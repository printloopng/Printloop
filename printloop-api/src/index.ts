import "reflect-metadata";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import morgan from "morgan";
import { createRootRoutes } from "./routes/root.route";
import { AppDataSource, runPostInitMigrations } from "./config/data-source";
import { Logger } from "./common/logger";
import { requestIdMiddleware } from "./common/errors";
import { Config, config } from "./config";
import { requestMetricsMiddleware } from "./common/monitoring/metrics";
import { auditMiddleware, AuditLogger } from "./common/monitoring/audit";
import { assertDeployConfig } from "./config/validateEnv";
import { runSeed, ensureLegacyTenant } from "./database/seeders/seed";
import { ensureSystemSettings } from "./config/settings";
import { startRetentionSweep } from "./workers/retention";

const app = express();
const logger = new Logger({
  level: Config.logging.level,
  service: Config.service.name,
});

const port = Config.port;

app.set("trust proxy", 1);
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'"],
        frameSrc: ["'none'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        upgradeInsecureRequests: [],
      },
    },
    crossOriginEmbedderPolicy: false,
  }),
);
app.use(compression());
app.use(
  express.json({
    limit: "10mb",
    verify: (req, _res, buf) => {
      (req as express.Request).rawBody = buf;
    },
  }),
);
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

const applianceCors = cors({
  origin: true,
  methods: ["GET", "POST", "PATCH", "OPTIONS"],
  allowedHeaders: [
    "Content-Type",
    "X-Kiosk-Key",
    "X-Upload-Token",
    "Authorization",
  ],
});
app.use("/api/printer", applianceCors);
app.use("/api/agent", applianceCors);
app.use("/api/participant-upload", applianceCors);

app.use(
  cors({
    origin: (
      origin: string | undefined,
      cb: (err: Error | null, allow?: boolean | string) => void,
    ) => {
      if (!origin) return cb(null, true);
      const allowed = Config.allowedOrigins.some((pattern) => {
        if (pattern.startsWith("*.")) {
          const domain = pattern.slice(2);
          try {
            const host = new URL(origin).hostname.toLowerCase();
            return host === domain || host.endsWith(`.${domain}`);
          } catch {
            return false;
          }
        }
        return origin === pattern;
      });
      cb(null, allowed ? origin : false);
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-Request-ID",
      "X-Tenant-Slug",
      "X-Kiosk-Key",
      "Origin",
    ],
  }),
);

app.use(
  morgan(Config.nodeEnv === "production" ? "combined" : "dev", {
    stream: {
      write: (message: string) => logger.info(message.trim()),
    },
  }),
);
app.use(requestIdMiddleware);
app.use(requestMetricsMiddleware);
app.use(auditMiddleware);

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    version: Config.service.version,
  });
});

const startServer = async () => {
  try {
    assertDeployConfig();

    await AppDataSource.initialize();
    logger.info("Database connected; migrations applied");
    AuditLogger.initialize(AppDataSource);
    await runPostInitMigrations();

    if (config.saas.seedDemo || process.env.SEED_DEMO === "1") {
      process.env.SEED_DEMO = "1";
    }
    await runSeed();
    await ensureLegacyTenant();
    await ensureSystemSettings();

    app.use("/api", createRootRoutes(AppDataSource));

    app.listen(port, () => {
      logger.info(
        `${Config.service.name} v${Config.service.version} on http://localhost:${port}`,
      );
      logger.info(`Health: http://localhost:${port}/health`);
    });

    startRetentionSweep();
  } catch (error) {
    logger.error("Failed to start server", error as Error);
    process.exit(1);
  }
};

startServer().catch((error) => {
  logger.error("Failed to start application", error);
  process.exit(1);
});
