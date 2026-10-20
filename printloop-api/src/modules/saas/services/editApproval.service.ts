import { DataSource } from 'typeorm';
import { DocumentEdit, DocumentEditStatus } from '@/database/entities/documentEdit.entity';
import { PrintJob, PrintJobStatus } from '@/database/entities/printJob.entity';
import { File } from '@/database/entities/file.entity';
import { loadDocumentBytes } from '@/core/utils/fileStore';
import { countPages } from '@/modules/public/services/documentConvert.service';
import { computeCost } from '@/modules/public/services/pricing.service';
import { notificationQueue } from '@/workers/queues';

export type ApprovalResult =
  | { ok: true; printJobId: string; amountDue: number; pageCount: number }
  | { ok: false; status: number; message: string };

export async function approveEdit(
  ds: DataSource,
  edit: DocumentEdit,
  user: { id: string; firstName?: string; lastName?: string },
): Promise<ApprovalResult> {
  if (edit.status !== DocumentEditStatus.PENDING_CUSTOMER || !edit.editedDocumentUrl) {
    return { ok: false, status: 409, message: `Edit job is ${edit.status}, cannot approve` };
  }
  const bytes = await loadDocumentBytes(edit.editedDocumentUrl);
  if (!bytes) {
    return { ok: false, status: 409, message: 'The edited document is no longer available. Ask the shop to upload it again.' };
  }
  const job = edit.printJob;
  const pageCount = await countPages(bytes, 'edited.pdf');
  const fileRepo = ds.getRepository(File);
  const original = job.fileId ? await fileRepo.findOne({ where: { id: job.fileId } }) : null;
  const editedFile = await fileRepo.save(
    fileRepo.create({
      tenantId: job.tenantId,
      fileName: `edited-${original?.fileName || job.fileName || 'document.pdf'}`.slice(0, 255),
      mimeType: 'application/pdf',
      sizeBytes: bytes.length,
      fileURL: edit.editedDocumentUrl,
      pageCount,
    }),
  );
  const cfg: any = job.printConfiguration || {};
  const printCost = await computeCost({
    tenantId: job.tenantId,
    pageCount,
    copies: cfg.copies || 1,
    paper: cfg.paper || 'A4',
    color: cfg.color === 'color' ? 'color' : 'bw',
    sided: cfg.sided === 'double' ? 'double' : 'single',
    qualityDpi: cfg.qualityDpi || 300,
  });

  edit.status = DocumentEditStatus.APPROVED;
  edit.approvedBy = user.id;
  edit.approvedAt = new Date();
  await ds.getRepository(DocumentEdit).save(edit);

  job.fileId = editedFile.id;
  job.totalPages = pageCount;
  job.cost = Math.round((Number(printCost) + (Number(edit.totalEditFee) || 0)) * 100) / 100;
  job.status = PrintJobStatus.PENDING;
  job.renderedKey = null;
  job.renderedPdfUrl = null;
  await ds.getRepository(PrintJob).save(job);

  await notificationQueue.add('edit-approved', {
    shopId: edit.shopId,
    printJobId: job.id,
    editId: edit.id,
    customerName: `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || 'Customer',
  });
  return { ok: true, printJobId: job.id, amountDue: Number(job.cost), pageCount };
}
