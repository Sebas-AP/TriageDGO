"""MCP Reportes: búsqueda local/Firestore-ready para los agentes Claude.
En producción, REPORTES_JSON puede sustituirse por una exportación sincronizada de Firestore.
"""
from __future__ import annotations
import json, math, os
from datetime import datetime, timedelta, timezone
from pathlib import Path
from mcp.server.fastmcp import FastMCP

mcp = FastMCP("mcp-reportes")
ROOT = Path(__file__).resolve().parents[2]
DATA = Path(os.getenv("REPORTES_JSON", ROOT / "assets" / "reportes_historicos.jsonl"))

def distance(a: float, b: float, c: float, d: float) -> float:
    radius = 6371.0; x = math.radians(c-a); y = math.radians(d-b)
    h = math.sin(x/2)**2 + math.cos(math.radians(a))*math.cos(math.radians(c))*math.sin(y/2)**2
    return 2 * radius * math.asin(math.sqrt(h))

@mcp.tool()
def buscar_similares(texto: str, lat: float, lon: float, radio_km: float = .5, dias: int = 30, as_of: str | None = None) -> dict:
    """Busca reportes del periodo y radio solicitados. as_of permite evaluación reproducible."""
    reference = datetime.fromisoformat((as_of or datetime.now(timezone.utc).isoformat()).replace("Z", "+00:00"))
    candidates = []
    for line in DATA.read_text(encoding="utf-8").splitlines():
        item = json.loads(line); ts = datetime.fromisoformat(item["timestamp"].replace("Z", "+00:00"))
        if ts < reference - timedelta(days=dias): continue
        km = distance(lat, lon, *item["coordenadas"])
        if km <= radio_km: candidates.append({"reporte_id": item["reporte_id"], "distancia_km": round(km, 3)})
    return {"similares_encontrados": len(candidates), "radio_km": radio_km, "ventana_dias": dias, "muestras": candidates[:10]}

@mcp.tool()
def crear_ticket(**ticket: object) -> dict:
    """Contrato MCP para creación idempotente; Express persiste el ticket en Firestore."""
    return {"ticket_id": str(ticket.get("reporte_id", "pending")), "estado": "delegado_a_express"}

@mcp.tool()
def enviar_acuse(ciudadano_id: str, mensaje: str, ticket_id: str) -> dict:
    """Contrato para el adaptador de notificaciones del backend."""
    return {"estado": "pendiente_adaptador", "ciudadano_id": ciudadano_id, "ticket_id": ticket_id, "n_caracteres": len(mensaje)}

if __name__ == "__main__": mcp.run()
