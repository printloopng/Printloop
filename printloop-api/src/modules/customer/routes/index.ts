import { Router } from "express";
import { DataSource } from "typeorm";
import { authenticate } from "@/common/middleware/auth.middleware";
import {
  resolveTenant,
  optionalTenant,
} from "@/common/middleware/tenant.middleware";
import {
  loginLimiter,
  signupLimiter,
  passwordResetLimiter,
  otpLimiter,
} from "@/common/middleware/rateLimit.middleware";
import authRoutes from "./auth.routes";
import { allowUploadTicket } from "@/common/middleware/uploadTicket.middleware";
import printRoutes from "./print.routes";
import paymentsRoutes from "./payments.routes";
import groupsRoutes from "./groups.routes";
import preflightRoutes from "./preflight.routes";
import passwordResetRoutes from "./password-reset.routes";

export const createCustomerRoutes = (_dataSource: DataSource) => {
  const router = Router();

  router.use("/auth/login", loginLimiter);
  router.use("/auth/register", signupLimiter);
  router.use("/auth/verify-email", otpLimiter);
  router.use("/auth/resend-verification", otpLimiter);
  router.use("/auth", optionalTenant, authRoutes);

  router.use(
    "/print-jobs",
    allowUploadTicket("print-document", (r) => r.method === "POST" && (r.path === "/" || r.path === "/batch")),
  );
  router.use(authenticate, optionalTenant, printRoutes);
  return router;
};

export const createCustomerAuxRoutes = (_dataSource: DataSource) => {
  const router = Router();
  router.use("/groups", optionalTenant, groupsRoutes);
  router.use("/payments", optionalTenant, paymentsRoutes);
  router.use("/preflight", optionalTenant, preflightRoutes);
  router.use("/auth/forgot-password", passwordResetLimiter);
  router.use("/auth/reset-password", passwordResetLimiter);
  router.use("/auth", optionalTenant, passwordResetRoutes);
  return router;
};
