import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../../app/AuthContext";
import { config } from "../../config";
import { notify } from "../../lib/feedback";
import { services } from "../../services";
import type { AdminEvent, ProblemCluster, ReportRecord } from "../../types";
import { Icon, type IconName } from "../Icon";
import { DashboardView } from "./DashboardView";
import { InboxView } from "./InboxView";
import { FollowUpsView, HistoryView, MapView, PatternsView } from "./OperationalViews";
import { ReportDetail } from "./ReportDetail";
import { isActive, isOverdue } from "./adminUi";

type AdminView = "dashboard" | "inbox" | "followups" | "patterns" | "map" | "history";

const navItems: Array<{ id: AdminView; label: string; icon: IconName }> = [
  { id: "dashboard", label: "Resumen operativo", icon: "dashboard" },
  { id: "inbox", label: "Bandeja omnicanal", icon: "inbox" },
  { id: "followups", label: "Seguimientos", icon: "clock" },
  { id: "patterns", label: "Problemas frecuentes", icon: "pattern" },
  { id: "map", label: "Mapa operativo", icon: "map" },
  { id: "history", label: "Históricos", icon: "history" },
];

function updateFromEvent(records: ReportRecord[], event: AdminEvent) {
  if (event.type === "report.received") return [event.payload, ...records.filter((item) => item.id !== event.reportId)];
  if (event.type === "report.updated") return records.map((report) => report.id === event.reportId ? event.payload : report);
  return records.map((report) => {
    if (report.id !== event.reportId) return report;
    if (event.type === "agent.status") {
      return { ...report, status: "processing" as const, agents: { ...report.agents, [event.payload.agent]: event.payload } };
    }
    if (event.type === "ticket.ready") return { ...report, status: "ready" as const, ticket: event.payload, updatedAt: event.timestamp };
    return { ...report, status: "failed" as const, updatedAt: event.timestamp };
  });
}

export default function AdminConsole() {
  const { user, logout } = useAuth();
  const [view, setView] = useState<AdminView>("dashboard");
  const [reports, setReports] = useState<ReportRecord[]>([]);
  const [clusters, setClusters] = useState<ProblemCluster[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [drawerId, setDrawerId] = useState("");
  const [connection, setConnection] = useState<"connecting" | "live" | "retrying">("connecting");
  const [loading, setLoading] = useState(true);
  const [mobileNav, setMobileNav] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  useEffect(() => {
    let active = true;
    Promise.all([services.realtime.listReports(), services.admin.listClusters()])
      .then(([reportItems, clusterItems]) => {
        if (!active) return;
        setReports(reportItems);
        setClusters(clusterItems);
        setSelectedId(reportItems.find((report) => isActive(report.operationalStatus))?.id || "");
        setLoading(false);
      })
      .catch(() => setLoading(false));
    const unsubscribe = services.realtime.subscribe(
      (event) => {
        setConnection("live");
        setReports((current) => updateFromEvent(current, event));
        if (event.type === "report.received") {
          setSelectedId(event.reportId);
          notify({
            title: "Nuevo reporte recibido",
            message: `${event.payload.folio} llegó desde ${event.payload.channel === "form" ? "formulario" : event.payload.channel}.`,
            tone: event.payload.ticket?.priority === "P0" ? "warning" : "info",
          });
        }
      },
      () => setConnection("retrying"),
    );
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const activeReports = useMemo(() => reports.filter((report) => isActive(report.operationalStatus)), [reports]);
  const followUpCount = useMemo(
    () => activeReports.flatMap((report) => report.followUps.filter((followUp) => !followUp.completed)).length,
    [activeReports],
  );
  const overdueCount = useMemo(() => activeReports.filter((report) => isOverdue(report.dueAt)).length, [activeReports]);
  const newCount = activeReports.filter((report) => report.operationalStatus === "new").length;
  const drawerReport = reports.find((report) => report.id === drawerId);

  function updateReport(report: ReportRecord) {
    setReports((current) => current.map((item) => item.id === report.id ? report : item));
  }

  function openReport(id: string) {
    const report = reports.find((item) => item.id === id);
    if (view === "inbox" && report && isActive(report.operationalStatus)) {
      setSelectedId(id);
    } else {
      setDrawerId(id);
    }
  }

  function navigate(next: AdminView) {
    setView(next);
    setMobileNav(false);
  }

  async function resetDemo() {
    await services.admin.resetDemoData();
    const [nextReports, nextClusters] = await Promise.all([services.realtime.listReports(), services.admin.listClusters()]);
    setReports(nextReports);
    setClusters(nextClusters);
    setSelectedId(nextReports[0]?.id || "");
    setView("dashboard");
    setConfirmReset(false);
    notify({ title: "Demostración restablecida", message: "Los reportes y patrones iniciales están disponibles nuevamente." });
  }

  if (loading) return <OperationsSkeleton />;

  return (
    <main className="ops-shell">
      <aside className={`ops-sidebar ${mobileNav ? "mobile-open" : ""}`}>
        <div className="ops-brand">
          <span className="ops-brand-mark"><b>D</b><small>072</small></span>
          <div><strong>DGO / Operaciones</strong><small>Atención ciudadana</small></div>
          <button className="mobile-close" onClick={() => setMobileNav(false)}>×</button>
        </div>
        <div className="ops-environment"><span className={`connection-dot ${connection}`} /><div><strong>Centro 072</strong><small>{connection === "live" ? "Operación sincronizada" : connection === "retrying" ? "Reconectando…" : "Conectando…"}</small></div><em>EN LÍNEA</em></div>
        <nav className="ops-nav">
          <p>OPERACIÓN</p>
          {navItems.slice(0, 5).map((item) => (
            <button key={item.id} className={view === item.id ? "active" : ""} onClick={() => navigate(item.id)}>
              <span><Icon name={item.icon} /></span><em>{item.label}</em>
              {item.id === "inbox" && newCount > 0 && <b>{newCount}</b>}
              {item.id === "followups" && followUpCount > 0 && <b className={overdueCount ? "warning" : ""}>{followUpCount}</b>}
              {item.id === "patterns" && <b className="pattern">{clusters.filter((cluster) => cluster.status !== "resolved").length}</b>}
            </button>
          ))}
          <p>CONSULTA</p>
          {navItems.slice(5).map((item) => (
            <button key={item.id} className={view === item.id ? "active" : ""} onClick={() => navigate(item.id)}>
              <span><Icon name={item.icon} /></span><em>{item.label}</em>
            </button>
          ))}
        </nav>
        <div className="ops-sidebar-bottom">
          {config.mode === "demo" && <button className="reset-demo" onClick={() => setConfirmReset(true)}><Icon name="refresh" /> Restablecer demo</button>}
          <div className="ops-user"><span>{user?.email.charAt(0).toUpperCase()}</span><div><strong>{user?.email}</strong><small>Administrador</small></div><button onClick={() => void logout()} title="Cerrar sesión"><Icon name="logout" /></button></div>
        </div>
      </aside>

      <section className="ops-main">
        <header className="ops-topbar">
          <button className="mobile-menu" onClick={() => setMobileNav(true)}><Icon name="menu" /></button>
          <div className="ops-breadcrumb"><span>Centro de mando</span><b>/</b><strong>{navItems.find((item) => item.id === view)?.label}</strong></div>
          <div className="ops-top-actions">
            <div className="global-search"><span><Icon name="search" /></span><input placeholder="Buscar folio…" onKeyDown={(event) => {
              if (event.key === "Enter") {
                const found = reports.find((report) => report.folio.toLowerCase().includes(event.currentTarget.value.toLowerCase()));
                if (found) openReport(found.id);
              }
            }} /></div>
            <button className="notification-button" title="Alertas"><Icon name="bell" />{overdueCount > 0 && <b>{overdueCount}</b>}</button>
            <div className={`live-indicator live-${connection}`}><i />{connection === "live" ? "En vivo" : "Conectando"}</div>
          </div>
        </header>

        <div key={view} className="view-transition">
          {view === "dashboard" && <DashboardView reports={reports} clusters={clusters} onOpenReport={openReport} onNavigate={(next) => navigate(next)} />}
          {view === "inbox" && <InboxView reports={reports} selectedId={selectedId} onSelect={setSelectedId} onUpdated={updateReport} />}
          {view === "followups" && <FollowUpsView reports={reports} onOpenReport={openReport} onUpdated={updateReport} />}
          {view === "patterns" && <PatternsView reports={reports} clusters={clusters} onClustersChanged={setClusters} onOpenReport={openReport} />}
          {view === "map" && <MapView reports={reports} clusters={clusters} onOpenReport={openReport} />}
          {view === "history" && <HistoryView reports={reports} onOpenReport={openReport} />}
        </div>
      </section>

      {drawerReport && <div className="case-drawer-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setDrawerId("")}><aside className="case-drawer"><ReportDetail report={drawerReport} onUpdated={updateReport} onClose={() => setDrawerId("")} /></aside></div>}
      {confirmReset && <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setConfirmReset(false)}><section className="confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="reset-title"><span className="confirm-icon"><Icon name="refresh" /></span><h3 id="reset-title">Restablecer demostración</h3><p>Se reemplazarán los cambios locales por el escenario inicial de reportes, seguimientos y patrones.</p><div><button className="secondary-button" onClick={() => setConfirmReset(false)}>Cancelar</button><button className="danger-button" onClick={() => void resetDemo()}>Restablecer datos</button></div></section></div>}
    </main>
  );
}

function OperationsSkeleton() {
  return (
    <main className="ops-shell skeleton-shell" aria-label="Cargando Mesa de Control">
      <aside className="ops-sidebar skeleton-sidebar">
        <div className="skeleton-brand shimmer" />
        <div className="skeleton-status shimmer" />
        {[1, 2, 3, 4, 5, 6].map((item) => <div key={item} className="skeleton-nav shimmer" />)}
      </aside>
      <section className="ops-main">
        <header className="ops-topbar"><div className="skeleton-line short shimmer" /><div className="skeleton-line shimmer" /></header>
        <div className="admin-view">
          <div className="skeleton-hero shimmer" />
          <div className="skeleton-metrics">{[1, 2, 3, 4, 5].map((item) => <div key={item} className="shimmer" />)}</div>
          <div className="skeleton-panels"><div className="shimmer" /><div className="shimmer" /></div>
        </div>
      </section>
    </main>
  );
}
