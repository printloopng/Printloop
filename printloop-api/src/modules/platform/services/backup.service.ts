import path from 'node:path';
import fs from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { Config } from '@/config';
import {
  S3Client,
  PutObjectCommand,
} from '@aws-sdk/client-s3';

const execFileP = promisify(execFile);

const dirname = __dirname;

const hasBackupS3 = Boolean(
  Config.backup.s3.endpoint &&
  Config.backup.s3.bucket &&
  Config.backup.s3.accessKeyId &&
  Config.backup.s3.secretAccessKey,
);

let backupS3Client: S3Client | null = null;
if (hasBackupS3) {
  backupS3Client = new S3Client({
    endpoint: Config.backup.s3.endpoint,
    region: Config.backup.s3.region,
    credentials: {
      accessKeyId: Config.backup.s3.accessKeyId,
      secretAccessKey: Config.backup.s3.secretAccessKey,
    },
    forcePathStyle: Config.backup.s3.forcePathStyle,
  });
}

export interface BackupResult {
  driver: 'postgres';
  path: string;
  sizeBytes: number;
  kept: number;
  timestamp: string;
  s3Url?: string;
}

function backupDir(): string {
  return Config.backup.dir || path.resolve(dirname, '../data/backups');
}

function keepCount(): number {
  return Config.backup.keep;
}

function stamp(): string {
  return new Date()
    .toISOString()
    .replace(/[:.]/g, '-')
    .replace('T', '_')
    .slice(0, -1);
}

async function postgresBackup(): Promise<string> {
  const dir = backupDir();
  await fs.mkdir(dir, { recursive: true });
  const out = path.join(dir, `printloop-backup-${stamp()}.dump`);
  await execFileP('pg_dump', ['--dbname', Config.database.url, '--format=c', '--file', out], {
    timeout: 15 * 60 * 1000,
  });
  return out;
}

async function prune(dir: string, keep: number): Promise<number> {
  let entries: string[];
  try {
    entries = await fs.readdir(dir);
  } catch {
    return 0;
  }
  const backups = entries.filter((f) => f.startsWith('printloop-backup-'));
  backups.sort();
  const removed = backups.slice(0, Math.max(0, backups.length - keep));
  await Promise.all(removed.map((f) => fs.rm(path.join(dir, f), { force: true })));
  return backups.length - removed.length;
}

async function uploadToS3(localPath: string, key: string): Promise<string | null> {
  if (!hasBackupS3 || !backupS3Client) return null;
  try {
    const fileStream = await fs.open(localPath, 'r');
    const stat = await fileStream.stat();
    await backupS3Client!.send(
      new PutObjectCommand({
        Bucket: Config.backup.s3.bucket,
        Key: key,
        Body: fileStream.createReadStream(),
        ContentLength: stat.size,
      }),
    );
    await fileStream.close();
    const publicBase = Config.backup.s3.publicUrl || Config.backup.s3.endpoint;
    return `${publicBase}/${Config.backup.s3.bucket}/${encodeURIComponent(key)}`;
  } catch (err) {
    console.error('[Backup] S3 upload failed:', err);
    return null;
  }
}

export async function runDatabaseBackup(): Promise<BackupResult> {
  const driver = 'postgres';
  const out = await postgresBackup();
  const stat = await fs.stat(out);
  const kept = await prune(path.dirname(out), keepCount());

  const s3Key = `backups/${path.basename(out)}`;
  const s3Url = await uploadToS3(out, s3Key);

  const result: BackupResult = {
    driver,
    path: out,
    sizeBytes: stat.size,
    kept,
    timestamp: new Date().toISOString(),
    s3Url: s3Url || undefined,
  };
  console.log(
    `[Backup] ${driver} backup OK → ${out} (${(stat.size / 1024).toFixed(1)} KB, keeping ${kept})` +
      (s3Url ? ` → S3: ${s3Url}` : ''),
  );
  return result;
}