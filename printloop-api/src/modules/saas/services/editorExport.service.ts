import axios from 'axios';
import { repos } from '@/config/repos';
import { saveBuffer } from '@/core/utils/fileStore';
import { EditorSession, EditorSessionStatus } from '@/database/entities/editorSession.entity';
import { DocumentEditStatus } from '@/database/entities/documentEdit.entity';
import { PrintJobStatus } from '@/database/entities/printJob.entity';
import { conversionEnabled, convertOfficeToPdf } from '@/modules/public/services/documentConversion.service';
import { countPages } from '@/modules/public/services/documentConvert.service';
import { EditorSessionError, storedDocument } from '@/modules/saas/services/documentEditor.service';
import { univerToHtml, univerToPdf, type UniverDocumentData } from '@/modules/saas/services/univerDocument';
import { notificationQueue } from '@/workers/queues';

export interface ExportResult {
  documentUrl: string;
  pageCount: number;
  fileSize: number;
  renderer: 'external' | 'converter' | 'builtin';
}

export class EditorExportService {
  async renderPdf(document: UniverDocumentData): Promise<{ pdf: Buffer; renderer: ExportResult['renderer'] }> {
    const external = process.env.UNIVER_EXPORT_URL;
    if (external) {
      try {
        const response = await axios.post(external, { document, format: 'pdf' }, {
          responseType: 'arraybuffer',
          timeout: 120000,
          maxContentLength: 100 * 1024 * 1024,
        });
        const pdf = Buffer.from(response.data);
        if (pdf.subarray(0, 5).toString('latin1') === '%PDF-') return { pdf, renderer: 'external' };
      } catch (err: any) {
        console.error('[EditorExport] external renderer failed:', err?.message);
      }
    }
    if (conversionEnabled()) {
      try {
        const pdf = await convertOfficeToPdf(Buffer.from(univerToHtml(document), 'utf8'), 'edited.html');
        return { pdf, renderer: 'converter' };
      } catch (err: any) {
        console.error('[EditorExport] converter failed, using built-in renderer:', err?.message);
      }
    }
    return { pdf: await univerToPdf(document), renderer: 'builtin' };
  }

  async exportSession(session: EditorSession, shopName: string): Promise<ExportResult> {
    const edit = session.documentEdit;
    if (!edit?.printJob) throw new EditorSessionError(404, 'Edit job not found');
    if (session.status !== EditorSessionStatus.ACTIVE) {
      throw new EditorSessionError(409, `This editor session is ${session.status}.`, 'SESSION_CLOSED');
    }
    if (edit.status !== DocumentEditStatus.IN_PROGRESS) {
      throw new EditorSessionError(409, `Edit job is ${edit.status}, start it before sending.`, 'EDIT_NOT_IN_PROGRESS');
    }
    const stored = storedDocument(session);
    if (!stored) throw new EditorSessionError(409, 'The document is still being prepared.', 'NOT_READY');

    const { pdf, renderer } = await this.renderPdf(stored.document);
    const pageCount = await countPages(pdf, 'edited.pdf');
    const file = await saveBuffer(pdf, `edited-${edit.id}.pdf`);

    edit.editedDocumentUrl = file.url;
    edit.editedDocumentMeta = { pageCount, fileSize: pdf.length };
    edit.editOperations = [
      ...(edit.editOperations || []),
      { type: 'exported', at: new Date().toISOString(), version: stored.version, pageCount, renderer },
    ];
    edit.status = DocumentEditStatus.PENDING_CUSTOMER;
    await repos.documentEdit().save(edit);

    const job = edit.printJob;
    job.editedDocumentUrl = file.url;
    job.status = PrintJobStatus.EDIT_COMPLETE;
    await repos.printJob().save(job);

    session.status = EditorSessionStatus.COMPLETED;
    session.lastActivityAt = new Date();
    await repos.editorSession().save(session);

    await notificationQueue.add('edit-complete', {
      userId: job.userId,
      printJobId: job.id,
      editId: edit.id,
      editedDocumentUrl: file.url,
      shopName,
      totalEditFee: edit.totalEditFee,
    });

    return { documentUrl: file.url, pageCount, fileSize: pdf.length, renderer };
  }
}

export const editorExportService = new EditorExportService();
