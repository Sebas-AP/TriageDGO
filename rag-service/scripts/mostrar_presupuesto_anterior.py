#!/usr/bin/env python3
"""Muestra el presupuesto participativo calculado del mes anterior."""
from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(Path(__file__).resolve().parent))
from presupuesto_participativo import firestore_client, previous_month  # noqa: E402


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--mes-referencia", help="AAAA-MM; por defecto usa la fecha actual UTC.")
    parser.add_argument("--output-dir", type=Path, default=ROOT / "data" / "presupuestos_mensuales")
    parser.add_argument("--firestore", action="store_true", help="Consulta presupuestos_participativos en lugar del archivo local.")
    args = parser.parse_args()
    if args.mes_referencia:
        try: reference = datetime.strptime(args.mes_referencia, "%Y-%m").date()
        except ValueError: parser.error("--mes-referencia debe tener formato AAAA-MM")
    else: reference = None
    month = previous_month(reference)
    if args.firestore:
        document = firestore_client().collection("presupuestos_participativos").document(month).get()
        if not document.exists: raise SystemExit(f"No existe presupuesto calculado para {month} en Firestore")
        result = document.to_dict()
    else:
        path = args.output_dir / f"presupuesto-{month}.json"
        if not path.exists(): raise SystemExit(f"No existe presupuesto calculado para {month}: {path}")
        result = json.loads(path.read_text(encoding="utf-8"))
    print(f"Presupuesto participativo {result['mes']} | techo: ${result['techo_mensual']} | predial: ${result['total_predial_pagado']}")
    print("Prioridad | Colonia | Clave catastral | Predial pagado | Presupuesto")
    for row in sorted(result["zonas"], key=lambda item: item["prioridad_recaudacion"]): print(f"{row['prioridad_recaudacion']:>9} | {row['colonia']} | {row['clave_catastral']} | ${row['predial_pagado']} | ${row['presupuesto_asignado']}")


if __name__ == "__main__": main()
