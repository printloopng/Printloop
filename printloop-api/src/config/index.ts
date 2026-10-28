import { z } from "zod";
import dotenv from "dotenv";

dotenv.config();

const env = process.env;
const num = (v: string | undefined) => (v === undefined || v === "" ? undefined : Number(v));
const list = (v: string | undefined, fallback: string[]) => {
  const items = (v || "").split(",").map((s) => s.trim()).filter(Boolean);
  return items.length ? items : fallback;
};
const url = (v: string | undefined, fallback = "") => (v || fallback).replace(/\/+$/, "");
const on = (v: string | undefined) => v === "1" || v === "true";

const configSchema = z.object({
  port: z.coerce.number().default(4000),
  nodeEnv: z.enum(["development", "production", "staging", "test"]).default("development"),
  publicBaseUrl: z.string().default(""),
  seedDemo: z.boolean().default(false),
  embedWorkers: z.boolean().default(false),
  printDispatchMode: z.string().default(""),
  commissionPctDefault: z.coerce.number().default(0.1),
  allowedOrigins: z.array(z.string()),
  apexDomains: z.array(z.string()),
  domainsCname: z.string().default("domains.printloop.app"),
  edgeSecret: z.string().default(""),
  urls: z.object({
    landing: z.string(),
    customer: z.string(),
    shop: z.string(),
    backoffice: z.string(),
  }),
  database: z.object({
    url: z.string().default("postgresql://postgres:postgres@localhost:5432/printloop"),
    ssl: z.boolean().default(false),
  }),
  redis: z.object({
    enabled: z.boolean(),
    url: z.string().default(""),
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
    pretty: z.boolean(),
    fileLogging: z.boolean(),
  }),
  rateLimit: z.object({
    disabled: z.boolean(),
    windowMs: z.number().default(900_000),
    maxRequests: z.number().default(300),
  }),
  platformRequire2fa: z.boolean().default(true),
  allowPrivateWebhooks: z.boolean().default(false),
  paystack: z.object({
    publicKey: z.string().default(""),
    secretKey: z.string().default(""),
    webhookSecret: z.string().default(""),
  }),
  cloudinary: z.object({
    cloudName: z.string().default(""),
    apiKey: z.string().default(""),
    apiSecret: z.string().default(""),
  }),
  s3: z.object({
    endpoint: z.string().default(""),
    bucket: z.string().default(""),
    region: z.string().default("auto"),
    accessKeyId: z.string().default(""),
    secretAccessKey: z.string().default(""),
    forcePathStyle: z.boolean().default(false),
    publicUrl: z.string().default(""),
  }),
  backup: z.object({
    dir: z.string().default(""),
    keep: z.number().default(14),
    s3: z.object({
      endpoint: z.string().default(""),
      bucket: z.string().default(""),
      region: z.string().default("auto"),
      accessKeyId: z.string().default(""),
      secretAccessKey: z.string().default(""),
      forcePathStyle: z.boolean().default(false),
      publicUrl: z.string().default(""),
    }),
  }),
  email: z.object({
    host: z.string().default(""),
    port: z.coerce.number().default(587),
    secure: z.boolean().default(false),
    user: z.string().default(""),
    password: z.string().default(""),
    from: z.string().default("PrintLoop <noreply@printloop.ng>"),
  }),
  sms: z.object({
    apiKey: z.string().default(""),
    senderId: z.string().default("PrintLoop"),
  }),
  conversion: z.object({
    converter: z.string().default(""),
    gotenbergUrl: z.string().default(""),
    timeoutMs: z.number().default(60_000),
    libreofficeBin: z.string().default(""),
    ghostscriptBin: z.string().default(""),
    univerExportUrl: z.string().default(""),
  }),
  editor: z.object({
    turnServer: z.string().default(""),
    turnTlsServer: z.string().default(""),
    coturnPassword: z.string().default(""),
    sessionTtlHours: z.number().default(24),
  }),
  ipp: z.object({
    caCert: z.string().default(""),
    path: z.string().default("/ipp/print"),
    port: z.number().optional(),
    rawPort: z.number().default(9100),
    secure: z.boolean().default(false),
    tlsRejectUnauthorized: z.boolean().default(false),
    version: z.string().default("2.0"),
    transport: z.string().default("ipp"),
    socks5Proxy: z.string().default(""),
  }),
  geocoder: z.object({
    provider: z.string().default("nominatim"),
    userAgent: z.string().default("PrintLoop-SaaS/2.0 (https://printloop.app; ops@printloop.app)"),
  }),
  documentRetentionHours: z.number().optional(),
  kioskAlertCooldownMinutes: z.number().default(30),
  render: z.object({
    enabled: z.boolean().default(false),
    callbackSecret: z.string().default(""),
  }),
  sentry: z.object({
    dsn: z.string().default(""),
    tracesSampleRate: z.number().default(0.1),
    profilesSampleRate: z.number().default(0),
  }),
});

const backupS3 = {
  endpoint: env.BACKUP_S3_ENDPOINT,
  bucket: env.BACKUP_S3_BUCKET,
  region: env.BACKUP_S3_REGION,
  accessKeyId: env.BACKUP_S3_ACCESS_KEY_ID,
  secretAccessKey: env.BACKUP_S3_SECRET_ACCESS_KEY,
  forcePathStyle: env.BACKUP_S3_FORCE_PATH_STYLE === "true",
  publicUrl: env.BACKUP_S3_PUBLIC_URL,
};

export const Config = configSchema.parse({
  port: env.PORT,
  nodeEnv: env.NODE_ENV,
  publicBaseUrl: url(env.PUBLIC_BASE_URL),
  seedDemo: env.SEED_DEMO ? on(env.SEED_DEMO) : env.NODE_ENV === "staging",
  embedWorkers: on(env.EMBED_WORKERS),
  printDispatchMode: env.PRINT_DISPATCH_MODE,
  commissionPctDefault: env.COMMISSION_PCT_DEFAULT || undefined,
  allowedOrigins: list(env.ALLOWED_ORIGINS, [
    "http://localhost:3000",
    "http://localhost:3001",
    "http://localhost:3002",
    "http://localhost:3003",
  ]),
  apexDomains: list(env.PRINTLOOP_APEX_DOMAINS, ["printloop.app", "printloop.test"]).map((d) => d.toLowerCase()),
  domainsCname: env.PRINTLOOP_DOMAINS_CNAME || undefined,
  edgeSecret: env.PL_EDGE_SECRET,
  urls: {
    landing: url(env.LANDING_URL, "http://localhost:3000"),
    customer: url(env.CUSTOMER_APP_URL, "http://localhost:3001"),
    shop: url(env.SHOP_APP_URL, "http://localhost:3002"),
    backoffice: url(env.BACKOFFICE_URL, "http://localhost:3003"),
  },
  database: {
    url: env.DATABASE_URL || undefined,
    ssl: env.DB_SSL === "true",
  },
  redis: {
    enabled: env.DISABLE_REDIS !== "1" && Boolean(env.REDIS_URL || env.REDIS_HOST),
    url: env.REDIS_URL,
    host: env.REDIS_HOST || undefined,
    port: env.REDIS_PORT || undefined,
    password: env.REDIS_PASSWORD,
    username: env.REDIS_USERNAME,
    db: env.REDIS_DB || undefined,
    keyPrefix: env.REDIS_KEY_PREFIX || undefined,
    ttl: env.REDIS_TTL || undefined,
  },
  jwt: {
    secret: env.JWT_SECRET || undefined,
    expiresIn: env.JWT_EXPIRES_IN || undefined,
  },
  service: {
    version: env.APP_VERSION || undefined,
  },
  logging: {
    level: env.LOG_LEVEL || undefined,
    pretty: env.LOG_PRETTY === "true",
    fileLogging: env.ENABLE_FILE_LOGGING === "true",
  },
  rateLimit: {
    disabled: env.DISABLE_RATE_LIMIT === "1" && env.NODE_ENV !== "production",
  },
  platformRequire2fa: env.PLATFORM_REQUIRE_2FA !== "0",
  allowPrivateWebhooks: env.ALLOW_PRIVATE_WEBHOOKS === "1" && env.NODE_ENV !== "production",
  paystack: {
    publicKey: env.PAYSTACK_PUBLIC_KEY,
    secretKey: env.PAYSTACK_SECRET_KEY,
    webhookSecret: env.PAYSTACK_WEBHOOK_SECRET,
  },
  cloudinary: {
    cloudName: env.CLOUDINARY_CLOUD_NAME,
    apiKey: env.CLOUDINARY_API_KEY,
    apiSecret: env.CLOUDINARY_API_SECRET,
  },
  s3: {
    endpoint: env.S3_ENDPOINT,
    bucket: env.S3_BUCKET,
    region: env.S3_REGION || undefined,
    accessKeyId: env.S3_ACCESS_KEY_ID,
    secretAccessKey: env.S3_SECRET_ACCESS_KEY,
    forcePathStyle: env.S3_FORCE_PATH_STYLE === "true",
    publicUrl: env.S3_PUBLIC_URL,
  },
  backup: {
    dir: env.BACKUP_DIR,
    keep: (() => {
      const n = num(env.BACKUP_KEEP);
      return n !== undefined && Number.isFinite(n) && n > 0 ? Math.floor(n) : undefined;
    })(),
    s3: { ...backupS3, region: backupS3.region || undefined },
  },
  email: {
    host: env.SMTP_HOST,
    port: env.SMTP_PORT || undefined,
    secure: env.SMTP_SECURE === "true",
    user: env.SMTP_USER,
    password: env.SMTP_PASSWORD,
    from: env.SMTP_FROM || undefined,
  },
  sms: {
    apiKey: env.TERMII_API_KEY,
    senderId: env.TERMII_SENDER_ID || undefined,
  },
  conversion: {
    converter: (env.DOC_CONVERTER || "").trim().toLowerCase(),
    gotenbergUrl: url(env.GOTENBERG_URL),
    timeoutMs: Math.max(10_000, num(env.DOC_CONVERT_TIMEOUT_MS) || 60_000),
    libreofficeBin: env.LIBREOFFICE_BIN,
    ghostscriptBin: env.GHOSTSCRIPT_BIN,
    univerExportUrl: env.UNIVER_EXPORT_URL,
  },
  editor: {
    turnServer: env.TURN_SERVER,
    turnTlsServer: env.TURN_TLS_SERVER,
    coturnPassword: env.COTURN_PASSWORD,
    sessionTtlHours: num(env.EDITOR_SESSION_TTL_HOURS) || undefined,
  },
  ipp: {
    caCert: env.IPP_CA_CERT,
    path: env.IPP_PATH || undefined,
    port: num(env.IPP_PORT) || undefined,
    rawPort: num(env.IPP_RAW_PORT) || undefined,
    secure: env.IPP_SECURE === "true",
    tlsRejectUnauthorized: env.IPP_TLS_REJECT_UNAUTHORIZED === "true",
    version: env.IPP_VERSION || undefined,
    transport: env.IPP_TRANSPORT || undefined,
    socks5Proxy: env.TS_SOCKS5_PROXY,
  },
  geocoder: {
    provider: (env.GEOCODER || "").toLowerCase() || undefined,
    userAgent: env.GEOCODER_USER_AGENT || undefined,
  },
  documentRetentionHours: num(env.DOCUMENT_RETENTION_HOURS),
  kioskAlertCooldownMinutes: num(env.KIOSK_ALERT_COOLDOWN_MINUTES) || undefined,
  render: {
    enabled: env.RENDER_ENABLED === "1",
    callbackSecret: env.RENDER_CALLBACK_SECRET,
  },
  sentry: {
    dsn: env.SENTRY_DSN,
    tracesSampleRate: num(env.SENTRY_TRACES_SAMPLE_RATE),
    profilesSampleRate: num(env.SENTRY_PROFILES_SAMPLE_RATE),
  },
});

export default Config;
