import { Router } from "express";
import { DataSource } from "typeorm";
import discoveryRoutes from "./discovery.routes";
import brandingRoutes from "./branding.routes";
import pricingRoutes from "./pricing.routes";
import legalRoutes from "./legal.routes";
import blogRoutes from "./blog.routes";
import renderRoutes from "./render.routes";
import integrationsRoutes from "./integrations.routes";

export const createPublicRoutes = (_dataSource: DataSource) => {
  const router = Router();
  router.use("/discovery", discoveryRoutes);
  router.use("/integrations", integrationsRoutes);
  router.use("/render", renderRoutes);
  router.use("/pricing", pricingRoutes);
  router.use("/branding", brandingRoutes);
  router.use("/legal", legalRoutes);
  router.use("/blog", blogRoutes);
  return router;
};
