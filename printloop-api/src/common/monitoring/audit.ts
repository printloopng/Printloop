import { DataSource } from "typeorm";
import { AuditLog } from "@/database/entities/auditLog.entity";
import { Logger } from "../logger";
import {
  requestContextStorage,
  RequestContext,
} from "../context/request-context";

export interface AuditLogEntry {
  userId?: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  oldValues?: Record<string, any>;
  newValues?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
  timestamp: Date;
  metadata?: Record<string, any>;
}

export class AuditLogger {
  private static instance: AuditLogger;
  private logger: Logger;
  private pendingLogs: AuditLogEntry[] = [];

  private constructor(private dataSource: DataSource) {
    this.logger = new Logger({ level: "info", service: "audit-logger" });

    setInterval(() => {
      this.flushLogs();
    }, 30000);
  }

  static initialize(dataSource: DataSource): AuditLogger {
    if (!AuditLogger.instance) {
      AuditLogger.instance = new AuditLogger(dataSource);
    }
    return AuditLogger.instance;
  }

  static getInstance(): AuditLogger {
    if (!AuditLogger.instance) {
      throw new Error("AuditLogger must be initialized first");
    }
    return AuditLogger.instance;
  }

  async log(entry: Omit<AuditLogEntry, "timestamp">): Promise<void> {
    const auditEntry: AuditLogEntry = {
      ...entry,
      timestamp: new Date(),
    };

    this.pendingLogs.push(auditEntry);

    this.logger.info("Audit event", {
      userId: auditEntry.userId,
      action: auditEntry.action,
      resourceType: auditEntry.resourceType,
      resourceId: auditEntry.resourceId,
      timestamp: auditEntry.timestamp,
    });

    if (this.pendingLogs.length >= 100) {
      await this.flushLogs();
    }
  }

  async logAuth(
    action: "login" | "logout" | "otp_requested" | "otp_verified",
    userId?: string,
    metadata?: Record<string, any>,
  ): Promise<void> {
    await this.log({
      userId,
      action: `auth.${action}`,
      resourceType: "user",
      resourceId: userId,
      metadata,
    });
  }

  async logCrud(
    action: "create" | "update" | "delete",
    resourceType: string,
    resourceId: string,
    userId?: string,
    oldValues?: Record<string, any>,
    newValues?: Record<string, any>,
  ): Promise<void> {
    await this.log({
      userId,
      action: `${resourceType}.${action}`,
      resourceType,
      resourceId,
      oldValues,
      newValues,
    });
  }

  async logAdminAction(
    action: string,
    adminUserId: string,
    resourceType: string,
    resourceId?: string,
    metadata?: Record<string, any>,
  ): Promise<void> {
    const ctx = requestContextStorage.getStore();
    await this.log({
      userId: adminUserId,
      action: `admin.${action}`,
      resourceType,
      resourceId,
      ipAddress: ctx?.ipAddress,
      userAgent: ctx?.userAgent,
      metadata,
    });
    await this.flushLogs();
  }

  async logSecurity(
    event: string,
    userId?: string,
    severity: "low" | "medium" | "high" | "critical" = "medium",
    metadata?: Record<string, any>,
  ): Promise<void> {
    await this.log({
      userId,
      action: `security.${event}`,
      resourceType: "security",
      metadata: {
        severity,
        ...metadata,
      },
    });

    if (severity === "high" || severity === "critical") {
      this.logger.warn("Security event", { event, severity, userId, metadata });
      await this.flushLogs();
    }
  }

  private async flushLogs(): Promise<void> {
    if (this.pendingLogs.length === 0) return;

    const logsToFlush = [...this.pendingLogs];
    this.pendingLogs = [];

    try {
      const repo = this.dataSource.getRepository(AuditLog);
      const rows = logsToFlush.map((log) =>
        repo.create({
          tenantId: null,
          actorId: log.userId || null,
          actorName: log.userId || "system",
          action: log.action,
          target: log.resourceId
            ? `${log.resourceType}:${log.resourceId}`
            : log.resourceType,
          detail: {
            oldValues: log.oldValues,
            newValues: log.newValues,
            metadata: log.metadata,
            userAgent: log.userAgent,
          },
          ipAddress: log.ipAddress || null,
        } as any),
      );
      await repo.save(rows as any);
      this.logger.debug(`Flushed ${logsToFlush.length} audit logs`);
    } catch (error: any) {
      this.logger.error("Failed to flush audit logs", undefined, {
        error: error instanceof Error ? error.message : String(error),
        logCount: logsToFlush.length,
      });
    }
  }

  async queryAuditLogs(_params: {
    userId?: string;
    action?: string;
    resourceType?: string;
    resourceId?: string;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    offset?: number;
  }): Promise<AuditLog[]> {
    const repo = this.dataSource.getRepository(AuditLog);
    return repo.find({
      order: { createdAt: "DESC" },
      take: _params.limit ?? 100,
      skip: _params.offset ?? 0,
    });
  }
}

export const auditMiddleware = (req: any, _res: any, next: any) => {
  const ctx: RequestContext = {
    ipAddress: req.ip || req.socket?.remoteAddress,
    userAgent: req.get?.("User-Agent"),
    requestId: req.requestId,
  };

  requestContextStorage.run(ctx, () => next());
};

export const auditLogger = AuditLogger.getInstance;

export const recordAdminAction = (
  action: string,
  adminUserId: string,
  resourceType: string,
  resourceId?: string,
  metadata?: Record<string, any>,
): void => {
  try {
    AuditLogger.getInstance()
      .logAdminAction(action, adminUserId, resourceType, resourceId, metadata)
      .catch(() => undefined);
  } catch {
    return;
  }
};
