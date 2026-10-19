import "reflect-metadata";
import "dotenv/config";
import { initSentry } from "./services/sentry.service.js";
initSentry();
import { createApp } from "./app.js";
import { AppDataSource, runPostInitMigrations } from "./config/database.js";
import { runSeed, ensureLegacyTenant } from "./config/seed.js";
import { ensureSystemSettings } from "./config/settings.js";
import { assertDeployConfig } from "./config/validateEnv.js";
import { startRetentionSweep } from "./workers/retention.js";
import { config } from "./config/index.js";

const port = config.app.port;

async function bootstrap() {
  try {
    assertDeployConfig();

    await AppDataSource.initialize();
    console.log("Database connected (SQLite); migrations applied.");

    await runPostInitMigrations();

    await runSeed();
    await ensureLegacyTenant();
    await ensureSystemSettings();

    const app = createApp();
    app.listen(port, () => {
      console.log(`PrintLoop API listening on http://localhost:${port}`);
      console.log(`Health check: http://localhost:${port}/health`);
    });

    startRetentionSweep();
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
}

bootstrap();
