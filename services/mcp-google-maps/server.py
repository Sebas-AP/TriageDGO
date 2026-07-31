"""MCP Google Maps para resolver ubicaciones de reportes del 072.

Expone dos herramientas:
- geocodificar: direcciones formales mediante Geocoding API.
- buscar_lugar: referencias libres mediante Places Text Search (New).

La API key se lee exclusivamente de GOOGLE_MAPS_API_KEY.
"""
import json
import os
from dataclasses import asdict, dataclass
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from mcp.server.fastmcp import FastMCP


mcp = FastMCP("mcp-google-maps")

GEOCODING_URL = "https://maps.googleapis.com/maps/api/geocode/json"
PLACES_TEXT_SEARCH_URL = "https://places.googleapis.com/v1/places:searchText"

# Centro y radio operativo del municipio de Durango. Se pueden ajustar por env.
DURANGO_CENTER = (
    float(os.getenv("MAPS_BIAS_LAT", "24.0277")),
    float(os.getenv("MAPS_BIAS_LON", "-104.6532")),
)
DURANGO_RADIUS_METERS = float(os.getenv("MAPS_BIAS_RADIUS_METERS", "40000"))
DEFAULT_MAX_CANDIDATES = 3


class MapsServiceError(RuntimeError):
    """Error seguro y entendible para consumidores del MCP."""


@dataclass(frozen=True)
class Candidate:
    nombre: str
    direccion: str
    coordenadas: list[float]
    place_id: str
    confianza: float
    tipos: list[str]


def _api_key() -> str:
    key = os.getenv("GOOGLE_MAPS_API_KEY", "").strip()
    if not key:
        raise MapsServiceError("GOOGLE_MAPS_API_KEY no está configurada")
    return key


def _request_json(
    url: str,
    *,
    method: str = "GET",
    headers: dict[str, str] | None = None,
    payload: dict[str, Any] | None = None,
    timeout: float = 10,
) -> dict[str, Any]:
    body = json.dumps(payload).encode("utf-8") if payload is not None else None
    request = Request(url, data=body, headers=headers or {}, method=method)
    try:
        with urlopen(request, timeout=timeout) as response:
            parsed: Any = json.loads(response.read().decode("utf-8"))
    except HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")[:500]
        raise MapsServiceError(f"Google Maps respondió HTTP {error.code}: {detail}") from error
    except (URLError, TimeoutError) as error:
        raise MapsServiceError("No fue posible conectar con Google Maps") from error
    except json.JSONDecodeError as error:
        raise MapsServiceError("Google Maps devolvió una respuesta inválida") from error
    if not isinstance(parsed, dict):
        raise MapsServiceError("Google Maps devolvió un formato inesperado")
    return parsed


def _confidence(rank: int, candidate_count: int) -> float:
    """Confianza operativa basada en ranking, no un score oficial de Google."""
    base = (0.93, 0.78, 0.66, 0.55, 0.48)
    score = base[min(rank, len(base) - 1)]
    if candidate_count == 1:
        score = max(score, 0.96)
    return score


def _candidate_from_place(place: dict[str, Any], rank: int, count: int) -> Candidate | None:
    location = place.get("location")
    if not isinstance(location, dict):
        return None
    latitude, longitude = location.get("latitude"), location.get("longitude")
    if not isinstance(latitude, (int, float)) or not isinstance(longitude, (int, float)):
        return None
    display_name = place.get("displayName")
    name = display_name.get("text") if isinstance(display_name, dict) else ""
    types = place.get("types")
    return Candidate(
        nombre=str(name or place.get("formattedAddress") or "Ubicación encontrada"),
        direccion=str(place.get("formattedAddress") or ""),
        coordenadas=[float(latitude), float(longitude)],
        place_id=str(place.get("id") or ""),
        confianza=_confidence(rank, count),
        tipos=[str(item) for item in types] if isinstance(types, list) else [],
    )


def search_place_candidates(
    description: str,
    *,
    bias_lat: float = DURANGO_CENTER[0],
    bias_lon: float = DURANGO_CENTER[1],
    radius_meters: float = DURANGO_RADIUS_METERS,
    max_candidates: int = DEFAULT_MAX_CANDIDATES,
) -> list[Candidate]:
    description = description.strip()
    if len(description) < 3:
        raise MapsServiceError("La descripción debe contener al menos 3 caracteres")
    if not 100 <= radius_meters <= 50000:
        raise MapsServiceError("El radio de búsqueda debe estar entre 100 y 50000 metros")
    limit = max(1, min(max_candidates, 5))
    payload = {
        "textQuery": description,
        "languageCode": "es",
        "regionCode": "MX",
        "maxResultCount": limit,
        "locationBias": {
            "circle": {
                "center": {"latitude": bias_lat, "longitude": bias_lon},
                "radius": radius_meters,
            }
        },
    }
    data = _request_json(
        PLACES_TEXT_SEARCH_URL,
        method="POST",
        headers={
            "Content-Type": "application/json",
            "X-Goog-Api-Key": _api_key(),
            "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.location,places.types",
        },
        payload=payload,
    )
    places = data.get("places")
    if not isinstance(places, list):
        return []
    candidates = [
        candidate
        for rank, place in enumerate(places[:limit])
        if isinstance(place, dict)
        for candidate in [_candidate_from_place(place, rank, len(places))]
        if candidate is not None
    ]
    return candidates


def geocode_address(address: str, *, max_candidates: int = DEFAULT_MAX_CANDIDATES) -> list[Candidate]:
    address = address.strip()
    if len(address) < 5:
        raise MapsServiceError("La dirección debe contener al menos 5 caracteres")
    query = urlencode(
        {
            "address": address,
            "components": "country:MX",
            "bounds": "23.67,-105.10|24.46,-104.15",
            "region": "mx",
            "language": "es",
            "key": _api_key(),
        }
    )
    data = _request_json(f"{GEOCODING_URL}?{query}")
    status = data.get("status")
    if status == "ZERO_RESULTS":
        return []
    if status != "OK":
        raise MapsServiceError(f"Geocoding no disponible: {status or 'estado desconocido'}")
    results = data.get("results")
    if not isinstance(results, list):
        return []
    limit = max(1, min(max_candidates, 5))
    candidates: list[Candidate] = []
    for rank, result in enumerate(results[:limit]):
        if not isinstance(result, dict):
            continue
        geometry = result.get("geometry")
        location = geometry.get("location") if isinstance(geometry, dict) else None
        if not isinstance(location, dict):
            continue
        latitude, longitude = location.get("lat"), location.get("lng")
        if not isinstance(latitude, (int, float)) or not isinstance(longitude, (int, float)):
            continue
        types = result.get("types")
        candidates.append(
            Candidate(
                nombre=str(result.get("formatted_address") or address),
                direccion=str(result.get("formatted_address") or ""),
                coordenadas=[float(latitude), float(longitude)],
                place_id=str(result.get("place_id") or ""),
                confianza=_confidence(rank, len(results)),
                tipos=[str(item) for item in types] if isinstance(types, list) else [],
            )
        )
    return candidates


def _result(query: str, candidates: list[Candidate]) -> dict[str, Any]:
    serialized = [asdict(candidate) for candidate in candidates]
    high_confidence = len(candidates) == 1 and candidates[0].confianza >= 0.9
    return {
        "consulta_original": query,
        "candidatos": serialized,
        "total": len(serialized),
        "resolucion": "unica" if high_confidence else "ambigua" if serialized else "sin_resultados",
        "requiere_confirmacion": not high_confidence,
        "sesgo": {
            "centro": [DURANGO_CENTER[0], DURANGO_CENTER[1]],
            "radio_metros": DURANGO_RADIUS_METERS,
        },
    }


@mcp.tool()
def geocodificar(direccion: str, max_candidatos: int = DEFAULT_MAX_CANDIDATES) -> dict[str, Any]:
    """Convierte una dirección formal de México en candidatos con coordenadas."""
    return _result(direccion, geocode_address(direccion, max_candidates=max_candidatos))


@mcp.tool()
def buscar_lugar(
    descripcion: str,
    sesgo_lat: float = DURANGO_CENTER[0],
    sesgo_lon: float = DURANGO_CENTER[1],
    radio_metros: float = DURANGO_RADIUS_METERS,
    max_candidatos: int = DEFAULT_MAX_CANDIDATES,
) -> dict[str, Any]:
    """Resuelve referencias libres cerca de Durango y devuelve candidatos."""
    candidates = search_place_candidates(
        descripcion,
        bias_lat=sesgo_lat,
        bias_lon=sesgo_lon,
        radius_meters=radio_metros,
        max_candidates=max_candidatos,
    )
    return _result(descripcion, candidates)


if __name__ == "__main__":
    mcp.run()
