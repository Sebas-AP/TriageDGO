"""
Servidor MCP mock para las pruebas TDD del agente `pattern`.

Expone `buscar_similares` con respuestas FIJAS (fixtures), no el algoritmo real
de similitud semántica (que en el reto vive en el microservicio RAG,
sentence-transformers — ver arq.md §5, todavía no construido). Esto desacopla
la prueba del *prompt* del agente de la corrección del motor de búsqueda:
el harness valida que el agente razone bien sobre lo que la tool le devuelve,
no que la tool en sí encuentre los similares "correctos".

Uso: referenciado por agents/tests/harness.py vía --mcp-config generado
dinámicamente (ver _mcp_config_path en harness.py).
"""
import json
from pathlib import Path

from mcp.server.fastmcp import FastMCP

FIXTURES_PATH = Path(__file__).parent / "mock_mcp_fixtures.json"
FIXTURES = json.loads(FIXTURES_PATH.read_text(encoding="utf-8"))["fixtures"]

DEFAULT_RESPONSE = {"similares_encontrados": 0, "radio_km": 0.5, "ventana_dias": 30, "muestras": []}

mcp = FastMCP("mcp-reportes-mock")


@mcp.tool()
def buscar_similares(texto: str, lat: float, lon: float, radio_km: float = 0.5, dias: int = 30) -> dict:
    """Busca reportes históricos similares (mock con respuestas fijas para pruebas)."""
    return FIXTURES.get(texto, DEFAULT_RESPONSE)


if __name__ == "__main__":
    mcp.run()
