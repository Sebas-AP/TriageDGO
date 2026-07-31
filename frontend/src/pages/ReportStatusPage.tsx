import { useQuery } from "@tanstack/react-query";
import { Link, useLocation, useParams } from "react-router-dom";
import { services } from "../services";

export default function ReportStatusPage() {
  const { folio = "" } = useParams();
  const location = useLocation();
  const { data, isLoading } = useQuery({
    queryKey: ["public-report", folio],
    queryFn: () => services.reports.getPublicReport(folio),
    refetchInterval: (query) => (query.state.data?.status === "ready" ? false : 1000),
  });
  const justSubmitted = Boolean((location.state as { justSubmitted?: boolean } | null)?.justSubmitted);

  return (
    <main className="status-shell">
      <section className="status-card">
        <span className="success-mark">✓</span>
        <p className="eyebrow">{justSubmitted ? "Reporte enviado" : "Seguimiento ciudadano"}</p>
        <h1>{folio}</h1>
        {isLoading && <p>Consultando el reporte…</p>}
        {data && <>
          <div className={`status-pill status-${data.status}`}>{data.status === "ready" ? "Ticket generado" : "En análisis"}</div>
          <p>Recibimos tu reporte en <strong>{data.location.address}</strong>.</p>
          {data.ticket
            ? <div className="citizen-ticket"><strong>Prioridad {data.ticket.priority}</strong><span>Área responsable: {data.ticket.area}</span></div>
            : <p className="muted">Nuestros agentes están clasificándolo. Esta vista se actualizará automáticamente.</p>}
        </>}
        {!isLoading && !data && <p>No encontramos un reporte con este folio.</p>}
        <div className="status-actions">
          <Link className="primary-button" to="/">Crear otro reporte</Link>
          <Link className="secondary-button" to="/mis-reportes">Mis reportes</Link>
          <Link className="secondary-button" to="/admin/login">Ver consola demo</Link>
        </div>
      </section>
    </main>
  );
}
