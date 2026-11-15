import "reflect-metadata";
import { AppDataSource } from "@/config/data-source";
import { Config } from "@/config";
import { Logger } from "@/common/logger";
import { seedDemoData } from "./demo-seed";

async function runSeeders() {
  const logger = new Logger({ level: "info", service: "seed-runner" });

  try {
    if (Config.nodeEnv === "production") {
      throw new Error("Refusing to seed demo accounts with NODE_ENV=production. Use db-seed:setup instead.");
    }

    logger.info("Initializing database connection...");
    await AppDataSource.initialize();

    const { host, port, name } = AppDataSource.options as any;
    logger.info(`Dropping existing database tables in ${name} on ${host}:${port}...`);
    await AppDataSource.dropDatabase();
    logger.info("Database dropped successfully");

    logger.info("Running migrations...");
    await AppDataSource.runMigrations();
    logger.info("Database migrated successfully");

    await seedDemoData(AppDataSource, logger);

    process.exit(0);
  } catch (err) {
    logger.error("Error during seeding:", err as Error);
    process.exit(1);
  } finally {
    if (AppDataSource.isInitialized) {
      await AppDataSource.destroy();
    }
  }
}

runSeeders();
