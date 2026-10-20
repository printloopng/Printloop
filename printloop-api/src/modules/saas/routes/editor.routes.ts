import { Router, Request, Response } from 'express';
import { AppDataSource } from '@/config/data-source';
import { authenticate } from '@/common/middleware/auth.middleware';
import { resolveTenant } from '@/common/middleware/tenant.middleware';
import { EditorSession, EditorSessionStatus } from '@/database/entities/editorSession.entity';
import { DocumentEdit, DocumentEditStatus } from '@/database/entities/documentEdit.entity';
import { PrintJob, PrintJobStatus } from '@/database/entities/printJob.entity';
import { UserRole } from '@/database/entities/user.entity';
import { approveEdit } from '@/modules/saas/services/editApproval.service';
import {
  documentEditorService,
  EditorSessionError,
  storedDocument,
} from '@/modules/saas/services/documentEditor.service';
import { editorExportService } from '@/modules/saas/services/editorExport.service';
import { editorCollaborationService } from '@/modules/saas/services/editorCollaboration.service';
import { notificationQueue } from '@/workers/queues';

const router = Router();

type Role = 'shop' | 'customer';

function isShopMember(req: Request, tenantId: string): boolean {
  const user = (req as any).user;
  if (!user) return false;
  if (user.role === UserRole.SUPER_ADMIN) return true;
  if ((req.tenantMemberships || []).some((m) => m.tenantId === tenantId)) return true;
  return user.role === UserRole.ADMIN && user.tenantId === tenantId;
}

function roleFor(req: Request, session: EditorSession): Role | null {
  const edit = session.documentEdit;
  if (!edit) return null;
  if (isShopMember(req, edit.shopId)) return 'shop';
  if (edit.printJob?.userId === (req as any).user?.id) return 'customer';
  return null;
}

async function loadSession(id: string): Promise<EditorSession | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  return AppDataSource.getRepository(EditorSession).findOne({
    where: { id },
    relations: ['documentEdit', 'documentEdit.printJob'],
  });
}

function view(req: Request, session: EditorSession, role: Role) {
  const stored = storedDocument(session);
  const edit = session.documentEdit;
  const job = edit?.printJob;
  const active = session.status === EditorSessionStatus.ACTIVE && new Date(session.expiresAt).getTime() > Date.now();
  return {
    sessionId: session.id,
    role,
    status: session.status,
    readOnly: role === 'customer' || !active,
    token: active ? documentEditorService.token(session, (req as any).user.id, role) : null,
    socketPath: '/editor-socket',
    conversionStatus: session.conversionStatus,
    conversionError: session.conversionError,
    version: stored?.version ?? 0,
    document: stored?.document ?? null,
    expiresAt: session.expiresAt,
    iceServers: documentEditorService.iceServers(),
    edit: edit
      ? {
          id: edit.id,
          status: edit.status,
          shopNotes: edit.shopNotes ?? null,
          customerRejectionReason: edit.customerRejectionReason ?? null,
          totalEditFee: Number(edit.totalEditFee ?? 0),
          editedDocumentUrl: edit.editedDocumentUrl,
          editedPageCount: edit.editedDocumentMeta?.pageCount ?? null,
        }
      : null,
    printJob: job
      ? {
          id: job.id,
          code: job.code,
          status: job.status,
          editingInstructions: job.editingInstructions ?? null,
          pageCount: job.totalPages,
        }
      : null,
  };
}

function fail(res: Response, err: unknown, label: string) {
  if (err instanceof EditorSessionError) {
    res.status(err.status).json({ success: false, message: err.message, code: err.code });
    return;
  }
  console.error(`[saas/editor/${label}]`, err);
  res.status(500).json({ success: false, message: 'Editor request failed' });
}

router.post('/session', authenticate, resolveTenant, async (req: Request, res: Response) => {
  try {
    const tenant = req.tenant!;
    const user = (req as any).user;
    const editId = String(req.body?.editId ?? req.body?.documentEditId ?? '');
    if (!/^[0-9a-f-]{36}$/i.test(editId)) {
      res.status(400).json({ success: false, message: 'editId is required' });
      return;
    }
    const editRepo = AppDataSource.getRepository(DocumentEdit);
    const edit = await editRepo.findOne({ where: { id: editId, shopId: tenant.id }, relations: ['printJob'] });
    if (!edit) {
      res.status(404).json({ success: false, message: 'Edit job not found' });
      return;
    }
    if (edit.status === DocumentEditStatus.PENDING_SHOP || edit.status === DocumentEditStatus.REJECTED) {
      edit.status = DocumentEditStatus.IN_PROGRESS;
      edit.editedBy = user.id;
      await editRepo.save(edit);
      if (edit.printJob) {
        edit.printJob.status = PrintJobStatus.AWAITING_EDIT;
        await AppDataSource.getRepository(PrintJob).save(edit.printJob);
      }
      await notificationQueue.add('edit-started', {
        userId: edit.printJob?.userId,
        printJobId: edit.printJobId,
        editId: edit.id,
        shopName: tenant.name,
      });
    }
    if (edit.status !== DocumentEditStatus.IN_PROGRESS) {
      res.status(409).json({ success: false, message: `Edit job is ${edit.status}, cannot open the editor` });
      return;
    }
    const { session, token } = await documentEditorService.openSession(edit, user.id);
    res.status(201).json({
      success: true,
      data: {
        sessionId: session.id,
        token,
        editorUrl: documentEditorService.editorUrl(session.id),
        conversionStatus: session.conversionStatus,
        iceServers: documentEditorService.iceServers(),
      },
    });
  } catch (err) {
    fail(res, err, 'session');
  }
});

router.get('/session/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const session = await loadSession(String(req.params.id));
    const role = session ? roleFor(req, session) : null;
    if (!session || !role) {
      res.status(404).json({ success: false, message: 'Session not found' });
      return;
    }
    if (role === 'customer' && !session.customerUserId) {
      session.customerUserId = (req as any).user.id;
      await AppDataSource.getRepository(EditorSession).save(session);
    }
    res.json({ success: true, data: view(req, session, role) });
  } catch (err) {
    fail(res, err, 'session:get');
  }
});

router.post('/session/:id/snapshot', authenticate, async (req: Request, res: Response) => {
  try {
    const session = await loadSession(String(req.params.id));
    if (!session || roleFor(req, session) !== 'shop') {
      res.status(404).json({ success: false, message: 'Session not found' });
      return;
    }
    const document = req.body?.document ?? req.body?.snapshot;
    const raw = req.body?.version;
    const baseVersion = raw === undefined || raw === null ? undefined : Number(raw);
    const saved = await documentEditorService.saveSnapshot(
      session,
      document,
      Number.isFinite(baseVersion) ? baseVersion : undefined,
    );
    res.json({ success: true, data: { saved: true, version: saved.version } });
  } catch (err) {
    fail(res, err, 'snapshot');
  }
});

router.post('/session/:id/export', authenticate, resolveTenant, async (req: Request, res: Response) => {
  try {
    const session = await loadSession(String(req.params.id));
    if (!session || roleFor(req, session) !== 'shop') {
      res.status(404).json({ success: false, message: 'Session not found' });
      return;
    }
    const result = await editorExportService.exportSession(session, req.tenant?.name ?? 'Your print shop');
    await editorCollaborationService.closeSession(session.id).catch(() => false);
    res.json({ success: true, data: result });
  } catch (err) {
    fail(res, err, 'export');
  }
});

router.get('/session/:id/conversion-status', authenticate, async (req: Request, res: Response) => {
  try {
    const session = await loadSession(String(req.params.id));
    if (!session || !roleFor(req, session)) {
      res.status(404).json({ success: false, message: 'Session not found' });
      return;
    }
    res.json({ success: true, data: { status: session.conversionStatus, error: session.conversionError } });
  } catch (err) {
    fail(res, err, 'conversion-status');
  }
});

router.post('/session/:id/approve', authenticate, async (req: Request, res: Response) => {
  try {
    const session = await loadSession(String(req.params.id));
    if (!session || roleFor(req, session) !== 'customer') {
      res.status(404).json({ success: false, message: 'Session not found' });
      return;
    }
    const edit = session.documentEdit;
    if (edit.status !== DocumentEditStatus.PENDING_CUSTOMER || !edit.editedDocumentUrl) {
      res.status(409).json({ success: false, message: `Edit is ${edit.status}, cannot approve` });
      return;
    }
    const result = await approveEdit(AppDataSource, edit, (req as any).user);
    if (!result.ok) {
      res.status(result.status).json({ success: false, message: result.message });
      return;
    }
    session.status = EditorSessionStatus.COMPLETED;
    await AppDataSource.getRepository(EditorSession).save(session);
    res.json({
      success: true,
      data: { printJobId: result.printJobId, amountDue: result.amountDue, pageCount: result.pageCount },
    });
  } catch (err) {
    fail(res, err, 'approve');
  }
});

router.post('/session/:id/reject', authenticate, async (req: Request, res: Response) => {
  try {
    const reason = String(req.body?.reason ?? '').trim().slice(0, 2000);
    if (!reason) {
      res.status(400).json({ success: false, message: 'Tell the shop what to change' });
      return;
    }
    const session = await loadSession(String(req.params.id));
    if (!session || roleFor(req, session) !== 'customer') {
      res.status(404).json({ success: false, message: 'Session not found' });
      return;
    }
    const edit = session.documentEdit;
    if (edit.status !== DocumentEditStatus.PENDING_CUSTOMER) {
      res.status(409).json({ success: false, message: `Edit is ${edit.status}, cannot reject` });
      return;
    }
    edit.status = DocumentEditStatus.REJECTED;
    edit.customerRejectionReason = reason;
    await AppDataSource.getRepository(DocumentEdit).save(edit);
    if (edit.printJob) {
      edit.printJob.status = PrintJobStatus.AWAITING_EDIT;
      await AppDataSource.getRepository(PrintJob).save(edit.printJob);
    }
    session.status = EditorSessionStatus.ABANDONED;
    await AppDataSource.getRepository(EditorSession).save(session);
    await notificationQueue.add('edit-rejected', {
      shopId: edit.shopId,
      printJobId: edit.printJobId,
      editId: edit.id,
      reason,
    });
    res.json({ success: true, data: { editId: edit.id, status: edit.status } });
  } catch (err) {
    fail(res, err, 'reject');
  }
});

router.get('/by-job/:jobId', authenticate, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const edit = await AppDataSource.getRepository(DocumentEdit).findOne({
      where: { printJobId: String(req.params.jobId) },
      relations: ['printJob'],
    });
    if (!edit || edit.printJob?.userId !== user.id) {
      res.status(404).json({ success: false, message: 'Edit job not found' });
      return;
    }
    const session = await AppDataSource.getRepository(EditorSession).findOne({
      where: { documentEditId: edit.id },
      order: { createdAt: 'DESC' },
      relations: ['documentEdit', 'documentEdit.printJob'],
    });
    res.json({
      success: true,
      data: {
        editId: edit.id,
        status: edit.status,
        editedDocumentUrl: edit.editedDocumentUrl,
        totalEditFee: Number(edit.totalEditFee ?? 0),
        session: session ? view(req, session, 'customer') : null,
      },
    });
  } catch (err) {
    fail(res, err, 'by-job');
  }
});

router.get('/active-sessions', authenticate, resolveTenant, async (_req: Request, res: Response) => {
  res.json({ success: true, data: { activeSessions: editorCollaborationService.getActiveSessionsCount() } });
});

export default router;
