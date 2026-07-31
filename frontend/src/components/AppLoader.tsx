export function AppLoader({ compact = false }: { compact?: boolean }) {
  return (
    <div className={compact ? "app-loader compact" : "app-loader"} role="status" aria-label="Cargando plataforma">
      <div className="loader-territory" aria-hidden="true">
        <span className="loader-brand">072</span>
        <i className="territory-ring ring-one" />
        <i className="territory-ring ring-two" />
        <i className="territory-point point-one" />
        <i className="territory-point point-two" />
      </div>
      {!compact && <div className="loader-copy"><strong>Preparando Mesa de Control</strong><span>Sincronizando operación ciudadana</span><div className="loader-progress"><i /></div></div>}
    </div>
  );
}
