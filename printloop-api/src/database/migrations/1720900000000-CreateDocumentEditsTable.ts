import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateDocumentEditsTable1720900000000 implements MigrationInterface {
    name = 'CreateDocumentEditsTable1720900000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        if (queryRunner.connection.options.type === 'postgres') {
            await queryRunner.query(`
                CREATE TABLE IF NOT EXISTS "document_edits" (
                    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                    "printJobId" uuid NOT NULL REFERENCES "print_jobs"("id") ON DELETE CASCADE,
                    "shopId" uuid NOT NULL,
                    "tenantId" uuid NOT NULL,
                    "editedBy" uuid,
                    "editOperations" text NOT NULL DEFAULT '[]',
                    "originalDocumentMeta" text,
                    "editedDocumentMeta" text,
                    "editedDocumentUrl" varchar(500),
                    "baseEditFee" numeric(10,2) NOT NULL DEFAULT 0,
                    "perPageFee" numeric(10,2) NOT NULL DEFAULT 0,
                    "complexityFee" numeric(10,2) NOT NULL DEFAULT 0,
                    "shopAdjustedFee" numeric(10,2) NOT NULL DEFAULT 0,
                    "totalEditFee" numeric(10,2) NOT NULL DEFAULT 0,
                    "status" varchar NOT NULL DEFAULT 'pending_shop',
                    "shopNotes" text,
                    "customerRejectionReason" text,
                    "approvedBy" uuid,
                    "approvedAt" timestamptz,
                    "completedAt" timestamptz,
                    "createdAt" timestamptz NOT NULL DEFAULT now(),
                    "updatedAt" timestamptz NOT NULL DEFAULT now()
                )
            `);
            await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_document_edit_job" ON "document_edits" ("printJobId")`);
            await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_document_edit_shop" ON "document_edits" ("shopId")`);
            await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_document_edit_status" ON "document_edits" ("status")`);
            await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_document_edit_tenant" ON "document_edits" ("tenantId")`);
            return;
        }
        await queryRunner.query(`
            CREATE TABLE "document_edits" (
                "id" TEXT NOT NULL PRIMARY KEY,
                "printJobId" TEXT NOT NULL,
                "shopId" TEXT NOT NULL,
                "editedBy" TEXT NOT NULL,
                "editOperations" TEXT NOT NULL DEFAULT '[]',
                "originalDocumentMeta" TEXT,
                "editedDocumentMeta" TEXT,
                "baseEditFee" REAL NOT NULL DEFAULT 0,
                "perPageFee" REAL NOT NULL DEFAULT 0,
                "complexityFee" REAL NOT NULL DEFAULT 0,
                "shopAdjustedFee" REAL NOT NULL DEFAULT 0,
                "totalEditFee" REAL NOT NULL DEFAULT 0,
                "status" TEXT NOT NULL DEFAULT 'pending_shop',
                "shopNotes" TEXT,
                "customerRejectionReason" TEXT,
                "approvedBy" TEXT,
                "approvedAt" DATETIME,
                "completedAt" DATETIME,
                "createdAt" DATETIME NOT NULL DEFAULT (datetime('now')),
                "updatedAt" DATETIME NOT NULL DEFAULT (datetime('now'))
            )
        `);
        await queryRunner.query(`CREATE INDEX "idx_document_edit_job" ON "document_edits" ("printJobId")`);
        await queryRunner.query(`CREATE INDEX "idx_document_edit_shop" ON "document_edits" ("shopId")`);
        await queryRunner.query(`CREATE INDEX "idx_document_edit_status" ON "document_edits" ("status")`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "document_edits"`);
    }
}