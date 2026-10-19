import { z } from "zod";
import dotenv from "dotenv";
import path from "path";

dotenv.config();

const boolFromEnv = (v: string | undefined, fallback = false) => {
  if (v === undefined || v === "") return fallback;
  return !["0", "false", "no", "off"].includes(v.toLowerCase());
};

const configSchema = z.object({
  port: z.coerce.number().default(4000),
  nodeEnv: z
    .enum(["development", "production", "staging", "test"])
    .default("development"),
  appUrl: z.string().default("http://localhost:4000"),
  frontendUrl: z.string().default("http://localhost:5173"),
  allowedOrigins: z.array(z.string()).default(["http://localhost:5173"]),
  database: z.object({
    url: z.string().optional(),
    file: z.string().default("./data/printloop.sqlite"),
    ssl: z.boolean().default(false),
    poolMax: z.coerce.number().default(10),
  }),
  redis: z.object({
    url: z.string().optional(),
    host: z.string().default("localhost"),
    port: z.coerce.number().default(6379),
    password: z.string().default(""),
    username: z.string().default(""),
    db: z.coerce.number().default(0),
    keyPrefix: z.string().default("printloop"),
    ttl: z.coerce.number().default(3600),
  }),
  jwt: z.object({
    secret: z.string().default("printloop-dev-secret-please-change-32chars-minimum"),
    expiresIn: z.string().default("7d"),
  }),
  service: z.object({
    name: z.string().default("printloop-api"),
    version: z.string().default("2.0.0"),
  }),
  logging: z.object({
    level: z.enum(["debug", "info", "warn", "error"]).default("info"),
  }),
  commissionPctDefault: z.coerce.number().default(0.1),
  printloopApexDomains: z.array(z.string()).default(["printloop.app", "printloop.test"]),
  renderCallbackSecret: z.string().default(""),
  paystack: z.object({
    publicKey: z.string().default(""),
    secretKey: z.string().default(""),
    webhookSecret: z.string().default(""),
  }),
  seedDemo: z.boolean().default(false),
  disableRateLimit: z.boolean().default(false),
});

const parsed = configSchema.parse({
  port: process.env.PORT ?? "4000",
  nodeEnv: process.env.NODE_ENV ?? "development",
  appUrl: process.env.APP_URL ?? process.env.FRONTEND_URL ?? "http://localhost:4000",
  frontendUrl: process.env.FRONTEND_URL ?? "http://localhost:5173",
  allowedOrigins: (process.env.ALLOWED_ORIGINS || "http://localhost:5173")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  database: {
    url: process.env.DATABASE_URL || undefined,
    file: process.env.DATABASE_FILE || path.join(process.cwd(), "data", "printloop.sqlite"),
    ssl: boolFromEnv(process.env.DB_SSL, false),
    poolMax: process.env.DB_POOL_MAX ?? "10",
  },
  redis: {
    url: process.env.REDIS_URL || undefined,
    host: process.env.REDIS_HOST || "localhost",
    port: process.env.REDIS_PORT ?? "6379",
    password: process.env.REDIS_PASSWORD || "",
    username: process.env.REDIS_USERNAME || "",
    db: process.env.REDIS_DB ?? "0",
    keyPrefix: process.env.REDIS_KEY_PREFIX || "printloop",
    ttl: process.env.REDIS_TTL ?? "3600",
  },
  jwt: {
    secret: process.env.JWT_SECRET || "printloop-dev-secret-please-change-32chars-minimum",
    expiresIn: process.env.JWT_EXPIRES_IN || "7d",
  },
  service: {
    name: process.env.SERVICE_NAME || "printloop-api",
    version: process.env.APP_VERSION || "2.0.0",
  },
  logging: {
    level: (process.env.LOG_LEVEL as any) || "info",
  },
  commissionPctDefault: process.env.COMMISSION_PCT_DEFAULT ?? "0.10",
  printloopApexDomains: (process.env.PRINTLOOP_APEX_DOMAINS || "printloop.app,printloop.test")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  renderCallbackSecret: process.env.RENDER_CALLBACK_SECRET || "",
  paystack: {
    publicKey: process.env.PAYSTACK_PUBLIC_KEY || "",
    secretKey: process.env.PAYSTACK_SECRET_KEY || "",
    webhookSecret: process.env.PAYSTACK_WEBHOOK_SECRET || "",
  },
  seedDemo: boolFromEnv(process.env.SEED_DEMO, false),
  disableRateLimit: boolFromEnv(process.env.DISABLE_RATE_LIMIT, false),
});

export const Config = parsed;

export const config = {
  app: {
    env: Config.nodeEnv,
    version: Config.service.version,
    port: Config.port,
    allowedOrigins: Config.allowedOrigins,
  },
  database: {
    url: Config.database.url || "",
    file: Config.database.file,
    ssl: Config.database.ssl,
    poolMax: Config.database.poolMax,
    logging: false,
  },
  redis: {
    url: Config.redis.url || "",
    host: Config.redis.host,
    port: Config.redis.port,
    password: Config.redis.password,
    enabled: Boolean(Config.redis.url || process.env.REDIS_HOST),
  },
  auth: {
    jwtSecret: Config.jwt.secret,
    jwtExpiresIn: Config.jwt.expiresIn,
  },
  saas: {
    commissionPctDefault: Config.commissionPctDefault,
    apexDomains: Config.printloopApexDomains,
    domainsCname: process.env.PRINTLOOP_DOMAINS_CNAME || "domains.printloop.app",
    seedDemo: Config.seedDemo,
    renderCallbackSecret: Config.renderCallbackSecret,
  },
  payments: {
    paystack: Config.paystack,
    commissionPctDefault: Config.commissionPctDefault,
  },
  storage: {
    s3: {
      bucket: process.env.S3_BUCKET || "printloop-uploads",
      region: process.env.AWS_REGION || "us-east-1",
      accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
      endpoint: process.env.S3_ENDPOINT || undefined,
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
    },
    cloudinary: {
      cloudName: process.env.CLOUDINARY_CLOUD_NAME || "",
      apiKey: process.env.CLOUDINARY_API_KEY || "",
      apiSecret: process.env.CLOUDINARY_API_SECRET || "",
    },
  },
  email: {
    host: process.env.SMTP_HOST || "",
    port: parseInt(process.env.SMTP_PORT || "587", 10),
    secure: process.env.SMTP_SECURE === "true",
    user: process.env.SMTP_USER || "",
    password: process.env.SMTP_PASSWORD || "",
    from: process.env.SMTP_FROM || "PrintLoop <noreply@printloop.app>",
  },
  sms: {
    termii: {
      apiKey: process.env.TERMII_API_KEY || "",
      senderId: process.env.TERMII_SENDER_ID || "PrintLoop",
    },
  },
  logging: {
    level: Config.logging.level,
    pretty: process.env.LOG_PRETTY === "true" || Config.nodeEnv !== "production",
  },
  sentry: {
    dsn: process.env.SENTRY_DSN || "",
    tracesSampleRate: parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE || "0.1"),
    profilesSampleRate: parseFloat(process.env.SENTRY_PROFILES_SAMPLE_RATE || "0"),
  },
  render: {
    callbackSecret: Config.renderCallbackSecret,
    callbackUrl:
      process.env.RENDER_CALLBACK_URL ||
      "http://localhost:4000/api/render/callback",
  },
  office: {
    converter: process.env.DOC_CONVERTER || "gotenberg",
    gotenbergUrl: process.env.GOTENBERG_URL || "http://localhost:3000",
  },
  print: {
    dispatchMode: process.env.PRINT_DISPATCH_MODE || "cloud-push",
  },
  editor: {
    libreofficeUrl: process.env.LIBREOFFICE_URL || "http://localhost:9980",
    univerLibreOfficeUrl:
      process.env.LIBREOFFICE_UNO_URL ||
      "socket,host=libreoffice,port=2002;urp;StarOffice.ComponentContext",
    univerExportUrl: process.env.UNIVER_EXPORT_URL || "http://localhost:3001/export",
    coturnPassword: process.env.COTURN_PASSWORD || "changeme",
    turnServer: process.env.TURN_SERVER || "",
    turnTlsServer: process.env.TURN_TLS_SERVER || "",
    sessionTtlHours: parseInt(process.env.EDITOR_SESSION_TTL_HOURS || "24", 10),
    snapshotIntervalMs: parseInt(process.env.EDITOR_SNAPSHOT_INTERVAL_MS || "30000", 10),
  },
  frontendUrl: Config.frontendUrl,
  rateLimit: {
    windowMs: 900_000,
    maxRequests: 300,
  },
};

export default Config;
