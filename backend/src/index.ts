// Entry point del monolito Express (ver arq.md §3). Lógica de negocio: fase TDD (siguiente checkpoint).
import "./env";
import "dotenv/config";
import { createApp } from "./app";

const app = createApp();

const PORT = process.env.PORT ?? 3000;
app.listen(PORT, () => {
  console.log(`Triage 072 backend escuchando en :${PORT}`);
});

export { app };
