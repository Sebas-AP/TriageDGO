import "./env";
import "dotenv/config";
import { IngestionWorker } from "./business/worker";
import { FirestoreTriageStore } from "./data/firestore/firestore.store";
import { InMemoryTriageStore } from "./data/firestore/triage.store";
import { createHttpRagClient } from "./mcp/clients/rag.client";
const store = process.env.FIREBASE_PROJECT_ID ? new FirestoreTriageStore() : new InMemoryTriageStore();
const worker = new IngestionWorker(store, undefined, createHttpRagClient(process.env.RAG_SERVICE_URL ?? "http://localhost:8001"));
setInterval(() => { void worker.runOnce(); }, Number(process.env.WORKER_POLL_MS ?? 2000));
