import { Worker, Job } from 'bullmq';
import { v2 as cloudinary } from 'cloudinary';
import { AppDataSource } from '../config/database';
import { File } from '../entities/file.entity';
import { PrintJob, PrintJobStatus } from '../entities/printJob.entity';

const redisConnection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,
};

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

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

        const publicId = extractCloudinaryPublicId(file.fileURL);

        if (publicId) {
          await cloudinary.uploader.destroy(publicId, { resource_type: 'raw' });
        }

        const watermarkedUrl = (file as any).watermarkedUrl;
        if (watermarkedUrl) {
          const watermarkedPublicId = extractCloudinaryPublicId(watermarkedUrl);
          if (watermarkedPublicId) {
            await cloudinary.uploader.destroy(watermarkedPublicId, { resource_type: 'raw' });
          }
        }

        await fileRepo.update(fileId, {
          fileURL: null as any,
          ...({ watermarkedUrl: null } as any),
          ...({ deletedAt: new Date() } as any),
        });

        return { fileId, status: 'deleted', publicId };
      })
    );

    const deleted = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;

    console.log(`[FileCleanup] Completed for ${printJobId}: ${deleted} deleted, ${failed} failed`);

    return { printJobId, deleted, failed };
  },
  { connection: redisConnection, concurrency: 10 }
);

function extractCloudinaryPublicId(url: string): string | null {
  try {
    const match = url.match(/\/upload\/(?:v\d+\/)?(.+?)(?:\.\w+)?$/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

fileCleanupWorker.on('completed', (job) => {
  console.log(`[FileCleanup] Job ${job.id} completed`);
});

fileCleanupWorker.on('failed', (job, err) => {
  console.error(`[FileCleanup] Job ${job?.id} failed:`, err);
});
