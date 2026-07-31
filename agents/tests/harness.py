"""
Harness de pruebas TDD para los agentes de Triage 072.

Ejecuta el system prompt de un agente (agents/prompts/<nombre>.md) contra sus
casos de prueba (agents/tests/cases/<nombre>.cases.json) invocando `codex exec`
con salida estructurada, valida
la salida contra su contrato (agents/contracts/<nombre>.schema.json) y contra
las aserciones de cada caso.

Reutiliza CODEX_BIN (descubrimiento del binario `codex`) de starter.py en
vez de reimplementarlo.

Uso:
    python3 agents/tests/harness.py classifier
    python3 agents/tests/harness.py pattern --verbose

Salida: JSON con el resumen a stdout. Exit code 0 si todos los casos pasan,
1 si alguno falla (para poder usarse en CI / scripting).
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
AGENTS_DIR = Path(__file__).resolve().parent.parent
PROMPTS_DIR = AGENTS_DIR / "prompts"
CONTRACTS_DIR = AGENTS_DIR / "contracts"
CASES_DIR = Path(__file__).resolve().parent / "cases"
GENERATED_MCP_CONFIG = Path(__file__).resolve().parent / "_mock_mcp_config.generated.json"

sys.path.insert(0, str(REPO_ROOT))
from starter import CODEX_BIN  # reutiliza descubrimiento del binario `codex`

try:
    import jsonschema
except ImportError:
    jsonschema = None

MODEL = os.getenv("CODEX_MODEL", "gpt-5.6-luna")
TIMEOUT_S = 60


def _mcp_config_path() -> Path:
    """Genera (una vez) el --mcp-config que apunta al servidor mock de buscar_similares."""
    server_path = Path(__file__).resolve().parent / "mock_mcp_server.py"
    config = {"mcpServers": {"mcp-reportes-mock": {"command": sys.executable, "args": [str(server_path)]}}}
    GENERATED_MCP_CONFIG.write_text(json.dumps(config, indent=2), encoding="utf-8")
    return GENERATED_MCP_CONFIG


def _run_codex(system_prompt: str, user_payload: dict, schema: dict, needs_mcp: bool) -> dict:
    with tempfile.TemporaryDirectory(prefix="triage-codex-") as temp_dir:
        temp_path = Path(temp_dir)
        schema_path = temp_path / "schema.json"
        output_path = temp_path / "output.json"
        schema_path.write_text(json.dumps(schema), encoding="utf-8")
        cmd = [CODEX_BIN, "exec", "--ephemeral", "--sandbox", "read-only", "--model", MODEL, "--output-schema", str(schema_path), "--output-last-message", str(output_path)]
        if needs_mcp:
            config = json.loads(_mcp_config_path().read_text(encoding="utf-8"))["mcpServers"]["mcp-reportes-mock"]
            cmd += ["--config", f'mcp_servers.reportes.command={json.dumps(config["command"])}', "--config", f'mcp_servers.reportes.args={json.dumps(config["args"])}', "--config", "mcp_servers.reportes.required=true", "--config", 'mcp_servers.reportes.default_tools_approval_mode="auto"']
        cmd.append(f"{system_prompt}\n\nReporte de entrada (JSON):\n{json.dumps(user_payload, ensure_ascii=False)}\n\nResponde exclusivamente con JSON que cumpla el esquema.")
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=TIMEOUT_S, stdin=subprocess.DEVNULL)
        if r.returncode != 0:
            raise RuntimeError(f"codex exec falló (exit {r.returncode}): {r.stderr.strip()[:500]}")
        return json.loads(output_path.read_text(encoding="utf-8").strip())


def _check_case(output: dict, case: dict) -> list[str]:
    errors: list[str] = []

    for key, expected in case.get("expect_equals", {}).items():
        actual = output.get(key)
        if actual != expected:
            errors.append(f"{key}: esperado={expected!r} obtenido={actual!r}")

    for key in case.get("expect_present", []):
        if key not in output or output[key] in (None, "", []):
            errors.append(f"{key}: ausente o vacío")

    for key, allowed in case.get("expect_in", {}).items():
        if output.get(key) not in allowed:
            errors.append(f"{key}: {output.get(key)!r} no está en {allowed}")

    for key, max_lines in case.get("expect_max_lines", {}).items():
        val = str(output.get(key, ""))
        n_lines = len(val.splitlines()) or 1
        if n_lines > max_lines:
            errors.append(f"{key}: {n_lines} líneas > máximo {max_lines}")

    for key, forbidden in case.get("expect_not_contains", {}).items():
        val = str(output.get(key, ""))
        for token in forbidden:
            if token.lower() in val.lower():
                errors.append(f"{key}: contiene texto prohibido {token!r}")

    for key, bounds in case.get("expect_range", {}).items():
        lo, hi = bounds
        val = output.get(key)
        if not isinstance(val, (int, float)) or not (lo <= val <= hi):
            errors.append(f"{key}: {val!r} fuera de rango [{lo}, {hi}]")

    return errors


def run_agent_tests(agent_name: str, verbose: bool = False) -> dict:
    prompt_path = PROMPTS_DIR / f"{agent_name}.md"
    cases_path = CASES_DIR / f"{agent_name}.cases.json"
    schema_path = CONTRACTS_DIR / f"{agent_name}.schema.json"

    if not prompt_path.exists() or not prompt_path.read_text(encoding="utf-8").strip():
        return {"agent": agent_name, "ok": False, "error": f"{prompt_path} no existe o está vacío"}
    if not cases_path.exists():
        return {"agent": agent_name, "ok": False, "error": f"No existe {cases_path}"}
    if not schema_path.exists():
        return {"agent": agent_name, "ok": False, "error": f"No existe {schema_path}"}

    system_prompt = prompt_path.read_text(encoding="utf-8")
    cases_doc = json.loads(cases_path.read_text(encoding="utf-8"))
    cases = cases_doc["cases"]
    needs_mcp = cases_doc.get("needs_mcp", False)
    schema = json.loads(schema_path.read_text(encoding="utf-8"))

    results = []
    n_pass = 0
    for case in cases:
        entry: dict = {"id": case["id"]}
        try:
            output = _run_codex(system_prompt, case["input"], schema, needs_mcp)
            errors = []
            if jsonschema:
                try:
                    jsonschema.validate(output, schema)
                except jsonschema.ValidationError as e:
                    errors.append(f"schema: {e.message}")
            errors += _check_case(output, case)
            entry["output"] = output
            entry["errors"] = errors
            entry["pass"] = len(errors) == 0
        except Exception as e:  # noqa: BLE001 — queremos capturar cualquier falla del subproceso/parseo
            entry["pass"] = False
            entry["errors"] = [f"excepción: {e}"]
        results.append(entry)
        if entry["pass"]:
            n_pass += 1
        if verbose:
            status = "PASS" if entry["pass"] else "FAIL"
            print(f"  [{status}] {entry['id']}" + (f" — {entry['errors']}" if entry["errors"] else ""), file=sys.stderr)

    summary = {
        "agent": agent_name,
        "total": len(cases),
        "passed": n_pass,
        "pass_rate": round(n_pass / len(cases), 3) if cases else 0.0,
        "ok": n_pass == len(cases),
        "results": results,
    }
    return summary


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("agent", help="classifier | pattern | acuse | evidence | dedup | escalation")
    parser.add_argument("--verbose", action="store_true", help="Imprime progreso caso por caso a stderr")
    args = parser.parse_args()

    summary = run_agent_tests(args.agent, verbose=args.verbose)
    print(json.dumps(summary, indent=2, ensure_ascii=False))
    sys.exit(0 if summary.get("ok") else 1)
