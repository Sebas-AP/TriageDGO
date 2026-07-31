import "./env";
import "dotenv/config";
import { IngestionWorker } from "./business/worker";
import { FirestoreTriageStore } from "./data/firestore/firestore.store";
import { InMemoryTriageStore } from "./data/firestore/triage.store";
const store = process.env.FIREBASE_PROJECT_ID ? new FirestoreTriageStore() : new InMemoryTriageStore();
const worker = new IngestionWorker(store);
setInterval(() => { void worker.runOnce(); }, Number(process.env.WORKER_POLL_MS ?? 2000));
