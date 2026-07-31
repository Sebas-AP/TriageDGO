# Frontend — Sistema de Triage 072

Capa de presentación del sistema de triage. React + Vite + TypeScript con
dos superficies: wizard de reporte para ciudadanos y consola administrativa.

## Scripts

```bash
npm run dev          # Desarrollo con Vite (http://localhost:5173)
npm run build        # Compilar a dist/
npm run preview      # Preview de producción
npm test             # Vitest
npm run test:watch   # Modo watch
npm run test:e2e     # Playwright E2E
npm run lint         # TypeScript type-check (tsc --noEmit)
```

## Rutas

| Ruta | Componente | Acceso |
|---|---|---|
| `/` | `ReportWizard` | Público |
| `/reporte/:folio` | `ReportStatusPage` | Público |
| `/admin/login` | `AdminLogin` | Público |
| `/admin` | `AdminConsole` | Protegido (Firebase Auth + claim `admin`) |

## Estructura

```
src/
├── App.tsx                 # Router principal (lazy loading)
├── main.tsx                # Entry point
├── config.ts               # Configuración (modo demo/API, URLs)
├── types.ts                # Tipos compartidos
├── styles.css              # Estilos globales
│
├── app/
│   ├── AuthContext.tsx      # Contexto de autenticación Firebase
│   └── ProtectedRoute.tsx   # Wrapper para rutas protegidas
│
├── components/
│   ├── wizard/
│   │   └── ReportWizard.tsx     # Formulario paso a paso para ciudadanos
│   ├── admin/
│   │   ├── AdminConsole.tsx     # Consola administrativa principal
│   │   ├── DashboardView.tsx    # Dashboard con métricas
│   │   ├── InboxView.tsx        # Bandeja de reportes
│   │   ├── ReportDetail.tsx     # Detalle de reporte/ticket
│   │   ├── OperationalViews.tsx # Vistas operativas
│   │   └── adminUi.ts           # Utilidades de UI admin
│   ├── maps/
│   │   ├── LocationPicker.tsx   # Selector de ubicación en mapa
│   │   ├── ReportMap.tsx        # Mapa de reporte individual
│   │   └── OperationsMap.tsx    # Mapa operativo (admin)
│   ├── AppLoader.tsx            # Spinner de carga
│   ├── Icon.tsx                 # Componente de iconos
│   └── ToastViewport.tsx        # Notificaciones toast
│
├── pages/
│   ├── AdminLogin.tsx           # Login de administradores
│   └── ReportStatusPage.tsx     # Estatus público de reporte
│
├── services/
│   ├── api.ts              # Cliente HTTP (modo API)
│   ├── demo.ts             # Datos simulados (modo demo)
│   ├── contracts.ts        # Interfaces de servicios
│   └── index.ts            # Export barrel
│
└── lib/
    ├── firebase.ts         # Inicialización Firebase SDK
    └── feedback.ts         # Utilidades de feedback (toast)
```

## Modo demo vs API

El frontend opera en dos modos según `VITE_APP_MODE`:

| Modo | Variable | Comportamiento |
|---|---|---|
| `demo` | `VITE_APP_MODE=demo` (default) | Datos simulados en `services/demo.ts`, sin backend |
| `api` | `VITE_APP_MODE=api` | Llamadas reales al backend vía `services/api.ts` |

## Variables de entorno

| Variable | Descripción | Default |
|---|---|---|
| `VITE_APP_MODE` | `demo` o `api` | `demo` |
| `VITE_API_BASE_URL` | URL del backend | `http://localhost:3000` |
| `VITE_FIREBASE_API_KEY` | Firebase Web API key | — |
| `VITE_FIREBASE_AUTH_DOMAIN` | Firebase Auth domain | — |
| `VITE_FIREBASE_PROJECT_ID` | Firebase project ID | — |
| `VITE_FIREBASE_STORAGE_BUCKET` | Firebase Storage bucket | — |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Firebase messaging sender | — |
| `VITE_FIREBASE_APP_ID` | Firebase app ID | — |
| `VITE_MAX_PHOTO_MB` | Tamaño máximo de foto (MB) | `5` |

Ver `.env.example` en `frontend/` y `docs/env.md` para más detalle.

## Dependencias principales

| Paquete | Uso |
|---|---|
| `react` + `react-dom` | UI framework |
| `react-router-dom` | Routing |
| `@tanstack/react-query` | Data fetching y caché |
| `react-hook-form` + `@hookform/resolvers` | Formularios + validación Zod |
| `leaflet` + `react-leaflet` | Mapas interactivos |
| `firebase` | SDK cliente (Auth, Firestore, Storage) |
| `zod` | Validación de schemas |

## Testing

```bash
npm test              # Unit tests (Vitest + Testing Library)
npm run test:e2e      # E2E tests (Playwright)
```

Los tests unitarios están junto a los componentes (`.test.tsx`).
Los tests E2E están en `frontend/e2e/`.
