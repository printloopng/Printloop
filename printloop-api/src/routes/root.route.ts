import { Router } from "express";
import { DataSource } from "typeorm";
import { NotFoundError, errorHandler } from "@/common";
import { AuditLogger } from "@/common/monitoring/audit";
import { redis, jwt } from "@/config/int-services";
import { Config } from "@/config";
import { HealthMonitor } from "@/common/monitoring/health";
import { MetricsCollector } from "@/common/monitoring/metrics";
import { Logger } from "@/common/logger";
import { RateLimitPresets } from "@/common/middleware/rate-limiter";
import { authMiddleware, adminMiddleware } from "@/common";
import { optionalTenant } from "@/common/middleware/tenant.middleware";
import { paystackWebhookController } from "@/modules/public/controllers/paystackWebhook.controller";
import { createPublicRoutes } from "@/modules/public/routes";
import {
  createCustomerRoutes,
  createCustomerAuxRoutes,
} from "@/modules/customer/routes";
import { createSaasRoutes } from "@/modules/saas/routes";
import { createPlatformRoutes } from "@/modules/platform/routes";
import { createKioskRoutes } from "@/modules/kiosk/routes";

const logger = new Logger({
  level: Config.logging.level,
  service: Config.service.name,
});

const initMonitoring = (dataSource: DataSource) => {
  const healthMonitor = HealthMonitor.initialize(dataSource, redis);
  AuditLogger.initialize(dataSource);
  const metricsCollector = MetricsCollector.getInstance();
  return { healthMonitor, metricsCollector };
};

export const createRootRoutes = (dataSource: DataSource) => {
  const rootRouter = Router();
  const { healthMonitor, metricsCollector } = initMonitoring(dataSource);

  rootRouter.get("/", (_req, res) => {
    res.json({
      name: Config.service.name,
      version: Config.service.version,
      status: "running",
      timestamp: new Date().toISOString(),
    });
  });

  rootRouter.get("/health", healthMonitor.healthEndpoint());
  rootRouter.get(
    "/metrics",
    authMiddleware(jwt),
    adminMiddleware(),
    (_req, res) => {
      res.json(metricsCollector.getMetricsSummary());
    },
  );

  try {
    rootRouter.use(RateLimitPresets.general(redis));
  } catch {
  }

  rootRouter.use(createPlatformRoutes(dataSource));
  rootRouter.use(createPublicRoutes(dataSource));
  rootRouter.use("/saas", createSaasRoutes(dataSource));
  rootRouter.use(createKioskRoutes(dataSource));

  rootRouter.post("/webhooks/paystack", optionalTenant, paystackWebhookController.handle);

  rootRouter.use(createCustomerAuxRoutes(dataSource));
  rootRouter.use("/customer", createCustomerRoutes(dataSource));

  rootRouter.use((req, _res, next) => {
    next(new NotFoundError(`Route not found: ${req.method} ${req.path}`));
  });
  rootRouter.use(errorHandler);

  logger.info("PrintLoop API routes mounted (product surface, no legacy admin)");

  return rootRouter;
};
