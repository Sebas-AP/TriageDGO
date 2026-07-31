import { useState, type FormEvent } from "react";
import { services } from "../../services";
import { notify } from "../../lib/feedback";
import type { OperationalStatus, Priority, ReportRecord } from "../../types";
import { ReportMap } from "../maps/ReportMap";
import {
  assignees,
  channelIcons,
  channelLabels,
  isOverdue,
  priorityLabels,
  shortDate,
  statusLabels,
  teams,
} from "./adminUi";

type ActionPanel = "assign" | "followup" | "note" | "priority" | null;
const agentLabels = { classifier: "Clasificador", pattern: "Detector de patrones", acuse: "Redactor de acuse" };

export function ReportDetail({
  report,
  onUpdated,
  onClose,
}: {
  report: ReportRecord;
  onUpdated: (report: ReportRecord) => void;
  onClose?: () => void;
}) {
  const [tab, setTab] = useState<"summary" | "channel" | "timeline">("summary");
  const [panel, setPanel] = useState<ActionPanel>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function run(action: () => Promise<ReportRecord>) {
    setBusy(true);
    setError("");
    try {
      onUpdated(await action());
      setPanel(null);
      notify({ title: "Cambio guardado", message: `El reporte ${report.folio} fue actualizado correctamente.` });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "No fue posible guardar el cambio.";
      setError(message);
      notify({ title: "No se guardó el cambio", message, tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  async function changeStatus(status: OperationalStatus) {
    if (status === report.operationalStatus) return;
    await run(() => services.admin.updateStatus(report.id, status));
  }

  return (
    <div className="case-detail">
      <header className="case-header">
        <div>
          <div className="case-kicker">
            <span className={`channel-tag channel-${report.channel}`}>{channelIcons[report.channel]} {channelLabels[report.channel]}</span>
            <span>Recibido {shortDate(report.createdAt)}</span>
          </div>
          <h2>{report.folio}</h2>
          <p>{report.location.address}</p>
        </div>
        <div className="case-header-actions">
          <span className={`priority-orb priority-${report.ticket?.priority.toLowerCase()}`}>{report.ticket?.priority || "—"}<small>{report.ticket ? priorityLabels[report.ticket.priority] : "Analizando"}</small></span>
          {onClose && <button className="icon-close" onClick={onClose} aria-label="Cerrar detalle">×</button>}
        </div>
      </header>

      <div className="case-toolbar">
        <label>
          <span>Estado operativo</span>
          <select value={report.operationalStatus} onChange={(event) => void changeStatus(event.target.value as OperationalStatus)} disabled={busy}>
            {(Object.keys(statusLabels) as OperationalStatus[]).map((status) => <option key={status} value={status}>{statusLabels[status]}</option>)}
          </select>
        </label>
        <button onClick={() => setPanel("assign")}><span>◎</span>{report.assignee ? "Reasignar" : "Asignar"}</button>
        <button onClick={() => setPanel("followup")}><span>◷</span>Programar seguimiento</button>
        <button onClick={() => setPanel("note")}><span>＋</span>Agregar nota</button>
        <button onClick={() => window.print()}><span>▤</span>Orden de trabajo</button>
      </div>

      {report.dueAt && (
        <div className={`deadline-banner ${isOverdue(report.dueAt) ? "deadline-overdue" : ""}`}>
          <span>{isOverdue(report.dueAt) ? "!" : "◷"}</span>
          <div><strong>{isOverdue(report.dueAt) ? "Atención vencida" : "Fecha compromiso"}</strong><small>{shortDate(report.dueAt)} · {report.assignee || "Sin responsable"}</small></div>
        </div>
      )}

      <nav className="case-tabs" aria-label="Detalle del reporte">
        <button className={tab === "summary" ? "active" : ""} onClick={() => setTab("summary")}>Resumen</button>
        <button className={tab === "channel" ? "active" : ""} onClick={() => setTab("channel")}>Origen y evidencia</button>
        <button className={tab === "timeline" ? "active" : ""} onClick={() => setTab("timeline")}>Bitácora <span>{report.auditLog.length}</span></button>
      </nav>

      {tab === "summary" && (
        <div className="case-tab-content">
          <section className="case-section">
            <div className="section-title"><h3>Reporte ciudadano</h3><span className={`status-chip status-${report.operationalStatus}`}>{statusLabels[report.operationalStatus]}</span></div>
            <blockquote>{report.description}</blockquote>
            <dl className="case-facts">
              <div><dt>Categoría</dt><dd>{report.ticket?.category || "En clasificación"}</dd></div>
              <div><dt>Área</dt><dd>{report.ticket?.area || "Por definir"}</dd></div>
              <div><dt>Responsable</dt><dd>{report.assignee || "Sin asignar"}</dd></div>
              <div><dt>Cuadrilla</dt><dd>{report.team || "Sin asignar"}</dd></div>
            </dl>
          </section>

          {report.clusterId && (
            <section className="pattern-callout">
              <span>⌁</span><div><strong>Relacionado con un problema frecuente</strong><p>Este reporte forma parte de una concentración territorial detectada por el sistema.</p></div>
            </section>
          )}

          <section className="case-section">
            <div className="section-title"><h3>Procesamiento inteligente</h3><span>3 agentes</span></div>
            <div className="agent-grid compact">
              {(Object.keys(agentLabels) as Array<keyof typeof agentLabels>).map((agent) => {
                const progress = report.agents[agent];
                return <div key={agent} className={`agent-card agent-${progress.status}`}><span className="agent-icon">{progress.status === "done" ? "✓" : progress.status === "running" ? "✦" : progress.status === "error" ? "!" : "·"}</span><div><strong>{agentLabels[agent]}</strong><small>{progress.status === "done" ? "Completado" : progress.status === "running" ? "Analizando" : progress.status}</small></div></div>;
              })}
            </div>
          </section>

          {report.ticket && (
            <section className="case-section decision-section">
              <div className="section-title"><h3>Decisión del ticket</h3><button className="text-action" onClick={() => setPanel("priority")}>Ajustar prioridad</button></div>
              <dl className="decision-grid">
                <div><dt>Regla activada</dt><dd>{report.ticket.triggeredRule}</dd></div>
                <div><dt>Patrón</dt><dd>{report.ticket.patternDetected ? "Detectado" : "Sin patrón"}</dd></div>
                <div><dt>Acuse ciudadano</dt><dd>{report.ticket.acknowledgmentSent ? "Enviado" : "Pendiente"}</dd></div>
                <div><dt>Revisión manual</dt><dd>{report.ticket.manualReview ? "Requerida" : "No requerida"}</dd></div>
              </dl>
            </section>
          )}

          {report.followUps.length > 0 && (
            <section className="case-section">
              <div className="section-title"><h3>Seguimientos</h3><span>{report.followUps.filter((item) => !item.completed).length} pendientes</span></div>
              <div className="followup-list">
                {report.followUps.map((followUp) => (
                  <div key={followUp.id} className={followUp.completed ? "completed" : isOverdue(followUp.dueAt) ? "overdue" : ""}>
                    <span className="followup-check">{followUp.completed ? "✓" : "◷"}</span>
                    <div><strong>{followUp.expectedAction}</strong><small>{followUp.reason} · {shortDate(followUp.dueAt)} · {followUp.owner}</small></div>
                    {!followUp.completed && <button onClick={() => void run(() => services.admin.completeFollowUp(report.id, followUp.id))}>Completar</button>}
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="case-section map-case-section"><div className="section-title"><h3>Ubicación</h3><span>{report.similarReports.length} similares cercanos</span></div><ReportMap report={report} /></section>
        </div>
      )}

      {tab === "channel" && (
        <div className="case-tab-content">
          <section className="channel-origin-card">
            <span className={`channel-hero-icon channel-${report.channel}`}>{channelIcons[report.channel]}</span>
            <div><p className="eyebrow">Canal de entrada</p><h3>{channelLabels[report.channel]}</h3><p>La información fue normalizada para ingresar al mismo flujo de atención municipal.</p></div>
          </section>
          <section className="case-section">
            <h3>Datos del ciudadano</h3>
            <dl className="case-facts"><div><dt>Nombre</dt><dd>{report.citizenName}</dd></div><div><dt>Teléfono</dt><dd>••• ••• {report.phone.slice(-4)}</dd></div></dl>
          </section>
          {report.channel === "call" && <section className="transcript-card"><div className="transcript-meta"><span>☎ Llamada 072</span><span>{Math.floor((report.channelDetails?.callDurationSeconds || 0) / 60)}:{String((report.channelDetails?.callDurationSeconds || 0) % 60).padStart(2, "0")} min · {Math.round((report.channelDetails?.transcriptionConfidence || 0) * 100)}% confianza</span></div><h3>Transcripción</h3><p>“{report.channelDetails?.transcript}”</p><small>El texto fue normalizado automáticamente antes de enviarse a clasificación.</small></section>}
          {report.channel === "whatsapp" && <section className="whatsapp-card"><div className="message-bubble">{report.channelDetails?.originalText || report.description}<time>{new Intl.DateTimeFormat("es-MX", { hour: "2-digit", minute: "2-digit" }).format(new Date(report.createdAt))}</time></div><p>{report.channelDetails?.mediaCount ? `${report.channelDetails.mediaCount} archivo adjunto` : "Sin archivos adjuntos"}</p></section>}
          {report.channel === "manual" && <section className="case-section"><h3>Captura en ventanilla</h3><p>Registrado por: <strong>{report.channelDetails?.capturedBy || "Personal 072"}</strong></p></section>}
        </div>
      )}

      {tab === "timeline" && (
        <div className="case-tab-content">
          <section className="timeline">
            {[...report.auditLog].reverse().map((event, index) => (
              <div key={event.id} className="timeline-event"><span className={index === 0 ? "current" : ""} /><div><header><strong>{event.label}</strong><time>{shortDate(event.createdAt)}</time></header><p>{event.detail}</p><small>{event.actor}</small></div></div>
            ))}
          </section>
          {report.notes.length > 0 && <section className="case-section"><h3>Notas internas</h3>{report.notes.map((note) => <div className="internal-note" key={note.id}><p>{note.text}</p><small>{note.author} · {shortDate(note.createdAt)}</small></div>)}</section>}
        </div>
      )}

      {panel && (
        <ActionModal
          panel={panel}
          report={report}
          busy={busy}
          error={error}
          onCancel={() => setPanel(null)}
          onRun={run}
        />
      )}
    </div>
  );
}

function ActionModal({
  panel,
  report,
  busy,
  error,
  onCancel,
  onRun,
}: {
  panel: Exclude<ActionPanel, null>;
  report: ReportRecord;
  busy: boolean;
  error: string;
  onCancel: () => void;
  onRun: (action: () => Promise<ReportRecord>) => Promise<void>;
}) {
  const defaultDate = new Date(Date.now() + 24 * 60 * 60_000);
  defaultDate.setMinutes(defaultDate.getMinutes() - defaultDate.getTimezoneOffset());

  function data(event: FormEvent<HTMLFormElement>) {
    return new FormData(event.currentTarget);
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onCancel()}>
      <section className="action-modal" role="dialog" aria-modal="true">
        <header><div><p className="eyebrow">Gestión del reporte</p><h3>{panel === "assign" ? "Asignar responsable" : panel === "followup" ? "Programar seguimiento" : panel === "note" ? "Agregar nota interna" : "Ajustar prioridad"}</h3></div><button onClick={onCancel} aria-label="Cerrar">×</button></header>
        {panel === "assign" && <form onSubmit={(event) => { event.preventDefault(); const form = data(event); void onRun(() => services.admin.assign(report.id, String(form.get("assignee")), String(form.get("team")))); }}>
          <label>Cuadrilla o equipo<select name="team" defaultValue={report.team || teams[0]}>{teams.map((team) => <option key={team}>{team}</option>)}</select></label>
          <label>Responsable<select name="assignee" defaultValue={report.assignee || assignees[0]}>{assignees.map((assignee) => <option key={assignee}>{assignee}</option>)}</select></label>
          <ModalActions busy={busy} onCancel={onCancel} />
        </form>}
        {panel === "followup" && <form onSubmit={(event) => { event.preventDefault(); const form = data(event); void onRun(() => services.admin.scheduleFollowUp(report.id, { dueAt: new Date(String(form.get("dueAt"))).toISOString(), reason: String(form.get("reason")), expectedAction: String(form.get("action")), owner: String(form.get("owner")) })); }}>
          <label>Fecha y hora<input name="dueAt" type="datetime-local" defaultValue={defaultDate.toISOString().slice(0, 16)} required /></label>
          <label>Motivo<select name="reason"><option>Requiere inspección presencial</option><option>Esperando información del ciudadano</option><option>Esperando disponibilidad de cuadrilla</option><option>Turnado a otra dependencia</option><option>Validación con supervisor</option></select></label>
          <label>Acción esperada<input name="action" defaultValue="Confirmar avance del reporte" required /></label>
          <label>Responsable<select name="owner">{assignees.map((assignee) => <option key={assignee}>{assignee}</option>)}</select></label>
          {report.ticket?.priority === "P0" && <div className="modal-warning">Los casos P0 permanecerán visibles en la bandeja crítica aunque se programe un seguimiento.</div>}
          <ModalActions busy={busy} onCancel={onCancel} />
        </form>}
        {panel === "note" && <form onSubmit={(event) => { event.preventDefault(); const form = data(event); void onRun(() => services.admin.addNote(report.id, String(form.get("note")))); }}>
          <label>Nota<textarea name="note" rows={5} placeholder="Registra contexto útil para el siguiente responsable…" required /></label>
          <small className="form-explainer">La nota quedará registrada en la bitácora administrativa.</small>
          <ModalActions busy={busy} onCancel={onCancel} />
        </form>}
        {panel === "priority" && <form onSubmit={(event) => { event.preventDefault(); const form = data(event); void onRun(() => services.admin.changePriority(report.id, String(form.get("priority")) as Priority, String(form.get("reason")))); }}>
          <label>Nueva prioridad<select name="priority" defaultValue={report.ticket?.priority}>{(["P0", "P1", "P2", "P3"] as Priority[]).map((priority) => <option key={priority} value={priority}>{priority} · {priorityLabels[priority]}</option>)}</select></label>
          <label>Justificación<textarea name="reason" rows={4} placeholder="Explica por qué se modifica la prioridad sugerida…" required minLength={10} /></label>
          <div className="modal-warning">Este cambio quedará registrado con fecha y responsable.</div>
          <ModalActions busy={busy} onCancel={onCancel} />
        </form>}
        {error && <div className="error-banner">{error}</div>}
      </section>
    </div>
  );
}

function ModalActions({ busy, onCancel }: { busy: boolean; onCancel: () => void }) {
  return <div className="modal-actions"><button type="button" className="secondary-button" onClick={onCancel}>Cancelar</button><button className="primary-button" disabled={busy}>{busy ? "Guardando…" : "Guardar cambio"}</button></div>;
}
