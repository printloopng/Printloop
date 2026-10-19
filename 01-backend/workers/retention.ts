import fs from 'node:fs';
import path from 'node:path';
import { In, LessThan } from 'typeorm';
import { AppDataSource } from '../config/database';
import { PrintJob, PrintJobStatus } from '../entities/printJob.entity';
import { PrintJobItem } from '../entities/printJobItem.entity';
import { File } from '../entities/file.entity';
import { SystemSetting } from '../entities/systemSetting.entity';
import { UPLOAD_DIR } from '../utils/fileStore';

const TERMINAL_STATUSES = [
  PrintJobStatus.DONE,
  PrintJobStatus.FAILED,
  PrintJobStatus.EXPIRED,
  PrintJobStatus.REFUNDED,
];

const DEFAULT_RETENTION_HOURS = 24;

async function getRetentionHours(): Promise<number> {
  try {
    const row = await AppDataSource.getRepository(SystemSetting).findOne({
      where: { key: 'documentRetentionHours' },
    });
    const n = Number(row?.value);
    if (Number.isFinite(n) && n > 0) return n;
  } catch {
  }
  const envN = Number(process.env.DOCUMENT_RETENTION_HOURS);
  return Number.isFinite(envN) && envN > 0 ? envN : DEFAULT_RETENTION_HOURS;
}

function diskPathFor(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = url.match(/\/api\/files\/([^/?#]+)/);
  if (!m) return null;
  return path.join(UPLOAD_DIR, decodeURIComponent(m[1]));
}

function unlinkIfExists(p: string): boolean {
  try {
    if (fs.existsSync(p)) {
      fs.unlinkSync(p);
      return true;
    }
  } catch (err) {
    console.warn('[retention] failed to unlink', p, err);
  }
  return false;
}

export async function runRetentionSweep(): Promise<void> {
  try {
    const hours = await getRetentionHours();
    const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);

    const jobs = await AppDataSource.getRepository(PrintJob).find({
      where: { status: In(TERMINAL_STATUSES), updatedAt: LessThan(cutoff) },
      select: ['id', 'fileId'],
    });
    if (jobs.length === 0) return;

    const jobIds = jobs.map((j) => j.id);
    const fileIds = new Set<string>();
    for (const j of jobs) if (j.fileId) fileIds.add(j.fileId);

    const items = await AppDataSource.getRepository(PrintJobItem).find({
      where: { printJobId: In(jobIds) },
      select: ['fileId'],
    });
    for (const it of items) if (it.fileId) fileIds.add(it.fileId);

    if (fileIds.size === 0) return;

    const files = await AppDataSource.getRepository(File).find({
      where: { id: In([...fileIds]) },
      select: ['id', 'fileURL', 'watermarkedUrl'],
    });

    let removed = 0;
    for (const f of files) {
      for (const p of [diskPathFor(f.fileURL), diskPathFor(f.watermarkedUrl)]) {
        if (p && unlinkIfExists(p)) removed++;
      }
    }

    if (removed > 0) {
      console.log(
        `[retention] removed ${removed} expired file(s) across ${jobs.length} terminal job(s) (retention ${hours}h).`,
      );
    }
  } catch (err) {
    console.warn('[retention] sweep failed:', err);
  }
}

export function startRetentionSweep(): void {
  const HOUR = 60 * 60 * 1000;
  setTimeout(() => {
    void runRetentionSweep();
    setInterval(() => void runRetentionSweep(), HOUR).unref();
  }, 30_000).unref();
}
