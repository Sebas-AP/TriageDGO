#!/usr/bin/env python3
"""Calcula y guarda la asignación mensual de presupuesto participativo."""
from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(Path(__file__).resolve().parent))
from presupuesto_participativo import calculate, firestore_client, read_firestore_payments, read_jsonl  # noqa: E402


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--mes", required=True, help="Mes a calcular, formato AAAA-MM.")
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument("--pagos-jsonl", type=Path, help="Pagos con clave_catastral, fecha_pago, monto_pagado y estatus.")
    source.add_argument("--pagos-firestore", action="store_true", help="Lee los pagos de la colección Firestore pagos_predial.")
    parser.add_argument("--libro", type=Path, default=ROOT / "data" / "Presupuesto_Participativo_Durango.xlsx")
    parser.add_argument("--techo-mensual", type=Decimal, help="Sobrescribe C6 del libro para este mes.")
    parser.add_argument("--peso-prioridad-predial", type=Decimal, default=Decimal("0.15"), help="0 conserva exactamente el Excel; por defecto, 15%% ajusta por recaudación.")
    parser.add_argument("--output-dir", type=Path, default=ROOT / "data" / "presupuestos_mensuales")
    parser.add_argument("--guardar-firestore", action="store_true", help="Guarda el resultado además en presupuestos_participativos/{AAAA-MM}.")
    args = parser.parse_args()
    payments = read_firestore_payments() if args.pagos_firestore else read_jsonl(args.pagos_jsonl)
    result = calculate(args.libro, payments, args.mes, args.techo_mensual, args.peso_prioridad_predial)
    result["generado_en"] = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    args.output_dir.mkdir(parents=True, exist_ok=True)
    output = args.output_dir / f"presupuesto-{args.mes}.json"
    output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    if args.guardar_firestore: firestore_client().collection("presupuestos_participativos").document(args.mes).set(result)
    print(f"Presupuesto guardado: {output} | techo ${result['techo_mensual']} | predial ${result['total_predial_pagado']}")


if __name__ == "__main__": main()
