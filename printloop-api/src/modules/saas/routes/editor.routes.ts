import { Router, Request, Response } from 'express';
import { AppDataSource } from '@/config/data-source';
import { EditorSession, EditorSessionStatus, ConversionStatus } from '@/database/entities/editorSession.entity';
import { DocumentEdit, DocumentEditStatus } from '@/database/entities/documentEdit.entity';
import { PrintJob, PrintJobStatus } from '@/database/entities/printJob.entity';
import { User } from '@/database/entities/user.entity';
import { documentEditorService } from '@/modules/saas/services/documentEditor.service';
import { editorExportService } from '@/modules/saas/services/editorExport.service';
import { editorCollaborationService } from '@/modules/saas/services/editorCollaboration.service';
import { paystackService } from '@/core/services/paystack.service';
import { authenticate } from '@/common/middleware/auth.middleware';
import { resolveTenant } from '@/common/middleware/tenant.middleware';
import { config } from '@/config';
import { notificationQueue } from '@/workers/queues';
import { randomUUID as uuidv4 } from 'node:crypto';
import * as crypto from 'crypto';

const router = Router();

router.post(
  '/session',
  authenticate,
  resolveTenant,
  async (req: Request, res: Response) => {
    try {
      const tenant = req.tenant!;
      const user = (req as any).user as any;
      const { documentEditId, sourceDocumentUrl, mimeType } = req.body || {};

      if (!documentEditId || !sourceDocumentUrl || !mimeType) {
        res.status(400).json({ success: false, message: 'documentEditId, sourceDocumentUrl, and mimeType are required' });
        return;
      }

      const editRepo = AppDataSource.getRepository(DocumentEdit);
      const edit = await editRepo.findOne({
        where: { id: documentEditId, shopId: tenant.id },
        relations: ['printJob'],
      });

      if (!edit) {
        res.status(404).json({ success: false, message: 'Edit job not found' });
        return;
      }

      if (edit.status !== DocumentEditStatus.PENDING_SHOP && edit.status !== DocumentEditStatus.IN_PROGRESS) {
        res.status(400).json({ success: false, message: `Edit job is ${edit.status}, cannot start editing` });
        return;
      }

      const session = await documentEditorService.createSession(
        documentEditId,
        user.id,
        sourceDocumentUrl,
        mimeType
      );

      edit.status = DocumentEditStatus.IN_PROGRESS;
      edit.editedBy = user.id;
      await editRepo.save(edit);

      const jobRepo = AppDataSource.getRepository(PrintJob);
      const job = edit.printJob;
      if (job) {
        job.status = PrintJobStatus.AWAITING_EDIT;
        await jobRepo.save(job);
      }

      await notificationQueue.add('edit-started', {
        userId: job?.userId,
        printJobId: job?.id,
        editId: edit.id,
        shopName: tenant.name,
      });

      res.json({ success: true, data: session });
    } catch (err: any) {
      console.error('[saas/editor/session] error:', err);
      res.status(500).json({ success: false, message: err?.message || 'Failed to create editor session' });
    }
  }
);

router.get(
  '/session/:id',
  authenticate,
  async (req: Request, res: Response) => {
    try {
      const user = (req as any).user as any;
      const { id } = req.params;

      const sessionRepo = AppDataSource.getRepository(EditorSession);
      const session = await sessionRepo.findOne({
        where: { id },
        relations: ['documentEdit', 'documentEdit.printJob'],
      });

      if (!session) {
        res.status(404).json({ success: false, message: 'Session not found' });
        return;
      }

      const isShop = session.shopUserId === user.id;
      const isCustomer = session.customerUserId === user.id || session.documentEdit?.printJob?.userId === user.id;

      if (!isShop && !isCustomer) {
        res.status(403).json({ success: false, message: 'Not authorized for this session' });
        return;
      }

      const role = isShop ? 'shop' : 'customer';
      const sessionData = await documentEditorService.getSession(id, user.id, role);

      let bankDetails = null;
      if (role === 'customer' && session.documentEdit?.printJob?.status === PrintJobStatus.AWAITING_PAYMENT) {
        const pricingRepo = AppDataSource.getRepository(
          (await import('@/database/entities/editPricingConfig.entity')).EditPricingConfig
        );
        const pricing = await pricingRepo.findOne({ where: { tenantId: session.documentEdit.shopId } });
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
          ...sessionData,
          bankDetails,
          printJob: session.documentEdit?.printJob
            ? {
                id: session.documentEdit.printJob.id,
                code: session.documentEdit.printJob.code,
                status: session.documentEdit.printJob.status,
                editingInstructions: session.documentEdit.printJob.editingInstructions,
                pageCount: session.documentEdit.printJob.totalPages,
              }
            : null,
        },
      });
    } catch (err: any) {
      console.error('[saas/editor/session:get] error:', err);
      res.status(500).json({ success: false, message: err?.message || 'Failed to get editor session' });
    }
  }
);

router.post(
  '/session/:id/snapshot',
  authenticate,
  async (req: Request, res: Response) => {
    try {
      const user = (req as any).user as any;
      const { id } = req.params;
      const { snapshot, version } = req.body || {};

      if (!snapshot || !version) {
        res.status(400).json({ success: false, message: 'snapshot and version are required' });
        return;
      }

      const sessionRepo = AppDataSource.getRepository(EditorSession);
      const session = await sessionRepo.findOne({ where: { id } });

      if (!session || session.shopUserId !== user.id) {
        res.status(403).json({ success: false, message: 'Not authorized' });
        return;
      }

      await documentEditorService.saveSnapshot(id, snapshot, version);

      res.json({ success: true, data: { saved: true, version } });
    } catch (err: any) {
      console.error('[saas/editor/snapshot] error:', err);
      res.status(500).json({ success: false, message: err?.message || 'Failed to save snapshot' });
    }
  }
);

router.post(
  '/session/:id/export',
  authenticate,
  async (req: Request, res: Response) => {
    try {
      const user = (req as any).user as any;
      const { id } = req.params;
      const { format } = req.body || {};

      if (!format || !['pdf', 'pwg'].includes(format)) {
        res.status(400).json({ success: false, message: 'format must be pdf or pwg' });
        return;
      }

      const result = await editorExportService.exportDocument(id, format, user.id);

      res.json({ success: true, data: result });
    } catch (err: any) {
      console.error('[saas/editor/export] error:', err);
      res.status(500).json({ success: false, message: err?.message || 'Failed to export document' });
    }
  }
);

router.post(
  '/session/:id/approve',
  authenticate,
  async (req: Request, res: Response) => {
    try {
      const user = (req as any).user as any;
      const { id } = req.params;

      const sessionRepo = AppDataSource.getRepository(EditorSession);
      const editRepo = AppDataSource.getRepository(DocumentEdit);
      const jobRepo = AppDataSource.getRepository(PrintJob);

      const session = await sessionRepo.findOne({
        where: { id },
        relations: ['documentEdit', 'documentEdit.printJob'],
      });

      if (!session) {
        res.status(404).json({ success: false, message: 'Session not found' });
        return;
      }

      const edit = session.documentEdit;
      if (!edit) {
        res.status(404).json({ success: false, message: 'Edit not found' });
        return;
      }

      if (edit.printJob?.userId !== user.id) {
        res.status(403).json({ success: false, message: 'Not authorized' });
        return;
      }

      if (edit.status !== DocumentEditStatus.PENDING_CUSTOMER) {
        res.status(400).json({ success: false, message: `Edit is ${edit.status}, cannot approve` });
        return;
      }

      const feeCalculation = await calculateEditFee(edit, session);

      const reference = `edit_${edit.id}_${Date.now()}`;
      const payment = await paystackService.initializePayment({
        amountNaira: feeCalculation.total / 100, // convert kobo to naira
        email: user.email,
        reference,
        metadata: {
          editId: edit.id,
          printJobId: edit.printJobId,
          type: 'edit_fee',
        },
        callbackUrl: `${config.frontendUrl}/saas/editor/${id}/payment-callback`,
      });

      edit.status = DocumentEditStatus.AWAITING_PAYMENT;
      await editRepo.save(edit);

      const job = edit.printJob;
      if (job) {
        job.status = PrintJobStatus.AWAITING_PAYMENT;
        await jobRepo.save(job);
      }

      session.status = EditorSessionStatus.COMPLETED;
      await sessionRepo.save(session);

      await notificationQueue.add('edit-approved', {
        shopId: edit.shopId,
        printJobId: job?.id,
        editId: edit.id,
        customerName: `${user.firstName} ${user.lastName}`,
        amount: feeCalculation.total,
      });

      res.json({
        success: true,
        data: {
          paymentUrl: payment.authorizationUrl,
          amount: feeCalculation.total,
          reference: payment.reference,
          feeBreakdown: feeCalculation,
        },
      });
    } catch (err: any) {
      console.error('[saas/editor/approve] error:', err);
      res.status(500).json({ success: false, message: err?.message || 'Failed to approve edit' });
    }
  }
);

router.post(
  '/session/:id/reject',
  authenticate,
  async (req: Request, res: Response) => {
    try {
      const user = (req as any).user as any;
      const { id } = req.params;
      const { reason } = req.body || {};

      if (!reason?.trim()) {
        res.status(400).json({ success: false, message: 'Rejection reason is required' });
        return;
      }

      const sessionRepo = AppDataSource.getRepository(EditorSession);
      const editRepo = AppDataSource.getRepository(DocumentEdit);
      const jobRepo = AppDataSource.getRepository(PrintJob);

      const session = await sessionRepo.findOne({
        where: { id },
        relations: ['documentEdit', 'documentEdit.printJob'],
      });

      if (!session) {
        res.status(404).json({ success: false, message: 'Session not found' });
        return;
      }

      const edit = session.documentEdit;
      if (!edit) {
        res.status(404).json({ success: false, message: 'Edit not found' });
        return;
      }

      if (edit.printJob?.userId !== user.id) {
        res.status(403).json({ success: false, message: 'Not authorized' });
        return;
      }

      if (edit.status !== DocumentEditStatus.PENDING_CUSTOMER) {
        res.status(400).json({ success: false, message: `Edit is ${edit.status}, cannot reject` });
        return;
      }

      edit.status = DocumentEditStatus.REJECTED;
      edit.customerRejectionReason = reason;
      await editRepo.save(edit);

      const job = edit.printJob;
      if (job) {
        job.status = PrintJobStatus.AWAITING_EDIT;
        await jobRepo.save(job);
      }

      session.status = EditorSessionStatus.ABANDONED;
      await sessionRepo.save(session);

      await notificationQueue.add('edit-rejected', {
        shopId: edit.shopId,
        printJobId: job?.id,
        editId: edit.id,
        reason,
      });

      res.json({ success: true, data: { editId: edit.id, status: edit.status } });
    } catch (err: any) {
      console.error('[saas/editor/reject] error:', err);
      res.status(500).json({ success: false, message: err?.message || 'Failed to reject edit' });
    }
  }
);

router.get(
  '/session/:id/conversion-status',
  authenticate,
  async (req: Request, res: Response) => {
    try {
      const user = (req as any).user as any;
      const { id } = req.params;

      const sessionRepo = AppDataSource.getRepository(EditorSession);
      const session = await sessionRepo.findOne({ where: { id } });

      if (!session) {
        res.status(404).json({ success: false, message: 'Session not found' });
        return;
      }

      const isShop = session.shopUserId === user.id;
      const isCustomer = session.customerUserId === user.id;

      if (!isShop && !isCustomer) {
        res.status(403).json({ success: false, message: 'Not authorized' });
        return;
      }

      res.json({
        success: true,
        data: {
          status: session.conversionStatus,
          error: session.conversionError,
        },
      });
    } catch (err: any) {
      console.error('[saas/editor/conversion-status] error:', err);
      res.status(500).json({ success: false, message: 'Failed to get conversion status' });
    }
  }
);

router.get(
  '/active-sessions',
  authenticate,
  async (req: Request, res: Response) => {
    try {
      const count = editorCollaborationService.getActiveSessionsCount();
      res.json({ success: true, data: { activeSessions: count } });
    } catch (err: any) {
      console.error('[saas/editor/active-sessions] error:', err);
      res.status(500).json({ success: false, message: 'Failed to get active sessions' });
    }
  }
);

async function calculateEditFee(
  edit: DocumentEdit,
  session: EditorSession
): Promise<{
  baseFee: number;
  perPageFee: number;
  pagesEdited: number;
  complexityTier: 'simple' | 'moderate' | 'complex';
  complexityFee: number;
  shopAdjustment: number;
  shopAdjustmentPct: number;
  total: number;
  currency: 'NGN';
}> {
  const pricingRepo = AppDataSource.getRepository(
    (await import('@/database/entities/editPricingConfig.entity')).EditPricingConfig
  );

  const pricing = await pricingRepo.findOne({ where: { tenantId: edit.shopId } });

  const baseFee = Number(pricing?.baseFee || edit.baseEditFee || 500);
  const perPageFee = Number(pricing?.perPageFee || edit.perPageFee || 100);
  const pagesEdited = edit.editedDocumentMeta?.pageCount || edit.originalDocumentMeta?.pageCount || 1;
  const complexityTier = 'simple' as const;
  const complexityFee = 0;
  const shopAdjustmentPct = 0;
  const shopAdjustment = 0;
  const total = baseFee + perPageFee * pagesEdited + complexityFee + shopAdjustment;

  return {
    baseFee,
    perPageFee,
    pagesEdited,
    complexityTier,
    complexityFee,
    shopAdjustment,
    shopAdjustmentPct,
    total,
    currency: 'NGN',
  };
}

router.get(
  '/by-job/:jobId',
  authenticate,
  async (req: Request, res: Response) => {
    try {
      const user = (req as any).user as any;
      const { jobId } = req.params;

      const editRepo = AppDataSource.getRepository(DocumentEdit);
      const edit = await editRepo.findOne({
        where: { printJobId: jobId },
        relations: ['printJob', 'printJob.user'],
      });

      if (!edit) {
        res.status(404).json({ success: false, message: 'Edit job not found' });
        return;
      }

      if (edit.printJob?.userId !== user.id) {
        res.status(403).json({ success: false, message: 'Not authorized' });
        return;
      }

      const sessionRepo = AppDataSource.getRepository(EditorSession);
      let session = await sessionRepo.findOne({
        where: { documentEditId: edit.id },
        order: { createdAt: 'DESC' },
      });

      if (!session) {
        const sessionId = uuidv4();
        const token = Buffer.from(JSON.stringify({
          sid: sessionId,
          eid: edit.id,
          uid: user.id,
          role: 'customer',
          iat: Math.floor(Date.now() / 1000),
          exp: Math.floor(Date.now() / 1000) + 24 * 60 * 60,
        })).toString('base64url');
        const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

        session = sessionRepo.create({
          id: sessionId,
          documentEditId: edit.id,
          customerUserId: user.id,
          univerDocument: edit.editedDocumentMeta || {},
          permissions: { shop: 'r', customer: 'r' },
          tokenHash,
          status: EditorSessionStatus.ACTIVE,
          conversionStatus: ConversionStatus.COMPLETED,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          lastActivityAt: new Date(),
        });
        await sessionRepo.save(session);
      }

      const sessionId = session.id;
      const sessionToken = Buffer.from(JSON.stringify({
        sid: sessionId,
        eid: edit.id,
        uid: user.id,
        role: 'customer',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 24 * 60 * 60,
      })).toString('base64url');

      res.json({
        success: true,
        data: {
          sessionId,
          sessionToken,
          editId: edit.id,
          printJob: edit.printJob,
          totalEditFee: edit.totalEditFee,
          bankDetails: edit.printJob?.status === 'awaiting_payment' ? {
            accountName: null, // Would come from pricing config
            accountNumber: null,
            bankName: null,
            sortCode: null,
          } : null,
        },
      });
    } catch (err: any) {
      console.error('[saas/editor/by-job] error:', err);
      res.status(500).json({ success: false, message: err?.message || 'Failed to get edit session' });
    }
  }
);

export default router;