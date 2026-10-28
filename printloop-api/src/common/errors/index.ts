import { Config } from '@/config';
import { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import { QueryFailedError } from "typeorm";
import { Logger } from "../logger";

const logger = new Logger({ level: "info", service: "error-handler" });

export interface ErrorContext {
  requestId?: string;
  userId?: string;
  path: string;
  method: string;
  timestamp: string;
  userAgent?: string;
  ip?: string;
}

export class AppError extends Error {
  public readonly isOperational = true;

  constructor(
    message: string,
    public status: number = 500,
    public code: string = "INTERNAL_SERVER_ERROR",
    public details?: unknown,
    public context?: Record<string, any>
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      status: this.status,
      code: this.code,
      details: this.details,
      context: this.context,
      stack: this.stack,
    };
  }
}

const buildErrorContext = (req: Request): ErrorContext => {
  const user = (req as any).user;

  return {
    requestId: (req as any).requestId || req.get("X-Request-ID"),
    userId: user?.id,
    path: req.path,
    method: req.method,
    timestamp: new Date().toISOString(),
    userAgent: req.get("User-Agent"),
    ip: req.ip || req.socket.remoteAddress,
  };
};

const SENSITIVE_FIELDS = new Set([
  "password",
  "token",
  "secret",
  "key",
  "authorization",
  "refreshToken",
  "accessToken",
  "otp",
  "pin",
  "ciphertext",
  "nonce",
  "publicKey",
]);

const sanitizeBody = (body: any, depth = 0): any => {
  if (depth > 5 || !body || typeof body !== "object") return body;
  if (Array.isArray(body)) return body.map((v) => sanitizeBody(v, depth + 1));

  const sanitized: Record<string, any> = {};
  for (const [field, value] of Object.entries(body)) {
    sanitized[field] = SENSITIVE_FIELDS.has(field.toLowerCase())
      ? "[REDACTED]"
      : sanitizeBody(value, depth + 1);
  }
  return sanitized;
};

export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
  const context = buildErrorContext(req);
  const isDevelopment = Config.nodeEnv === "development";

  if (err instanceof AppError) {
    logger.warn("Operational error", {
      error: {
        name: err.name,
        message: err.message,
        status: err.status,
        code: err.code,
        details: err.details,
      },
      context,
      request: {
        body: sanitizeBody(req.body),
        query: req.query,
        params: req.params,
      },
      ...(isDevelopment && { stack: err.stack }),
    });

    res.status(err.status).json({
      success: false,
      error: {
        message: err.message,
        code: err.code,
        ...(err.details ? { details: err.details } : {}),
        ...(isDevelopment && { stack: err.stack }),
      },
      timestamp: context.timestamp,
      requestId: context.requestId,
    });
    return;
  }

  if (err instanceof ZodError) {
    logger.warn("Validation error", {
      error: {
        name: err.name,
        issues: err.issues,
      },
      context,
      request: {
        body: sanitizeBody(req.body),
        query: req.query,
        params: req.params,
      },
    });

    res.status(400).json({
      success: false,
      error: {
        message: "Validation failed",
        code: "VALIDATION_ERROR",
        details: err.issues.map((error: any) => ({
          field: error.path.join("."),
          message: error.message,
          code: error.code,
        })),
      },
      timestamp: context.timestamp,
      requestId: context.requestId,
    });
    return;
  }

  if (err instanceof QueryFailedError) {
    const dbError = err as any;

    logger.error("Database error", err, {
      code: dbError.code,
      detail: dbError.detail,
      constraint: dbError.constraint,
      context,
      request: {
        body: sanitizeBody(req.body),
        query: req.query,
        params: req.params,
      },
    });

    let status = 500;
    let message = "Database operation failed";
    let code = "DATABASE_ERROR";

    if (dbError.code === "23505") {
      status = 409;
      message = "Resource already exists";
      code = "DUPLICATE_RESOURCE";
    } else if (dbError.code === "23503") {
      status = 400;
      message = "Invalid reference";
      code = "INVALID_REFERENCE";
    } else if (dbError.code === "23502") {
      status = 400;
      message = "Required field missing";
      code = "REQUIRED_FIELD_MISSING";
    }

    res.status(status).json({
      success: false,
      error: {
        message,
        code,
        ...(isDevelopment && {
          details: {
            code: dbError.code,
            detail: dbError.detail,
            constraint: dbError.constraint,
          },
        }),
      },
      timestamp: context.timestamp,
      requestId: context.requestId,
    });
    return;
  }

  if (err.name === "JsonWebTokenError" || err.name === "TokenExpiredError") {
    logger.warn("JWT error", {
      error: {
        name: err.name,
        message: err.message,
      },
      context,
    });

    res.status(401).json({
      success: false,
      error: {
        message: "Invalid or expired token",
        code: "INVALID_TOKEN",
      },
      timestamp: context.timestamp,
      requestId: context.requestId,
    });
    return;
  }

  logger.error("Unexpected error", err, {
    error: {
      name: err.name,
      message: err.message,
    },
    context,
    request: {
      body: sanitizeBody(req.body),
      query: req.query,
      params: req.params,
    },
    stack: err.stack,
  });

  res.status(500).json({
    success: false,
    error: {
      message: isDevelopment ? err.message : "Internal server error",
      code: "INTERNAL_SERVER_ERROR",
      ...(isDevelopment && { stack: err.stack }),
    },
    timestamp: context.timestamp,
    requestId: context.requestId,
  });
};

export const requestIdMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const requestId =
    req.get("X-Request-ID") ||
    `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  (req as any).requestId = requestId;
  res.set("X-Request-ID", requestId);
  next();
};

export class ValidationError extends AppError {
  constructor(
    message: string,
    details?: unknown,
    context?: Record<string, any>
  ) {
    super(message, 400, "VALIDATION_ERROR", details, context);
  }
}

export class InternalServerError extends AppError {
  constructor(
    message: string,
    details?: unknown,
    context?: Record<string, any>
  ) {
    super(message, 500, "INTERNAL_SERVER_ERROR", details, context);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message: string = "Unauthorized", context?: Record<string, any>) {
    super(message, 401, "UNAUTHORIZED", undefined, context);
  }
}

export class ForbiddenError extends AppError {
  constructor(
    message: string = "Access denied",
    context?: Record<string, any>
  ) {
    super(message, 403, "FORBIDDEN", undefined, context);
  }
}

export class NotFoundError extends AppError {
  constructor(
    message: string = "Resource not found",
    context?: Record<string, any>
  ) {
    super(message, 404, "NOT_FOUND", undefined, context);
  }
}

export class ConflictError extends AppError {
  constructor(
    message: string,
    details?: unknown,
    context?: Record<string, any>
  ) {
    super(message, 409, "CONFLICT", details, context);
  }
}

export class TooManyRequestsError extends AppError {
  constructor(
    message: string = "Too many requests",
    context?: Record<string, any>
  ) {
    super(message, 429, "TOO_MANY_REQUESTS", undefined, context);
  }
}

export class BadRequestError extends AppError {
  constructor(message: string, context?: Record<string, any>) {
    super(message, 400, "BAD_REQUEST", context);
  }
}

export class ServiceUnavailableError extends AppError {
  constructor(
    message: string = "Service temporarily unavailable",
    context?: Record<string, any>
  ) {
    super(message, 503, "SERVICE_UNAVAILABLE", undefined, context);
  }
}

export class GoneError extends AppError {
  constructor(message: string = "Resource has expired") {
    super(message, 410, "GONE");
  }
}

export class TokenExpiredError extends AppError {
  constructor(message: string = "Token has expired") {
    super(message, 401, "TOKEN_EXPIRED");
  }
}

export class InvalidTokenError extends AppError {
  constructor(message: string = "Invalid token provided") {
    super(message, 401, "INVALID_TOKEN");
  }
}

export const isOperationalError = (error: Error): boolean => {
  if (error instanceof AppError) {
    return error.isOperational;
  }
  return false;
};
