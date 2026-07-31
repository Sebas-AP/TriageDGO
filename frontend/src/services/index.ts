import { config } from "../config";
import type { Services } from "./contracts";

export const services: Services =
  config.mode === "api"
    ? (await import("./api")).apiServices
    : (await import("./demo")).demoServices;
