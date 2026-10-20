import { Request, Response } from 'express';
import { tenantRoleOf } from '@/common/middleware/tenant.middleware';
import { DataSource } from 'typeorm';
import { DocumentEdit, DocumentEditStatus } from '@/database/entities/documentEdit.entity';
import { PrintJob, PrintJobStatus } from '@/database/entities/printJob.entity';
import { EditPricingConfig } from '@/database/entities/editPricingConfig.entity';
import { loadDocumentBytes, storageKeyFromUrl } from '@/core/utils/fileStore';
import { countPages } from '@/modules/public/services/documentConvert.service';
import { approveEdit } from '@/modules/saas/services/editApproval.service';
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
        .leftJoinAndSelect('pj.file', 'f')
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
                  originalDocumentUrl: e.printJob.file?.fileURL ?? e.printJob.renderedPdfUrl ?? null,
                  fileName: e.printJob.file?.fileName ?? e.printJob.fileName ?? null,
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

  private async findShopEdit(req: Request): Promise<DocumentEdit | null> {
    return this.ds.getRepository(DocumentEdit).findOne({
      where: { printJobId: req.params.jobId, shopId: req.tenant!.id },
      relations: ['printJob'],
    });
  }

  private async findCustomerEdit(req: Request): Promise<DocumentEdit | null> {
    const edit = await this.ds.getRepository(DocumentEdit).findOne({
      where: { printJobId: req.params.jobId },
      relations: ['printJob'],
    });
    return edit && edit.printJob?.userId === (req as any).user.id ? edit : null;
  }

  startEdit = async (req: Request, res: Response) => {
    try {
      const user = (req as any).user as any;
      const edit = await this.findShopEdit(req);
      if (!edit) {
        res.status(404).json({ success: false, message: 'Edit job not found' });
        return;
      }
      if (![DocumentEditStatus.PENDING_SHOP, DocumentEditStatus.REJECTED].includes(edit.status)) {
        res.status(409).json({ success: false, message: `Edit job is ${edit.status}, cannot start` });
        return;
      }
      edit.status = DocumentEditStatus.IN_PROGRESS;
      edit.editedBy = user.id;
      await this.ds.getRepository(DocumentEdit).save(edit);
      edit.printJob.status = PrintJobStatus.AWAITING_EDIT;
      await this.ds.getRepository(PrintJob).save(edit.printJob);
      await notificationQueue.add('edit-started', {
        userId: edit.printJob.userId,
        printJobId: edit.printJobId,
        editId: edit.id,
        shopName: req.tenant!.name,
      });
      res.json({ success: true, data: { editId: edit.id, status: edit.status } });
    } catch (err: any) {
      console.error('[saas/edit/start] error:', err);
      res.status(500).json({ success: false, message: 'Failed to start edit' });
    }
  };

  uploadEdit = async (req: Request, res: Response) => {
    try {
      const parsed = editUploadBodySchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        res.status(400).json({ success: false, message: 'Edited document URL is required' });
        return;
      }
      const { documentUrl, editOperations, shopNotes } = parsed.data;
      const edit = await this.findShopEdit(req);
      if (!edit) {
        res.status(404).json({ success: false, message: 'Edit job not found' });
        return;
      }
      if (edit.status !== DocumentEditStatus.IN_PROGRESS) {
        res.status(409).json({ success: false, message: `Edit job is ${edit.status}, cannot upload` });
        return;
      }
      const bytes = storageKeyFromUrl(documentUrl) ? await loadDocumentBytes(documentUrl) : null;
      if (!bytes) {
        res.status(400).json({ success: false, message: 'Upload the edited document to PrintLoop first' });
        return;
      }
      const pageCount = await countPages(bytes, 'edited.pdf');
      edit.editedDocumentUrl = documentUrl;
      edit.editedDocumentMeta = { pageCount, fileSize: bytes.length };
      edit.editOperations = [...(edit.editOperations || []), ...((editOperations as any[]) || []), { type: 'uploaded', at: new Date().toISOString() }];
      edit.shopNotes = shopNotes || edit.shopNotes || null;
      edit.status = DocumentEditStatus.PENDING_CUSTOMER;
      await this.ds.getRepository(DocumentEdit).save(edit);
      await this.markReadyForReview(req, edit, documentUrl);
      res.json({ success: true, data: { editId: edit.id, status: edit.status, pageCount } });
    } catch (err: any) {
      console.error('[saas/edit/upload] error:', err);
      res.status(500).json({ success: false, message: 'Failed to upload edited document' });
    }
  };

  completeEdit = async (req: Request, res: Response) => {
    try {
      const edit = await this.findShopEdit(req);
      if (!edit) {
        res.status(404).json({ success: false, message: 'Edit job not found' });
        return;
      }
      if (edit.status === DocumentEditStatus.PENDING_CUSTOMER) {
        res.json({ success: true, data: { editId: edit.id, status: edit.status, documentUrl: edit.editedDocumentUrl } });
        return;
      }
      if (edit.status !== DocumentEditStatus.IN_PROGRESS || !edit.editedDocumentUrl) {
        res.status(409).json({
          success: false,
          message: 'Upload the edited document or export it from the editor before sending it to the customer.',
        });
        return;
      }
      edit.status = DocumentEditStatus.PENDING_CUSTOMER;
      await this.ds.getRepository(DocumentEdit).save(edit);
      await this.markReadyForReview(req, edit, edit.editedDocumentUrl);
      res.json({ success: true, data: { editId: edit.id, status: edit.status, documentUrl: edit.editedDocumentUrl } });
    } catch (err: any) {
      console.error('[saas/edit/complete] error:', err);
      res.status(500).json({ success: false, message: 'Failed to complete edit' });
    }
  };

  private async markReadyForReview(req: Request, edit: DocumentEdit, documentUrl: string) {
    const job = edit.printJob;
    job.editedDocumentUrl = documentUrl;
    job.status = PrintJobStatus.EDIT_COMPLETE;
    await this.ds.getRepository(PrintJob).save(job);
    await notificationQueue.add('edit-complete', {
      userId: job.userId,
      printJobId: job.id,
      editId: edit.id,
      editedDocumentUrl: documentUrl,
      shopName: req.tenant!.name,
      totalEditFee: edit.totalEditFee,
    });
  }

  confirmEdit = async (req: Request, res: Response) => {
    try {
      const user = (req as any).user as any;
      const edit = await this.findCustomerEdit(req);
      if (!edit) {
        res.status(404).json({ success: false, message: 'Edit job not found' });
        return;
      }
      if (edit.status !== DocumentEditStatus.PENDING_CUSTOMER || !edit.editedDocumentUrl) {
        res.status(409).json({ success: false, message: `Edit job is ${edit.status}, cannot confirm` });
        return;
      }
      const result = await approveEdit(this.ds, edit, user);
      if (!result.ok) {
        res.status(result.status).json({ success: false, message: result.message });
        return;
      }
      res.json({
        success: true,
        data: { editId: edit.id, status: DocumentEditStatus.APPROVED, printJobStatus: PrintJobStatus.PENDING, amountDue: result.amountDue, pageCount: result.pageCount },
      });
    } catch (err: any) {
      console.error('[saas/edit/confirm] error:', err);
      res.status(500).json({ success: false, message: 'Failed to confirm edit' });
    }
  };

  rejectEdit = async (req: Request, res: Response) => {
    try {
      editRejectBodySchema.safeParse(req.body ?? {});
      const edit = await this.findCustomerEdit(req);
      if (!edit) {
        res.status(404).json({ success: false, message: 'Edit job not found' });
        return;
      }
      if (edit.status !== DocumentEditStatus.PENDING_CUSTOMER) {
        res.status(409).json({ success: false, message: `Edit job is ${edit.status}, cannot reject` });
        return;
      }
      edit.status = DocumentEditStatus.REJECTED;
      edit.customerRejectionReason = String(req.body?.reason || '').slice(0, 2000) || 'Customer asked for changes';
      await this.ds.getRepository(DocumentEdit).save(edit);
      edit.printJob.status = PrintJobStatus.AWAITING_EDIT;
      await this.ds.getRepository(PrintJob).save(edit.printJob);
      await notificationQueue.add('edit-rejected', {
        shopId: edit.shopId,
        printJobId: edit.printJobId,
        editId: edit.id,
        reason: edit.customerRejectionReason,
      });
      res.json({ success: true, data: { editId: edit.id, status: edit.status } });
    } catch (err: any) {
      console.error('[saas/edit/reject] error:', err);
      res.status(500).json({ success: false, message: 'Failed to reject edit' });
    }
  };

  confirmPayment = async (_req: Request, res: Response) => {
    res.status(410).json({
      success: false,
      message: 'Edit fees are now paid by the customer at checkout together with the print.',
      code: 'EDIT_PAYMENT_AT_CHECKOUT',
    });
  };

  getEditJob = async (req: Request, res: Response) => {
    try {
      const user = (req as any).user as any;
      const { jobId } = req.params;

      const editRepo = this.ds.getRepository(DocumentEdit);
      const edit = await editRepo.findOne({
        where: { printJobId: jobId },
        relations: ['printJob', 'printJob.user', 'printJob.file'],
      });

      if (!edit) {
        res.status(404).json({ success: false, message: 'Edit job not found' });
        return;
      }

      const isShop = tenantRoleOf(req, edit.shopId) !== null;
      const isCustomer = edit.printJob.userId === user.id;

      if (!isShop && !isCustomer) {
        res.status(403).json({ success: false, message: 'Not authorized' });
        return;
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
          printJob: edit.printJob
            ? {
                id: edit.printJob.id,
                code: edit.printJob.code,
                status: edit.printJob.status,
                fileName: edit.printJob.file?.fileName ?? edit.printJob.fileName ?? null,
                documentUrl: edit.printJob.file?.fileURL ?? edit.printJob.renderedPdfUrl ?? null,
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
