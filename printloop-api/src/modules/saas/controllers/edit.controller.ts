import { Request, Response } from 'express';
import { DataSource } from 'typeorm';
import { DocumentEdit, DocumentEditStatus } from '@/database/entities/documentEdit.entity';
import { PrintJob, PrintJobStatus } from '@/database/entities/printJob.entity';
import { EditPricingConfig } from '@/database/entities/editPricingConfig.entity';
import { etherpadService } from '@/modules/saas/services/etherpad.service';
import { notificationQueue } from '@/workers/queues';
import {
  editRejectBodySchema,
  editUploadBodySchema,
} from '@/modules/saas/validation/edit.validation';

export class EditController {
  constructor(private ds: DataSource) {}

  upsertEditPricing = async (req: Request, res: Response) => {
    try {
      const tenant = req.tenant!;
      const {
        baseFee,
        perPageFee,
        complexityTierFees,
        maxShopAdjustmentPct,
        editingEnabled,
        bankAccountName,
        bankAccountNumber,
        bankName,
        bankSortCode,
      } = req.body || {};

      const repo = this.ds.getRepository(EditPricingConfig);
      let config = await repo.findOne({ where: { tenantId: tenant.id } });

      if (!config) {
        config = repo.create({ tenantId: tenant.id });
      }

      if (baseFee !== undefined) config.baseFee = baseFee;
      if (perPageFee !== undefined) config.perPageFee = perPageFee;
      if (complexityTierFees !== undefined) config.complexityTierFees = complexityTierFees;
      if (maxShopAdjustmentPct !== undefined) config.maxShopAdjustmentPct = maxShopAdjustmentPct;
      if (editingEnabled !== undefined) config.editingEnabled = editingEnabled;
      if (bankAccountName !== undefined) config.bankAccountName = bankAccountName;
      if (bankAccountNumber !== undefined) config.bankAccountNumber = bankAccountNumber;
      if (bankName !== undefined) config.bankName = bankName;
      if (bankSortCode !== undefined) config.bankSortCode = bankSortCode;

      await repo.save(config);

      res.json({ success: true, data: config });
    } catch (err: any) {
      console.error('[saas/edit-pricing] error:', err);
      res.status(500).json({ success: false, message: err?.message || 'Failed to save edit pricing' });
    }
  };

  getEditPricing = async (req: Request, res: Response) => {
    try {
      const tenant = req.tenant!;
      const repo = this.ds.getRepository(EditPricingConfig);
      const config = await repo.findOne({ where: { tenantId: tenant.id } });

      if (!config) {
        res.json({
          success: true,
          data: {
            baseFee: 500,
            perPageFee: 100,
            complexityTierFees: {},
            maxShopAdjustmentPct: 0,
            editingEnabled: true,
            bankAccountName: null,
            bankAccountNumber: null,
            bankName: null,
            bankSortCode: null,
          },
        });
        return;
      }

      res.json({ success: true, data: config });
    } catch (err: any) {
      console.error('[saas/edit-pricing:get] error:', err);
      res.status(500).json({ success: false, message: 'Failed to get edit pricing' });
    }
  };

  getEditQueue = async (req: Request, res: Response) => {
    try {
      const tenant = req.tenant!;
      const status = req.query.status as DocumentEditStatus | undefined;
      const limit = Math.min(50, Math.max(1, Number(req.query.limit ?? 20)));

      const qb = this.ds
        .getRepository(DocumentEdit)
        .createQueryBuilder('de')
        .leftJoinAndSelect('de.printJob', 'pj')
        .leftJoinAndSelect('pj.user', 'u')
        .where('de.shopId = :tid', { tid: tenant.id });

      if (status) {
        qb.andWhere('de.status = :status', { status });
      } else {
        qb.andWhere('de.status IN (:...statuses)', {
          statuses: [DocumentEditStatus.PENDING_SHOP, DocumentEditStatus.IN_PROGRESS],
        });
      }

      qb.orderBy('de.createdAt', 'ASC').limit(limit);

      const edits = await qb.getMany();

      res.json({
        success: true,
        data: {
          items: edits.map((e) => ({
            id: e.id,
            printJobId: e.printJobId,
            status: e.status,
            editOperations: e.editOperations,
            originalDocumentMeta: e.originalDocumentMeta,
            editedDocumentMeta: e.editedDocumentMeta,
            totalEditFee: e.totalEditFee,
            shopNotes: e.shopNotes,
            customerRejectionReason: e.customerRejectionReason,
            createdAt: e.createdAt,
            printJob: e.printJob
              ? {
                  id: e.printJob.id,
                  code: e.printJob.code,
                  status: e.printJob.status,
                  customerName: e.printJob.user
                    ? `${e.printJob.user.firstName} ${e.printJob.user.lastName}`
                    : 'Unknown',
                  customerEmail: e.printJob.user?.email,
                  originalDocumentUrl: e.printJob.renderedPdfUrl,
                  editingInstructions: e.printJob.editingInstructions,
                  pageCount: e.printJob.totalPages,
                  colorMode: e.printJob.printConfiguration?.color,
                  paperSize: e.printJob.printConfiguration?.paper,
                }
              : null,
          })),
        },
      });
    } catch (err: any) {
      console.error('[saas/edit-queue] error:', err);
      res.status(500).json({ success: false, message: 'Failed to list edit queue' });
    }
  };

  startEdit = async (req: Request, res: Response) => {
    try {
      const tenant = req.tenant!;
      const user = (req as any).user as any;
      const { jobId } = req.params;

      const editRepo = this.ds.getRepository(DocumentEdit);
      const jobRepo = this.ds.getRepository(PrintJob);

      const edit = await editRepo.findOne({
        where: { printJobId: jobId, shopId: tenant.id },
        relations: ['printJob'],
      });

      if (!edit) {
        res.status(404).json({ success: false, message: 'Edit job not found' });
        return;
      }

      if (edit.status !== DocumentEditStatus.PENDING_SHOP) {
        res.status(400).json({ success: false, message: `Edit job is ${edit.status}, cannot start` });
        return;
      }

      edit.status = DocumentEditStatus.IN_PROGRESS;
      edit.editedBy = user.id;
      await editRepo.save(edit);

      const job = edit.printJob;
      job.status = PrintJobStatus.AWAITING_EDIT;
      await jobRepo.save(job);

      const padId = `edit-${edit.id}`;
      let editorUrl = '';
      try {
        const initialText = edit.printJob.editingInstructions
          ? `Editing Instructions:\n${edit.printJob.editingInstructions}\n\n---\nOriginal Document: ${edit.printJob.fileName || 'document.pdf'}\nPages: ${edit.printJob.totalPages}\n\n[Document content would be extracted from PDF here]`
          : `Editing document: ${edit.printJob.fileName || 'document.pdf'}\nPages: ${edit.printJob.totalPages}\n\n[Document content would be extracted from PDF here]`;

        await etherpadService.createPad(padId, initialText);

        const etherpadUrl = process.env.ETHERPAD_URL || 'http://localhost:9001';
        editorUrl = `${etherpadUrl}/p/${padId}?showControls=true&showChat=true&showLineNumbers=true&useMonospaceFont=false`;

        edit.editOperations = [{ type: 'etherpad_created', padId, createdAt: new Date().toISOString() }];
        await editRepo.save(edit);
      } catch (e: any) {
        console.error('[saas/edit/start] Etherpad error:', e);
      }

      await notificationQueue.add('edit-started', {
        userId: job.userId,
        printJobId: job.id,
        editId: edit.id,
        shopName: tenant.name,
      });

      res.json({ success: true, data: { editId: edit.id, status: edit.status, editorUrl } });
    } catch (err: any) {
      console.error('[saas/edit/start] error:', err);
      res.status(500).json({ success: false, message: 'Failed to start edit' });
    }
  };

  uploadEdit = async (req: Request, res: Response) => {
    try {
      const tenant = req.tenant!;
      const { jobId } = req.params;
      const parsed = editUploadBodySchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        res.status(400).json({ success: false, message: 'Edited document URL is required' });
        return;
      }
      const { documentUrl, pageCount, fileSize, editOperations, shopNotes } = parsed.data;

      const editRepo = this.ds.getRepository(DocumentEdit);
      const jobRepo = this.ds.getRepository(PrintJob);

      const edit = await editRepo.findOne({
        where: { printJobId: jobId, shopId: tenant.id },
        relations: ['printJob'],
      });

      if (!edit) {
        res.status(404).json({ success: false, message: 'Edit job not found' });
        return;
      }

      if (edit.status !== DocumentEditStatus.IN_PROGRESS) {
        res.status(400).json({ success: false, message: `Edit job is ${edit.status}, cannot upload` });
        return;
      }

      edit.editedDocumentMeta = { pageCount: pageCount || 0, fileSize: fileSize || 0 };
      edit.editOperations = (editOperations as any[]) || [];
      edit.shopNotes = shopNotes || null;
      edit.status = DocumentEditStatus.PENDING_CUSTOMER;
      await editRepo.save(edit);

      const job = edit.printJob;
      job.editedDocumentUrl = documentUrl;
      job.status = PrintJobStatus.EDIT_COMPLETE;
      await jobRepo.save(job);

      await notificationQueue.add('edit-complete', {
        userId: job.userId,
        printJobId: job.id,
        editId: edit.id,
        editedDocumentUrl: documentUrl,
        shopName: tenant.name,
        totalEditFee: edit.totalEditFee,
      });

      res.json({ success: true, data: { editId: edit.id, status: edit.status } });
    } catch (err: any) {
      console.error('[saas/edit/upload] error:', err);
      res.status(500).json({ success: false, message: 'Failed to upload edited document' });
    }
  };

  completeEdit = async (req: Request, res: Response) => {
    try {
      const tenant = req.tenant!;
      const { jobId } = req.params;

      const editRepo = this.ds.getRepository(DocumentEdit);
      const jobRepo = this.ds.getRepository(PrintJob);

      const edit = await editRepo.findOne({
        where: { printJobId: jobId, shopId: tenant.id },
        relations: ['printJob'],
      });

      if (!edit) {
        res.status(404).json({ success: false, message: 'Edit job not found' });
        return;
      }

      if (edit.status !== DocumentEditStatus.IN_PROGRESS && edit.status !== DocumentEditStatus.PENDING_CUSTOMER) {
        res.status(400).json({ success: false, message: `Edit job is ${edit.status}, cannot complete` });
        return;
      }

      const job = edit.printJob;

      const padId = `edit-${edit.id}`;
      let documentUrl = job.editedDocumentUrl;
      let pageCount = 0;
      let fileSize = 0;

      try {
        const pdfBuffer = await etherpadService.exportAsPDF(padId);

        const { saveBuffer } = await import('@/core/utils/fileStore');
        const stored = await saveBuffer(pdfBuffer, `edited-${edit.printJobId}.pdf`);
        documentUrl = stored.url;
        fileSize = pdfBuffer.length;

        pageCount = Math.max(1, Math.ceil(fileSize / 3000));

        edit.editedDocumentMeta = { pageCount, fileSize };
      } catch (e: any) {
        console.error('[saas/edit/complete] Etherpad export error:', e);
        if (!job.editedDocumentUrl) {
          res.status(400).json({
            success: false,
            message: 'Could not export from Etherpad. Please upload the edited PDF manually.',
          });
          return;
        }
      }

      edit.editOperations = [
        ...(edit.editOperations || []),
        { type: 'etherpad_exported', padId, exportedAt: new Date().toISOString() },
      ];
      edit.status = DocumentEditStatus.PENDING_CUSTOMER;
      await editRepo.save(edit);

      job.editedDocumentUrl = documentUrl;
      job.status = PrintJobStatus.EDIT_COMPLETE;
      await jobRepo.save(job);

      await notificationQueue.add('edit-complete', {
        userId: job.userId,
        printJobId: job.id,
        editId: edit.id,
        editedDocumentUrl: documentUrl,
        shopName: tenant.name,
        totalEditFee: edit.totalEditFee,
      });

      res.json({ success: true, data: { editId: edit.id, status: edit.status, documentUrl } });
    } catch (err: any) {
      console.error('[saas/edit/complete] error:', err);
      res.status(500).json({ success: false, message: 'Failed to complete edit' });
    }
  };

  confirmEdit = async (req: Request, res: Response) => {
    try {
      const user = (req as any).user as any;
      const { jobId } = req.params;

      const editRepo = this.ds.getRepository(DocumentEdit);
      const jobRepo = this.ds.getRepository(PrintJob);

      const edit = await editRepo.findOne({
        where: { printJobId: jobId },
        relations: ['printJob'],
      });

      if (!edit) {
        res.status(404).json({ success: false, message: 'Edit job not found' });
        return;
      }

      if (edit.printJob.userId !== user.id) {
        res.status(403).json({ success: false, message: 'Not authorized' });
        return;
      }

      if (edit.status !== DocumentEditStatus.PENDING_CUSTOMER) {
        res.status(400).json({ success: false, message: `Edit job is ${edit.status}, cannot confirm` });
        return;
      }

      edit.status = DocumentEditStatus.APPROVED;
      edit.approvedBy = user.id;
      edit.approvedAt = new Date();
      await editRepo.save(edit);

      const job = edit.printJob;
      job.status = PrintJobStatus.AWAITING_PAYMENT;
      await jobRepo.save(job);

      await notificationQueue.add('edit-approved', {
        shopId: edit.shopId,
        printJobId: job.id,
        editId: edit.id,
        customerName: user ? `${user.firstName} ${user.lastName}` : 'Unknown',
      });

      res.json({ success: true, data: { editId: edit.id, status: edit.status, printJobStatus: job.status } });
    } catch (err: any) {
      console.error('[saas/edit/confirm] error:', err);
      res.status(500).json({ success: false, message: 'Failed to confirm edit' });
    }
  };

  rejectEdit = async (req: Request, res: Response) => {
    try {
      const user = (req as any).user as any;
      const { jobId } = req.params;
      editRejectBodySchema.safeParse(req.body ?? {});
      const { reason } = req.body || {};

      const editRepo = this.ds.getRepository(DocumentEdit);
      const jobRepo = this.ds.getRepository(PrintJob);

      const edit = await editRepo.findOne({
        where: { printJobId: jobId },
        relations: ['printJob'],
      });

      if (!edit) {
        res.status(404).json({ success: false, message: 'Edit job not found' });
        return;
      }

      if (edit.printJob.userId !== user.id) {
        res.status(403).json({ success: false, message: 'Not authorized' });
        return;
      }

      if (edit.status !== DocumentEditStatus.PENDING_CUSTOMER) {
        res.status(400).json({ success: false, message: `Edit job is ${edit.status}, cannot reject` });
        return;
      }

      edit.status = DocumentEditStatus.REJECTED;
      edit.customerRejectionReason = reason || 'Customer rejected the edited document';
      await editRepo.save(edit);

      const job = edit.printJob;
      job.status = PrintJobStatus.AWAITING_EDIT;
      await jobRepo.save(job);

      await notificationQueue.add('edit-rejected', {
        shopId: edit.shopId,
        printJobId: job.id,
        editId: edit.id,
        reason: edit.customerRejectionReason,
      });

      res.json({ success: true, data: { editId: edit.id, status: edit.status } });
    } catch (err: any) {
      console.error('[saas/edit/reject] error:', err);
      res.status(500).json({ success: false, message: 'Failed to reject edit' });
    }
  };

  confirmPayment = async (req: Request, res: Response) => {
    try {
      const tenant = req.tenant!;
      const { jobId } = req.params;

      const editRepo = this.ds.getRepository(DocumentEdit);
      const jobRepo = this.ds.getRepository(PrintJob);

      const edit = await editRepo.findOne({
        where: { printJobId: jobId, shopId: tenant.id },
        relations: ['printJob'],
      });

      if (!edit) {
        res.status(404).json({ success: false, message: 'Edit job not found' });
        return;
      }

      if (edit.status !== DocumentEditStatus.APPROVED) {
        res.status(400).json({ success: false, message: `Edit job is ${edit.status}, cannot confirm payment` });
        return;
      }

      const job = edit.printJob;
      if (job.status !== PrintJobStatus.AWAITING_PAYMENT) {
        res.status(400).json({ success: false, message: `Print job is ${job.status}, cannot confirm payment` });
        return;
      }

      edit.status = DocumentEditStatus.COMPLETED;
      edit.completedAt = new Date();
      await editRepo.save(edit);

      job.status = PrintJobStatus.PAID;
      await jobRepo.save(job);

      await notificationQueue.add('edit-payment-confirmed', {
        userId: job.userId,
        printJobId: job.id,
        editId: edit.id,
      });

      res.json({ success: true, data: { editId: edit.id, status: edit.status, printJobStatus: job.status } });
    } catch (err: any) {
      console.error('[saas/edit/confirm-payment] error:', err);
      res.status(500).json({ success: false, message: 'Failed to confirm payment' });
    }
  };

  getEditJob = async (req: Request, res: Response) => {
    try {
      const user = (req as any).user as any;
      const { jobId } = req.params;

      const editRepo = this.ds.getRepository(DocumentEdit);
      const edit = await editRepo.findOne({
        where: { printJobId: jobId },
        relations: ['printJob', 'printJob.user', 'shop'],
      });

      if (!edit) {
        res.status(404).json({ success: false, message: 'Edit job not found' });
        return;
      }

      const isShop = edit.shopId === req.tenant?.id;
      const isCustomer = edit.printJob.userId === user.id;

      if (!isShop && !isCustomer) {
        res.status(403).json({ success: false, message: 'Not authorized' });
        return;
      }

      let bankDetails = null;
      if (isCustomer && edit.printJob.status === PrintJobStatus.AWAITING_PAYMENT) {
        const pricingRepo = this.ds.getRepository(EditPricingConfig);
        const pricing = await pricingRepo.findOne({ where: { tenantId: edit.shopId } });
        if (pricing) {
          bankDetails = {
            accountName: pricing.bankAccountName,
            accountNumber: pricing.bankAccountNumber,
            bankName: pricing.bankName,
            sortCode: pricing.bankSortCode,
          };
        }
      }

      res.json({
        success: true,
        data: {
          id: edit.id,
          printJobId: edit.printJobId,
          status: edit.status,
          editOperations: edit.editOperations,
          originalDocumentMeta: edit.originalDocumentMeta,
          editedDocumentMeta: edit.editedDocumentMeta,
          baseEditFee: edit.baseEditFee,
          perPageFee: edit.perPageFee,
          complexityFee: edit.complexityFee,
          shopAdjustedFee: edit.shopAdjustedFee,
          totalEditFee: edit.totalEditFee,
          shopNotes: edit.shopNotes,
          customerRejectionReason: edit.customerRejectionReason,
          approvedAt: edit.approvedAt,
          completedAt: edit.completedAt,
          createdAt: edit.createdAt,
          bankDetails,
          editorUrl: isShop && (edit.status === DocumentEditStatus.IN_PROGRESS || edit.status === DocumentEditStatus.PENDING_CUSTOMER)
            ? `${process.env.ETHERPAD_URL || 'http://localhost:9001'}/p/edit-${edit.id}?showControls=true&showChat=true&showLineNumbers=true&useMonospaceFont=false`
            : null,
          printJob: edit.printJob
            ? {
                id: edit.printJob.id,
                code: edit.printJob.code,
                status: edit.printJob.status,
                documentUrl: edit.printJob.renderedPdfUrl,
                editedDocumentUrl: edit.printJob.editedDocumentUrl,
                editingInstructions: edit.printJob.editingInstructions,
                pageCount: edit.printJob.totalPages,
                colorMode: edit.printJob.printConfiguration?.color,
                paperSize: edit.printJob.printConfiguration?.paper,
              }
            : null,
        },
      });
    } catch (err: any) {
      console.error('[saas/edit/get] error:', err);
      res.status(500).json({ success: false, message: 'Failed to get edit job' });
    }
  };
}
