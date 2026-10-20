import * as crypto from 'crypto';
import { randomUUID } from 'node:crypto';
import { repos } from '@/config/repos';
import { config } from '@/config';
import { signEditorToken, type EditorRole } from '@/core/utils/editorToken';
import { appUrls } from '@/core/utils/appUrls';
import { loadDocumentBytes } from '@/core/utils/fileStore';
import { EditorSession, EditorSessionStatus, ConversionStatus } from '@/database/entities/editorSession.entity';
import { DocumentEdit } from '@/database/entities/documentEdit.entity';
import {
  conversionEnabled,
  convertOfficeToPdf,
  isOfficeDocument,
} from '@/modules/public/services/documentConversion.service';
import {
  emptyUniverDocument,
  isUniverDocument,
  pdfToUniver,
  type StoredEditorDocument,
  type UniverDocumentData,
} from '@/modules/saas/services/univerDocument';

export type RTCIceServer = {
  urls: string | string[];
  username?: string;
  credential?: string;
};

export class EditorSessionError extends Error {
  constructor(public status: number, message: string, public code?: string) {
    super(message);
  }
}

export function storedDocument(session: EditorSession): StoredEditorDocument | null {
  const raw = session.univerDocument as Partial<StoredEditorDocument> | null;
  if (raw && isUniverDocument(raw.document)) return { version: Number(raw.version) || 0, document: raw.document };
  return null;
}

export class DocumentEditorService {
  async openSession(edit: DocumentEdit, shopUserId: string): Promise<{ session: EditorSession; token: string }> {
    const sessionRepo = repos.editorSession();
    const existing = await sessionRepo.findOne({
      where: { documentEditId: edit.id, status: EditorSessionStatus.ACTIVE },
      order: { createdAt: 'DESC' },
    });
    if (existing && new Date(existing.expiresAt).getTime() > Date.now()) {
      if (existing.shopUserId !== shopUserId) {
        existing.shopUserId = shopUserId;
        await sessionRepo.save(existing);
      }
      if (existing.conversionStatus === ConversionStatus.FAILED) void this.importDocument(existing.id);
      return { session: existing, token: this.token(existing, shopUserId, 'shop') };
    }

    const sessionId = randomUUID();
    const token = signEditorToken({ sessionId, editId: edit.id, userId: shopUserId, role: 'shop' });
    const ttlHours = Math.max(1, config.editor?.sessionTtlHours || 24);
    const session = sessionRepo.create({
      id: sessionId,
      documentEditId: edit.id,
      tenantId: edit.tenantId ?? edit.shopId,
      shopUserId,
      univerDocument: {},
      permissions: { shop: 'rw', customer: 'r' },
      tokenHash: crypto.createHash('sha256').update(token).digest('hex'),
      status: EditorSessionStatus.ACTIVE,
      conversionStatus: ConversionStatus.PENDING,
      expiresAt: new Date(Date.now() + ttlHours * 3600_000),
      lastActivityAt: new Date(),
    });
    await sessionRepo.save(session);
    void this.importDocument(session.id);
    return { session, token };
  }

  token(session: EditorSession, userId: string, role: EditorRole): string {
    const ttl = Math.max(60, Math.floor((new Date(session.expiresAt).getTime() - Date.now()) / 1000));
    return signEditorToken({ sessionId: session.id, editId: session.documentEditId, userId, role }, ttl);
  }

  editorUrl(sessionId: string): string {
    return `${appUrls.shop}/editor/${sessionId}`;
  }

  async importDocument(sessionId: string): Promise<void> {
    const sessionRepo = repos.editorSession();
    const session = await sessionRepo.findOne({
      where: { id: sessionId },
      relations: ['documentEdit', 'documentEdit.printJob', 'documentEdit.printJob.file'],
    });
    if (!session) return;
    try {
      session.conversionStatus = ConversionStatus.PROCESSING;
      session.conversionError = null;
      await sessionRepo.save(session);

      const file = session.documentEdit?.printJob?.file;
      const title = file?.fileName || 'Document';
      const docId = `edit-${session.documentEditId}`;
      let document: UniverDocumentData;
      const bytes = file?.fileURL ? await loadDocumentBytes(file.fileURL) : null;
      if (!bytes) {
        document = emptyUniverDocument(docId, title, 'The original document could not be loaded. Type the edited content here.');
      } else {
        let pdf: Buffer | null = null;
        if (bytes.subarray(0, 5).toString('latin1') === '%PDF-') pdf = bytes;
        else if (isOfficeDocument(file?.fileName, file?.mimeType) && conversionEnabled()) {
          pdf = await convertOfficeToPdf(bytes, file?.fileName || 'document.docx');
        }
        document = pdf
          ? await pdfToUniver(pdf, docId, title)
          : emptyUniverDocument(docId, title, 'This file has no selectable text. Retype or paste the edited content here.');
      }

      session.univerDocument = { version: 1, document } satisfies StoredEditorDocument;
      session.conversionStatus = ConversionStatus.COMPLETED;
      session.lastActivityAt = new Date();
      await sessionRepo.save(session);
    } catch (err: any) {
      session.conversionStatus = ConversionStatus.FAILED;
      session.conversionError = String(err?.message || 'Conversion failed').slice(0, 500);
      await sessionRepo.save(session).catch(() => undefined);
    }
  }

  async saveSnapshot(session: EditorSession, document: unknown, baseVersion?: number): Promise<StoredEditorDocument> {
    if (session.status !== EditorSessionStatus.ACTIVE) {
      throw new EditorSessionError(409, `This editor session is ${session.status}.`, 'SESSION_CLOSED');
    }
    if (!isUniverDocument(document)) {
      throw new EditorSessionError(400, 'That is not an editor document.', 'INVALID_DOCUMENT');
    }
    const current = storedDocument(session);
    const currentVersion = current?.version ?? 0;
    if (baseVersion !== undefined && baseVersion !== currentVersion) {
      throw new EditorSessionError(409, 'The document changed since you loaded it. Reload to continue.', 'VERSION_CONFLICT');
    }
    const next: StoredEditorDocument = { version: currentVersion + 1, document };
    session.univerDocument = next;
    session.lastActivityAt = new Date();
    await repos.editorSession().save(session);
    return next;
  }

  async cleanupExpired(): Promise<number> {
    return repos.editorSession().expireActivePast();
  }

  iceServers(): RTCIceServer[] {
    const turnServer = config.editor?.turnServer;
    const turnTlsServer = config.editor?.turnTlsServer;
    const turnPassword = process.env.COTURN_PASSWORD;
    const stun: RTCIceServer = { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] };
    if (!turnServer || !turnPassword) return [stun];
    return [
      stun,
      { urls: [turnServer, turnTlsServer].filter(Boolean) as string[], username: 'editor', credential: turnPassword },
    ];
  }
}

export const documentEditorService = new DocumentEditorService();
