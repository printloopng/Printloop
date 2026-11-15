import "reflect-metadata";
import { AppDataSource } from "@/config/data-source";
import { Logger } from "@/common/logger";
import { ProductionSetupSeeder } from "./production-setup.seeder";

async function main() {
  const logger = new Logger({ level: "info", service: "production-setup" });

  try {
    logger.info("Connecting to database...");
    await AppDataSource.initialize();
    logger.info("Database connected; migrations applied");

    const seeder = new ProductionSetupSeeder(logger);
    await seeder.run(AppDataSource);

    logger.info("Production setup completed successfully");
    process.exit(0);
  } catch (err) {
    logger.error("Production setup failed:", err as Error);
    process.exit(1);
  } finally {
    if (AppDataSource.isInitialized) {
      await AppDataSource.destroy();
    }
  }
}

void main();
