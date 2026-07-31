import { useMemo, useState } from "react";
import { services } from "../../services";
import { notify } from "../../lib/feedback";
import type { ProblemCluster, ReportRecord } from "../../types";
import { OperationsMap } from "../maps/OperationsMap";
import {
  channelIcons,
  channelLabels,
  clusterStatusLabels,
  isActive,
  isOverdue,
  priorityLabels,
  shortDate,
  statusLabels,
} from "./adminUi";

export function FollowUpsView({
  reports,
  onOpenReport,
  onUpdated,
}: {
  reports: ReportRecord[];
  onOpenReport: (id: string) => void;
  onUpdated: (report: ReportRecord) => void;
}) {
  const items = reports
    .flatMap((report) => report.followUps.filter((followUp) => !followUp.completed).map((followUp) => ({ report, followUp })))
    .sort((a, b) => a.followUp.dueAt.localeCompare(b.followUp.dueAt));
  const overdue = items.filter((item) => isOverdue(item.followUp.dueAt));
  const today = items.filter((item) => new Date(item.followUp.dueAt).toDateString() === new Date().toDateString() && !isOverdue(item.followUp.dueAt));
  const upcoming = items.filter((item) => !isOverdue(item.followUp.dueAt) && new Date(item.followUp.dueAt).toDateString() !== new Date().toDateString());

  async function complete(report: ReportRecord, followUpId: string) {
    onUpdated(await services.admin.completeFollowUp(report.id, followUpId));
    notify({ title: "Seguimiento completado", message: `${report.folio} fue retirado de la agenda pendiente.` });
  }

  return (
    <div className="admin-view">
      <header className="view-heading"><div><p className="eyebrow">Nada se queda atrás</p><h2>Agenda de seguimiento</h2><p>Actividades programadas, compromisos y casos que requieren una nueva intervención.</p></div><div className="view-heading-stat danger"><strong>{overdue.length}</strong><span>vencidos</span></div></header>
      <section className="agenda-summary">
        <div><span className="agenda-dot overdue" /><strong>{overdue.length}</strong><small>Vencidos</small></div>
        <div><span className="agenda-dot today" /><strong>{today.length}</strong><small>Para hoy</small></div>
        <div><span className="agenda-dot upcoming" /><strong>{upcoming.length}</strong><small>Próximos</small></div>
      </section>
      <div className="agenda-board">
        <AgendaColumn title="Vencidos" tone="overdue" items={overdue} onOpenReport={onOpenReport} onComplete={complete} />
        <AgendaColumn title="Para hoy" tone="today" items={today} onOpenReport={onOpenReport} onComplete={complete} />
        <AgendaColumn title="Próximos" tone="upcoming" items={upcoming} onOpenReport={onOpenReport} onComplete={complete} />
      </div>
    </div>
  );
}

function AgendaColumn({
  title,
  tone,
  items,
  onOpenReport,
  onComplete,
}: {
  title: string;
  tone: string;
  items: Array<{ report: ReportRecord; followUp: ReportRecord["followUps"][number] }>;
  onOpenReport: (id: string) => void;
  onComplete: (report: ReportRecord, followUpId: string) => Promise<void>;
}) {
  return <section className={`agenda-column agenda-${tone}`}><header><h3>{title}</h3><span>{items.length}</span></header><div>
    {items.map(({ report, followUp }) => <article key={followUp.id} className="agenda-card">
      <div className="agenda-card-top"><span className={`priority-token priority-${report.ticket?.priority.toLowerCase()}`}>{report.ticket?.priority}</span><time>{shortDate(followUp.dueAt)}</time></div>
      <h4>{followUp.expectedAction}</h4><p>{followUp.reason}</p>
      <div className="agenda-case"><strong>{report.folio}</strong><span>{report.location.neighborhood || report.location.address}</span></div>
      <footer><span className="owner-avatar">{followUp.owner.charAt(0)}</span><small>{followUp.owner}</small><button onClick={() => void onComplete(report, followUp.id)}>✓</button><button onClick={() => onOpenReport(report.id)}>Abrir</button></footer>
    </article>)}
    {items.length === 0 && <div className="empty-compact">Sin actividades.</div>}
  </div></section>;
}

export function PatternsView({
  clusters,
  reports,
  onClustersChanged,
  onOpenReport,
}: {
  clusters: ProblemCluster[];
  reports: ReportRecord[];
  onClustersChanged: (clusters: ProblemCluster[]) => void;
  onOpenReport: (id: string) => void;
}) {
  const [selectedId, setSelectedId] = useState(clusters[0]?.id || "");
  const [busy, setBusy] = useState(false);
  const selected = clusters.find((cluster) => cluster.id === selectedId) ?? clusters[0];
  const linked = selected ? reports.filter((report) => selected.reportIds.includes(report.id)) : [];

  async function createIncident() {
    if (!selected) return;
    setBusy(true);
    const updated = await services.admin.createMasterIncident(selected.id, selected.owner || "Mesa de Control");
    onClustersChanged(clusters.map((cluster) => cluster.id === updated.id ? updated : cluster));
    setBusy(false);
    notify({ title: "Incidencia maestra creada", message: `${updated.masterIncidentFolio} agrupa los reportes relacionados.` });
  }

  async function changeStatus(status: ProblemCluster["status"]) {
    if (!selected) return;
    const updated = await services.admin.updateClusterStatus(selected.id, status);
    onClustersChanged(clusters.map((cluster) => cluster.id === updated.id ? updated : cluster));
    notify({ title: "Patrón actualizado", message: `${selected.title} cambió a ${clusterStatusLabels[status]}.` });
  }

  return (
    <div className="admin-view">
      <header className="view-heading pattern-heading"><div><p className="eyebrow">Inteligencia territorial</p><h2>Problemas frecuentes</h2><p>Agrupa señales dispersas para atender causas estructurales, no solo reportes individuales.</p></div><div className="pattern-score"><span>✦</span><div><strong>{clusters.filter((cluster) => cluster.trend === "growing").length}</strong><small>patrones creciendo</small></div></div></header>
      <section className="pattern-alert"><span>!</span><div><strong>Atención recomendada</strong><p>El patrón de fugas en Zona Centro creció 58% y ya combina reportes de cuatro canales.</p></div></section>
      <div className="patterns-layout">
        <section className="clusters-list">
          {clusters.map((cluster) => <button key={cluster.id} className={selected?.id === cluster.id ? "selected" : ""} onClick={() => setSelectedId(cluster.id)}>
            <div className="cluster-row-top"><span className={`priority-token priority-${cluster.highestPriority.toLowerCase()}`}>{cluster.highestPriority}</span><span className={`cluster-status cluster-${cluster.status}`}>{clusterStatusLabels[cluster.status]}</span></div>
            <h3>{cluster.title}</h3><p>{cluster.probableCause}</p>
            <div className="cluster-row-data"><span><strong>{cluster.reportCount}</strong> reportes</span><span><strong>{cluster.radiusMeters} m</strong> radio</span><em className={`trend-${cluster.trend}`}>{cluster.trend === "growing" ? `↑ ${cluster.growthPercent}%` : cluster.trend === "stable" ? "→ Estable" : "↓ Disminuye"}</em></div>
          </button>)}
        </section>
        {selected && <section className="cluster-detail">
          <header><div><p className="eyebrow">{selected.category}</p><h2>{selected.title}</h2><p>{selected.zone} · Detectado desde {new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "long" }).format(new Date(selected.firstSeenAt))}</p></div><span className={`trend-hero trend-${selected.trend}`}>{selected.trend === "growing" ? `↑ ${selected.growthPercent}%` : "→"}</span></header>
          <div className="cluster-kpis"><div><strong>{selected.reportCount}</strong><small>Reportes vinculados</small></div><div><strong>{selected.radiusMeters}m</strong><small>Radio afectado</small></div><div><strong>{selected.highestPriority}</strong><small>Máxima prioridad</small></div><div><strong>{Object.values(selected.channelCounts).filter(Boolean).length}</strong><small>Canales distintos</small></div></div>
          <section className="cause-card"><span>⌁</span><div><small>Posible causa estructural</small><strong>{selected.probableCause}</strong></div></section>
          <div className="cluster-actions">
            <label>Estado<select value={selected.status} onChange={(event) => void changeStatus(event.target.value as ProblemCluster["status"])}>{(Object.keys(clusterStatusLabels) as ProblemCluster["status"][]).map((status) => <option key={status} value={status}>{clusterStatusLabels[status]}</option>)}</select></label>
            {selected.masterIncidentFolio ? <div className="master-incident"><span>Incidencia maestra</span><strong>{selected.masterIncidentFolio}</strong></div> : <button className="primary-button" onClick={() => void createIncident()} disabled={busy}>{busy ? "Creando…" : "Crear incidencia maestra"}</button>}
          </div>
          <div className="cluster-channels"><h3>Distribución por canal</h3>{(Object.entries(selected.channelCounts) as Array<[keyof typeof channelLabels, number]>).map(([channel, count]) => <div key={channel}><span className={`channel-mini channel-${channel}`}>{channelIcons[channel]}</span><span>{channelLabels[channel]}</span><i><b style={{ width: `${(count / selected.reportCount) * 100}%` }} /></i><strong>{count}</strong></div>)}</div>
          <div className="cluster-map"><OperationsMap reports={linked} clusters={[selected]} onSelect={onOpenReport} /></div>
          <section className="linked-reports"><div className="section-title"><h3>Reportes relacionados</h3><span>{linked.length} visibles en demo</span></div>{linked.map((report) => <button key={report.id} onClick={() => onOpenReport(report.id)}><span className={`priority-token priority-${report.ticket?.priority.toLowerCase()}`}>{report.ticket?.priority}</span><div><strong>{report.folio}</strong><small>{report.description}</small></div><span className={`channel-mini channel-${report.channel}`}>{channelIcons[report.channel]}</span></button>)}</section>
        </section>}
      </div>
    </div>
  );
}

export function HistoryView({ reports, onOpenReport }: { reports: ReportRecord[]; onOpenReport: (id: string) => void }) {
  const [search, setSearch] = useState("");
  const historical = useMemo(() => reports.filter((report) => !isActive(report.operationalStatus)).filter((report) => {
    const needle = search.toLowerCase();
    return !needle || `${report.folio} ${report.description} ${report.ticket?.category}`.toLowerCase().includes(needle);
  }), [reports, search]);
  return <div className="admin-view"><header className="view-heading"><div><p className="eyebrow">Memoria institucional</p><h2>Histórico de atención</h2><p>Consulta casos resueltos, tiempos, responsables y decisiones anteriores.</p></div><div className="view-heading-stat"><strong>{historical.length}</strong><span>resultados</span></div></header>
    <section className="history-panel"><div className="history-toolbar"><div className="search-box"><span>⌕</span><input aria-label="Buscar históricos" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar en históricos…" /></div><button onClick={() => window.print()}>⇩ Exportar vista</button></div>
      <div className="history-table-wrap"><table className="history-table"><thead><tr><th>Folio</th><th>Canal</th><th>Problema</th><th>Prioridad</th><th>Área</th><th>Responsable</th><th>Resultado</th><th /></tr></thead><tbody>{historical.map((report) => <tr key={report.id}><td><strong>{report.folio}</strong><small>{shortDate(report.createdAt)}</small></td><td><span className={`channel-tag channel-${report.channel}`}>{channelIcons[report.channel]} {channelLabels[report.channel]}</span></td><td><strong>{report.ticket?.category}</strong><small>{report.location.neighborhood}</small></td><td><span className={`priority-token priority-${report.ticket?.priority.toLowerCase()}`}>{report.ticket?.priority}</span></td><td>{report.ticket?.area}</td><td>{report.assignee || "—"}</td><td><span className={`status-chip status-${report.operationalStatus}`}>{statusLabels[report.operationalStatus]}</span></td><td><button onClick={() => onOpenReport(report.id)}>Ver →</button></td></tr>)}</tbody></table></div>
    </section>
  </div>;
}

export function MapView({ reports, clusters, onOpenReport }: { reports: ReportRecord[]; clusters: ProblemCluster[]; onOpenReport: (id: string) => void }) {
  const active = reports.filter((report) => isActive(report.operationalStatus));
  return <div className="admin-view"><header className="view-heading"><div><p className="eyebrow">Territorio</p><h2>Mapa operativo</h2><p>Ubica reportes activos y concentraciones que podrían compartir una causa.</p></div></header><section className="full-map-panel"><div className="map-legend"><span><i className="legend-p0" />P0 Crítica</span><span><i className="legend-p1" />P1 Alta</span><span><i className="legend-p2" />P2 Media</span><span><i className="legend-p3" />P3 Baja</span><span><i className="legend-pattern" />Problema frecuente</span></div><OperationsMap reports={active} clusters={clusters} onSelect={onOpenReport} /><div className="map-floating-stats"><div><strong>{active.length}</strong><span>reportes activos</span></div><div><strong>{clusters.length}</strong><span>zonas frecuentes</span></div></div></section></div>;
}
