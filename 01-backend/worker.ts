import "reflect-metadata";
import "dotenv/config";
import { initSentryIfConfigured } from "./utils/observability.js";
initSentryIfConfigured();
import { AppDataSource, runPostInitMigrations } from "./config/database.js";
import { ensureLegacyTenant } from "./config/seed.js";
import { ensureSystemSettings } from "./config/settings.js";
import { initScheduledJobs } from "./workers/queues.js";
import { REDIS_ENABLED } from "./config/redis.js";
import { assertDeployConfig } from "./config/validateEnv.js";

import "./workers/scheduled.worker.js";
import "./workers/fileCleanup.worker.js";
import "./workers/watermark.worker.js";
import "./workers/webhook.worker.js";

async function bootstrap() {
  if (!REDIS_ENABLED) {
    console.error(
      "[worker] REDIS_URL or REDIS_HOST is not configured. The worker " +
        "process requires Redis (BullMQ has no in-memory fallback). " +
        "Set REDIS_URL and restart.",
    );
    process.exit(1);
  }

  try {
    assertDeployConfig();

    await AppDataSource.initialize();
    console.log("[worker] Database connected; migrations applied.");

    await runPostInitMigrations();
    await ensureLegacyTenant();
    await ensureSystemSettings();

    await initScheduledJobs();

    console.log("[worker] Online. Consumers: scheduled, fileCleanup, watermark, webhook.");
  } catch (error) {
    console.error("[worker] Failed to start:", error);
    process.exit(1);
  }
}

const shutdown = (signal: string) => {
  console.log(`[worker] ${signal} received, shutting down`);
  process.exit(0);
};
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

bootstrap();
