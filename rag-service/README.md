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

## Dataset sintético para desarrollo

El repositorio incluye un dataset reproducible de 2,500 reportes ciudadanos
sintéticos, sin PII y distribuido entre las diez categorías canónicas. Incluye
grupos recurrentes para probar la búsqueda semántica y la detección de patrones.

```bash
# Regenera el archivo si se requiere una variante determinista
python3 rag-service/scripts/generar_dataset_sintetico.py

# Guarda los documentos confirmados directamente en el índice local del RAG
python3 rag-service/scripts/cargar_dataset_sintetico.py --target local-index
```

El segundo comando escribe en `.rag-index/` y permite probar
`/buscar_reportes` sin Firebase. Para cargar el conjunto en Firestore use el
emulador (`FIRESTORE_EMULATOR_HOST`) o confirme una instancia remota:

```bash
python3 rag-service/scripts/cargar_dataset_sintetico.py --target firestore
python3 rag-service/scripts/cargar_dataset_sintetico.py --target firestore --confirm-remote
```

## Presupuesto participativo mensual

`Presupuesto_Participativo_Durango.xlsx` es la fuente de zonas, población,
rezago y techo: el cálculo base reproduce su fórmula `0.40 × población + 0.60
× rezago`. La prioridad de recaudación se calcula mensualmente a partir de cada
`clave_catastral` y ajusta el puntaje con peso configurable (15% por defecto),
normalizado para que la suma siempre sea exactamente el techo mensual.

Los pagos deben ser transacciones en `pagos_predial` con
`clave_catastral`, `fecha_pago`, `monto_pagado` y `estatus=pagado`; la colección
`predial` existente sólo conserva el estado actual y no sirve para una suma por
mes. Para desarrollo hay un archivo de ejemplo sin datos reales.

```bash
# Calcula y guarda rag-service/data/presupuestos_mensuales/presupuesto-2026-06.json
python3 rag-service/scripts/calcular_presupuesto_mensual.py \
  --mes 2026-06 --pagos-jsonl rag-service/data/pagos_predial_ejemplo.jsonl

# Muestra el presupuesto de junio al usar julio como referencia
python3 rag-service/scripts/mostrar_presupuesto_anterior.py --mes-referencia 2026-07
```

En operación se puede leer y guardar en Firestore (con credenciales o emulador):

```bash
python3 rag-service/scripts/calcular_presupuesto_mensual.py --mes 2026-06 \
  --pagos-firestore --guardar-firestore
python3 rag-service/scripts/mostrar_presupuesto_anterior.py --mes-referencia 2026-07 --firestore
```
