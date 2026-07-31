"""MCP Reportes: fachada de solo lectura del servicio RAG por HTTP."""
from __future__ import annotations

import json
import os
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from mcp.server.fastmcp import FastMCP

mcp = FastMCP("mcp-reportes")
RAG_URL = os.getenv("RAG_SERVICE_URL", "http://localhost:8001").rstrip("/")
TIMEOUT_SECONDS = float(os.getenv("RAG_TIMEOUT_SECONDS", "5"))


def rag_post(path: str, payload: dict) -> dict:
    request = Request(f"{RAG_URL}{path}", data=json.dumps(payload).encode("utf-8"), headers={"content-type": "application/json"}, method="POST")
    try:
        with urlopen(request, timeout=TIMEOUT_SECONDS) as response:
            return json.loads(response.read().decode("utf-8"))
    except (HTTPError, URLError, TimeoutError, json.JSONDecodeError) as error:
        # Never leak the RAG URL, credentials, or a downstream body to an agent.
        raise RuntimeError("Servicio RAG no disponible") from error


@mcp.tool()
def buscar_similares(texto: str, lat: float, lon: float, radio_km: float = 0.5, dias: int = 30) -> dict:
    """Busca reincidencias semánticas en radio y ventana temporal; no expone PII."""
    return rag_post("/buscar_reportes", {"texto": texto, "lat": lat, "lon": lon, "radio_km": radio_km, "dias": dias})


@mcp.tool()
def buscar_pagos(clave_catastral: str | None = None, ubicacion: str | None = None) -> dict:
    """Consulta contexto predial de solo lectura; nunca cambia la prioridad del reporte."""
    return rag_post("/buscar_pagos", {"clave_catastral": clave_catastral, "ubicacion": ubicacion})


@mcp.tool()
def crear_ticket(**ticket: object) -> dict:
    """Contrato MCP para creación idempotente; Express persiste el ticket en Firestore."""
    return {"ticket_id": str(ticket.get("reporte_id", "pending")), "estado": "delegado_a_express"}


@mcp.tool()
def enviar_acuse(ciudadano_id: str, mensaje: str, ticket_id: str) -> dict:
    """Contrato para el adaptador de notificaciones del backend."""
    return {"estado": "pendiente_adaptador", "ciudadano_id": ciudadano_id, "ticket_id": ticket_id, "n_caracteres": len(mensaje)}


if __name__ == "__main__":
    mcp.run()
