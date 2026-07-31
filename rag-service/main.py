"""Servicio RAG de Triage 072.

Firestore conserva los documentos canónicos; los índices locales solo aceleran las
consultas y pueden reconstruirse sin pérdida de datos.
"""
from __future__ import annotations

import json
import math
import os
import re
import secrets
from datetime import datetime, timedelta, timezone
from pathlib import Path
from threading import Event, Lock, Thread
from typing import Any, Protocol

import numpy as np
from fastapi import Depends, FastAPI, Header, HTTPException
from pydantic import BaseModel, Field, model_validator

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_INDEX_DIR = ROOT / ".rag-index"


def now() -> datetime:
    return datetime.now(timezone.utc)


def parse_time(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def haversine_km(a: float, b: float, c: float, d: float) -> float:
    da, db = math.radians(c - a), math.radians(d - b)
    x = math.sin(da / 2) ** 2 + math.cos(math.radians(a)) * math.cos(math.radians(c)) * math.sin(db / 2) ** 2
    return 6371 * 2 * math.asin(math.sqrt(x))


def tokens(text: str) -> set[str]:
    return set(re.findall(r"[a-záéíóúñ]{3,}", text.lower()))


class DocumentSource(Protocol):
    def confirmed_reports(self) -> list[dict[str, Any]]: ...
    def confirmed_report(self, reporte_id: str) -> dict[str, Any] | None: ...
    def predial(self) -> list[dict[str, Any]]: ...


class FirestoreSource:
    """Admin-only Firestore adapter; Firebase rules never grant this service client access."""
    def __init__(self) -> None:
        import firebase_admin
        from firebase_admin import credentials, firestore
        if not firebase_admin._apps:
            key = os.getenv("GOOGLE_APPLICATION_CREDENTIALS")
            firebase_admin.initialize_app(credentials.Certificate(key) if key else credentials.ApplicationDefault())
        self.db = firestore.client()

    def confirmed_reports(self) -> list[dict[str, Any]]:
        tickets = {row.get("reporte_id"): row for row in (doc.to_dict() for doc in self.db.collection("tickets").stream())}
        rows: list[dict[str, Any]] = []
        for doc in self.db.collection("reportes").where("estado", "==", "completado").stream():
            report = doc.to_dict()
            ticket = tickets.get(report.get("reporte_id"))
            if ticket:
                rows.append({**report, "categoria": ticket.get("categoria", "revision_manual")})
        return rows

    def confirmed_report(self, reporte_id: str) -> dict[str, Any] | None:
        report_doc = self.db.collection("reportes").doc(reporte_id).get()
        if not report_doc.exists or report_doc.to_dict().get("estado") != "completado": return None
        tickets = self.db.collection("tickets").where("reporte_id", "==", reporte_id).limit(1).get()
        if not tickets: return None
        return {**report_doc.to_dict(), "categoria": tickets[0].to_dict().get("categoria", "revision_manual")}

    def predial(self) -> list[dict[str, Any]]:
        return [{"id": doc.id, **doc.to_dict()} for doc in self.db.collection("predial").stream()]


class Vectorizer:
    def __init__(self) -> None:
        self._model: Any | None = None

    def encode(self, text: str) -> np.ndarray:
        # Tests and an emergency local environment remain deterministic without a model download.
        try:
            if self._model is None:
                from sentence_transformers import SentenceTransformer
                self._model = SentenceTransformer(os.getenv("RAG_MODEL", "all-MiniLM-L6-v2"))
            vector = np.asarray(self._model.encode(text), dtype=np.float32)
        except ImportError:
            vocabulary = sorted(tokens(text))[:64]
            vector = np.zeros(64, dtype=np.float32)
            for token in vocabulary:
                vector[hash(token) % 64] += 1
        magnitude = float(np.linalg.norm(vector))
        return vector / magnitude if magnitude else vector


class PersistentIndex:
    """FAISS-backed index with a NumPy fallback solely for dependency-light tests."""
    def __init__(self, directory: Path, name: str, vectorizer: Vectorizer) -> None:
        self.directory, self.name, self.vectorizer = directory, name, vectorizer
        self.records: list[dict[str, Any]] = []
        self.vectors = np.empty((0, 0), dtype=np.float32)
        self.faiss_index: Any | None = None
        self.lock = Lock()
        self.load()

    @property
    def metadata_path(self) -> Path: return self.directory / f"{self.name}.json"
    @property
    def vector_path(self) -> Path: return self.directory / f"{self.name}.npy"
    @property
    def faiss_path(self) -> Path: return self.directory / f"{self.name}.faiss"

    def load(self) -> None:
        if self.metadata_path.exists() and self.vector_path.exists():
            self.records = json.loads(self.metadata_path.read_text(encoding="utf-8"))
            self.vectors = np.load(self.vector_path)
            try:
                import faiss
                if self.faiss_path.exists(): self.faiss_index = faiss.read_index(str(self.faiss_path))
            except ImportError: pass

    def replace(self, records: list[dict[str, Any]], text_field: str) -> int:
        with self.lock:
            deduped = {str(row["id"]): row for row in records}
            self.records = list(deduped.values())
            self.vectors = np.vstack([self.vectorizer.encode(str(row[text_field])) for row in self.records]) if self.records else np.empty((0, 0), dtype=np.float32)
            self.directory.mkdir(parents=True, exist_ok=True)
            self.metadata_path.write_text(json.dumps(self.records, ensure_ascii=False), encoding="utf-8")
            np.save(self.vector_path, self.vectors)
            try:
                import faiss
                self.faiss_index = faiss.IndexFlatIP(self.vectors.shape[1]) if len(self.records) else None
                if self.faiss_index is not None:
                    self.faiss_index.add(self.vectors)
                    faiss.write_index(self.faiss_index, str(self.faiss_path))
            except ImportError:
                self.faiss_index = None
            return len(self.records)

    def scores(self, text: str) -> list[float]:
        with self.lock:
            if not self.records: return []
            query = self.vectorizer.encode(text)
            if query.shape[0] != self.vectors.shape[1]: return [0.0] * len(self.records)
            if self.faiss_index is not None:
                values, positions = self.faiss_index.search(query.reshape(1, -1), len(self.records))
                scores = [0.0] * len(self.records)
                for score, position in zip(values[0], positions[0]):
                    if position >= 0: scores[int(position)] = float(score)
                return scores
            return (self.vectors @ query).astype(float).tolist()


class EmbedInput(BaseModel):
    texto: str = Field(min_length=1, max_length=10_000)


class SearchInput(EmbedInput):
    lat: float = Field(ge=-90, le=90)
    lon: float = Field(ge=-180, le=180)
    radio_km: float = Field(default=0.5, gt=0, le=50)
    dias: int = Field(default=30, gt=0, le=3650)


class PaymentInput(BaseModel):
    clave_catastral: str | None = Field(default=None, min_length=1, max_length=128)
    ubicacion: str | None = Field(default=None, min_length=1, max_length=500)

    @model_validator(mode="after")
    def has_query(self):
        if not self.clave_catastral and not self.ubicacion:
            raise ValueError("clave_catastral o ubicacion es requerida")
        return self


class IndexRequest(BaseModel):
    force: bool = False


class RagService:
    def __init__(self, source: DocumentSource | None = None, index_dir: Path | None = None, vectorizer: Vectorizer | None = None) -> None:
        self.source = source
        self.vectorizer = vectorizer or Vectorizer()
        path = index_dir or Path(os.getenv("RAG_INDEX_DIR", DEFAULT_INDEX_DIR))
        self.reports = PersistentIndex(path, "reportes", self.vectorizer)
        self.payments = PersistentIndex(path, "predial", self.vectorizer)
        self.min_similarity = float(os.getenv("RAG_MIN_SIMILARITY", "0.55"))
        self.last_rebuild_at: str | None = None

    def rebuild(self) -> dict[str, int]:
        if not self.source: raise RuntimeError("Firestore no está configurado")
        reports = []
        for row in self.source.confirmed_reports():
            coords = row.get("coordenadas")
            if isinstance(coords, list) and len(coords) == 2 and row.get("texto") and row.get("reporte_id"):
                reports.append({"id": row["reporte_id"], "reporte_id": row["reporte_id"], "texto": row["texto"], "categoria": row.get("categoria", "revision_manual"), "coordenadas": coords, "timestamp": row.get("created_at") or row.get("timestamp")})
        payments = [{"id": row["id"], "clave_catastral": row.get("claveCatastral", ""), "ubicacion": row.get("ubicacion", ""), "al_corriente": bool(row.get("alCorriente")), "actualizado_en": row.get("actualizadoEn", ""), "texto": f"{row.get('claveCatastral', '')} {row.get('ubicacion', '')}".strip()} for row in self.source.predial() if row.get("id")]
        result = {"reportes": self.reports.replace(reports, "texto"), "predial": self.payments.replace(payments, "texto")}
        self.last_rebuild_at = now().isoformat()
        return result

    def index_report(self, reporte_id: str) -> dict[str, int]:
        if not self.source: raise RuntimeError("Firestore no está configurado")
        row = self.source.confirmed_report(reporte_id)
        if not row: raise LookupError("Reporte confirmado no encontrado")
        coords = row.get("coordenadas")
        if not isinstance(coords, list) or len(coords) != 2 or not row.get("texto"):
            raise ValueError("Reporte confirmado inválido para indexación")
        indexed = {"id": reporte_id, "reporte_id": reporte_id, "texto": row["texto"], "categoria": row.get("categoria", "revision_manual"), "coordenadas": coords, "timestamp": row.get("created_at") or row.get("timestamp")}
        return {"reportes": self.reports.replace([item for item in self.reports.records if item["id"] != reporte_id] + [indexed], "texto")}

    def search_reports(self, input: SearchInput, reference: datetime | None = None) -> dict[str, Any]:
        cutoff = (reference or now()) - timedelta(days=input.dias)
        matches = []
        for row, score in zip(self.reports.records, self.reports.scores(input.texto)):
            timestamp = row.get("timestamp")
            if not timestamp or parse_time(timestamp) < cutoff: continue
            lat, lon = row["coordenadas"]
            distance = haversine_km(input.lat, input.lon, lat, lon)
            if distance <= input.radio_km and score >= self.min_similarity:
                matches.append({"reporte_id": row["reporte_id"], "categoria": row["categoria"], "distancia_km": round(distance, 3), "similitud": round(score, 3)})
        matches.sort(key=lambda item: (-item["similitud"], item["distancia_km"]))
        structural = len(matches) >= 6
        return {"similares_encontrados": len(matches), "posible_causa_estructural": structural, "ascenso_sugerido": structural, "nota": "Posible reincidencia geográfica y semántica." if structural else "Sin patrón estructural suficiente.", "radio_km": input.radio_km, "ventana_dias": input.dias, "umbral_similitud": self.min_similarity, "muestras": matches[:10]}

    def search_payments(self, input: PaymentInput) -> dict[str, Any]:
        found: dict[str, Any] | None = None
        if input.clave_catastral:
            found = next((row for row in self.payments.records if row["clave_catastral"] == input.clave_catastral), None)
        if not found and input.ubicacion:
            scored = list(zip(self.payments.records, self.payments.scores(input.ubicacion)))
            if scored:
                candidate, score = max(scored, key=lambda item: item[1])
                if score >= self.min_similarity: found = candidate
        if not found: return {"encontrado": False, "nota": "Sin registro predial coincidente."}
        return {"encontrado": True, "clave_catastral": found["clave_catastral"], "ubicacion": found["ubicacion"], "al_corriente": found["al_corriente"], "actualizado_en": found["actualizado_en"], "nota": "Contexto informativo; no afecta la prioridad."}


def make_service() -> RagService:
    # A missing local ADC must not prevent health checks or fixture-free tests from starting.
    try: return RagService(source=FirestoreSource())
    except Exception: return RagService()


service = make_service()
app = FastAPI(title="Triage 072 RAG")
reconciliation_stop = Event()


def internal_authorized(authorization: str | None = Header(default=None)) -> None:
    token = os.getenv("RAG_INTERNAL_TOKEN")
    if not token or not authorization or not authorization.startswith("Bearer ") or not secrets.compare_digest(authorization[7:], token):
        raise HTTPException(status_code=401, detail="No autorizado")


@app.get("/healthz")
def healthz() -> dict[str, Any]:
    return {"status": "ok", "reportes_indexados": len(service.reports.records), "predial_indexado": len(service.payments.records), "firestore_configurado": service.source is not None, "ultima_reconciliacion": service.last_rebuild_at}


@app.on_event("startup")
def start_reconciliation() -> None:
    if not service.source: return
    interval = max(30, int(os.getenv("RAG_RECONCILE_SECONDS", "300")))
    def reconcile() -> None:
        while not reconciliation_stop.is_set():
            try: service.rebuild()
            except Exception: pass  # Health remains available even when Firestore is temporarily unavailable.
            reconciliation_stop.wait(interval)
    Thread(target=reconcile, name="rag-reconcile", daemon=True).start()


@app.on_event("shutdown")
def stop_reconciliation() -> None:
    reconciliation_stop.set()


@app.post("/embed")
def embed(input: EmbedInput) -> dict[str, list[float]]:
    return {"embedding": service.vectorizer.encode(input.texto).tolist()}


@app.post("/buscar_reportes")
def buscar_reportes(input: SearchInput) -> dict[str, Any]:
    return service.search_reports(input)


@app.post("/buscar_pagos")
def buscar_pagos(input: PaymentInput) -> dict[str, Any]:
    return service.search_payments(input)


@app.post("/index/rebuild", dependencies=[Depends(internal_authorized)])
def rebuild_index(_: IndexRequest) -> dict[str, int]:
    try: return service.rebuild()
    except RuntimeError as error: raise HTTPException(status_code=503, detail=str(error)) from error


@app.post("/index/reportes/{reporte_id}", dependencies=[Depends(internal_authorized)])
def index_report(reporte_id: str) -> dict[str, int]:
    try: return service.index_report(reporte_id)
    except LookupError as error: raise HTTPException(status_code=404, detail=str(error)) from error
    except (RuntimeError, ValueError) as error: raise HTTPException(status_code=503, detail=str(error)) from error
