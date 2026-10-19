import { Router } from "express";
import { DataSource } from "typeorm";
import { resolveTenant } from "@/common/middleware/tenant.middleware";
import printerRoutes from "./printer.routes";
import agentRoutes from "./agent.routes";
import participantUploadRoutes from "./participant-upload.routes";
import cupsRoutes from "./cups.routes";

export const createKioskRoutes = (_dataSource: DataSource) => {
  const router = Router();
  router.use("/printer", resolveTenant, printerRoutes);
  router.use("/agent", resolveTenant, agentRoutes);
  router.use("/participant-upload", resolveTenant, participantUploadRoutes);
  router.use("/cups", resolveTenant, cupsRoutes);
  return router;
};
