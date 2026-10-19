import { Response, NextFunction } from "express";
import { AuthenticatedRequest } from "../types";
import { UnauthorizedError, ForbiddenError } from "../errors";

export const adminMiddleware = () => {
  return (req: AuthenticatedRequest, _res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new UnauthorizedError("Authentication required"));
    }
    const role = String((req.user as any).role || "").toUpperCase();
    if (role !== "SUPER_ADMIN" && role !== "ADMIN") {
      return next(new ForbiddenError("Platform admin required"));
    }
    next();
  };
};

export const platformAdminMiddleware = adminMiddleware;
