#!/usr/bin/env python3
"""Genera un conjunto reproducible de reportes ciudadanos sintéticos sin PII."""
from __future__ import annotations

import argparse
import json
import random
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUTPUT = ROOT / "data" / "reportes_sinteticos.jsonl"

# categoría: área, urgencia, prioridad, textos. Corresponde a assets/categorias.json.
CATEGORIES = {
    "bache": ("Obras Públicas", "media", "P2", ["Hay un bache profundo en {calle}, {colonia}; los carros tienen que esquivarlo.", "Se está formando un socavón en {calle} con {cruce}, {colonia}; creció con las lluvias."]),
    "fuga_agua": ("AMD (Agua)", "alta", "P1", ["Sale agua a chorros de una tubería rota en {calle}, colonia {colonia}; se desperdicia mucha agua.", "Hay una fuga de agua potable en {calle} con {cruce}; el agua ya corre por la calle."]),
    "alumbrado_apagado": ("Servicios Públicos", "media", "P2", ["Los postes de alumbrado están apagados en {calle}, colonia {colonia}; está muy oscuro por la noche.", "No funciona la luminaria frente a {calle} con {cruce}, {colonia}; la zona queda sin visibilidad."]),
    "semaforo_apagado": ("Vialidad", "alta", "P1", ["El semáforo de {calle} con {cruce} está apagado y el cruce es peligroso.", "Las luces del semáforo en {calle}, {colonia}, parpadean y no coordinan el tránsito."]),
    "basura_acumulada": ("Servicios Públicos", "media", "P2", ["Hay basura acumulada en la esquina de {calle} y {cruce}, {colonia}; ya genera mal olor.", "El camión no pasó y hay bolsas y residuos sobre {calle}, colonia {colonia}."]),
    "cable_caido": ("CFE / SP", "critica", "P0", ["Hay un cable eléctrico caído en {calle}, {colonia}, y se observan chispas; mantengan distancia.", "Un cable cuelga muy bajo sobre la banqueta de {calle} con {cruce}; puede lastimar a alguien."]),
    "ruido_excesivo": ("Reglamentos", "baja", "P3", ["Hay música con bocinas muy altas en {calle}, colonia {colonia}, desde la madrugada.", "Fiesta con ruido excesivo en {calle} y {cruce}; no dejan descansar a los vecinos."]),
    "arbol_riesgoso": ("Medio Ambiente", "alta", "P1", ["Un árbol grande está inclinado sobre la vivienda en {calle}, {colonia}; parece que puede caer.", "Ramas pesadas y quebradas cuelgan sobre la banqueta de {calle} con {cruce}."]),
    "riesgo_seguridad": ("Seguridad Pública", "critica", "P0", ["Se reporta una situación de riesgo en {calle}, {colonia}; se solicita presencia preventiva.", "Personas con actitud amenazante permanecen en {calle} con {cruce}; vecinos temen por su seguridad."]),
    "drenaje_tapado": ("AMD (Drenaje)", "media", "P2", ["La coladera de {calle} con {cruce} está tapada y el agua se acumula en la vialidad.", "Drenaje azolvado en {calle}, colonia {colonia}; hay olor fuerte y aguas residuales."]),
}
COLONIES = [("Del Maestro", 24.0290, -104.6295), ("Villas del Guadiana", 24.0570, -104.6820), ("Los Ángeles", 24.0175, -104.6545), ("Guadalupe", 24.0095, -104.6460), ("San Marcos", 24.0330, -104.6570), ("Tapias", 24.0460, -104.6090), ("Morga", 24.0390, -104.6860), ("Fátima", 24.0030, -104.6590), ("Insurgentes", 24.0170, -104.6390), ("Zona Centro", 24.0210, -104.6710)]
STREETS = ["Zaragoza", "20 de Noviembre", "Constitución", "Negrete", "Pino Suárez", "Aquiles Serdán", "Av. 5 de Febrero", "Blvd. Guadiana", "Fanny Anitúa", "Cuencamé"]


def build(count: int, seed: int) -> list[dict]:
    rng, end = random.Random(seed), datetime(2026, 7, 30, 23, 59, tzinfo=timezone.utc)
    start, category_ids, records = datetime(2026, 1, 1, tzinfo=timezone.utc), list(CATEGORIES), []
    for index in range(1, count + 1):
        category = category_ids[(index - 1) % len(category_ids)]
        area, urgency, priority, templates = CATEGORIES[category]
        colony, lat0, lon0 = COLONIES[(index // 4) % len(COLONIES)]
        # Cuatro reportes cercanos crean recurrencias reales para probar el RAG.
        jitter = 0.00025 if index % 4 else 0.0018
        timestamp = end - timedelta(days=rng.randrange(88), hours=rng.randrange(24), minutes=rng.randrange(60)) if index > count * .42 else start + timedelta(seconds=rng.randrange(int((end - start).total_seconds())))
        street, cross = STREETS[index % len(STREETS)], STREETS[(index + 3) % len(STREETS)]
        text = rng.choice(templates).format(calle=street, cruce=cross, colonia=colony)
        if index % 9 == 0: text += " Es la tercera vez que se reporta esta semana."
        if category in {"cable_caido", "semaforo_apagado", "arbol_riesgoso"} and index % 7 == 0: text += " Hay una escuela o paso peatonal muy cerca."
        manual = index % 37 == 0
        ticket = None if manual else {"ticket_id": f"TKT-SYN-{index:05d}", "categoria": category, "area_responsable": area, "urgencia_final": urgency, "prioridad_final": priority, "patron_detectado": index % 9 == 0}
        records.append({"reporte_id": f"SYN-{index:05d}", "ciudadano_id": f"sintetico-{(index * 17) % 9000:04d}", "canal": ("formulario", "whatsapp", "llamada")[index % 3], "texto": text, "coordenadas": [round(lat0 + rng.uniform(-jitter, jitter), 6), round(lon0 + rng.uniform(-jitter, jitter), 6)], "colonia": colony, "timestamp": timestamp.isoformat().replace("+00:00", "Z"), "estado": "revision_manual" if manual else "completado", "categoria": category, "ticket": ticket, "origen": "sintetico", "sin_pii": True})
    return sorted(records, key=lambda row: row["timestamp"])


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--count", type=int, default=2500)
    parser.add_argument("--seed", type=int, default=72026)
    args = parser.parse_args()
    if args.count < 1: parser.error("--count debe ser mayor a cero")
    args.output.parent.mkdir(parents=True, exist_ok=True)
    rows = build(args.count, args.seed)
    args.output.write_text("".join(json.dumps(row, ensure_ascii=False) + "\n" for row in rows), encoding="utf-8")
    print(f"Dataset creado: {args.output} ({len(rows)} reportes; {sum(row['ticket'] is not None for row in rows)} confirmados)")


if __name__ == "__main__": main()
