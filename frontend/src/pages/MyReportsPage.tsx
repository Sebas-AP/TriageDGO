import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { services } from "../services";

const labels: Record<string, string> = { new: "Recibido", review: "En análisis", assigned: "Asignado", in_progress: "En atención", resolved: "Resuelto", closed: "Cerrado" };

export default function MyReportsPage() {
  const { data = [], isLoading, isError } = useQuery({ queryKey: ["my-reports"], queryFn: () => services.reports.listMine() });
  return <main className="status-shell"><section className="status-card"><p className="eyebrow">Seguimiento ciudadano</p><h1>Mis reportes</h1><p className="muted">Esta lista se conserva en este navegador para proteger tu privacidad.</p>
    {isLoading && <p>Consultando tus reportes…</p>}
    {isError && <p className="error-banner">No pudimos recuperar tus reportes. Intenta nuevamente.</p>}
    {!isLoading && !isError && data.length === 0 && <p>Aún no tienes reportes activos en esta sesión.</p>}
    <div className="my-reports-list">{data.map((report) => <Link key={report.id} className="report-row" to={`/mis-reportes/${report.id}`}><div className="report-row-top"><strong>{report.folio}</strong><span className={`status-chip status-${report.operationalStatus}`}>{labels[report.operationalStatus]}</span></div><p>{report.location.address}</p><small>{new Date(report.createdAt).toLocaleString("es-MX")}</small></Link>)}</div>
    <div className="status-actions"><Link className="primary-button" to="/">Levantar reporte</Link></div></section></main>;
}
