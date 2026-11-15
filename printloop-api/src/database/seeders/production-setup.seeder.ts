import { DataSource } from "typeorm";
import { Logger } from "@/common/logger";
import { ensureSystemSettings } from "@/config/settings";
import { ensureSuperAdmin } from "./superAdmin";

export class ProductionSetupSeeder {
  constructor(private readonly logger: Logger) {}

  async run(dataSource: DataSource): Promise<void> {
    void dataSource;

    await ensureSystemSettings();
    this.logger.info("System settings: defaults applied (missing keys only)");

    await this.ensureBootstrapAdmin();
  }

  private async ensureBootstrapAdmin(): Promise<void> {
    const skip = process.env.SETUP_SKIP_ADMIN === "1" || process.env.SETUP_SKIP_ADMIN === "true";
    if (skip) {
      this.logger.info("SETUP_SKIP_ADMIN set — skipping bootstrap admin");
      return;
    }

    const email = process.env.BOOTSTRAP_ADMIN_EMAIL;
    const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
    if (!email || !password) {
      throw new Error(
        "BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD must be set to create the bootstrap admin (or set SETUP_SKIP_ADMIN=1 to skip)"
      );
    }

    const result = await ensureSuperAdmin({ email, password });
    if (result.outcome === "created") {
      this.logger.info(`Created bootstrap super admin: ${email.trim().toLowerCase()}`);
    } else if (result.outcome === "unchanged") {
      this.logger.info(`Bootstrap admin already exists: ${email.trim().toLowerCase()}`);
    } else if (result.outcome === "refused") {
      throw new Error(`Bootstrap admin email is already registered as ${result.role}, not a platform admin`);
    }
  }
}
