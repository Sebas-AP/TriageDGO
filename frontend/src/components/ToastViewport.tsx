import { useEffect, useState } from "react";
import type { ToastRequest } from "../lib/feedback";
import { Icon } from "./Icon";

interface ToastItem extends ToastRequest {
  id: string;
  leaving?: boolean;
}

export function ToastViewport() {
  const [items, setItems] = useState<ToastItem[]>([]);

  useEffect(() => {
    function receive(event: Event) {
      const detail = (event as CustomEvent<ToastRequest>).detail;
      const id = crypto.randomUUID();
      setItems((current) => [...current.slice(-2), { ...detail, id, tone: detail.tone || "success" }]);
      window.setTimeout(() => {
        setItems((current) => current.map((item) => item.id === id ? { ...item, leaving: true } : item));
        window.setTimeout(() => setItems((current) => current.filter((item) => item.id !== id)), 220);
      }, 3_500);
    }
    window.addEventListener("triage:toast", receive);
    return () => window.removeEventListener("triage:toast", receive);
  }, []);

  return (
    <aside className="toast-viewport" aria-live="polite" aria-label="Notificaciones">
      {items.map((item) => (
        <div key={item.id} className={`toast toast-${item.tone} ${item.leaving ? "toast-leaving" : ""}`}>
          <span className="toast-icon"><Icon name={item.tone === "success" ? "check" : item.tone === "error" ? "close" : item.tone === "warning" ? "alert" : "spark"} /></span>
          <div><strong>{item.title}</strong>{item.message && <p>{item.message}</p>}</div>
          <button onClick={() => setItems((current) => current.filter((candidate) => candidate.id !== item.id))} aria-label="Cerrar notificación"><Icon name="close" /></button>
        </div>
      ))}
    </aside>
  );
}
