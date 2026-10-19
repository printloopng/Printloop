import crypto from 'crypto';
import { Request, Response } from 'express';
import { GroupSessionService } from '@/modules/customer/services/groupSession.service';
import { QRCodeService } from '@/modules/public/services/qrCode.service';
import { GroupSessionStatus } from '@/database/entities/groupSession.entity';

const groupService = new GroupSessionService();
const qrService = new QRCodeService();

function hostIdOf(req: Request): string | undefined {
  return (
    (req as any).user?.id ||
    (req.body && req.body.hostId) ||
    (req.query && (req.query.hostId as string)) ||
    undefined
  );
}

export const createGroupSession = async (req: Request, res: Response): Promise<void> => {
  try {
    const { groupName, deadline, sharedSettings, defaultOptions, watermarkPrefix } = req.body || {};
    if (!groupName || !deadline) {
      res.status(400).json({ success: false, message: 'groupName and deadline are required' });
      return;
    }
    const hostId = hostIdOf(req) || crypto.randomUUID();
    const result = await groupService.createSession({
      hostId,
      tenantId: req.tenant?.id ?? null,
      groupName,
      deadline: new Date(deadline),
      sharedSettings: sharedSettings || defaultOptions || {},
      watermarkPrefix,
    });
    res.status(201).json({
      success: true,
      message: 'Group session created',
      data: {
        session: result.session,
        shareUrl: result.shareUrl,
        shareId: result.shareId,
        hostId,
      },
    });
  } catch (error: any) {
    console.error('Create group session error:', error);
    res.status(400).json({ success: false, message: error.message || 'Failed to create group session' });
  }
};

export const getSessionByShareId = async (req: Request, res: Response): Promise<void> => {
  try {
    const session = await groupService.getSessionByShareId(req.params.shareId);
    if (!session) {
      res.status(404).json({ success: false, message: 'Group session not found' });
      return;
    }
    if (session.status !== GroupSessionStatus.OPEN) {
      res.status(410).json({ success: false, message: 'This group session is closed', data: { status: session.status } });
      return;
    }
    res.json({
      success: true,
      data: {
        session: {
          id: session.id,
          groupName: session.groupName,
          deadline: session.deadline,
          defaultOptions: session.defaultOptions,
          status: session.status,
        },
      },
    });
  } catch (error) {
    console.error('Get session error:', error);
    res.status(500).json({ success: false, message: 'Failed to get session' });
  }
};

export const joinSession = async (req: Request, res: Response): Promise<void> => {
  try {
    const { shareId } = req.params;
    const { name, email, phoneNumber } = req.body || {};
    const userId = (req as any).user?.id;

    if (!name) {
      res.status(400).json({ success: false, message: 'Name is required' });
      return;
    }
    if (!email && !phoneNumber) {
      res.status(400).json({ success: false, message: 'Email or phone number is required' });
      return;
    }

    const result = await groupService.joinSession({ shareId, name, email, phoneNumber, userId });
    res.json({
      success: true,
      message: 'Joined group session',
      data: {
        participant: {
          id: result.participant.id,
          name: result.participant.name,
          watermarkId: result.participant.watermarkId,
          status: result.participant.status,
        },
        uploadToken: result.uploadToken,
        session: {
          id: result.session.id,
          groupName: result.session.groupName,
          deadline: result.session.deadline,
          defaultOptions: result.session.defaultOptions,
        },
      },
    });
  } catch (error: any) {
    console.error('Join session error:', error);
    res.status(400).json({ success: false, message: error.message || 'Failed to join session' });
  }
};

export const getHostSessionDetails = async (req: Request, res: Response): Promise<void> => {
  try {
    const hostId = hostIdOf(req);
    if (!hostId) {
      res.status(400).json({ success: false, message: 'hostId required' });
      return;
    }
    const result = await groupService.getSessionDetails(req.params.id, hostId);
    if (!result) {
      res.status(404).json({ success: false, message: 'Session not found or access denied' });
      return;
    }
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Get host session error:', error);
    res.status(500).json({ success: false, message: 'Failed to get session details' });
  }
};

export const listHostSessions = async (req: Request, res: Response): Promise<void> => {
  try {
    const hostId = hostIdOf(req);
    if (!hostId) {
      res.json({ success: true, data: { sessions: [], count: 0 } });
      return;
    }
    const sessions = await groupService.listHostSessions(hostId);
    res.json({ success: true, data: { sessions, count: sessions.length } });
  } catch (error) {
    console.error('List host sessions error:', error);
    res.status(500).json({ success: false, message: 'Failed to list sessions' });
  }
};

export const closeSession = async (req: Request, res: Response): Promise<void> => {
  try {
    const hostId = hostIdOf(req);
    if (!hostId) {
      res.status(400).json({ success: false, message: 'hostId required' });
      return;
    }
    const result = await groupService.closeSession(req.params.id, hostId);
    const qr = await qrService.generateGroupBatchQR(result.batchCode);
    res.json({
      success: true,
      message: 'Group session closed',
      data: {
        session: result.session,
        batchToken: result.batchToken,
        batchCode: result.batchCode,
        qrCode: { dataUrl: qr.dataUrl, svg: qr.svg },
      },
    });
  } catch (error: any) {
    console.error('Close session error:', error);
    res.status(400).json({ success: false, message: error.message || 'Failed to close session' });
  }
};
