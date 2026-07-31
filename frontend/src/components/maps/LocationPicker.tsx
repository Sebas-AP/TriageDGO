import { useEffect, useRef, useState } from "react";
import { CircleMarker, MapContainer, TileLayer, useMapEvents } from "react-leaflet";
import type { LocationValue, MapSuggestion } from "../../types";
import { services } from "../../services";

const DURANGO_CENTER: [number, number] = [24.0277, -104.6532];

function MapClick({ onPick }: { onPick: (location: LocationValue) => void }) {
  useMapEvents({
    click(event) {
      onPick({ address: "Punto seleccionado en el mapa", lat: event.latlng.lat, lng: event.latlng.lng });
    },
  });
  return null;
}

export function LocationPicker({
  value,
  onChange,
  error,
}: {
  value?: LocationValue;
  onChange: (location: LocationValue) => void;
  error?: string;
}) {
  const [query, setQuery] = useState(value?.address ?? "");
  const [suggestions, setSuggestions] = useState<MapSuggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const skipNextSearch = useRef(false);

  useEffect(() => {
    if (skipNextSearch.current) {
      skipNextSearch.current = false;
      return;
    }
    if (query.trim().length < 3 || query === value?.address) {
      setSuggestions([]);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setSearching(true);
      try {
        setSuggestions(await services.maps.autocomplete(query.trim(), controller.signal));
      } catch (cause) {
        if (!(cause instanceof DOMException && cause.name === "AbortError")) setSuggestions([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [query, value?.address]);

  async function choose(suggestion: MapSuggestion) {
    const location = await services.maps.geocode(suggestion.placeId);
    skipNextSearch.current = true;
    setQuery(location.address);
    setSuggestions([]);
    onChange(location);
  }

  function chooseMapPoint(location: LocationValue) {
    skipNextSearch.current = true;
    setQuery(location.address);
    onChange(location);
  }

  const center: [number, number] = value ? [value.lat, value.lng] : DURANGO_CENTER;

  return (
    <div className="location-picker">
      <label htmlFor="location-search">Busca una calle o lugar</label>
      <div className="autocomplete">
        <input
          id="location-search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Ej. Avenida 20 de Noviembre"
          autoComplete="off"
          aria-describedby={error ? "location-error" : undefined}
        />
        {searching && <span className="input-status">Buscando…</span>}
        {suggestions.length > 0 && (
          <ul className="suggestions" role="listbox" aria-label="Ubicaciones sugeridas">
            {suggestions.map((suggestion) => (
              <li key={suggestion.placeId}>
                <button type="button" onClick={() => void choose(suggestion)}>
                  <strong>{suggestion.label}</strong>
                  {suggestion.context && <span>{suggestion.context}</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <p className="field-hint">También puedes marcar el punto exacto en el mapa.</p>
      <MapContainer key={center.join(",")} center={center} zoom={14} className="map" scrollWheelZoom>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <MapClick onPick={chooseMapPoint} />
        {value && <CircleMarker center={[value.lat, value.lng]} radius={10} pathOptions={{ color: "#0b6259" }} />}
      </MapContainer>
      {value && <p className="selected-location">Ubicación: {value.address}</p>}
      {error && (
        <p id="location-error" className="field-error">
          {error}
        </p>
      )}
    </div>
  );
}
