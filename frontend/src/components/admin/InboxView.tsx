import { useMemo, useState } from "react";
import type { ChannelSource, OperationalStatus, Priority, ReportRecord } from "../../types";
import { channelIcons, channelLabels, isActive, isOverdue, priorityLabels, relativeTime, statusLabels } from "./adminUi";
import { ReportDetail } from "./ReportDetail";

export function InboxView({
  reports,
  selectedId,
  onSelect,
  onUpdated,
}: {
  reports: ReportRecord[];
  selectedId: string;
  onSelect: (id: string) => void;
  onUpdated: (report: ReportRecord) => void;
}) {
  const [search, setSearch] = useState("");
  const [priority, setPriority] = useState<Priority | "all">("all");
  const [channel, setChannel] = useState<ChannelSource | "all">("all");
  const [status, setStatus] = useState<OperationalStatus | "all">("all");
  const active = reports.filter((report) => isActive(report.operationalStatus));
  const filtered = useMemo(() => active.filter((report) => {
    if (priority !== "all" && report.ticket?.priority !== priority) return false;
    if (channel !== "all" && report.channel !== channel) return false;
    if (status !== "all" && report.operationalStatus !== status) return false;
    const needle = search.toLowerCase();
    return !needle || `${report.folio} ${report.description} ${report.location.address} ${report.assignee}`.toLowerCase().includes(needle);
  }).sort((a, b) => {
    const rank = { P0: 0, P1: 1, P2: 2, P3: 3 };
    return rank[a.ticket?.priority || "P3"] - rank[b.ticket?.priority || "P3"] || b.createdAt.localeCompare(a.createdAt);
  }), [active, priority, channel, status, search]);
  const selected = reports.find((report) => report.id === selectedId) ?? filtered[0];

  return (
    <div className="admin-view inbox-view">
      <header className="view-heading">
        <div><p className="eyebrow">Operación diaria</p><h2>Bandeja omnicanal</h2><p>Revisa, asigna y da seguimiento a todos los reportes activos desde un solo lugar.</p></div>
        <div className="view-heading-stat"><strong>{active.length}</strong><span>activos</span></div>
      </header>
      <section className="inbox-filters">
        <div className="search-box"><span>⌕</span><input aria-label="Buscar reportes" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar folio, ubicación o responsable…" /></div>
        <select aria-label="Filtrar por prioridad" value={priority} onChange={(event) => setPriority(event.target.value as Priority | "all")}><option value="all">Todas las prioridades</option>{(["P0", "P1", "P2", "P3"] as Priority[]).map((item) => <option key={item} value={item}>{item} · {priorityLabels[item]}</option>)}</select>
        <select aria-label="Filtrar por canal" value={channel} onChange={(event) => setChannel(event.target.value as ChannelSource | "all")}><option value="all">Todos los canales</option>{(["form", "whatsapp", "call", "manual"] as ChannelSource[]).map((item) => <option key={item} value={item}>{channelLabels[item]}</option>)}</select>
        <select aria-label="Filtrar por estado" value={status} onChange={(event) => setStatus(event.target.value as OperationalStatus | "all")}><option value="all">Todos los estados</option>{(["new", "review", "assigned", "in_progress"] as OperationalStatus[]).map((item) => <option key={item} value={item}>{statusLabels[item]}</option>)}</select>
      </section>
      <div className="inbox-layout">
        <section className="case-list-panel">
          <div className="case-list-header"><span>{filtered.length} resultados</span><small>Urgentes primero</small></div>
          <div className="case-list">
            {filtered.map((report) => (
              <button key={report.id} className={`case-row ${selected?.id === report.id ? "selected" : ""}`} onClick={() => onSelect(report.id)}>
                <div className="case-row-line">
                  <span className={`priority-token priority-${report.ticket?.priority.toLowerCase()}`}>{report.ticket?.priority || "—"}</span>
                  <strong>{report.folio}</strong>
                  <span className={`channel-mini channel-${report.channel}`} title={channelLabels[report.channel]}>{channelIcons[report.channel]}</span>
                  <time>{relativeTime(report.createdAt)}</time>
                </div>
                <p>{report.description}</p>
                <div className="case-row-meta"><span className={`status-chip status-${report.operationalStatus}`}>{statusLabels[report.operationalStatus]}</span><span>{report.location.neighborhood || report.location.address}</span></div>
                <div className="case-row-owner">
                  <span className={report.assignee ? "owner-avatar" : "owner-avatar empty"}>{report.assignee?.charAt(0) || "?"}</span>
                  <span>{report.assignee || "Sin responsable"}</span>
                  {report.dueAt && <em className={isOverdue(report.dueAt) ? "overdue" : ""}>{isOverdue(report.dueAt) ? "Vencido" : "Con seguimiento"}</em>}
                </div>
              </button>
            ))}
            {filtered.length === 0 && <div className="empty-state"><strong>No encontramos reportes</strong><p>Prueba cambiando los filtros de la bandeja.</p></div>}
          </div>
        </section>
        <section className="case-detail-panel">
          {selected ? <ReportDetail report={selected} onUpdated={onUpdated} /> : <div className="empty-state">Selecciona un reporte para ver sus datos.</div>}
        </section>
      </div>
    </div>
  );
}
