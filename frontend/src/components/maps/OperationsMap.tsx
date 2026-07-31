import { CircleMarker, MapContainer, Popup, TileLayer } from "react-leaflet";
import type { ProblemCluster, ReportRecord } from "../../types";
import { isActive } from "../admin/adminUi";

const colors = { P0: "#c5163a", P1: "#e46a18", P2: "#d89d16", P3: "#147568" };

export function OperationsMap({
  reports,
  clusters,
  onSelect,
}: {
  reports: ReportRecord[];
  clusters: ProblemCluster[];
  onSelect?: (reportId: string) => void;
}) {
  return (
    <MapContainer center={[24.0277, -104.6532]} zoom={13} className="operations-map" scrollWheelZoom>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {reports.filter((report) => isActive(report.operationalStatus)).map((report) => (
        <CircleMarker
          key={report.id}
          center={[report.location.lat, report.location.lng]}
          radius={report.ticket?.priority === "P0" ? 9 : 6}
          pathOptions={{
            color: colors[report.ticket?.priority || "P3"],
            fillColor: colors[report.ticket?.priority || "P3"],
            fillOpacity: 0.82,
          }}
          eventHandlers={{ click: () => onSelect?.(report.id) }}
        >
          <Popup>
            <strong>{report.folio}</strong>
            <br />
            {report.description}
          </Popup>
        </CircleMarker>
      ))}
      {clusters.filter((cluster) => cluster.status !== "resolved").map((cluster) => (
        <CircleMarker
          key={cluster.id}
          center={[cluster.coordinates.lat, cluster.coordinates.lng]}
          radius={Math.max(14, cluster.radiusMeters / 25)}
          pathOptions={{ color: "#6d3ac6", fillColor: "#8b5bd8", fillOpacity: 0.14, dashArray: "5 5" }}
        >
          <Popup>
            <strong>{cluster.title}</strong>
            <br />
            {cluster.reportCount} reportes · {cluster.trend === "growing" ? "en crecimiento" : "estable"}
          </Popup>
        </CircleMarker>
      ))}
    </MapContainer>
  );
}
