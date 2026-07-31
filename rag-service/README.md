# Servicio RAG

El servicio indexa reportes con ticket confirmado y registros de `predial` desde
Firestore. Firestore es la fuente de verdad; `RAG_INDEX_DIR` contiene una copia
local regenerable de vectores y metadatos.

## Arranque local

```bash
cd rag-service
python3 -m pip install -r requirements.txt
RAG_INTERNAL_TOKEN=un-secreto RAG_INDEX_DIR=../.rag-index \
  uvicorn main:app --host 127.0.0.1 --port 8001
```

Configure credenciales de Firebase Admin mediante `GOOGLE_APPLICATION_CREDENTIALS`
o credenciales de aplicación. El worker del backend usa `RAG_SERVICE_URL` y
`RAG_INTERNAL_TOKEN` para indexar inmediatamente después de confirmar un ticket.
Como respaldo, el servicio reconstruye sus índices cada `RAG_RECONCILE_SECONDS`.

`POST /index/rebuild` y `POST /index/reportes/{reporte_id}` requieren el token
interno. Las consultas públicas del servicio no devuelven PII; la búsqueda predial
solo aporta contexto y no debe usarse para cambiar prioridad o atención.
