#!/usr/bin/env python3
"""Carga el dataset sintético al índice local del RAG o a Firestore."""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from main import DocumentSource, RagService  # noqa: E402

DEFAULT_DATASET = ROOT / "data" / "reportes_sinteticos.jsonl"


def load_dataset(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        raise FileNotFoundError(f"No existe el dataset: {path}. Ejecute generar_dataset_sintetico.py primero.")
    rows = [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]
    if not rows: raise ValueError("El dataset está vacío")
    return rows


class SyntheticSource(DocumentSource):
    def __init__(self, rows: list[dict[str, Any]]) -> None: self.rows = rows
    def confirmed_reports(self) -> list[dict[str, Any]]:
        return [{"reporte_id": row["reporte_id"], "texto": row["texto"], "coordenadas": row["coordenadas"], "created_at": row["timestamp"], "categoria": row["categoria"]} for row in self.rows if row["estado"] == "completado" and row.get("ticket")]
    def confirmed_report(self, reporte_id: str) -> dict[str, Any] | None:
        return next((row for row in self.confirmed_reports() if row["reporte_id"] == reporte_id), None)
    def predial(self) -> list[dict[str, Any]]: return []


def load_local(rows: list[dict[str, Any]], index_dir: Path) -> None:
    result = RagService(source=SyntheticSource(rows), index_dir=index_dir).rebuild()
    print(f"Índice local actualizado en {index_dir}: {result['reportes']} reportes y {result['predial']} prediales.")


def load_firestore(rows: list[dict[str, Any]], batch_size: int, confirm_remote: bool) -> None:
    if not os.getenv("FIRESTORE_EMULATOR_HOST") and not confirm_remote:
        raise RuntimeError("Para una base remota use --confirm-remote. Para desarrollo configure FIRESTORE_EMULATOR_HOST.")
    import firebase_admin
    from firebase_admin import credentials, firestore
    if not firebase_admin._apps:
        key = os.getenv("GOOGLE_APPLICATION_CREDENTIALS")
        firebase_admin.initialize_app(credentials.Certificate(key) if key else credentials.ApplicationDefault())
    db, written = firestore.client(), 0
    for start in range(0, len(rows), batch_size):
        batch = db.batch()
        for row in rows[start:start + batch_size]:
            ticket = row.get("ticket")
            batch.set(db.collection("reportes").document(row["reporte_id"]), {"reporte_id": row["reporte_id"], "ciudadano_id": row["ciudadano_id"], "canal": row["canal"], "texto": row["texto"], "coordenadas": row["coordenadas"], "colonia": row["colonia"], "created_at": row["timestamp"], "estado": row["estado"], "ticket_id": ticket["ticket_id"] if ticket else None, "origen": "dataset_sintetico"}, merge=True)
            if ticket: batch.set(db.collection("tickets").document(ticket["ticket_id"]), {**ticket, "reporte_id": row["reporte_id"], "creado_en": row["timestamp"], "origen": "dataset_sintetico"}, merge=True)
        batch.commit()
        written += len(rows[start:start + batch_size])
    print(f"Firestore actualizado: {written} reportes; {sum(row.get('ticket') is not None for row in rows)} tickets confirmados.")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dataset", type=Path, default=DEFAULT_DATASET)
    parser.add_argument("--target", choices=("local-index", "firestore"), default="local-index")
    parser.add_argument("--index-dir", type=Path, default=ROOT.parent / ".rag-index")
    parser.add_argument("--batch-size", type=int, default=400)
    parser.add_argument("--confirm-remote", action="store_true", help="Confirma escritura en Firestore no emulado.")
    args = parser.parse_args()
    if not 1 <= args.batch_size <= 500: parser.error("--batch-size debe estar entre 1 y 500")
    rows = load_dataset(args.dataset)
    if args.target == "local-index": load_local(rows, args.index_dir)
    else: load_firestore(rows, args.batch_size, args.confirm_remote)


if __name__ == "__main__": main()
