"""
Reto 03 · Triage inteligente 072
Starter (esqueleto). NO incluye la solución.

Objetivo: supervisor con delegación paralela a 3 subagentes (clasificador,
detector de patrones, escritor de acuse) + servidor MCP con 3 tools.

Este archivo te da:
  - codex_exec() con detección de CLI y salida estructurada
  - Helper para paralelismo con asyncio + subprocess
  - Contratos JSON de los 4 tipos de mensaje
  - Función haversine (distancia entre coords)
  - Stubs de los 3 subagentes y el supervisor

NO te da:
  - system prompts
  - implementación real de tools MCP (mocks incluidos)
  - las 5 reglas de arbitraje
"""
from __future__ import annotations

import asyncio
import json
import math
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Any


ROOT = Path(__file__).parent
HIST = ROOT / "reportes_historicos.jsonl"
FRESH = ROOT / "reportes_frescos.jsonl"
ESPERADO = ROOT / "reportes_frescos_esperado.json"
ESCUELAS = ROOT / "escuelas.json"
CATEGORIAS = ROOT / "categorias.json"
LOG_PATH = ROOT / "log_agentes.jsonl"


# ─────────────────────────────────────────────────────────────
# CLI helper
# ─────────────────────────────────────────────────────────────

def _find_codex() -> str:
    exe = shutil.which("codex")
    if exe:
        return exe
    for c in [
        Path.home() / ".local" / "bin" / "codex",
        Path("/opt/homebrew/bin/codex"),
        Path("/usr/local/bin/codex"),
        Path.home() / ".npm-global" / "bin" / "codex",
    ]:
        if c.exists() and os.access(c, os.X_OK):
            return str(c)
    raise RuntimeError("No encontré `codex`.")


CODEX_BIN = _find_codex()
CODEX_MODEL = os.getenv("CODEX_MODEL", "gpt-5.6-luna")


def codex_exec(prompt: str, system: str | None = None, schema: dict | None = None, timeout: int = 120) -> Any:
    """Ejecuta Codex sin interacción; si hay schema, devuelve JSON validado por CLI."""
    full_prompt = f"{system or ''}\n\n{prompt}".strip()
    with tempfile.TemporaryDirectory(prefix="triage-codex-") as temp_dir:
        temp_path = Path(temp_dir)
        output_path = temp_path / "last-message.json"
        cmd = [CODEX_BIN, "exec", "--ephemeral", "--sandbox", "read-only", "--model", CODEX_MODEL, "--output-last-message", str(output_path)]
        if schema:
            schema_path = temp_path / "schema.json"
            schema_path.write_text(json.dumps(schema), encoding="utf-8")
            cmd += ["--output-schema", str(schema_path)]
        cmd.append(full_prompt)
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout, stdin=subprocess.DEVNULL)
        if r.returncode != 0:
            raise RuntimeError(f"codex exec falló ({r.returncode}): {r.stderr[:500]}")
        out = output_path.read_text(encoding="utf-8").strip()
        return json.loads(out) if schema else out


async def codex_exec_async(*args, **kwargs) -> Any:
    return await asyncio.get_event_loop().run_in_executor(None, lambda: codex_exec(*args, **kwargs))


# ─────────────────────────────────────────────────────────────
# Utilidades geográficas
# ─────────────────────────────────────────────────────────────

def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (math.sin(dlat / 2) ** 2
         + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2) ** 2)
    return R * 2 * math.asin(math.sqrt(a))


# ─────────────────────────────────────────────────────────────
# TOOLS MCP (mocks — muévelas a un servidor FastMCP real)
# ─────────────────────────────────────────────────────────────

def _load_historicos() -> list[dict]:
    return [json.loads(line) for line in HIST.read_text(encoding="utf-8").splitlines() if line.strip()]


def _load_escuelas() -> list[dict]:
    return json.loads(ESCUELAS.read_text(encoding="utf-8"))["escuelas"]


def tool_buscar_similares(texto: str, lat: float, lon: float, radio_km: float = 0.5, dias: int = 30) -> dict:
    """
    TODO: implementar con sentence-transformers para similitud semántica.
    Aquí, versión simple: por proximidad espacial + palabras clave.
    """
    historicos = _load_historicos()
    from datetime import datetime, timedelta, timezone
    cutoff = datetime(2024, 10, 21, tzinfo=timezone.utc) - timedelta(days=dias)

    similares = []
    for r in historicos:
        ts = datetime.fromisoformat(r["timestamp"].replace("Z", "+00:00"))
        if ts < cutoff:
            continue
        rlat, rlon = r["coordenadas"]
        dist = haversine_km(lat, lon, rlat, rlon)
        if dist > radio_km:
            continue
        similares.append({"reporte_id": r["reporte_id"], "categoria": r["categoria"], "distancia_km": round(dist, 3)})

    return {
        "similares_encontrados": len(similares),
        "radio_km": radio_km,
        "ventana_dias": dias,
        "muestras": similares[:10],
    }


def tool_crear_ticket(**kwargs) -> dict:
    """Mock: devuelve un ticket_id incremental."""
    return {"ticket_id": f"DUR-2024-{hash(json.dumps(kwargs, sort_keys=True)) & 0xFFFF:04X}"}


def tool_enviar_acuse(ciudadano_id: str, mensaje: str) -> dict:
    """Mock: 'envía' notificación."""
    return {"estado": "enviado", "canal": "whatsapp", "ciudadano_id": ciudadano_id, "n_caracteres": len(mensaje)}


# ─────────────────────────────────────────────────────────────
# Utilidad para la Regla 2 (cerca de escuela)
# ─────────────────────────────────────────────────────────────

def esta_cerca_de_escuela(lat: float, lon: float, radio_m: float = 500.0) -> tuple[bool, str | None]:
    escuelas = _load_escuelas()
    for e in escuelas:
        elat, elon = e["coordenadas"]
        if haversine_km(lat, lon, elat, elon) * 1000 <= radio_m:
            return True, e["nombre"]
    return False, None


# ─────────────────────────────────────────────────────────────
# TODO: subagentes + supervisor
# ─────────────────────────────────────────────────────────────

SYS_CLASIFICADOR = """TODO: escribe el system prompt del clasificador.
Recibe {texto, coordenadas} del reporte.
Devuelve JSON con {categoria, urgencia_base, area_responsable, resumen, palabras_clave}.
La categoría debe ser una de las 10 del taxonomía (categorias.json).
"""

SYS_DETECTOR = """TODO: system prompt del detector de patrones.
Recibe {texto, coordenadas}. Invoca tool buscar_similares.
Devuelve JSON {similares_encontrados, posible_causa_estructural, ascenso_sugerido, nota}.
"""

SYS_ESCRITOR = """TODO: system prompt del escritor de acuse.
Recibe {texto, ciudadano_id, categoria (opcional)}. NO consulta datos.
Devuelve JSON {mensaje} — máximo 3 líneas, tono empático y directo.
"""


def _schema(nombre: str) -> dict:
    """Carga el contrato JSON que Codex debe respetar para cada subagente."""
    schema_path = ROOT.parent / "agents" / "contracts" / f"{nombre}.schema.json"
    return json.loads(schema_path.read_text(encoding="utf-8"))


def _payload(reporte: dict, campos: tuple[str, ...]) -> str:
    """Expone a un agente sólo los datos que necesita para su tarea."""
    return json.dumps({campo: reporte.get(campo) for campo in campos}, ensure_ascii=False)


def _public(name: str) -> Any:
    """Respeta sustituciones hechas sobre el shim público ``starter``.

    El material se importa normalmente desde ``starter.py`` en la raíz, que
    reexporta estas funciones. Resolver los colaboradores desde ese módulo
    mantiene inyectables los agentes y el executor sin modificar el shim.
    """
    shim = sys.modules.get("starter")
    return getattr(shim, name, globals()[name])


async def subagente_clasificador(reporte: dict) -> dict:
    return await _public("codex_exec_async")(
        _payload(reporte, ("texto", "coordenadas")),
        system=SYS_CLASIFICADOR,
        schema=_schema("classifier"),
    )


async def subagente_detector(reporte: dict) -> dict:
    return await _public("codex_exec_async")(
        _payload(reporte, ("texto", "coordenadas")),
        system=SYS_DETECTOR,
        schema=_schema("pattern"),
    )


async def subagente_escritor(reporte: dict) -> dict:
    return await _public("codex_exec_async")(
        _payload(reporte, ("texto", "ciudadano_id")),
        system=SYS_ESCRITOR,
        schema=_schema("acuse"),
    )


async def supervisor(reporte: dict) -> dict:
    """
    Delega en paralelo a los 3 subagentes.
    Consolida aplicando las 5 reglas de arbitraje.
    Crea ticket (MCP) y envía acuse.
    """
    clasi_t = asyncio.create_task(_public("subagente_clasificador")(reporte))
    detec_t = asyncio.create_task(_public("subagente_detector")(reporte))
    escri_t = asyncio.create_task(_public("subagente_escritor")(reporte))

    clasi, detec, escri = await asyncio.gather(clasi_t, detec_t, escri_t, return_exceptions=True)

    resultados = (clasi, detec, escri)
    revision_manual = any(isinstance(resultado, BaseException) for resultado in resultados)

    # Regla 3: si un agente falló, el flujo continúa con valores conservadores.
    clasificacion = clasi if isinstance(clasi, dict) else {}
    patrones = detec if isinstance(detec, dict) else {}
    acuse = escri if isinstance(escri, dict) else {}
    urgencia = clasificacion.get("urgencia_base", "media")
    categoria = clasificacion.get("categoria")
    regla_gatillada: str | None = None

    # Regla 1: recurrencia considerable y causa estructural no puede quedar baja.
    if (
        patrones.get("similares_encontrados", 0) >= 10
        and patrones.get("posible_causa_estructural") is True
        and urgencia in {"baja", "media"}
    ):
        urgencia = "alta"
        regla_gatillada = "regla_1_patron_estructural"

    # Regla 2 tiene precedencia: riesgos cerca de una escuela son críticos.
    categorias_riesgo = {"fuga_agua", "semaforo_apagado", "cable_caido", "riesgo_seguridad"}
    coordenadas = reporte.get("coordenadas") or ()
    cerca_escuela = False
    escuela: str | None = None
    if len(coordenadas) == 2:
        cerca_escuela, escuela = _public("esta_cerca_de_escuela")(*coordenadas)
    if categoria in categorias_riesgo and cerca_escuela:
        urgencia = "critica"
        regla_gatillada = "regla_2_cercania_escuela"

    # Regla 5: mapping fijo de la urgencia consolidada a prioridad operativa.
    prioridad = {"critica": "P0", "alta": "P1", "media": "P2", "baja": "P3"}.get(urgencia, "P2")
    ticket = tool_crear_ticket(
        ciudadano_id=reporte.get("ciudadano_id"),
        categoria=categoria,
        urgencia_final=urgencia,
        prioridad_final=prioridad,
        revision_manual=revision_manual,
    )
    mensaje = acuse.get("mensaje") or "Recibimos tu reporte y será revisado por el área responsable."
    # Regla 4: el acuse sólo se envía después de obtener el folio del ticket.
    envio = tool_enviar_acuse(reporte.get("ciudadano_id", ""), mensaje)

    return {
        "ticket_id": ticket["ticket_id"],
        "categoria": categoria,
        "urgencia_final": urgencia,
        "prioridad_final": prioridad,
        "revision_manual": revision_manual,
        "regla_gatillada": regla_gatillada,
        "escuela_cercana": escuela,
        "acuse_enviado": envio.get("estado") == "enviado",
        "orden_ticket_antes_de_acuse": True,
    }


# ─────────────────────────────────────────────────────────────
# Main de smoke test
# ─────────────────────────────────────────────────────────────

async def main() -> None:
    frescos = [json.loads(l) for l in FRESH.read_text(encoding="utf-8").splitlines() if l.strip()]
    esperado = json.loads(ESPERADO.read_text(encoding="utf-8"))["esperado"]

    print(f"[+] Cargados {len(frescos)} reportes frescos.")
    print(f"[+] Cargados {len(_load_historicos())} reportes históricos.")
    print(f"[+] Cargadas {len(_load_escuelas())} escuelas.")
    print()

    # ejemplo: buscar similares del F-01
    f01 = frescos[0]
    print(f"[F-01] texto: {f01['texto'][:80]}...")
    sim = tool_buscar_similares(f01["texto"], *f01["coordenadas"])
    print(f"       similares: {sim['similares_encontrados']} en {sim['radio_km']}km / {sim['ventana_dias']}d")

    cerca, esc = esta_cerca_de_escuela(*f01["coordenadas"])
    print(f"       cerca de escuela: {cerca} ({esc})")
    print()

    print("[i] Ahora completa los 3 subagentes + supervisor y compara contra esperado.")


if __name__ == "__main__":
    asyncio.run(main())
