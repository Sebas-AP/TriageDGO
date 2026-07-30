# Arquitectura de Software — Sistema de Triage Inteligente 072

**Base:** Reto 03 · Capstone DuranIA (supervisor + 3 subagentes en paralelo + MCP)
**Extensión:** entrada multicanal (formulario wizard, WhatsApp, llamada), agente de evidencias, roles ciudadano/admin, RAG de reportes y de pagos.
**Stack impuesto:** Frontend React · Backend Express (monolito) · BD y Storage Firebase · Transcripción vía API Whisper · Arquitectura de 3 capas.

---

## 1. Principio arquitectónico

El sistema se construye como un **monolito modular en 3 capas** (Presentación → Negocio → Datos). Dentro de la capa de Negocio vive el núcleo multiagente. Se extraen a **microservicios/MCP servers independientes** únicamente los componentes que:

- requieren un runtime distinto a Node (embeddings con `sentence-transformers` es Python), o
- son "herramientas" (tools) que el propio reto exige exponer como **servidores MCP** reutilizables por cualquier agente, o
- envuelven APIs externas de terceros (Twilio, Google Maps) y conviene aislar sus credenciales/rate limits.

**Decisión clave: ejecución de agentes vía Claude Code CLI.** Los 6 agentes de razonamiento (clasificador, detector de patrones, escritor de acuse, análisis de evidencias, detector de duplicados, escalamiento) **no se ejecutan como código TypeScript dentro del monolito**, sino como **procesos `claude` CLI independientes** (suscripción de Claude Code, no API Anthropic con costo por token). Cada agente es un archivo `.md` con su system prompt; cuando el Supervisor necesita ejecutarlo, crea un nuevo subproceso `claude -p` que lee el prompt, recibe el payload del reporte, puede invocar MCP tools si necesita, y devuelve JSON estructurado. Esto descentraliza la lógica de razonamiento y aprovecha la suscripción pagada.

Todo lo demás (orquestación del supervisor, controllers, reglas de arbitraje, acceso a Firestore, invocación de procesos `claude`) permanece **dentro del monolito Express**.

```
┌───────────────────────────────────────────────────────────────────┐
│                        CAPA DE PRESENTACIÓN                       │
│  React SPA (wizard ciudadano + consola admin)                     │
│  Webhooks de canal: WhatsApp (Twilio) · Voz (Twilio) · Form API   │
└───────────────────────────────┬───────────────────────────────────┘
                                 │ HTTPS / REST / WebSocket (estado en vivo)
┌───────────────────────────────▼───────────────────────────────────┐
│                    CAPA DE NEGOCIO (Express, monolito)             │
│  Controllers → Orquestador Supervisor → Procesos claude-p (agentes)│
│  Servicios: Ingesta, Prioridad dinámica, Notificación             │
│  Agent-runner: invocación de CLI `claude` para cada subagente      │
└───────┬───────────────┬───────────────┬───────────────┬───────────┘
        │ MCP (agentes  │ MCP           │ MCP           │ HTTP
        │ en sesión)    │ (supervisor)  │ (supervisor)  │
        ▼                ▼               ▼               ▼
┌──────────────┐ ┌───────────────┐ ┌──────────────┐ ┌─────────────────┐
│ Procesos     │ │ MCP Twilio    │ │ MCP Reportes │ │ Microservicio    │
│ claude -p    │ │ (WhatsApp/voz)│ │ (tickets/    │ │ RAG (Python:     │
│ (6 agentes)  │ │               │ │  similares)  │ │ sentence-transf.)│
└──────┬───────┘ └───────┬───────┘ └──────┬───────┘ └────────┬─────────┘
       │ stdin/stdout      │                │                  │
       │ (JSON)            ▼                ▼                  ▼
       │           ┌───────────────────────────────┐
       │           │     MCP Google Maps           │
       │           │     (geocodificación, lugares)│
       └──────────▶│                               │
                   └───────────────────────────────┘
                             ▼
┌───────────────────────────────────────────────────────────────────┐
│                         CAPA DE DATOS                              │
│  Firebase Firestore (tickets, reportes, usuarios, predial)         │
│  Firebase Storage (evidencia foto/video, audio de llamadas)        │
│  Firebase Auth (roles: ciudadano / admin)                          │
│  Índice vectorial (embeddings de reportes) — dentro del RAG svc    │
└───────────────────────────────────────────────────────────────────┘
```

---

## 2. Capa de Presentación

### 2.1 React SPA — dos superficies

| Superficie | Usuario | Contenido |
|---|---|---|
| **Wizard de reporte** | Ciudadano (`usuario_inv`) | Formulario dinámico paso a paso: nombre → ubicación (mapa + input, usa MCP Maps para autocompletar/geocodificar) → descripción libre → adjuntar foto/video (opcional) → confirmación con folio. El wizard puede disparar una clasificación básica previa (antes del supervisor multiagente) si requiere clarificación ("¿el bache está en la vía principal o en un callejón?"), pero solo bloquea el avance si el ciudadano no ha dado "Siguiente"; si ya avanzó, el reporte se envía con lo que hay. |
| **Consola admin** | Trabajador municipal (`usuario_admin`) | Bandeja de reportes entrantes en tiempo real (WebSocket/SSE), panel de estado de los 3 subagentes en paralelo, ticket resultante con color por prioridad P0–P3, mapa con históricos similares, botón de reproceso manual, vista de reportes duplicados fusionados. |

### 2.2 Canales de entrada (todos convergen al mismo endpoint interno `POST /reportes/ingesta`)

```
┌────────────┐   ┌────────────┐   ┌────────────────────┐
│ Formulario │   │ WhatsApp   │   │ Llamada telefónica  │
│ (React)    │   │ (Twilio)   │   │ (Twilio Voice)      │
└─────┬──────┘   └─────┬──────┘   └─────────┬───────────┘
      │ REST           │ webhook          │ webhook (audio URL)
      ▼                ▼                  ▼
┌──────────────────────────────────────────────────────┐
│ Adaptador de canal (normaliza a "ReporteCrudo")        │
│  - Form:      texto ya estructurado                   │
│  - WhatsApp:  texto/imagen/audio de voz → si hay audio,│
│               se manda a Whisper API para transcribir  │
│  - Llamada:   audio completo de la llamada → Whisper   │
│               API → texto                              │
└───────────────────────┬────────────────────────────────┘
                         ▼
              POST /reportes/ingesta (interno)
```

- **WhatsApp**: Twilio recibe el mensaje → webhook `POST /webhooks/whatsapp` en Express → si el mensaje trae una nota de voz o el ciudadano llama dentro del hilo, el audio se descarga de la URL de Twilio y se envía a **Whisper API** para transcripción antes de entrar al pipeline.
- **Llamada**: Twilio Voice contesta con un flujo IVR simple ("cuéntenos qué pasó, ubicación aproximada") y graba; al finalizar, el webhook `POST /webhooks/voz` recibe la URL de la grabación → Whisper API transcribe → se arma el `ReporteCrudo` igual que los otros canales.
- **Formulario**: ya llega estructurado (nombre, ubicación, descripción, adjuntos), no pasa por Whisper.

Este adaptador es lo único "consciente" del canal; a partir de aquí todo el pipeline multiagente es agnóstico al canal de origen.

---

## 3. Capa de Negocio (Express — monolito)

Organización interna típica de 3 capas dentro del propio backend:

```
src/
├── presentation/        # controllers + rutas + webhooks + validación de entrada
│   ├── report.controller.ts
│   ├── whatsapp.webhook.ts
│   ├── voice.webhook.ts
│   └── admin.controller.ts
├── business/             # lógica de negocio: orquestación multiagente
│   ├── orchestrator/
│   │   └── supervisor.ts         # dispara subagentes (procesos claude) en paralelo, arbitra
│   ├── agents/
│   │   ├── prompts/               # "cerebro" de cada agente (system prompts)
│   │   │   ├── classifier.md      # categoría + urgencia_base + área
│   │   │   ├── pattern.md         # detector de patrones (puede usar MCP buscar_similares)
│   │   │   ├── acuse.md           # redacta mensaje al ciudadano
│   │   │   ├── evidence.md        # analiza foto/video adjunto (con visión de Claude)
│   │   │   ├── dedup.md           # (Pro) detecta duplicado reciente
│   │   │   └── escalation.md      # (Extremo) escalamiento a director + resumen semanal
│   │   ├── agent-runner.ts        # única pieza que invoca `claude -p` (CLI)
│   │   ├── classifier.agent.ts    # orquestación: agent-runner.run('classifier', payload)
│   │   ├── pattern.agent.ts       # orquestación: agent-runner.run('pattern', payload)
│   │   ├── acuse.agent.ts
│   │   ├── evidence.agent.ts
│   │   ├── dedup.agent.ts
│   │   └── escalation.agent.ts
│   ├── rules/
│   │   ├── priority.rules.ts     # matriz P0–P3 + modificadores
│   │   └── arbitration.rules.ts  # reglas 1–5 del supervisor
│   └── services/
│       ├── transcription.service.ts   # llama Whisper API (externa)
│       ├── notification.service.ts    # llama MCP Twilio (enviar_acuse)
│       └── cost.service.ts            # estimación de costo por atención
└── data/                 # capa de acceso a datos (repos)
    ├── firestore/
    │   ├── reports.repo.ts
    │   ├── tickets.repo.ts
    │   ├── users.repo.ts
    │   └── predial.repo.ts
    └── storage/
        └── evidence.repo.ts   # Firebase Storage (fotos/video/audio)
```

### 3.1 Orquestación: Supervisor + subagentes en paralelo (procesos `claude -p`)

```
ReporteCrudo
   │
   ▼
┌─────────────────────────────────────────────┐
│                SUPERVISOR                    │
│  Promise.allSettled([...])                   │
│  Lanza 3-6 procesos `claude -p` en paralelo  │
└───┬─────────────┬─────────────┬──────────────┘
    ▼              ▼              ▼
┌────────┐  ┌──────────────┐ ┌──────────┐
│claude -p │  │claude -p     │ │claude -p │
│classifier│  │pattern.md    │ │acuse.md  │
│.md      │  │(+ MCP para   │ │(solo     │
│(catego) │  │buscar_       │ │redacción)│
│         │  │similares)    │ │          │
└────┬────┘  └──────┬───────┘ └─────┬────┘
     │              │               │
     └──────┬───────┴───────┬───────┘
            ▼                ▼
   (si hay evidencia)   (opcional Pro)
┌──────────────────┐  ┌──────────────┐
│claude -p         │  │claude -p     │
│evidence.md       │  │dedup.md      │
│(foto/video → IA) │  │(¿duplicado?) │
└──────────────────┘  └──────────────┘
            │
            ▼
┌─────────────────────────────────────────────┐
│      SUPERVISOR — consolidación (Express)    │
│  aplica reglas de arbitraje (1–5) +          │
│  modificadores de prioridad (escuela,        │
│  reincidencia, vulnerabilidad, clima)         │
│  decide: urgencia_final, prioridad_final,    │
│  revision_manual, escalar_a                  │
└───────────┬───────────────────────────────────┘
                ▼
      MCP crear_ticket()  →  ticket_id
                ▼
      MCP enviar_acuse()  →  WhatsApp al ciudadano
                ▼
   (Extremo) si crítico + <500m de escuela:
      claude -p escalation.md → notifica director de área
```

**Manejo de fallas (Regla 3):** el supervisor usa `Promise.allSettled` en vez de `Promise.all`, así un subproceso que falla (exit code ≠ 0, timeout, JSON inválido, rate limit de la suscripción) no tumba a los demás; el ticket se marca `revision_manual: true` y sigue con la info disponible.

**Detalles de invocación de agentes:** cada `claude -p` se construye así:
```bash
claude -p \
  --model haiku-4.5 \
  --append-system-prompt "$(cat src/business/agents/prompts/classifier.md)" \
  --mcp-config path/to/mcp-config.json \
  --output-format json \
  --json-schema '{"$schema":"...", "type":"object"}' \
  <<< '{"texto":"...", "coordenadas":[...], ...}'
```
- **Modelo:** todos los agentes usan `--model haiku-4.5` (rápido, bajo consumo de cuota de suscripción). Para tareas complejas de clasificación/análisis que requieran más razonamiento, evaluar caso a caso.
- El array de argumentos se construye sin concatenación de strings (previene inyección).
- Cada agente recibe su `.md` específico con `--append-system-prompt` (la "inteligencia" del agente).
- Solo los agentes que necesiten MCP (ej. `pattern.md`) incluyen `--mcp-config`.
- La respuesta es JSON estructurada, validada en el supervisor.

### 3.2 Agente de evidencias (foto/video)

- Recibe el/los archivo(s) adjuntos del wizard o de WhatsApp (Twilio media URL).
- Sube el archivo a **Firebase Storage** (`/evidencias/{reporte_id}/...`).
- Se ejecuta como `claude -p evidence.md` con la imagen adjunta (descargada a disco local), usando la capacidad de **visión de Claude** para: (a) confirmar que la imagen corresponde a la descripción, (b) extraer señales de severidad (ej. tamaño del bache, cable expuesto visible, agua acumulada), (c) generar una etiqueta corta que el clasificador puede usar como contexto adicional.
- Su output es **una entrada más para el Clasificador**, no reemplaza las reglas de prioridad; solo aporta evidencia visual.

### 3.3 Operación de agentes (integración con CLI y suscripción)

La ejecución de cada agente es responsabilidad de **`agent-runner.ts`**, un módulo en Node que:

1. **Construye el comando** como array de strings (sin concatenación, previene inyección) con el binario `claude`, flags de autenticación implícitos (la suscripción está configurada en la sesión del sistema), rutas a los archivos `.md` y MCP config, y **`--model haiku-4.5`** (modelo para todos los agentes).
2. **Carga el prompt** del agente desde su archivo `.md` en `src/business/agents/prompts/`.
3. **Adjunta MCP config** solo para agentes que lo necesiten (`pattern.md`, `evidence.md` si requiere búsquedas posteriores).
4. **Pasa el payload** (reporte + contexto previo) como JSON en stdin, solicita salida estructurada con `--output-format json` + `--json-schema`.
5. **Espera el resultado** (timeout típico: 30–60s por agente) y retorna el JSON al supervisor, o captura errores (rate limit, timeout, malformed JSON) para registrar en `log_agentes` y marcar `revision_manual: true`.
6. **Registra la invocación** en `log_agentes.jsonl`: timestamps, agente, duración, exit code, status (éxito/fallo/rate-limit), modelo usado.

**Selección de modelo (Haiku 4.5):**
- **Por qué Haiku:** los 6 agentes ejecutan tareas específicas y acotadas (clasificación, búsqueda de patrones, síntesis de acuse, análisis de imagen); Haiku es suficiente y consume menos cuota de suscripción, permitiendo mayor concurrencia.
- **Excepción:** si un agente falla consistentemente con Haiku (ej. clasificación ambigua que requiere más razonamiento), evaluar usar `--model opus-4.8` solo para ese agente, pero documentar en `log_agentes`.

**Requisitos operacionales:**
- El host/contenedor que ejecuta Express **debe tener instalado el CLI `claude`** y **autenticado con la suscripción** (sesión persistida localmente, no vía API key).
- **Sin FaaS/serverless efímero** (no sobrevive la autenticación entre instancias).
- **Control de concurrencia:** la suscripción tiene ventanas de uso; usar un semáforo o queue para limitar procesos `claude` simultáneos (recomendado: máximo 5–10 agentes en paralelo concurrentes globalmente, no por reporte).
- **Monitoreo de cuota:** `log_agentes` permite seguir uso real vs. límites de la suscripción. Con Haiku, el consumo es menor; ajustar límites de concurrencia según observación real.

### 3.4 Prioridad dinámica y modificadores

El **Clasificador** (agente) aplica la matriz heurística (riesgo a la vida, alcance del impacto, velocidad de deterioro) para asignar `urgencia_base`. El **Supervisor**, al consolidar, aplica:

- **Reglas de arbitraje del reto** (similares ≥10 + causa estructural ⇒ mínimo alta; categoría de riesgo + <500m de escuela ⇒ crítica; fallo de subagente ⇒ revisión manual; ticket antes que acuse; mapping fijo urgencia→prioridad).
- **Modificadores sugeridos por el usuario / Claude**, aplicados como *ascenso de un nivel* (nunca descenso):
  - Ubicación cerca de escuela, hospital o zona de alta afluencia (vía MCP Google Maps → `places nearby`).
  - Reincidencia (mismo ciudadano o misma ubicación con reportes previos, vía RAG).
  - Vulnerabilidad de la población (si el ciudadano lo indica en el formulario).
  - Clima agravante (lluvia inminente + drenaje tapado) — puede consultarse un servicio de clima externo si se desea, opcional.
  - **Zona con pago de predial al corriente**: se consulta el RAG/BD de pagos; no cambia la prioridad operativa del servicio público, pero se anota en el ticket como dato de contexto para la Dirección de Obras (transparencia de recursos, no como criterio para negar o acelerar el servicio).
  - Lugar público o cercanía a lugar público (vía MCP Google Maps).

---

## 4. Servidores MCP (herramientas)

Se implementan como **procesos MCP independientes** (aislamiento de credenciales, reutilizables por cualquier agente), pero desplegados junto al monolito (mismo repo/mono-repo, procesos separados).

**Dos consumidores de MCP:**
1. **Agentes de razonamiento** (clasificador, detector de patrones, evidencias, escalamiento) invocan MCP **dentro de su sesión `claude -p`** usando `--mcp-config`, como tools nativas. El agente puede decidir cuándo llamar la tool, cómo procesar el resultado, etc.
2. **Supervisor/servicios Express** invocan MCP **directamente desde Node** para operaciones deterministas (crear ticket, enviar acuse).

### 4.1 MCP Reportes (`buscar_similares`, `crear_ticket`, `enviar_acuse`)
- `buscar_similares(texto, lat, lon, radio_km, dias)`: herramienta disponible para agentes de razonamiento (ej. `pattern.md` la llama). Delega el embedding del texto al **microservicio RAG** (sentence-transformers), calcula proximidad con haversine y filtra por ventana temporal contra Firestore. Devuelve `similares_encontrados`, `posible_causa_estructural`, `ascenso_sugerido`.
- `crear_ticket(...)`: llamada **directa desde Supervisor (Express)**, no desde agentes. Escribe en Firestore (`tickets` collection), devuelve `ticket_id`.
- `enviar_acuse(ciudadano_id, mensaje)`: llamada **directa desde Supervisor o desde agente escalation.md**. Delega al MCP Twilio para el envío real por WhatsApp.

### 4.2 MCP Twilio
- `enviar_whatsapp(destino, mensaje)` — usado por `enviar_acuse` y por el agente de escalamiento.
- `iniciar_llamada` / `recibir_grabacion` — soporte al canal de voz.
- Aísla las credenciales de Twilio del resto del monolito.

### 4.3 MCP Google Maps
- `geocodificar(direccion)` — usado por el wizard para convertir la ubicación escrita en lat/lon.
- `distancia(lat, lon, destino)` / `lugares_cercanos(lat, lon, tipo)` — usado por el Clasificador/Supervisor para la Regla 2 (cercanía a escuela) y el modificador de "lugar público".

---

## 5. Microservicio RAG (única pieza fuera de Node)

**Por qué microservicio y no monolito:** `sentence-transformers` requiere Python; separarlo evita mezclar runtimes en el mismo proceso Express y permite escalarlo de forma independiente (es la parte con más carga de CPU/GPU).

```
┌───────────────────────────────────────────┐
│      Microservicio RAG (Python/FastAPI)     │
│  - /embed          → vector de un texto     │
│  - /buscar_reportes → similitud + haversine │
│  - /buscar_pagos    → estado predial por    │
│                       ubicación/propietario │
│  - Índice vectorial en memoria o en un      │
│    almacén ligero (ej. FAISS) + Firestore   │
│    como fuente de verdad de los documentos  │
└───────────────────────────────────────────┘
```

- **RAG de reportes:** embeddings de cada reporte histórico (se agregan nuevos conforme entran tickets confirmados), consultado por `buscar_similares`.
- **RAG de pagos (predial):** embeddings/índice por ubicación o clave catastral, consultado para anotar contexto de recursos en el ticket (no bloquea ni prioriza el servicio).
- El MCP Reportes es cliente HTTP de este microservicio; el resto del sistema no lo llama directamente.

---

## 6. Capa de Datos (Firebase)

### 6.1 Firestore — colecciones principales

| Colección | Contenido clave |
|---|---|
| `reportes` | reporte crudo + texto normalizado + canal de origen + coordenadas + ciudadano_id + estado |
| `tickets` | categoria, urgencia_final, prioridad_final, area, patron_detectado, regla_gatillada, acuse_enviado, revision_manual, escalar_a |
| `usuarios` | perfil ciudadano/admin, rol (Firebase Auth custom claims) |
| `predial` | estatus de pago por ubicación/clave catastral (fuente para el RAG de pagos) |
| `escuelas` / `lugares_publicos` | catálogo estático usado como respaldo si el MCP Maps no responde |
| `log_agentes` | trazabilidad de cada delegación paralela y consolidación, con timestamps |

### 6.2 Firebase Storage

- `/evidencias/{reporte_id}/foto|video` — subidas por el Agente de Evidencias.
- `/audio/{reporte_id}/llamada|nota_voz` — audio crudo antes de pasar por Whisper (se conserva para auditoría).

### 6.3 Firebase Auth

- Roles vía *custom claims*: `ciudadano` (usuario_inv) vs `admin` (usuario_admin). Las reglas de seguridad de Firestore/Storage restringen lectura de tickets completos solo a `admin`; el ciudadano solo ve el estado/folio de sus propios reportes.

---

## 7. Flujo end-to-end (secuencia)

```
Ciudadano ─┬─(form)──────────────┐
           ├─(WhatsApp)──────────┤
           └─(llamada)───────────┤
                                 ▼
                     Adaptador de canal
                     (+ Whisper API si hay audio)
                                 ▼
                    POST /reportes/ingesta
                                 ▼
              SUPERVISOR (Express, orquestador)
              Promise.allSettled([...])
    ┌─────────────┬─────────────┬─────────────────┬──────────┐
    ▼             ▼             ▼                 ▼          ▼
  claude -p    claude -p     claude -p        claude -p   claude -p
  classifier   pattern       acuse            evidence    dedup
  .md          .md + MCP     .md              .md + visión  .md
              (buscar_sim)   (solo redacta)
    │             │             │                 │          │
    └─────────────┴─────────────┴─────────────────┴──────────┘
                          ▼
               SUPERVISOR consolida (Express)
        (reglas de arbitraje + modificadores)
                          ▼
              MCP crear_ticket → ticket_id
                          ▼
              MCP enviar_acuse → Twilio WhatsApp
                          ▼
        (si crítico + cerca de escuela)
              claude -p escalation.md
                (+ MCP Twilio para notificar director)
                          ▼
              Consola admin (WebSocket, tiempo real)
```

---

## 8. Cambios arquitectónicos vs. versión anterior

**Principal:** El sistema cambió de ejecutar agentes **in-process dentro de Express (SDK de Anthropic)** a **procesos CLI independientes** (`claude -p`, suscripción de Claude Code):

| Aspecto | Versión anterior | Versión actual |
|---|---|---|
| **Ejecución de agentes** | Módulos TypeScript (`.agent.ts`) que llaman SDK Anthropic (API, pago por token). | Procesos `claude -p` invocados desde Express; cada agente es un `.md` con su system prompt (suscripción, costo fijo). |
| **"Cerebro" del agente** | Embedded en `const SYS_CLASIFICADOR = "...";` dentro del `.ts`. | Archivo `.md` independiente en `src/business/agents/prompts/`. |
| **MCP en agentes** | Agentes como código tenían acceso manual a herramientas. | Agentes CLI invocan MCP como tools nativas vía `--mcp-config`; el agente decide cuándo llamarlas. |
| **Análisis de visión (evidencias)** | Llamada externa a API de visión (modelo de tercero). | Integrada en `claude -p evidence.md` usando capacidad nativa de visión de Claude. |
| **Hosting/Deploy** | Serverless-compatible (FaaS): solo necesita Node + API key. | Host persistente: requiere CLI `claude` instalado + autenticado con suscripción. No compatible con FaaS efímero. |
| **Monitoreo de uso** | Métricas: tokens consumidos, $. | Métricas: cuota de suscripción (ventanas de uso), log de invocaciones (timestamps, duración, exit code). |
| **Escalabilidad concurrencia** | Ilimitada (billing cresce con uso). | Limitada por ventana de la suscripción; usar semáforo para no saturar límite. Recomendado: ≤10 procesos `claude` paralelos. |
| **Modelo de IA usado** | Implícito (típicamente el default de SDK). | Explícito: todos los agentes usan `haiku-4.5` por defecto (rápido, bajo consumo de cuota); evaluar `opus-4.8` por agente si falla. |

---

## 9. Costos y consideraciones operativas

- **Claude Code (suscripción)**: costo **fijo** por suscripción, no marginal por token. Los 6 agentes de razonamiento están cubiertos. El monitor es **cuota de uso** (ventana de uso del plan), no gasto: `log_agentes` registra duración y exit code de cada invocación de agente para alertar si se aproxima al límite. Todos los agentes usan `haiku-4.5` por defecto (bajo consumo de cuota); excepciones documentadas en `log_agentes` si un agente requiere `opus-4.8`.
- **Twilio**: costo por mensaje de WhatsApp y por minuto de llamada; el adaptador de canal debe registrar el costo estimado por reporte en `log_agentes` o en el propio ticket, para métricas por colonia/categoría que pide la Alcaldía.
- **Whisper API**: costo por minuto de audio transcrito (sigue siendo externo, no cubierto por Claude Code); se recomienda limitar duración máxima de grabación en el IVR de Twilio.
- **RAG/embeddings**: correr el microservicio con el modelo pre-descargado (evita latencia de descarga en cada arranque, igual que sugiere el starter del reto).
- **Predial**: el dato de pago de predial se usa solo como **contexto informativo** para la Dirección de Obras/Alcaldía (transparencia de recursos por colonia), nunca como criterio que retrase o niegue la atención de un reporte de riesgo.

**Monitoreo de cuota Claude Code:**
- `log_agentes.jsonl` incluye por cada invocación: `{"timestamp", "agente", "reporte_id", "duracion_ms", "exit_code", "status": "success|timeout|rate_limit|json_error"}`.
- Alertar operacional si la tasa de `rate_limit` o timeouts supera 5% en ventana de 1h.
- Escalar a usuario si la suscripción está cercana al límite de uso (extraer métrica de sesiones exitosas restantes).

---

## 10. Resumen de la decisión monolito vs. microservicio vs. CLI

| Componente | Monolito Express | Microservicio/MCP separado | Proceso `claude -p` (CLI) | Razón |
|---|---|---|---|---|
| Controllers, webhooks, wizard API | ✅ | | | Misma capa de presentación/negocio, sin necesidad de aislar |
| Orquestación Supervisor + reglas de arbitraje | ✅ | | | Lógica de negocio central, comparte estado y contexto de la request |
| **Agentes de razonamiento** (clasificador, patrones, acuse, evidencias, dedup, escalamiento) | | | ✅ | Requieren Claude Code (suscripción), no API Anthropic; cada agente es un `.md` + sesión de CLI nueva |
| Acceso a Firestore/Storage (repos) | ✅ | | | Capa de datos del propio monolito |
| MCP Reportes (buscar_similares, crear_ticket, enviar_acuse) | | ✅ | parcial | Exigido por reto como servidor MCP; `buscar_similares` disponible como tool dentro de sesión agent; `crear_ticket`/`enviar_acuse` llamadas directas desde Express |
| MCP Twilio | | ✅ | | Aísla credenciales/rate limit; disponible para agentes vía `--mcp-config` y directamente desde Express |
| MCP Google Maps | | ✅ | | Aísla credenciales/rate limit; disponible para agentes y servicios Express |
| RAG (embeddings + similitud) | | ✅ (Python) | | Requiere runtime distinto (sentence-transformers); microservicio independiente |
| Transcripción (Whisper) | | Llamada a API externa (no se construye) | | Se consume vía API, no se aloja |

**Nota operacional:** La "Ejecución de agentes" es lógicamente orquestada desde el monolito (Supervisor es Express), pero la **invocación real corre como proceso CLI externo** (`claude -p`), requiriendo que el host tenga el CLI instalado y autenticado con la suscripción de Claude Code. Esto es incompatible con deploys serverless efímeros.