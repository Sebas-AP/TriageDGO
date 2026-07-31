# MCP Google Maps

Servicio MCP para resolver la ubicación de reportes ciudadanos del 072.

## Herramientas

- `geocodificar(direccion)`: direcciones formales mediante Geocoding API.
- `buscar_lugar(descripcion, sesgo_lat, sesgo_lon, radio_metros)`: referencias
  libres mediante Places Text Search (New).

Ambas herramientas devuelven candidatos y requieren confirmación cuando no
existe una única respuesta de alta confianza.

## Configuración

La credencial se carga desde el `.env` de la raíz:

```env
GOOGLE_MAPS_API_KEY=
MAPS_BIAS_LAT=24.0277
MAPS_BIAS_LON=-104.6532
MAPS_BIAS_RADIUS_METERS=40000
```

No guardes claves reales en este directorio ni en Git.

## Ejecución

Requiere Python 3.11+ y las dependencias de `requirements-dev.txt`:

```bash
python3 -m pip install -r requirements-dev.txt
```

Desde la raíz del repositorio:

```bash
python3 services/mcp-google-maps/server.py
```

El transporte predeterminado de FastMCP es `stdio`, compatible con el gateway
CLI del proyecto.

## Pruebas

Las pruebas no realizan solicitudes reales ni necesitan una API key:

```bash
python3 services/mcp-google-maps/test_server.py
```

Para una prueba contra Google deben estar habilitadas **Places API (New)** y
**Geocoding API** en el proyecto asociado a `GOOGLE_MAPS_API_KEY`.
