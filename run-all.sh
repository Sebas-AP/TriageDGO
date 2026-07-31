#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"
RAG_DIR="$ROOT_DIR/rag-service"
LOG_DIR="${LOG_DIR:-$ROOT_DIR/.run-logs}"

mkdir -p "$LOG_DIR"

load_env_file() {
  local env_file="$1"
  if [[ -f "$env_file" ]]; then
    set -a
    # shellcheck disable=SC1090
    source "$env_file"
    set +a
  fi
}

run_background() {
  local name="$1"
  local cwd="$2"
  shift 2
  local log_file="$LOG_DIR/${name}.log"
  (
    cd "$cwd"
    "$@"
  ) >"$log_file" 2>&1 &
  echo $!
}

cleanup() {
  local status=$?
  trap - EXIT INT TERM
  if [[ -n "${RAG_PID:-}" ]]; then kill "$RAG_PID" 2>/dev/null || true; fi
  if [[ -n "${BACKEND_PID:-}" ]]; then kill "$BACKEND_PID" 2>/dev/null || true; fi
  if [[ -n "${WORKER_PID:-}" ]]; then kill "$WORKER_PID" 2>/dev/null || true; fi
  if [[ -n "${FRONTEND_PID:-}" ]]; then kill "$FRONTEND_PID" 2>/dev/null || true; fi
  wait 2>/dev/null || true
  exit "$status"
}

trap cleanup EXIT INT TERM

load_env_file "$ROOT_DIR/.env"

if [[ -f "$BACKEND_DIR/.env" ]]; then
  load_env_file "$BACKEND_DIR/.env"
fi

if [[ -f "$FRONTEND_DIR/.env" ]]; then
  load_env_file "$FRONTEND_DIR/.env"
fi

if [[ -f "$RAG_DIR/.env" ]]; then
  load_env_file "$RAG_DIR/.env"
fi

export RAG_SERVICE_URL="${RAG_SERVICE_URL:-http://127.0.0.1:8001}"
export RAG_INTERNAL_TOKEN="${RAG_INTERNAL_TOKEN:-}"
export RAG_INDEX_DIR="${RAG_INDEX_DIR:-$ROOT_DIR/.rag-index}"
export PORT="${PORT:-3000}"

if [[ ! -d "$BACKEND_DIR/node_modules" ]]; then
  echo "Falta instalar dependencias en backend: cd backend && npm install"
  exit 1
fi

if [[ ! -d "$FRONTEND_DIR/node_modules" ]]; then
  echo "Falta instalar dependencias en frontend: cd frontend && npm install"
  exit 1
fi

if ! python3 - <<'PY' >/dev/null 2>&1
import importlib.util
raise SystemExit(0 if importlib.util.find_spec("uvicorn") else 1)
PY
then
  echo "Faltan dependencias de Python para rag-service: cd rag-service && python3 -m pip install -r requirements.txt"
  exit 1
fi

if [[ ! -f "$RAG_DIR/requirements.txt" ]]; then
  echo "No encontré rag-service/requirements.txt"
  exit 1
fi

echo "Logs en: $LOG_DIR"
echo "Iniciando microservicio RAG..."
RAG_PID="$(run_background rag "$RAG_DIR" python3 -m uvicorn main:app --host 127.0.0.1 --port 8001)"

sleep 2

echo "Iniciando backend..."
BACKEND_PID="$(run_background backend "$BACKEND_DIR" npm run dev)"
echo "Iniciando worker..."
WORKER_PID="$(run_background worker "$BACKEND_DIR" npm run worker)"
echo "Iniciando frontend..."
FRONTEND_PID="$(run_background frontend "$FRONTEND_DIR" npm run dev -- --host 0.0.0.0)"

cat <<EOF
Proyecto levantado.

Frontend:    http://localhost:5173
Backend:     http://localhost:3000
RAG:         http://127.0.0.1:8001

Logs:
  $LOG_DIR/frontend.log
  $LOG_DIR/backend.log
  $LOG_DIR/worker.log
  $LOG_DIR/rag.log

EOF

wait -n "$RAG_PID" "$BACKEND_PID" "$WORKER_PID" "$FRONTEND_PID"
