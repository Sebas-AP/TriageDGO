import { CircleMarker, MapContainer, Popup, TileLayer } from "react-leaflet";
import type { ReportRecord } from "../../types";

export function ReportMap({ report }: { report: ReportRecord }) {
  return (
    <MapContainer
      key={report.id}
      center={[report.location.lat, report.location.lng]}
      zoom={14}
      className="map admin-map"
      scrollWheelZoom
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <CircleMarker
        center={[report.location.lat, report.location.lng]}
        radius={11}
        pathOptions={{ color: "#9b1c31", fillColor: "#db2447", fillOpacity: 0.9 }}
      >
        <Popup>Reporte actual: {report.folio}</Popup>
      </CircleMarker>
      {report.similarReports.map((similar) => (
        <CircleMarker
          key={similar.id}
          center={[similar.coordinates.lat, similar.coordinates.lng]}
          radius={7}
          pathOptions={{ color: "#255fc7", fillOpacity: 0.65 }}
        >
          <Popup>
            {similar.category} · {similar.distanceKm} km
          </Popup>
        </CircleMarker>
      ))}
    </MapContainer>
  );
}
