import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { services } from "../services";

const labels: Record<string, string> = { new: "Recibido", review: "En análisis", assigned: "Asignado", in_progress: "En atención", resolved: "Resuelto", closed: "Cerrado" };
export default function MyReportDetailPage() {
  const { reportId = "" } = useParams();
  const { data, isLoading } = useQuery({ queryKey: ["my-report", reportId], queryFn: () => services.reports.getMine(reportId), refetchInterval: 5000 });
  return <main className="status-shell"><section className="status-card"><p className="eyebrow">Seguimiento ciudadano</p>{isLoading && <p>Consultando el reporte…</p>}{!isLoading && !data && <p>No encontramos este reporte en tu sesión.</p>}{data && <><h1>{data.folio}</h1><div className={`status-pill status-${data.status}`}>{labels[data.operationalStatus]}</div><p>Ubicación: <strong>{data.location.address}</strong></p><p className="muted">Actualizaremos este progreso conforme el área responsable atienda el reporte.</p></>}<div className="status-actions"><Link className="secondary-button" to="/mis-reportes">Volver a mis reportes</Link></div></section></main>;
}
