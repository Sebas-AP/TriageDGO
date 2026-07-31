import { useState, type FormEvent } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { config } from "../config";
import { useAuth } from "../app/AuthContext";

export default function AdminLogin() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState(config.mode === "demo" ? "admin@demo.local" : "");
  const [password, setPassword] = useState(config.mode === "demo" ? "demo072" : "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to="/admin" replace />;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await login(email, password);
      const target = (location.state as { from?: string } | null)?.from || "/admin";
      navigate(target, { replace: true });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No pudimos iniciar sesión.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login-shell">
      <section className="login-panel">
        <Link to="/" className="brand"><span className="brand-mark">072</span><span>Triage Durango</span></Link>
        <div className="login-copy">
          <p className="eyebrow">Consola municipal</p>
          <h1>Atiende lo urgente, entiende el contexto.</h1>
          <p>Supervisa reportes y observa cómo los agentes construyen cada ticket.</p>
        </div>
      </section>
      <section className="login-card">
        <form onSubmit={submit}>
          <h2>Acceso administrativo</h2>
          <p>Ingresa con tu cuenta institucional.</p>
          <label htmlFor="admin-email">Correo electrónico</label>
          <input id="admin-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="email" />
          <label htmlFor="admin-password">Contraseña</label>
          <input id="admin-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} required autoComplete="current-password" />
          {config.mode === "demo" && <div className="demo-note">Modo demo activo: las credenciales ya están preparadas.</div>}
          {error && <div className="error-banner" role="alert">{error}</div>}
          <button className="primary-button full-button" disabled={busy}>{busy ? "Ingresando…" : "Entrar a la consola"}</button>
          <Link to="/" className="back-link">← Volver al reporte ciudadano</Link>
        </form>
      </section>
    </main>
  );
}
