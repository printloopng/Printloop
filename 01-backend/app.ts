import "reflect-metadata";
import express, { type Application } from "express";
import cors from "cors";
import devApiRoutes from "./routes/devApi.routes.js";
import adminAuthRoutes from "./routes/adminAuth.routes.js";
import adminRoutes from "./routes/admin.routes.js";
import adminKioskRoutes from "./routes/admin-kiosk.routes.js";
import spikeRoutes from "./routes/spike.routes.js";
import groupSessionRoutes from "./routes/groupSession.routes.js";
import participantUploadRoutes from "./routes/participantUpload.routes.js";
import printerRoutes from "./routes/printer.routes.js";
import agentRoutes from "./routes/agent.routes.js";
import paymentsRoutes from "./routes/payments.routes.js";
import customerAuthRoutes from "./routes/customerAuth.routes.js";
import customerPrintRoutes from "./routes/customerPrint.routes.js";
import cupsRoutes from "./routes/cups.routes.js";
import publicPricingRoutes from "./routes/publicPricing.routes.js";
import saasRoutes from "./routes/saas.routes.js";
import renderRoutes from "./routes/render.routes.js";
import platformRoutes from "./routes/platform.routes.js";
import publicBrandingRoutes from "./routes/publicBranding.routes.js";
import openApiRoutes from "./routes/openapi.js";
import discoveryRoutes from "./routes/discovery.routes.js";
import integrationsRoutes from "./routes/integrations.routes.js";
import passwordResetRoutes from "./routes/passwordReset.routes.js";
import disputeRoutes from "./routes/dispute.routes.js";
import blogRoutes from "./routes/blog.routes.js";
import legalRoutes from "./routes/legal.routes.js";
import preflightRoutes from "./routes/preflight.routes.js";
import { paystackService } from "./services/paystack.service.js";
import { authenticate } from "./middleware/auth.middleware.js";
import { resolveTenant, optionalTenant } from "./middleware/tenant.middleware.js";
import { requestContext } from "./middleware/requestContext.middleware.js";
import {
  loginLimiter,
  signupLimiter,
  otpLimiter,
  passwordResetLimiter,
} from "./middleware/rateLimit.middleware.js";
import { UPLOAD_DIR } from "./utils/fileStore.js";
import filesRoutes from "./routes/files.routes.js";

export function createApp(): Application {
  const app = express();

  app.use(requestContext);

  const applianceCors = cors({
    origin: true,
    methods: ["GET", "POST", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "X-Kiosk-Key", "X-Upload-Token", "Authorization"],
  });
  app.use("/api/printer", applianceCors);
  app.use("/api/agent", applianceCors);
  app.use("/api/participant-upload", applianceCors);

  app.use(
    cors({
      origin: (process.env.ALLOWED_ORIGINS || "http://localhost:5173").split(","),
      credentials: true,
    }),
  );

  app.use(
    express.json({
      limit: "10mb",
      verify: (req: any, _res, buf) => {
        req.rawBody = buf;
      },
    }),
  );
  app.use(express.urlencoded({ extended: true, limit: "10mb" }));

  app.get("/health", (_req, res) => {
    res.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      version: process.env.APP_VERSION || "1.0.0",
    });
  });

  app.use("/api", openApiRoutes);

  app.use("/api/discovery", discoveryRoutes);

  app.use("/api/integrations", integrationsRoutes);

  app.use("/api/customer/auth/login", loginLimiter);
  app.use("/api/customer/auth/register", signupLimiter);
  app.use("/api/admin/auth/login", loginLimiter);
  app.use("/api/saas/signup", signupLimiter);
  app.use("/api/saas/verify-email", otpLimiter);
  app.use("/api/saas/resend-verification", otpLimiter);
  app.use("/api/auth/forgot-password", passwordResetLimiter);
  app.use("/api/auth/reset-password", passwordResetLimiter);

  app.use("/api/auth", optionalTenant, passwordResetRoutes);

  app.use("/api/saas", saasRoutes);

  app.use("/api/render", renderRoutes);

  app.use("/api/platform", platformRoutes);

  app.use("/api/admin/auth", adminAuthRoutes);
  app.use("/api/admin/kiosks", authenticate, resolveTenant, adminKioskRoutes);
  app.use("/api/admin/disputes", disputeRoutes);
  if (process.env.ENABLE_SPIKE_RENDER === "1") {
    app.use("/api/admin/spike", authenticate, resolveTenant, spikeRoutes);
  }
  app.use("/api/admin", authenticate, resolveTenant, adminRoutes);

  app.use("/api/groups", resolveTenant, groupSessionRoutes);
  app.use("/api/participant-upload", resolveTenant, participantUploadRoutes);
  app.use("/api/printer", resolveTenant, printerRoutes);
  app.use("/api/agent", resolveTenant, agentRoutes);
  app.use("/api/payments", optionalTenant, paymentsRoutes);

  app.post("/api/webhooks/paystack", optionalTenant, async (req, res) => {
    try {
      const signature = req.header('x-paystack-signature');
      const rawBody: Buffer | undefined = (req as any).rawBody;
      if (!rawBody) {
        res.status(400).json({ success: false, message: 'Raw body unavailable' });
        return;
      }
      if (!paystackService.verifyWebhookSignature(rawBody, signature)) {
        res.status(401).json({ success: false, message: 'Invalid signature' });
        return;
      }
      const result = await paystackService.handleWebhook(req.body);
      res.json({ success: true, ...result });
    } catch (error: any) {
      console.error('Payment webhook error:', error);
      res.status(500).json({ success: false, message: 'Webhook processing failed' });
    }
  });

  app.use("/api/pricing", optionalTenant, publicPricingRoutes);

  app.use("/api/branding", optionalTenant, publicBrandingRoutes);

  app.use("/api/legal", legalRoutes);

  app.use("/api/preflight", optionalTenant, preflightRoutes);

  app.use("/api/blog", blogRoutes);

  app.use("/api/cups", resolveTenant, cupsRoutes);

  app.use("/api/customer/auth", optionalTenant, customerAuthRoutes);
  app.use("/api/customer", authenticate, resolveTenant, customerPrintRoutes);

  app.use("/api/files", filesRoutes);

  app.use("/api", optionalTenant, devApiRoutes);

  app.use((_req, res) => {
    res.status(404).json({ success: false, message: "Endpoint not found" });
  });

  app.use(async (err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (err && err.name === "MulterError") {
      const code = err.code === "LIMIT_FILE_SIZE" ? 413 : 400;
      res.status(code).json({
        success: false,
        message: err.code === "LIMIT_FILE_SIZE" ? "File too large." : `Upload rejected: ${err.message}`,
        code: err.code,
      });
      return;
    }
    console.error("Unhandled error:", err);
    try {
      const { reportError } = await import("./utils/observability.js");
      reportError(err, { path: _req.path, method: _req.method });
    } catch {
    }
    res.status(500).json({ success: false, message: err?.message || "Internal server error" });
  });

  return app;
}
