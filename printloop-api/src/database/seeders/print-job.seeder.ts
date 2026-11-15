import { DataSource } from "typeorm";
import { faker } from "@faker-js/faker";
import { PrintJob, PrintJobStatus } from "@/database/entities/printJob.entity";
import { Payment } from "@/database/entities/payment.entity";
import { Kiosk } from "@/database/entities/kiosk.entity";
import { Tenant } from "@/database/entities/tenant.entity";
import { User } from "@/database/entities/user.entity";

const RELEASE_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function releaseCode(length = 6): string {
  return faker.string.fromCharacters(RELEASE_CODE_ALPHABET, length);
}

const STATUS_POOL = [
  PrintJobStatus.DONE,
  PrintJobStatus.DONE,
  PrintJobStatus.READY,
  PrintJobStatus.FAILED
];

export class PrintJobSeeder {
  public async run(
    dataSource: DataSource,
    shop: Tenant,
    students: User[],
    kiosks: Kiosk[]
  ): Promise<{ jobs: PrintJob[]; payments: Payment[] }> {
    const jobRepo = dataSource.getRepository(PrintJob);
    const paymentRepo = dataSource.getRepository(Payment);
    const jobs: PrintJob[] = [];
    const payments: Payment[] = [];

    for (let daysAgo = 29; daysAgo >= 0; daysAgo--) {
      const when = new Date();
      when.setDate(when.getDate() - daysAgo);
      const jobsThatDay = 1 + ((daysAgo * 7) % 4);

      for (let n = 0; n < jobsThatDay; n++) {
        const pages = 2 + ((daysAgo + n) % 18);
        const cost = pages * 5;
        const status = STATUS_POOL[(daysAgo + n) % STATUS_POOL.length]!;
        const kiosk = kiosks[(daysAgo + n) % kiosks.length]!;
        const student = faker.helpers.arrayElement(students);

        const job = await jobRepo.save(
          jobRepo.create({
            tenantId: shop.id,
            userId: student.id,
            fileName: `Document ${daysAgo}-${n}.pdf`,
            code: releaseCode(),
            cost,
            totalPages: pages,
            jobType: "single",
            status,
            printConfiguration: {
              copies: 1,
              paper: "A4",
              color: "bw",
              sided: "single",
              qualityDpi: 300
            },
            kioskId: kiosk.id,
            printerId: kiosk.id,
            expiresAt: new Date(when.getTime() + 24 * 3600 * 1000),
            completedAt: status === PrintJobStatus.DONE ? when : (null as any)
          })
        );
        await jobRepo.update({ id: job.id }, { createdAt: when, updatedAt: when });
        jobs.push(job);

        if (status === PrintJobStatus.DONE) {
          const payment = await paymentRepo.save(
            paymentRepo.create({
              tenantId: shop.id,
              userId: student.id,
              amount: cost,
              status: "SUCCESS",
              method: "card",
              reference: job.code || "",
              description: job.fileName
            } as any) as any
          );
          await paymentRepo.update({ id: payment.id }, { createdAt: when, updatedAt: when } as any);
          payments.push(payment);
        }
      }
    }

    return { jobs, payments };
  }
}
