import { Router } from "express";
import { DataSource } from "typeorm";
import { optionalTenant } from "@/common/middleware/tenant.middleware";
import discoveryRoutes from "./discovery.routes";
import brandingRoutes from "./branding.routes";
import pricingRoutes from "./pricing.routes";
import legalRoutes from "./legal.routes";
import blogRoutes from "./blog.routes";
import renderRoutes from "./render.routes";
import integrationsRoutes from "./integrations.routes";
import uploadsRoutes from "./uploads.routes";

export const createPublicRoutes = (_dataSource: DataSource) => {
  const router = Router();
  router.use("/discovery", discoveryRoutes);
  router.use("/integrations", integrationsRoutes);
  router.use("/render", renderRoutes);
  router.use("/pricing", optionalTenant, pricingRoutes);
  router.use("/branding", optionalTenant, brandingRoutes);
  router.use("/legal", legalRoutes);
  router.use("/blog", blogRoutes);
  router.use("/uploads", uploadsRoutes);
  return router;
};
