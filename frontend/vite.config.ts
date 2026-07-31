import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
  build: {
    target: "es2022",
    rollupOptions: {
      output: {
        manualChunks: {
          maps: ["leaflet", "react-leaflet"],
          firebase: ["firebase/app", "firebase/auth"],
        },
      },
    },
  },
  test: {
    environment: "jsdom",
    environmentOptions: {
      jsdom: {
        url: "http://localhost:5173",
      },
    },
    setupFiles: "./vitest.setup.ts",
    css: true,
    exclude: ["e2e/**", "node_modules/**", "dist/**"],
  },
});
