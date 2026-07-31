import type { ChannelSource, ProblemCluster, ReportRecord } from "../../types";
import { Icon } from "../Icon";
import {
  channelIcons,
  channelLabels,
  isActive,
  isOverdue,
  priorityLabels,
  relativeTime,
} from "./adminUi";

export function DashboardView({
  reports,
  clusters,
  onOpenReport,
  onNavigate,
}: {
  reports: ReportRecord[];
  clusters: ProblemCluster[];
  onOpenReport: (id: string) => void;
  onNavigate: (view: "inbox" | "followups" | "patterns") => void;
}) {
  const active = reports.filter((report) => isActive(report.operationalStatus));
  const today = new Date().toDateString();
  const receivedToday = reports.filter((report) => new Date(report.createdAt).toDateString() === today).length;
  const critical = active.filter((report) => report.ticket?.priority === "P0");
  const unassigned = active.filter((report) => !report.assignee);
  const overdue = active.filter((report) => isOverdue(report.dueAt));
  const followUps = active.flatMap((report) =>
    report.followUps.filter((followUp) => !followUp.completed).map((followUp) => ({ report, followUp })),
  );
  const channels = (["form", "whatsapp", "call", "manual"] as ChannelSource[]).map((channel) => ({
    channel,
    count: reports.filter((report) => report.channel === channel).length,
  }));
  const maxChannel = Math.max(...channels.map((item) => item.count), 1);
  const urgent = [...active]
    .sort((a, b) => {
      const rank = { P0: 0, P1: 1, P2: 2, P3: 3 };
      return rank[a.ticket?.priority || "P3"] - rank[b.ticket?.priority || "P3"];
    })
    .slice(0, 5);

  return (
    <div className="admin-view dashboard-view">
      <section className="ops-hero">
        <div className="hero-briefing">
          <span className="hero-kicker">Sala de situación · Turno vespertino</span>
          <h2>Operación ciudadana<br /><em>bajo control.</em></h2>
          <p>Prioriza lo urgente, coordina responsables y da seguimiento a cada reporte desde una sola vista.</p>
          <div className="hero-quick-status">
            <span><i className="status-good" /><b>96%</b> dentro de SLA</span>
            <span><i className="status-watch" /><b>{overdue.length}</b> casos vencidos</span>
            <span><i className="status-good" /><b>4</b> canales activos</span>
          </div>
        </div>
        <div className="hero-priority-brief">
          <div className="brief-heading"><span>Foco del turno</span><b>01</b></div>
          <strong>Riesgo eléctrico<br />en Zona Centro</strong>
          <p>{critical.length} reportes críticos requieren coordinación inmediata.</p>
          <button onClick={() => onNavigate("inbox")}>Abrir casos críticos <span>↗</span></button>
        </div>
        <div className="hero-time">
          <span>Última actualización · ahora</span>
          <strong>{new Intl.DateTimeFormat("es-MX", { hour: "2-digit", minute: "2-digit" }).format(new Date())}</strong>
        </div>
      </section>

      <section className="metric-grid metric-grid-wide">
        <button className="metric-card metric-primary" onClick={() => onNavigate("inbox")}>
          <span className="metric-index">01</span><span className="metric-icon"><Icon name="inbox" /></span><small>Ingreso del día</small><strong>{receivedToday}</strong><em>Reportes recibidos</em>
        </button>
        <button className="metric-card metric-danger" onClick={() => onNavigate("inbox")}>
          <span className="metric-index">02</span><span className="metric-icon"><Icon name="alert" /></span><small>Atención inmediata</small><strong>{critical.length}</strong><em>Casos críticos P0</em>
        </button>
        <button className="metric-card metric-warning" onClick={() => onNavigate("followups")}>
          <span className="metric-index">03</span><span className="metric-icon"><Icon name="clock" /></span><small>Agenda operativa</small><strong>{followUps.length}</strong><em>{overdue.length} acciones vencidas</em>
        </button>
        <button className="metric-card metric-neutral" onClick={() => onNavigate("inbox")}>
          <span className="metric-index">04</span><span className="metric-icon"><Icon name="user" /></span><small>Por despachar</small><strong>{unassigned.length}</strong><em>Sin responsable</em>
        </button>
        <button className="metric-card metric-pattern" onClick={() => onNavigate("patterns")}>
          <span className="metric-index">05</span><span className="metric-icon"><Icon name="pattern" /></span><small>Inteligencia territorial</small><strong>{clusters.filter((cluster) => cluster.status !== "resolved").length}</strong><em>Patrones activos</em>
        </button>
      </section>

      <div className="dashboard-columns">
        <section className="ops-panel urgent-panel">
          <div className="ops-panel-heading">
            <div><h3>Atención prioritaria</h3><p>Ordenada por riesgo operativo</p></div>
            <button onClick={() => onNavigate("inbox")}>Ver bandeja →</button>
          </div>
          <div className="urgent-list">
            {urgent.map((report) => (
              <button key={report.id} className="urgent-row" onClick={() => onOpenReport(report.id)}>
                <span className={`priority-token priority-${report.ticket?.priority.toLowerCase()}`}>{report.ticket?.priority}</span>
                <div><strong>{report.description}</strong><small>{report.folio} · {report.location.neighborhood || report.location.address}</small></div>
                <div className="urgent-meta"><span className={`channel-mini channel-${report.channel}`}>{channelIcons[report.channel]}</span><small>{relativeTime(report.createdAt)}</small></div>
              </button>
            ))}
          </div>
        </section>

        <section className="ops-panel channel-panel">
          <div className="ops-panel-heading"><div><h3>Origen de reportes</h3><p>Distribución omnicanal</p></div></div>
          <div className="channel-bars">
            {channels.map(({ channel, count }) => (
              <div key={channel} className="channel-bar-row">
                <span className={`channel-symbol channel-${channel}`}>{channelIcons[channel]}</span>
                <div><div className="bar-label"><span>{channelLabels[channel]}</span><strong>{count}</strong></div><span className="bar-track"><i style={{ width: `${(count / maxChannel) * 100}%` }} /></span></div>
              </div>
            ))}
          </div>
          <div className="channel-total"><strong>{reports.length}</strong><span>reportes registrados</span></div>
        </section>
      </div>

      <div className="dashboard-columns lower">
        <section className="ops-panel">
          <div className="ops-panel-heading"><div><h3>Problemas que se repiten</h3><p>Señales detectadas en territorio</p></div><button onClick={() => onNavigate("patterns")}>Analizar →</button></div>
          <div className="pattern-preview-list">
            {clusters.slice(0, 3).map((cluster) => (
              <button key={cluster.id} onClick={() => onNavigate("patterns")}>
                <span className={`trend-dot trend-${cluster.trend}`} />
                <div><strong>{cluster.title}</strong><small>{cluster.zone} · {cluster.reportCount} reportes</small></div>
                <span className={`trend-label trend-${cluster.trend}`}>{cluster.trend === "growing" ? `↑ ${cluster.growthPercent}%` : cluster.trend === "stable" ? "Estable" : "↓"}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="ops-panel">
          <div className="ops-panel-heading"><div><h3>Próximas acciones</h3><p>Agenda de seguimiento</p></div><button onClick={() => onNavigate("followups")}>Abrir agenda →</button></div>
          <div className="mini-agenda">
            {followUps.sort((a, b) => a.followUp.dueAt.localeCompare(b.followUp.dueAt)).slice(0, 4).map(({ report, followUp }) => (
              <button key={followUp.id} onClick={() => onOpenReport(report.id)}>
                <time className={isOverdue(followUp.dueAt) ? "overdue" : ""}>{new Intl.DateTimeFormat("es-MX", { hour: "2-digit", minute: "2-digit" }).format(new Date(followUp.dueAt))}</time>
                <div><strong>{followUp.expectedAction}</strong><small>{report.folio} · {followUp.owner}</small></div>
              </button>
            ))}
            {followUps.length === 0 && <div className="empty-compact">No hay seguimientos pendientes.</div>}
          </div>
        </section>
      </div>

      <section className="ops-insight">
        <span>✦</span><div><strong>Hallazgo operativo</strong><p>Las fugas de agua en Zona Centro crecieron 58% esta semana. Conviene abrir una incidencia maestra y coordinar una inspección de la línea principal.</p></div><button onClick={() => onNavigate("patterns")}>Revisar patrón</button>
      </section>
    </div>
  );
}
