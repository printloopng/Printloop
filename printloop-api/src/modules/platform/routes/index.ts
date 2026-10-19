import { Router } from "express";
import { DataSource } from "typeorm";
import platformRoutes from "./platform.routes";
import filesRoutes from "./files.routes";
import openapiRoutes from "./openapi.routes";

export const createPlatformRoutes = (_dataSource: DataSource) => {
  const router = Router();
  router.use("/", openapiRoutes);
  router.use("/files", filesRoutes);
  router.use("/platform", platformRoutes);
  return router;
};
