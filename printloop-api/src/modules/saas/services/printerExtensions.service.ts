import { repos } from '@/config/repos';
import { PrintJobStatus } from '@/database/entities/printJob.entity';
import type { PrintJobRepository } from '@/modules/customer/repositories/printJob.repository';
import type { FileRepository } from '@/modules/customer/repositories/file.repository';
import { GroupSessionService } from '@/modules/customer/services/groupSession.service';
import { fileCleanupQueue } from '@/workers/queues';
import { emitTenantEvent } from './tenantWebhook.service';
import { WebhookEvent } from '@/database/entities/tenantWebhook.entity';
import { checkPickupLimit } from '@/modules/customer/services/abuseLimits.service';

export class PrinterServiceExtensions {
  private get printJobRepo(): PrintJobRepository {
    return repos.printJob();
  }
  private get fileRepo(): FileRepository {
    return repos.file();
  }
  private get groupService(): GroupSessionService {
    return new GroupSessionService();
  }

  
  async validateCode(code: string, tenantId?: string | null): Promise<{
    success: boolean;
    type?: 'single' | 'group_batch';
    message: string;
    data?: any;
    code?: string;
    retryAfter?: number;
  }> {
    const where = tenantId ? { code, tenantId } : { code };
    const job = await this.printJobRepo.findOne({ where });
    if (job) {
      if (job.status === PrintJobStatus.DONE) {
        return { success: false, message: 'This job has already been printed' };
      }
      if (job.status === PrintJobStatus.PENDING) {
        return { success: false, message: 'Payment not yet confirmed for this job' };
      }
      if (job.status !== PrintJobStatus.READY) {
        return { success: false, message: `Job is ${job.status} and cannot be printed` };
      }
      if (tenantId && job.userId) {
        const pickupLimit = await checkPickupLimit(tenantId, job.userId);
        if (!pickupLimit.allowed) {
          return {
            success: false,
            message: `Too many pickup attempts. Limit is ${pickupLimit.limit} per hour. Try again at ${pickupLimit.resetAt.toISOString()}`,
            code: 'PICKUP_LIMIT_EXCEEDED',
            retryAfter: Math.ceil((pickupLimit.resetAt.getTime() - Date.now()) / 1000),
          };
        }
      }
      return {
        success: true,
        type: 'single',
        message: 'Code validated',
        data: { code: job.code, jobId: job.id },
      };
    }

    const batchData = await this.groupService.getBatchPrintData(code);
    if (batchData) {
      return {
        success: true,
        type: 'group_batch',
        message: 'Group batch validated',
        data: {
          sessionId: batchData.session.id,
          groupName: batchData.session.groupName,
          fileCount: batchData.files.length,
        },
      };
    }

    return { success: false, message: 'Invalid code' };
  }

  async getJob(code: string, tenantId?: string | null): Promise<{
    success: boolean;
    type?: 'single' | 'group_batch';
    data?: any;
    message: string;
  }> {
    const where = tenantId ? { code, tenantId } : { code };
    const job = await this.printJobRepo.findOne({ where });
    if (job) {
      const file = job.fileId
        ? await this.fileRepo.findOne({
            where: tenantId
              ? { id: job.fileId, tenantId }
              : { id: job.fileId },
          })
        : null;
      return {
        success: true,
        type: 'single',
        message: 'Job retrieved',
        data: {
          jobId: job.id,
          code: job.code,
          fileURL: null,
          fileName: file?.fileName || job.fileName || null,
          totalPages: job.totalPages,
          printConfig: job.printConfiguration,
          cost: job.cost,
          customerInfo: { userId: job.userId },
          pagesCompleted: job.pagesCompleted || 0,
        },
      };
    }

    const batchData = await this.groupService.getBatchPrintData(code);
    if (batchData) {
      return {
        success: true,
        type: 'group_batch',
        message: 'Group batch retrieved',
        data: {
          sessionId: batchData.session.id,
          groupName: batchData.session.groupName,
          defaultOptions: batchData.session.defaultOptions,
          files: batchData.files.map((f) => ({
            fileId: f.fileId,
            fileURL: null,
            participantName: f.participantName,
            printConfig: f.printConfig,
          })),
        },
      };
    }

    return { success: false, message: 'Code not found' };
  }

  async updateProgress(input: {
    code: string;
    pagesCompleted: number;
    kioskId: string;
    tenantId?: string | null;
  }): Promise<{ success: boolean; message: string }> {
    const where = input.tenantId
      ? { code: input.code, tenantId: input.tenantId }
      : { code: input.code };
    const job = await this.printJobRepo.findOne({ where });
    if (!job) return { success: false, message: 'Job not found' };

    job.pagesCompleted = input.pagesCompleted;
    job.status = PrintJobStatus.PRINTING;
    job.printerId = input.kioskId;
    await this.printJobRepo.save(job);
    return { success: true, message: 'Progress updated' };
  }

  async completePrintJob(input: {
    code: string;
    kioskId: string;
    kioskName: string;
    cost: number;
    totalPages: number;
    tenantId?: string | null;
  }): Promise<{ success: boolean; message: string; data?: any }> {
    const where = input.tenantId
      ? { code: input.code, tenantId: input.tenantId }
      : { code: input.code };
    const job = await this.printJobRepo.findOne({ where });
    if (!job) return { success: false, message: 'Job not found' };

    job.status = PrintJobStatus.DONE;
    job.completedAt = new Date();
    job.cost = input.cost;
    job.totalPages = input.totalPages;
    job.pagesCompleted = input.totalPages;
    job.printerId = input.kioskId;
    job.printerName = input.kioskName;
    await this.printJobRepo.save(job);

    await fileCleanupQueue.add(
      'cleanup',
      { printJobId: job.id, fileIds: job.fileId ? [job.fileId] : [] },
      { delay: 24 * 60 * 60 * 1000 }
    );

    if (job.tenantId) {
      emitTenantEvent(job.tenantId, WebhookEvent.JOB_COMPLETED, {
        printJobId: job.id,
        code: job.code,
        cost: Number(job.cost),
        totalPages: job.totalPages,
        completedAt: job.completedAt,
        kioskId: input.kioskId,
        kioskName: input.kioskName,
      });
    }

    return {
      success: true,
      message: 'Job completed and cleanup scheduled',
      data: { jobId: job.id, completedAt: job.completedAt },
    };
  }
}
