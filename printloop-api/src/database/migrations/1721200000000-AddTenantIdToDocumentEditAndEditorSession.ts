import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTenantIdToDocumentEditAndEditorSession1721200000000 implements MigrationInterface {
    name = 'AddTenantIdToDocumentEditAndEditorSession1721200000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        if (queryRunner.connection.options.type === 'postgres') return;
        await queryRunner.query(
            'ALTER TABLE "document_edits" ADD COLUMN "tenantId" TEXT NOT NULL DEFAULT \'\''
        );

        await queryRunner.query(
            'UPDATE "document_edits" SET "tenantId" = (SELECT pj."tenantId" FROM "print_jobs" pj WHERE pj."id" = "document_edits"."printJobId")'
        );

        await queryRunner.query('CREATE INDEX "IDX_document_edit_tenant" ON "document_edits" ("tenantId")');

        await queryRunner.query('ALTER TABLE "editor_sessions" ADD COLUMN "tenantId" TEXT NOT NULL DEFAULT \'\'');

        await queryRunner.query(
            'UPDATE "editor_sessions" SET "tenantId" = (SELECT de."tenantId" FROM "document_edits" de WHERE de."id" = "editor_sessions"."document_edit_id")'
        );

        await queryRunner.query('CREATE INDEX "IDX_editor_sessions_tenant" ON "editor_sessions" ("tenantId")');
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query('DROP INDEX "IDX_editor_sessions_tenant"');

        await queryRunner.query('ALTER TABLE "editor_sessions" DROP COLUMN "tenantId"');

        await queryRunner.query('DROP INDEX "IDX_document_edit_tenant"');

        await queryRunner.query('ALTER TABLE "document_edits" DROP COLUMN "tenantId"');
    }
}