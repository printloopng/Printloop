import { type Request, type Response, type NextFunction } from 'express';
import { GroupSessionService } from '@/modules/customer/services/groupSession.service';
import { AppDataSource } from '@/config/data-source';
import { PrintJob, PrintJobStatus, JobType } from '@/database/entities/printJob.entity';
import { File } from '@/database/entities/file.entity';
import { GroupSessionStatus } from '@/database/entities/groupSession.entity';
import { saveBuffer } from '@/core/utils/fileStore';
import {
  isPrintableDocument,
  ALLOWED_LABEL,
  countPages,
  flattenAnnotations,
  UnsupportedDocumentError,
} from '@/modules/public/services/documentConvert.service';
import { getUploadLimits } from '@/core/utils/limits';
import { applyPromotion } from '@/modules/customer/services/promotion.service';
import { computeCost } from '@/modules/public/services/pricing.service';
import { makeCode } from '@/core/utils/releaseCode';

const groupService = new GroupSessionService();

export class KioskParticipantUploadController {
  upload = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const uploadToken = req.headers['x-upload-token'] as string;
      if (!uploadToken) {
        res.status(401).json({ success: false, message: 'Upload token required' });
        return;
      }

      const result = await groupService.getParticipantByToken(uploadToken);
      if (!result) {
        res.status(401).json({ success: false, message: 'Invalid upload token' });
        return;
      }

      const { participant, session } = result;

      if (session.status !== GroupSessionStatus.OPEN) {
        res.status(400).json({ success: false, message: 'Group session is closed' });
        return;
      }
      if (new Date() > session.deadline) {
        res.status(400).json({ success: false, message: 'Deadline has passed' });
        return;
      }

      // The document itself must be uploaded (multipart `file`, or base64):
      // pages and price are always computed from the bytes we store, never
      // from client-supplied URLs or page counts.
      const body = req.body || {};
      const fileName = String(body.fileName || req.file?.originalname || '');
      const mimeType = body.mimeType || req.file?.mimetype;
      const fileBase64 = body.fileBase64;
      let printConfiguration: Record<string, unknown> = {};
      try {
        printConfiguration =
          typeof body.printConfiguration === 'string'
            ? JSON.parse(body.printConfiguration)
            : body.printConfiguration || {};
      } catch {
        res.status(400).json({ success: false, message: 'printConfiguration must be JSON' });
        return;
      }
      if ((!req.file && !fileBase64) || !fileName) {
        res.status(400).json({
          success: false,
          message: 'Upload the document (multipart "file" or fileBase64) with its fileName',
        });
        return;
      }
      if (!isPrintableDocument(fileName, mimeType)) {
        res.status(415).json({
          success: false,
          message: `Unsupported file type. PrintLoop prints ${ALLOWED_LABEL} only.`,
          code: 'UNSUPPORTED_DOCUMENT',
        });
        return;
      }

      const limits = await getUploadLimits();
      let buffer: Buffer =
        req.file?.buffer ??
        Buffer.from(String(fileBase64).replace(/^data:.*?;base64,/, ''), 'base64');
      if (buffer.length > limits.maxFileBytes) {
        res.status(413).json({
          success: false,
          message: `File too large. Max ${Math.round(limits.maxFileBytes / 1048576)} MB.`,
          code: 'FILE_TOO_LARGE',
        });
        return;
      }
      let authoritativePages: number;
      try {
        buffer = await flattenAnnotations(buffer);
        authoritativePages = await countPages(buffer, fileName);
      } catch (e: any) {
        res.status(e instanceof UnsupportedDocumentError ? 415 : 422).json({
          success: false,
          message: e?.message || 'Could not read the document.',
          code: e?.code || 'UNREADABLE_DOCUMENT',
        });
        return;
      }
      if (authoritativePages > limits.maxPages) {
        res.status(413).json({
          success: false,
          message: `Document has ${authoritativePages} pages; the limit is ${limits.maxPages}.`,
          code: 'TOO_MANY_PAGES',
        });
        return;
      }

      const stored = await saveBuffer(buffer, fileName);

      const opts = session.defaultOptions;
      const styleOverride = opts.enforce
        ? {}
        : {
            paper: (printConfiguration as any)?.paper,
            color: (printConfiguration as any)?.color,
            sided: (printConfiguration as any)?.sided,
            qualityDpi: (printConfiguration as any)?.qualityDpi,
            orientation: (printConfiguration as any)?.orientation,
          };
      const effective = {
        paper: styleOverride.paper ?? opts.paper,
        color: styleOverride.color ?? opts.color,
        sided: styleOverride.sided ?? opts.sided,
        qualityDpi: styleOverride.qualityDpi ?? opts.qualityDpi,
        orientation:
          (styleOverride.orientation ?? (opts as any).orientation) === 'landscape'
            ? 'landscape'
            : 'portrait',
      };
      const requestedCopies = Math.max(
        1,
        Math.min(99, Number((printConfiguration as any)?.copies) || 1),
      );

      const baseCost = await computeCost({
        pageCount: authoritativePages,
        paper: effective.paper,
        color: effective.color,
        sided: effective.sided,
        qualityDpi: effective.qualityDpi,
        copies: requestedCopies,
      });
      const promo = await applyPromotion(baseCost, req.body?.promotionCode, {
        pageCount: authoritativePages,
        perPageBw: 5,
      });
      const cost = promo.cost;

      const fileRepo = AppDataSource.getRepository(File);
      const jobRepo = AppDataSource.getRepository(PrintJob);

      const savedFile = await fileRepo.save(
        fileRepo.create({
          tenantId: session.tenantId ?? null,
          fileURL: stored.url,
          fileName,
          mimeType: mimeType || 'application/pdf',
          sizeBytes: stored.sizeBytes,
          pageCount: authoritativePages,
          participantId: participant.id,
        }),
      );

      const savedJob = await jobRepo.save(
        jobRepo.create({
          userId: participant.userId ?? null,
          tenantId: session.tenantId ?? null,
          jobType: JobType.GROUP_BATCH,
          groupSessionId: session.id,
          watermarkId: null,
          fileId: savedFile.id,
          printConfiguration: {
            copies: requestedCopies,
            paper: effective.paper,
            color: effective.color,
            sided: effective.sided,
            qualityDpi: effective.qualityDpi,
            orientation: effective.orientation as 'portrait' | 'landscape',
          },
          totalPages: authoritativePages,
          cost,
          status: PrintJobStatus.PENDING,
          code: `GP${makeCode(6)}`,
        }),
      );

      await groupService.linkFileToParticipant(uploadToken, savedJob.id, savedFile.id);

      res.json({
        success: true,
        message: 'File uploaded successfully',
        data: {
          printJob: { id: savedJob.id, code: savedJob.code, cost, totalPages: authoritativePages },
          nextStep: 'payment',
        },
      });
    } catch (error: any) {
      console.error('Participant upload error:', error);
      next(error);
    }
  };
}

export const kioskParticipantUploadController = new KioskParticipantUploadController();
