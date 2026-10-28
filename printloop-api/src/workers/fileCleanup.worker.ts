import { Config } from '@/config';
import { Worker, Job } from 'bullmq';
import { destroyCloudinaryDocument } from '@/core/utils/fileStore';
import { AppDataSource } from '@/config/data-source';
import { File } from '@/database/entities/file.entity';
import { PrintJob, PrintJobStatus } from '@/database/entities/printJob.entity';

const redisConnection = {
  host: Config.redis.host,
  port: Config.redis.port,
  password: Config.redis.password || undefined,
};

interface FileCleanupJobData {
  printJobId: string;
  fileIds: string[];
}

export const fileCleanupWorker = new Worker<FileCleanupJobData>(
  'file-cleanup',
  async (job: Job<FileCleanupJobData>) => {
    const { printJobId, fileIds } = job.data;

    console.log(`[FileCleanup] Starting for print job ${printJobId}`);

    const fileRepo = AppDataSource.getRepository(File);
    const printJobRepo = AppDataSource.getRepository(PrintJob);

    const printJob = await printJobRepo.findOne({ where: { id: printJobId } });
    if (!printJob) {
      console.warn(`[FileCleanup] Print job ${printJobId} not found, skipping`);
      return { skipped: true, reason: 'job_not_found' };
    }

    if (printJob.status !== PrintJobStatus.DONE) {
      console.warn(`[FileCleanup] Print job ${printJobId} status is ${printJob.status}, not done. Skipping.`);
      return { skipped: true, reason: 'not_completed' };
    }

    const results = await Promise.allSettled(
      fileIds.map(async (fileId) => {
        const file = await fileRepo.findOne({ where: { id: fileId } });
        if (!file || !file.fileURL) {
          return { fileId, status: 'skipped' };
        }

        await destroyCloudinaryDocument(file.fileURL);

        const watermarkedUrl = (file as any).watermarkedUrl;
        if (watermarkedUrl) {
          await destroyCloudinaryDocument(watermarkedUrl);
        }

        await fileRepo.update(fileId, {
          fileURL: null as any,
          ...({ watermarkedUrl: null } as any),
          ...({ deletedAt: new Date() } as any),
        });

        return { fileId, status: 'deleted' };
      })
    );

    const deleted = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;

    console.log(`[FileCleanup] Completed for ${printJobId}: ${deleted} deleted, ${failed} failed`);

    return { printJobId, deleted, failed };
  },
  { connection: redisConnection, concurrency: 10 }
);

fileCleanupWorker.on('completed', (job) => {
  console.log(`[FileCleanup] Job ${job.id} completed`);
});

fileCleanupWorker.on('failed', (job, err) => {
  console.error(`[FileCleanup] Job ${job?.id} failed:`, err);
});
