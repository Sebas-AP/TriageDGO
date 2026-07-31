export type ToastTone = "success" | "error" | "info" | "warning";

export interface ToastRequest {
  title: string;
  message?: string;
  tone?: ToastTone;
}

export function notify(request: ToastRequest) {
  window.dispatchEvent(new CustomEvent<ToastRequest>("triage:toast", { detail: request }));
}
