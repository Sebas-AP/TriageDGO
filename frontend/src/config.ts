export const config = {
  mode: import.meta.env.VITE_APP_MODE === "api" ? "api" : "demo",
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL || "http://localhost:3000",
  maxPhotoBytes: Number(import.meta.env.VITE_MAX_PHOTO_MB || 5) * 1024 * 1024,
} as const;
