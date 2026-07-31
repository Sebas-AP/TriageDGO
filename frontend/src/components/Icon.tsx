import type { SVGProps } from "react";

export type IconName =
  | "dashboard" | "inbox" | "clock" | "pattern" | "map" | "history"
  | "search" | "bell" | "user" | "team" | "note" | "print" | "close"
  | "chevron" | "check" | "alert" | "spark" | "refresh" | "logout"
  | "form" | "whatsapp" | "call" | "manual" | "menu" | "calendar";

const paths: Record<IconName, React.ReactNode> = {
  dashboard: <><rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/></>,
  inbox: <><path d="M4 5h16v13H4z"/><path d="M4 14h4l2 3h4l2-3h4"/></>,
  clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
  pattern: <><path d="M3 16c3-7 6-7 9 0s6 7 9 0"/><path d="M3 8c3-4 6-4 9 0s6 4 9 0"/></>,
  map: <><path d="m3 6 5-3 8 3 5-3v15l-5 3-8-3-5 3z"/><path d="M8 3v15M16 6v15"/></>,
  history: <><path d="M4 5h16v16H4z"/><path d="M8 3v4M16 3v4M4 10h16"/></>,
  search: <><circle cx="11" cy="11" r="7"/><path d="m16 16 5 5"/></>,
  bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></>,
  user: <><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></>,
  team: <><circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M3 20a6 6 0 0 1 12 0M14 15a5 5 0 0 1 7 5"/></>,
  note: <><path d="M4 3h16v18H4z"/><path d="M8 8h8M8 12h8M8 16h5"/></>,
  print: <><path d="M7 8V3h10v5M7 17H4v-7h16v7h-3"/><path d="M7 14h10v7H7z"/></>,
  close: <path d="m5 5 14 14M19 5 5 19"/>,
  chevron: <path d="m9 18 6-6-6-6"/>,
  check: <path d="m4 12 5 5L20 6"/>,
  alert: <><path d="M12 3 2 21h20z"/><path d="M12 9v5M12 18h.01"/></>,
  spark: <><path d="m12 2 1.6 6.4L20 10l-6.4 1.6L12 18l-1.6-6.4L4 10l6.4-1.6z"/><path d="m19 17 .6 2.4L22 20l-2.4.6L19 23l-.6-2.4L16 20l2.4-.6z"/></>,
  refresh: <><path d="M20 11a8 8 0 1 0-2 5.3"/><path d="M20 4v7h-7"/></>,
  logout: <><path d="M10 4H4v16h6M14 8l4 4-4 4M8 12h10"/></>,
  form: <><path d="M5 3h14v18H5z"/><path d="M8 8h8M8 12h8M8 16h5"/></>,
  whatsapp: <><path d="M20 11.5a8 8 0 0 1-12 7L3 20l1.5-4.5A8 8 0 1 1 20 11.5z"/><path d="M8 8c1 4 3 6 7 7"/></>,
  call: <path d="M6 3h4l2 5-3 2c1 3 3 5 6 6l2-3 5 2v4c0 2-2 3-4 3C10 21 3 14 3 6c0-2 1-3 3-3z"/>,
  manual: <><path d="m4 20 4-1 11-11-3-3L5 16z"/><path d="m14 7 3 3"/></>,
  menu: <path d="M4 7h16M4 12h16M4 17h16"/>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18"/></>,
};

export function Icon({ name, ...props }: { name: IconName } & SVGProps<SVGSVGElement>) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{paths[name]}</svg>;
}
