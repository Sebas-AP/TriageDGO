import { config } from "dotenv";
import { resolve } from "node:path";

// Both ts-node-dev (src/) and compiled Node (dist/) resolve this to the repo root.
config({ path: resolve(__dirname, "../../.env") });
