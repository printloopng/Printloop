import "reflect-metadata";
import { AppDataSource } from "@/config/data-source";
import { Logger } from "@/common/logger";
import { Config } from "@/config";
import { assertDeployConfig } from "@/config/validateEnv";
import { REDIS_ENABLED } from "@/config/redis";

const logger = new Logger({
  level: Config.logging.level,
  service: "printloop-worker",
});

async function main() {
  assertDeployConfig();
  if (!REDIS_ENABLED) {
    logger.error("REDIS_URL is required for the worker process");
    process.exit(1);
  }

  await AppDataSource.initialize();
  logger.info("Worker DB connected");

  await import("./scheduled.worker");
  await import("./fileCleanup.worker");
  await import("./webhook.worker");
  await import("./watermark.worker");

  logger.info("PrintLoop BullMQ workers registered");
}

main().catch((err) => {
  logger.error("Worker failed to start", err as Error);
  process.exit(1);
});
