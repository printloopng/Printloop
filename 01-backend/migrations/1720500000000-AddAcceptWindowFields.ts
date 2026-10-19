import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAcceptWindowFields1720500000000 implements MigrationInterface {
  name = 'AddAcceptWindowFields1720500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (queryRunner.connection.options.type === 'postgres') {
      await queryRunner.query(
        `ALTER TABLE "print_jobs" ADD COLUMN IF NOT EXISTS "requiresAccept" boolean NOT NULL DEFAULT false`,
      );
      await queryRunner.query(
        `ALTER TABLE "print_jobs" ADD COLUMN IF NOT EXISTS "reroutedFromTenantId" uuid`,
      );
      return;
    }

    await queryRunner.query(`PRAGMA foreign_keys = OFF`);
    try {
      await queryRunner.query(`
        CREATE TABLE "print_jobs_new" (
          "id" varchar PRIMARY KEY NOT NULL,
          "tenantId" varchar NOT NULL,
          "userId" varchar,
          "fileId" varchar,
          "fileName" varchar(255),
          "code" varchar(10),
          "paymentReference" varchar(255),
          "cost" decimal(10,2) NOT NULL,
          "finalCost" decimal(10,2),
          "costReconciledAt" datetime,
          "totalPages" integer NOT NULL DEFAULT (0),
          "jobType" varchar(20),
          "status" varchar CHECK( "status" IN ('pending','rendering','awaiting_accept','ready','releasing','printing','done','failed','expired','refunded') ) NOT NULL DEFAULT ('ready'),
          "printConfiguration" text NOT NULL,
          "kioskId" varchar,
          "printerId" varchar,
          "printerName" varchar(255),
          "groupSessionId" varchar,
          "watermarkId" varchar(50),
          "pagesCompleted" integer NOT NULL DEFAULT (0),
          "idempotencyKey" varchar(128),
          "expiresAt" datetime,
          "completedAt" datetime,
          "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
          "updatedAt" datetime NOT NULL DEFAULT (datetime('now')),
          "printerProfileId" varchar,
          "requiresAccept" boolean NOT NULL DEFAULT 0,
          "reroutedFromTenantId" varchar,
          "agentConfirmation" varchar(64),
          "renderedKey" varchar(255),
          "renderedPdfUrl" varchar(255),
          "previewImageUrls" text,
          "renderingStatus" varchar(20) NOT NULL DEFAULT 'pending',
          "renderingError" text,
          "renderingStartedAt" datetime,
          "renderingCompletedAt" datetime,
          CONSTRAINT "UQ_print_jobs_code" UNIQUE ("code")
        )
      `);

      await queryRunner.query(`
        INSERT INTO "print_jobs_new" (
          "id","tenantId","userId","fileId","fileName","code",
          "paymentReference","cost","finalCost","costReconciledAt",
          "totalPages","jobType","status","printConfiguration","kioskId",
          "printerId","printerName","groupSessionId","watermarkId",
          "pagesCompleted","idempotencyKey","expiresAt","completedAt",
          "createdAt","updatedAt","printerProfileId",
          "requiresAccept","reroutedFromTenantId","agentConfirmation",
          "renderedKey","renderedPdfUrl","previewImageUrls",
          "renderingStatus","renderingError","renderingStartedAt",
          "renderingCompletedAt"
        )
        SELECT
          "id","tenantId","userId","fileId","fileName","code",
          "paymentReference","cost","finalCost","costReconciledAt",
          "totalPages","jobType","status","printConfiguration","kioskId",
          "printerId","printerName","groupSessionId","watermarkId",
          "pagesCompleted","idempotencyKey","expiresAt","completedAt",
          "createdAt","updatedAt","printerProfileId",
          "requiresAccept","reroutedFromTenantId","agentConfirmation",
          "renderedKey","renderedPdfUrl","previewImageUrls",
          "renderingStatus","renderingError","renderingStartedAt",
          "renderingCompletedAt"
        FROM "print_jobs"
      `);

      await queryRunner.query(`DROP TABLE "print_jobs"`);
      await queryRunner.query(
        `ALTER TABLE "print_jobs_new" RENAME TO "print_jobs"`,
      );

      await queryRunner.query(
        `CREATE UNIQUE INDEX IF NOT EXISTS "print_jobs_user_idem_uniq" ON "print_jobs" ("userId", "idempotencyKey") WHERE "idempotencyKey" IS NOT NULL`,
      );
      await queryRunner.query(
        `CREATE INDEX IF NOT EXISTS "idx_print_job_tenant" ON "print_jobs" ("tenantId")`,
      );
      await queryRunner.query(
        `CREATE INDEX IF NOT EXISTS "idx_print_job_tenant_status" ON "print_jobs" ("tenantId", "status")`,
      );
      await queryRunner.query(
        `CREATE INDEX IF NOT EXISTS "idx_print_job_code" ON "print_jobs" ("code")`,
      );
    } finally {
      await queryRunner.query(`PRAGMA foreign_keys = ON`);
    }
  }

  public async down(): Promise<void> {
    throw new Error(
      'AddAcceptWindowFields is one-way: rolling back would reject any ' +
        'existing rows with status=\'awaiting_accept\'. Restore from backup.',
    );
  }
}