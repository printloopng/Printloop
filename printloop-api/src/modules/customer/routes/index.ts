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
} from "@/common/middleware/rateLimit.middleware";
import authRoutes from "./auth.routes";
import printRoutes from "./print.routes";
import paymentsRoutes from "./payments.routes";
import groupsRoutes from "./groups.routes";
import preflightRoutes from "./preflight.routes";
import passwordResetRoutes from "./password-reset.routes";
import disputeRoutes from "./dispute.routes";

export const createCustomerRoutes = (_dataSource: DataSource) => {
  const router = Router();

  router.use("/auth/login", loginLimiter);
  router.use("/auth/register", signupLimiter);
  router.use("/auth", optionalTenant, authRoutes);

  router.use(authenticate, resolveTenant, printRoutes);
  return router;
};

export const createCustomerAuxRoutes = (_dataSource: DataSource) => {
  const router = Router();
  router.use("/groups", resolveTenant, groupsRoutes);
  router.use("/payments", optionalTenant, paymentsRoutes);
  router.use("/preflight", optionalTenant, preflightRoutes);
  router.use("/auth/forgot-password", passwordResetLimiter);
  router.use("/auth/reset-password", passwordResetLimiter);
  router.use("/auth", optionalTenant, passwordResetRoutes);
  router.use("/disputes", disputeRoutes);
  return router;
};
