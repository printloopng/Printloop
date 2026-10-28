import "reflect-metadata";
import { createApp, initApp } from "./app";
import { Logger } from "./common/logger";
import { Config } from "./config";
import { assertDeployConfig } from "./config/validateEnv";
import { startRetentionSweep } from "./workers/retention";
import { REDIS_ENABLED } from "./config/redis";
import { editorCollaborationService } from "./modules/saas/services/editorCollaboration.service";

const logger = new Logger({
  level: Config.logging.level,
  service: Config.service.name,
});

const startServer = async () => {
  try {
    assertDeployConfig();
    const app = createApp();
    await initApp(app);
    logger.info("Database connected; migrations applied");
    const server = app.listen(Config.port, () => {
      logger.info(`${Config.service.name} v${Config.service.version} on http://localhost:${Config.port}`);
      logger.info(`Health: http://localhost:${Config.port}/health`);
    });
    await editorCollaborationService.initialize(server);
    startRetentionSweep();
    if (Config.embedWorkers && REDIS_ENABLED) {
      await import("./workers/scheduled.worker");
      await import("./workers/fileCleanup.worker");
      await import("./workers/webhook.worker");
      await import("./workers/watermark.worker");
      logger.info("BullMQ workers running inside the API process");
    }
  } catch (error) {
    logger.error("Failed to start server", error as Error);
    process.exit(1);
  }
};

startServer().catch((error) => {
  logger.error("Failed to start application", error);
  process.exit(1);
});
