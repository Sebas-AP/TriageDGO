"""Prueba manual end-to-end del servidor MCP mediante transporte stdio."""
from __future__ import annotations

import asyncio
import json
import os
import sys
from pathlib import Path

from dotenv import load_dotenv
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client


ROOT = Path(__file__).resolve().parents[2]


async def main() -> None:
    load_dotenv(ROOT / ".env")
    if not os.getenv("GOOGLE_MAPS_API_KEY"):
        raise RuntimeError("GOOGLE_MAPS_API_KEY no está configurada")

    parameters = StdioServerParameters(
        command=sys.executable,
        args=[str(Path(__file__).with_name("server.py"))],
        env=dict(os.environ),
    )
    async with stdio_client(parameters) as (read_stream, write_stream):
        async with ClientSession(read_stream, write_stream) as session:
            await session.initialize()
            tools = await session.list_tools()
            names = [tool.name for tool in tools.tools]
            if names != ["geocodificar", "buscar_lugar"]:
                raise AssertionError(f"Tools inesperadas: {names}")
            response = await session.call_tool(
                "buscar_lugar",
                {"descripcion": "cerca de la Catedral de Durango"},
            )
            if response.isError:
                raise RuntimeError("La tool buscar_lugar devolvió un error")
            structured = response.structuredContent
            if not structured or structured.get("total", 0) < 1:
                raise AssertionError("La tool no devolvió candidatos")
            print(json.dumps({
                "tools": names,
                "total": structured["total"],
                "resolucion": structured["resolucion"],
                "requiere_confirmacion": structured["requiere_confirmacion"],
                "primer_candidato": structured["candidatos"][0]["nombre"],
            }, ensure_ascii=False))


if __name__ == "__main__":
    asyncio.run(main())
