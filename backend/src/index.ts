// Entry point del monolito Express (ver arq.md §3). Lógica de negocio: fase TDD (siguiente checkpoint).
import express from "express";

const app = express();
app.use(express.json());

const PORT = process.env.PORT ?? 3000;
app.listen(PORT, () => {
  console.log(`Triage 072 backend escuchando en :${PORT}`);
});

export { app };
