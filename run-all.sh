#!/usr/bin/env bash
set -uo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"
RAG_DIR="$ROOT_DIR/rag-service"
LOG_DIR="${LOG_DIR:-$ROOT_DIR/.run-logs}"

mkdir -p "$LOG_DIR"

PIDS=()
TAIL_PIDS=()

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m'

load_env_file() {
  local env_file="$1"
  if [[ -f "$env_file" ]]; then
    set -a
    source "$env_file"
    set +a
  fi
}

run_background() {
  local name="$1"
  local cwd="$2"
  shift 2
  local log_file="$LOG_DIR/${name}.log"
  
  > "$log_file"
  
  cd "$cwd" || exit 1
  "$@" >>"$log_file" 2>&1 &
  local pid=$!
  cd "$ROOT_DIR" || exit 1
  
  PIDS+=("$pid")
  echo "$pid"
}

tagged_tail() {
  local tag="$1"
  local color="$2"
  local log_file="$3"
  
  tail -f "$log_file" 2>/dev/null | while IFS= read -r line; do
    printf "${color}[%s]${NC} %s\n" "$tag" "$line"
  done &
  TAIL_PIDS+=($!)
}

wait_for_port() {
  local port="$1"
  local name="$2"
  local max_wait="${3:-15}"
  local path="${4:-/}"
  local waited=0
  
  while [[ $waited -lt $max_wait ]]; do
    if curl -s -o /dev/null -w "" "http://127.0.0.1:$port$path" 2>/dev/null; then
      echo "✓ $name listo en puerto $port"
      return 0
    fi
    sleep 1
    waited=$((waited + 1))
  done
  
  echo "✗ $name no respondió en puerto $port después de ${max_wait}s"
  echo "  Ver log: $LOG_DIR/${name,,}.log"
  return 1
}

cleanup() {
  local status=$?
  trap - EXIT INT TERM
  
  echo ""
  echo "Deteniendo servicios..."
  
  # Kill tail processes first
  for pid in "${TAIL_PIDS[@]}"; do
    kill "$pid" 2>/dev/null || true
  done
  
  # Kill service processes
  for pid in "${PIDS[@]}"; do
    if kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null || true
    fi
  done
  
  sleep 1
  for pid in "${PIDS[@]}" "${TAIL_PIDS[@]}"; do
    kill -9 "$pid" 2>/dev/null || true
  done
  
  wait 2>/dev/null || true
  echo "Servicios detenidos."
  exit "$status"
}

trap cleanup EXIT INT TERM

load_env_file "$ROOT_DIR/.env"
[[ -f "$BACKEND_DIR/.env" ]] && load_env_file "$BACKEND_DIR/.env"
[[ -f "$FRONTEND_DIR/.env" ]] && load_env_file "$FRONTEND_DIR/.env"
[[ -f "$RAG_DIR/.env" ]] && load_env_file "$RAG_DIR/.env"

export RAG_SERVICE_URL="${RAG_SERVICE_URL:-http://127.0.0.1:8001}"
export RAG_INTERNAL_TOKEN="${RAG_INTERNAL_TOKEN:-}"
export RAG_INDEX_DIR="${RAG_INDEX_DIR:-$ROOT_DIR/.rag-index}"
export PORT="${PORT:-3000}"

if [[ ! -d "$BACKEND_DIR/node_modules" ]]; then
  echo " Falta instalar dependencias en backend: cd backend && npm install"
  exit 1
fi

if [[ ! -d "$FRONTEND_DIR/node_modules" ]]; then
  echo "❌ Falta instalar dependencias en frontend: cd frontend && npm install"
  exit 1
fi

if ! python3 -c "import uvicorn" >/dev/null 2>&1; then
  echo "❌ Faltan dependencias de Python para rag-service: cd rag-service && python3 -m pip install -r requirements.txt"
  exit 1
fi

if ! python3 -c "from mcp.server.fastmcp import FastMCP" >/dev/null 2>&1; then
  echo "❌ Faltan dependencias MCP: cd services/mcp-reportes && python3 -m pip install -r requirements.txt"
  exit 1
fi

if [[ ! -f "$RAG_DIR/requirements.txt" ]]; then
  echo "❌ No encontré rag-service/requirements.txt"
  exit 1
fi

echo "📁 Logs en: $LOG_DIR"
echo ""

echo "🚀 Iniciando microservicio RAG..."
RAG_PID="$(run_background rag "$RAG_DIR" python3 -m uvicorn main:app --host 127.0.0.1 --port 8001)"
sleep 2

echo "🚀 Iniciando backend..."
BACKEND_PID="$(run_background backend "$BACKEND_DIR" npm run dev)"
sleep 1

echo "🚀 Iniciando worker..."
WORKER_PID="$(run_background worker "$BACKEND_DIR" npm run worker)"
sleep 1

echo " Iniciando frontend..."
FRONTEND_PID="$(run_background frontend "$FRONTEND_DIR" npm run dev -- --host 0.0.0.0)"

echo ""
echo " Esperando que los servicios arranquen..."
echo ""

wait_for_port 8001 "RAG" 10 "/healthz" || true
wait_for_port 3000 "Backend" 15 "/" || true
wait_for_port 5173 "Frontend" 15 "/" || true

echo ""
echo "✅ Proyecto levantado."
echo ""
echo "Frontend:    http://localhost:5173"
echo "Backend:     http://localhost:3000"
echo "RAG:         http://127.0.0.1:8001"
echo ""
echo "Presiona Ctrl+C para detener todo."
echo ""
echo "─────────────────────────────────────────────────────────────"
echo ""

# Start tagged tails for each service
tagged_tail "RAG"     "$CYAN"    "$LOG_DIR/rag.log"
tagged_tail "BACKEND" "$GREEN"   "$LOG_DIR/backend.log"
tagged_tail "WORKER"  "$YELLOW"  "$LOG_DIR/worker.log"
tagged_tail "FRONTEND" "$MAGENTA" "$LOG_DIR/frontend.log"

# Keep script running
wait
