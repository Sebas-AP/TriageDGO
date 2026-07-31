export interface CatalogPlace {
  id: string;
  nombre: string;
  coordenadas: [number, number];
  tipo: "escuela" | "lugar_publico";
  direccion?: string;
}

export interface NearbyPlace extends CatalogPlace { distanciaKm: number; }

export interface MapsClient {
  geocodificar(direccion: string): Promise<{ lat: number; lon: number } | null>;
  distancia(origen: [number, number], destino: [number, number]): Promise<number>;
  lugaresCercanos(lat: number, lon: number, tipo: CatalogPlace["tipo"], radioMetros: number): Promise<NearbyPlace[]>;
}

export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = radians(lat2 - lat1);
  const dLon = radians(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(a));
}

export function createCatalogMapsClient(places: CatalogPlace[]): MapsClient {
  return {
    async geocodificar(direccion) {
      const normalized = direccion.trim().toLocaleLowerCase();
      const match = places.find((place) => place.direccion?.toLocaleLowerCase() === normalized);
      return match ? { lat: match.coordenadas[0], lon: match.coordenadas[1] } : null;
    },
    async distancia(origen, destino) { return haversineKm(origen[0], origen[1], destino[0], destino[1]); },
    async lugaresCercanos(lat, lon, tipo, radioMetros) {
      return places
        .filter((place) => place.tipo === tipo)
        .map((place) => ({ ...place, distanciaKm: haversineKm(lat, lon, place.coordenadas[0], place.coordenadas[1]) }))
        .filter((place) => place.distanciaKm * 1000 <= radioMetros)
        .sort((a, b) => a.distanciaKm - b.distanciaKm);
    },
  };
}

/** Google implementation is opt-in; the catalog remains the deterministic fallback for tests/outages. */
export function createGoogleMapsClient(apiKey: string, fetchFn: typeof fetch = fetch): MapsClient {
  const request = async (path: string, params: Record<string, string>) => {
    const query = new URLSearchParams({ ...params, key: apiKey });
    const response = await fetchFn(`https://maps.googleapis.com/maps/api/${path}?${query}`, { signal: AbortSignal.timeout(5_000) });
    if (!response.ok) throw new Error("Google Maps no disponible.");
    return response.json() as Promise<{ results?: Array<{ geometry?: { location?: { lat: number; lng: number } }; name?: string; place_id?: string; vicinity?: string }> }>;
  };
  return {
    async geocodificar(direccion) { const data = await request("geocode/json", { address: direccion }); const location = data.results?.[0]?.geometry?.location; return location ? { lat: location.lat, lon: location.lng } : null; },
    async distancia(origen, destino) { return haversineKm(origen[0], origen[1], destino[0], destino[1]); },
    async lugaresCercanos(lat, lon, tipo, radioMetros) {
      const data = await request("place/nearbysearch/json", { location: `${lat},${lon}`, radius: String(radioMetros), type: tipo === "escuela" ? "school" : "point_of_interest" });
      return (data.results ?? []).flatMap((place) => {
        const location = place.geometry?.location;
        if (!location || !place.name || !place.place_id) return [];
        return [{ id: place.place_id, nombre: place.name, coordenadas: [location.lat, location.lng] as [number, number], tipo, direccion: place.vicinity, distanciaKm: haversineKm(lat, lon, location.lat, location.lng) }];
      });
    },
  };
}
