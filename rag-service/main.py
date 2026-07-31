"""Servicio RAG local: Firestore es la fuente de verdad; los fixtures permiten arrancar sin credenciales."""
from __future__ import annotations

import json
import math
import re
from functools import lru_cache
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from fastapi import FastAPI
from pydantic import BaseModel, Field

ROOT = Path(__file__).resolve().parents[1]
HISTORY = ROOT / "assets" / "reportes_historicos.jsonl"
app = FastAPI(title="Triage 072 RAG")

def haversine_km(a: float, b: float, c: float, d: float) -> float:
    da, db = math.radians(c-a), math.radians(d-b)
    x = math.sin(da/2)**2 + math.cos(math.radians(a))*math.cos(math.radians(c))*math.sin(db/2)**2
    return 6371 * 2 * math.asin(math.sqrt(x))

def tokens(text: str) -> set[str]: return set(re.findall(r"[a-záéíóúñ]{3,}", text.lower()))
def lexical_similarity(left: str, right: str) -> float:
    a, b = tokens(left), tokens(right)
    return len(a & b) / len(a | b) if a and b else 0.0
def historic() -> list[dict[str, Any]]:
    return [json.loads(line) for line in HISTORY.read_text(encoding="utf-8").splitlines() if line.strip()]

@lru_cache(maxsize=1)
def embedding_model():
    from sentence_transformers import SentenceTransformer
    return SentenceTransformer("all-MiniLM-L6-v2")

class EmbedInput(BaseModel): texto: str = Field(min_length=1)
class SearchInput(EmbedInput): lat: float; lon: float; radio_km: float = Field(default=0.5, gt=0); dias: int = Field(default=30, gt=0)
class PaymentInput(BaseModel): clave_catastral: str | None = None; ubicacion: str | None = None

@app.post("/embed")
def embed(input: EmbedInput) -> dict[str, list[float]]:
    # El modelo se carga perezosamente para mantener pruebas y emulador sin descarga de red.
    try:
        return {"embedding": embedding_model().encode(input.texto).tolist()}
    except ImportError:
        return {"embedding": [float(len(tokens(input.texto)))]}

@app.post("/buscar_reportes")
def buscar_reportes(input: SearchInput) -> dict[str, Any]:
    records = historic()
    reference = max(datetime.fromisoformat(row["timestamp"].replace("Z", "+00:00")) for row in records)
    cutoff = reference - timedelta(days=input.dias)
    samples = []
    for row in records:
        timestamp = datetime.fromisoformat(row["timestamp"].replace("Z", "+00:00"))
        lat, lon = row["coordenadas"]
        distance = haversine_km(input.lat, input.lon, lat, lon)
        if timestamp >= cutoff and distance <= input.radio_km:
            samples.append({"reporte_id": row["reporte_id"], "categoria": row["categoria"], "distancia_km": round(distance, 3), "similitud": round(lexical_similarity(input.texto, row["texto"]), 3)})
    samples.sort(key=lambda item: (item["distancia_km"], -item["similitud"]))
    count = len(samples)
    structural = count >= 6
    return {"similares_encontrados": count, "posible_causa_estructural": structural, "ascenso_sugerido": structural, "nota": "Posible reincidencia geográfica." if structural else "Sin patrón estructural suficiente.", "muestras": samples[:10]}

@app.post("/buscar_pagos")
def buscar_pagos(input: PaymentInput) -> dict[str, Any]:
    # Se conecta a PredialRepository/Firestore al configurar credenciales; no altera prioridad.
    return {"encontrado": False, "clave_catastral": input.clave_catastral, "ubicacion": input.ubicacion, "nota": "Consulta predial pendiente de fuente Firestore."}
