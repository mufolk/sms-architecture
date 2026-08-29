import pino from "pino";
import { loadEnv } from "./env.js";

const env = loadEnv();
const log = pino({ level: env.LOG_LEVEL });

log.info("Worker process started — processing begins in ticket 02");

function shutdown() {
  log.info("Worker shutting down");
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
