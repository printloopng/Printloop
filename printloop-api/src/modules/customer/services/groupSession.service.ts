import crypto from 'crypto';
import { repos } from '@/config/repos';
import type { GroupSessionRepository } from '@/modules/customer/repositories/groupSession.repository';
import type { GroupParticipantRepository } from '@/modules/customer/repositories/groupParticipant.repository';
import type { PrintJobRepository } from '@/modules/customer/repositories/printJob.repository';
import type { FileRepository } from '@/modules/customer/repositories/file.repository';
import { GroupSession, GroupSessionStatus } from '@/database/entities/groupSession.entity';
import { GroupParticipant, ParticipantStatus } from '@/database/entities/groupParticipant.entity';
import { PrintJob } from '@/database/entities/printJob.entity';
import { File } from '@/database/entities/file.entity';
import { makeCode } from '@/core/utils/releaseCode';

export interface SessionOptions {
  paper: string;
  color: 'bw' | 'color';
  sided: 'single' | 'double';
  qualityDpi: 100 | 300 | 600;
  
  orientation: 'portrait' | 'landscape';
  enforce: boolean;
}

function normalizeOptions(raw: any): SessionOptions {
  const r = raw || {};
  const color =
    r.color === 'color' || r.colorType === 'color' || r.colorType === 'COLOR' ? 'color' : 'bw';
  const sided = r.sided === 'double' || r.isDuplex === true ? 'double' : 'single';
  const dpi = [100, 300, 600].includes(Number(r.qualityDpi))
    ? (Number(r.qualityDpi) as 100 | 300 | 600)
    : 300;
  return {
    paper: r.paper || r.paperSize || 'A4',
    color,
    sided,
    qualityDpi: dpi,
    orientation: r.orientation === 'landscape' ? 'landscape' : 'portrait',
    enforce: Boolean(r.enforce ?? r.enforceSettings ?? false),
  };
}

export interface CreateGroupSessionInput {
  hostId: string;
  
  tenantId?: string | null;
  groupName: string;
  deadline: Date;
  sharedSettings: any;
  watermarkPrefix?: string;
}

export class GroupSessionService {
  private get sessionRepo(): GroupSessionRepository {
    return repos.groupSession();
  }
  private get participantRepo(): GroupParticipantRepository {
    return repos.groupParticipant();
  }
  private get printJobRepo(): PrintJobRepository {
    return repos.printJob();
  }
  private get fileRepo(): FileRepository {
    return repos.file();
  }

  async createSession(input: CreateGroupSessionInput): Promise<{
    session: GroupSession;
    shareUrl: string;
    shareId: string;
  }> {
    if (input.deadline.getTime() <= Date.now()) {
      throw new Error('Deadline must be in the future');
    }
    const maxDeadline = new Date();
    maxDeadline.setDate(maxDeadline.getDate() + 7);
    if (input.deadline > maxDeadline) {
      throw new Error('Deadline cannot be more than 7 days from now');
    }

    const shareId = makeCode(8);
    const baseUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const shareUrl = `${baseUrl}/join/${shareId}`;

    const session = this.sessionRepo.create({
      hostUserId: input.hostId,
      tenantId: input.tenantId ?? null,
      groupName: input.groupName,
      deadline: input.deadline,
      status: GroupSessionStatus.OPEN,
      shareUrl,
      shareId,
      watermarkPrefix: input.watermarkPrefix || shareId,
      defaultOptions: normalizeOptions(input.sharedSettings),
    });

    const saved = await this.sessionRepo.save(session);
    return { session: saved, shareUrl, shareId };
  }

  async getSessionByShareId(shareId: string): Promise<GroupSession | null> {
    return this.sessionRepo.findOne({ where: { shareId } });
  }

  async joinSession(input: {
    shareId: string;
    name: string;
    email?: string;
    phoneNumber?: string;
    userId?: string;
  }): Promise<{
    participant: GroupParticipant;
    uploadToken: string;
    session: GroupSession;
  }> {
    const session = await this.sessionRepo.findOne({ where: { shareId: input.shareId } });
    if (!session) throw new Error('Group session not found');
    if (session.status !== GroupSessionStatus.OPEN) throw new Error('This group session is closed');
    if (new Date() > session.deadline)
      throw new Error('The deadline for this group session has passed');

    const dedupe: Array<Record<string, any>> = [];
    if (input.email) dedupe.push({ groupSessionId: session.id, email: input.email });
    if (input.phoneNumber)
      dedupe.push({ groupSessionId: session.id, phoneNumber: input.phoneNumber });
    if (dedupe.length) {
      const existing = await this.participantRepo.findOne({ where: dedupe });
      if (existing) {
        return { participant: existing, uploadToken: existing.uploadToken, session };
      }
    }

    const uploadToken = crypto.randomBytes(32).toString('base64url');

    const participant = this.participantRepo.create({
      groupSessionId: session.id,
      userId: input.userId,
      name: input.name,
      email: input.email,
      phoneNumber: input.phoneNumber,
      watermarkId: null,
      uploadToken,
      status: ParticipantStatus.JOINED,
      joinedAt: new Date(),
    });

    const saved = await this.participantRepo.save(participant);
    return { participant: saved, uploadToken, session };
  }

  async getParticipantByToken(uploadToken: string): Promise<{
    participant: GroupParticipant;
    session: GroupSession;
  } | null> {
    const participant = await this.participantRepo.findOne({ where: { uploadToken } });
    if (!participant) return null;
    const session = await this.sessionRepo.findOne({ where: { id: participant.groupSessionId } });
    if (!session) return null;
    return { participant, session };
  }

  async linkFileToParticipant(
    uploadToken: string,
    printJobId: string,
    fileId: string
  ): Promise<GroupParticipant> {
    const result = await this.getParticipantByToken(uploadToken);
    if (!result) throw new Error('Invalid upload token');
    const { participant, session } = result;
    if (session.status !== GroupSessionStatus.OPEN) throw new Error('Group session is closed');

    await this.fileRepo.update(fileId, { participantId: participant.id });

    participant.printJobId = printJobId;
    participant.status = ParticipantStatus.UPLOADED;
    participant.uploadedAt = new Date();
    const saved = await this.participantRepo.save(participant);

    return saved;
  }

  async markParticipantPaid(printJobId: string): Promise<GroupParticipant | null> {
    const participant = await this.participantRepo.findOne({ where: { printJobId } });
    if (!participant) return null;
    participant.status = ParticipantStatus.PAID;
    participant.paidAt = new Date();
    return this.participantRepo.save(participant);
  }

  async getSessionDetails(
    sessionId: string,
    hostId: string
  ): Promise<{
    session: GroupSession;
    participants: GroupParticipant[];
    summary: {
      totalParticipants: number;
      uploaded: number;
      paid: number;
      totalPages: number;
      totalAmountPaid: number;
    };
  } | null> {
    const session = await this.sessionRepo.findOne({ where: { id: sessionId } });
    if (!session || session.hostUserId !== hostId) return null;

    const participants = await this.participantRepo.find({
      where: { groupSessionId: sessionId },
      order: { createdAt: 'ASC' },
    });

    const paidParticipants = participants.filter((p) => p.status === ParticipantStatus.PAID);
    const printJobIds = paidParticipants.map((p) => p.printJobId).filter(Boolean) as string[];

    let totalPages = 0;
    let totalAmountPaid = 0;
    if (printJobIds.length > 0) {
      const jobs = await this.printJobRepo.findByIds(printJobIds);
      totalPages = jobs.reduce((s, j) => s + (j.totalPages || 0), 0);
      totalAmountPaid = jobs.reduce((s, j) => s + Number(j.cost || 0), 0);
    }

    return {
      session,
      participants,
      summary: {
        totalParticipants: participants.length,
        uploaded: participants.filter(
          (p) => p.status === ParticipantStatus.UPLOADED || p.status === ParticipantStatus.PAID
        ).length,
        paid: paidParticipants.length,
        totalPages,
        totalAmountPaid,
      },
    };
  }

  async closeSession(
    sessionId: string,
    hostId: string | null
  ): Promise<{ session: GroupSession; batchToken: string; batchCode: string }> {
    const session = await this.sessionRepo.findOne({ where: { id: sessionId } });
    if (!session) throw new Error('Session not found');
    if (hostId && session.hostUserId && session.hostUserId !== hostId)
      throw new Error('Only the host can close the session');
    if (session.status === GroupSessionStatus.CLOSED) throw new Error('Session is already closed');

    const batchToken = crypto.randomBytes(32).toString('base64url');
    const batchCode = makeCode(6);

    session.status = GroupSessionStatus.CLOSED;
    session.batchToken = batchToken;
    session.batchCode = batchCode;
    session.closedAt = new Date();

    const saved = await this.sessionRepo.save(session);
    return { session: saved, batchToken, batchCode };
  }

  async getBatchPrintData(batchCode: string): Promise<{
    session: GroupSession;
    files: Array<{
      fileId: string;
      fileURL: string;
      participantName: string;
      printConfig: any;
      totalPages: number;
    }>;
  } | null> {
    const session = await this.sessionRepo.findOne({ where: { batchCode } });
    if (!session || session.status !== GroupSessionStatus.CLOSED) return null;

    const paidParticipants = await this.participantRepo.find({
      where: { groupSessionId: session.id, status: ParticipantStatus.PAID },
    });

    const printJobIds = paidParticipants.map((p) => p.printJobId).filter(Boolean) as string[];
    if (printJobIds.length === 0) return { session, files: [] };

    const jobs = await this.printJobRepo.findByIds(printJobIds);
    const fileIds = jobs.map((j) => j.fileId).filter(Boolean) as string[];
    const files = await this.fileRepo.findByIds(fileIds);

    const fileData = paidParticipants
      .map((participant) => {
        const job = jobs.find((j) => j.id === participant.printJobId);
        const file = job ? files.find((f) => f.id === job.fileId) : undefined;
        if (!job || !file) return null;
        return {
          fileId: file.id,
          fileURL: file.fileURL,
          participantName: participant.name,
          printConfig: job.printConfiguration,
          totalPages: job.totalPages || 0,
        };
      })
      .filter(Boolean) as Array<{
      fileId: string;
      fileURL: string;
      participantName: string;
      printConfig: any;
      totalPages: number;
    }>;

    return { session, files: fileData };
  }

  async listHostSessions(hostId: string): Promise<GroupSession[]> {
    return this.sessionRepo.find({
      where: { hostUserId: hostId },
      order: { createdAt: 'DESC' },
    });
  }

  async autoCloseExpiredSessions(): Promise<number> {
    const expired = await this.sessionRepo.findOpenPastDeadline();
    let closedCount = 0;
    for (const session of expired) {
      try {
        await this.closeSession(session.id, session.hostUserId);
        closedCount++;
      } catch (err) {
        console.error(`Failed to auto-close session ${session.id}:`, err);
      }
    }
    return closedCount;
  }
}
