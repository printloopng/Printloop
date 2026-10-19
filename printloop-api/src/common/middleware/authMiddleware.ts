import { Response, NextFunction } from "express";
import { AuthenticatedRequest } from "../types";
import { JwtService } from "../auth/jwt";
import { UnauthorizedError } from "../errors";
import { Logger } from "../logger";
import { loadAuthenticatedUserContext } from "./jwt-user.loader";
import { getRequestContext } from "../context/request-context";

const authLogger = new Logger({
  level: (process.env.LOG_LEVEL as any) ?? "info",
  service: "auth-middleware",
});

export const authMiddleware = (jwtService: JwtService) => {
  return async (
    req: AuthenticatedRequest,
    _res: Response,
    next: NextFunction,
  ) => {
    try {
      const token = req.headers.authorization?.split(" ")[1];
      if (!token) {
        throw new UnauthorizedError("No token provided");
      }

      const ctx = await loadAuthenticatedUserContext(jwtService, token);
      req.user = ctx.user;
      (req as any).memberships = ctx.payload.memberships;
      (req as any).jwtPayload = ctx.payload;

      const reqCtx = getRequestContext();
      if (reqCtx && ctx.user?.id) {
        reqCtx.userId = ctx.user.id;
      }

      next();
    } catch (error: unknown) {
      authLogger.warn("Auth middleware rejected request", {
        message: error instanceof Error ? error.message : String(error),
      });
      next(new UnauthorizedError("Invalid token"));
    }
  };
};

export const optionalAuthMiddleware = (jwtService: JwtService) => {
  return async (
    req: AuthenticatedRequest,
    _res: Response,
    next: NextFunction,
  ) => {
    try {
      const token = req.headers.authorization?.split(" ")[1];
      if (!token) return next();
      const ctx = await loadAuthenticatedUserContext(jwtService, token);
      req.user = ctx.user;
      (req as any).memberships = ctx.payload.memberships;
      (req as any).jwtPayload = ctx.payload;
    } catch {
    }
    next();
  };
};
