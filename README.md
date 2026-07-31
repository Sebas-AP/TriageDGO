# Sistema de Triage Inteligente 072

Triage de reportes ciudadanos (bache, fuga de agua, cable caído, etc.)
mediante 6 agentes de razonamiento orquestados en paralelo por un
Supervisor. Entrada multicanal: formulario web, WhatsApp y llamada
telefónica.

## Stack

| Capa | Tecnología |
|---|---|
| **Frontend** | React 18 + TypeScript 5.6, Vite 5, TanStack Query, react-hook-form + Zod, Leaflet, Firebase SDK |
| **Backend** | Express 4 + TypeScript 5.6, Zod, Multer, Firebase Admin SDK |
| **Agentes IA** | 6 prompts `.md` ejecutados vía `codex exec` (modelo `gpt-5.6-luna`) con JSON Schema |
| **RAG** | Python 3 / FastAPI, sentence-transformers, FAISS |
| **MCP** | Model Context Protocol SDK (`@modelcontextprotocol/sdk`) |
| **Base de datos** | Firebase Firestore + Firebase Storage + Firebase Auth |
| **Canales** | Twilio (WhatsApp + Voice), Whisper API (transcripción) |
| **Mapas** | Google Maps (Geocoding + Places), Open-Meteo (clima) |
| **Testing** | Vitest, Testing Library, Playwright (E2E), pytest (contratos Python) |

## Estructura

```
agents/           Fábrica TDD de los 6 agentes (specs, contratos, prompts, tests)
assets/           Taxonomía, fixtures de reportes, catálogo de escuelas
backend/          Express + TypeScript + Firebase (monolito en 3 capas)
frontend/         React + Vite + TypeScript (wizard ciudadano + consola admin)
rag-service/      Microservicio Python (embeddings + búsqueda semántica)
services/         Servidores MCP independientes (mcp-reportes)
tests/            Contratos pydantic + mocks para la orquestación
docs/             Documentación adicional (plan, credenciales, API)
arq.md            Documento de arquitectura completo
CLAUDE.md         Instrucciones para agentes de IA
```

## Arranque local

### Prerrequisitos

- Node.js 20+
- Python 3.10+
- Firebase project (o emuladores)
- CLI `codex` instalado y autenticado

### Instalación

```bash
# Backend
cd backend && npm install

# Frontend
cd frontend && npm install

# RAG service
cd rag-service && python3 -m pip install -r requirements.txt
```

### Variables de entorno

Copia `.env.example` a `.env` en la raíz del proyecto y completa las
credenciales necesarias. Ver `docs/env.md` para el detalle de cada variable.

### Levantar todo

```bash
./run-all.sh
```

Esto inicia los 4 procesos en paralelo:

| Servicio | URL |
|---|---|
| Frontend | http://localhost:5173 |
| Backend | http://localhost:3000 |
| RAG | http://127.0.0.1:8001 |
| Worker | (proceso en segundo plano, sin puerto) |

Los logs se escriben en `.run-logs/`.

### Levantar por separado

```bash
# Backend
cd backend && npm run dev

# Worker (procesamiento asíncrono)
cd backend && npm run worker

# Frontend
cd frontend && npm run dev

# RAG
cd rag-service && uvicorn main:app --host 127.0.0.1 --port 8001
```

## Comandos clave

```bash
# Backend
cd backend && npm test          # Vitest
cd backend && npm run lint      # TypeScript type-check

# Frontend
cd frontend && npm test         # Vitest
cd frontend && npm run lint     # TypeScript type-check
cd frontend && npm run test:e2e # Playwright

# Agentes (fábrica TDD)
python3 agents/tests/harness.py <agente> --verbose
python3 agents/tests/integration_test.py classifier pattern acuse

# Contratos Python
pytest tests/ -v
```

## Agentes de razonamiento

| Agente | Propósito | MCP | Prompt |
|---|---|---|---|
| `classifier` | Categoría + urgencia base + área responsable | No | `agents/prompts/classifier.md` |
| `pattern` | Detector de patrones y causa estructural | Sí (`buscar_similares`) | `agents/prompts/pattern.md` |
| `acuse` | Redacción de mensaje al ciudadano | No | `agents/prompts/acuse.md` |
| `evidence` | Análisis de foto/video adjunto (visión) | No | `agents/prompts/evidence.md` |
| `dedup` | Detección de reportes duplicados | No | `agents/prompts/dedup.md` |
| `escalation` | Escalamiento a director de área | No | `agents/prompts/escalation.md` |

Ver `agents/README.md` para la fábrica TDD y `arq.md` para la
arquitectura completa.

## Documentación

| Archivo | Contenido |
|---|---|
| `arq.md` | Arquitectura completa (capas, MCP, reglas, colecciones) |
| `CLAUDE.md` | Instrucciones para agentes de IA que trabajan en este repo |
| `docs/api.md` | Referencia de endpoints del backend |
| `docs/env.md` | Variables de entorno por servicio |
| `docs/plan-viernes.md` | Plan de trabajo y criterios de aceptación |
| `docs/ROL2_CREDENCIALES.md` | Guía de configuración de credenciales |
| `agents/README.md` | Fábrica TDD de agentes de razonamiento |
| `rag-service/README.md` | Microservicio RAG |
