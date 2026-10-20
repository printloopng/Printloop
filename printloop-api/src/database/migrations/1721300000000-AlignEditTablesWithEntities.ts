import { MigrationInterface, QueryRunner } from 'typeorm';

const SESSION_COLUMNS: Array<[string, string]> = [
    ['id', 'id'],
    ['document_edit_id', 'documentEditId'],
    ['shop_user_id', 'shopUserId'],
    ['customer_user_id', 'customerUserId'],
    ['tenantId', 'tenantId'],
    ['univer_document', 'univerDocument'],
    ['permissions', 'permissions'],
    ['token_hash', 'tokenHash'],
    ['status', 'status'],
    ['webrtc_signaling', 'webrtcSignaling'],
    ['conversion_status', 'conversionStatus'],
    ['conversion_error', 'conversionError'],
    ['created_at', 'createdAt'],
    ['updated_at', 'updatedAt'],
    ['expires_at', 'expiresAt'],
    ['last_activity_at', 'lastActivityAt'],
];

export class AlignEditTablesWithEntities1721300000000 implements MigrationInterface {
    name = 'AlignEditTablesWithEntities1721300000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        if (queryRunner.connection.options.type !== 'sqlite') return;

        const editCols: Array<{ name: string }> = await queryRunner.query(`PRAGMA table_info("document_edits")`);
        if (!editCols.some((c) => c.name === 'editedDocumentUrl')) {
            await queryRunner.query(`ALTER TABLE "document_edits" ADD COLUMN "editedDocumentUrl" varchar(500)`);
        }

        const sessionCols: Array<{ name: string }> = await queryRunner.query(`PRAGMA table_info("editor_sessions")`);
        if (!sessionCols.some((c) => c.name === 'document_edit_id')) return;

        await queryRunner.query(`
            CREATE TABLE "editor_sessions_aligned" (
                "id" TEXT NOT NULL PRIMARY KEY,
                "documentEditId" TEXT NOT NULL,
                "shopUserId" TEXT,
                "customerUserId" TEXT,
                "tenantId" TEXT NOT NULL DEFAULT '',
                "univerDocument" TEXT NOT NULL DEFAULT '{}',
                "permissions" TEXT NOT NULL DEFAULT '{"shop": "rw", "customer": "r"}',
                "tokenHash" TEXT NOT NULL,
                "status" TEXT NOT NULL DEFAULT 'active' CHECK ("status" IN ('active', 'expired', 'completed', 'abandoned', 'in_progress', 'pending_customer', 'approved', 'awaiting_payment')),
                "webrtcSignaling" TEXT NOT NULL DEFAULT '{}',
                "conversionStatus" TEXT NOT NULL DEFAULT 'pending' CHECK ("conversionStatus" IN ('pending', 'processing', 'completed', 'failed')),
                "conversionError" TEXT,
                "createdAt" DATETIME NOT NULL DEFAULT (datetime('now')),
                "updatedAt" DATETIME NOT NULL DEFAULT (datetime('now')),
                "expiresAt" DATETIME NOT NULL,
                "lastActivityAt" DATETIME NOT NULL DEFAULT (datetime('now')),
                FOREIGN KEY ("documentEditId") REFERENCES "document_edits"("id") ON DELETE CASCADE,
                FOREIGN KEY ("shopUserId") REFERENCES "users"("id") ON DELETE SET NULL,
                FOREIGN KEY ("customerUserId") REFERENCES "users"("id") ON DELETE SET NULL
            )
        `);
        const from = SESSION_COLUMNS.map(([oldName]) => `"${oldName}"`).join(', ');
        const to = SESSION_COLUMNS.map(([, newName]) => `"${newName}"`).join(', ');
        await queryRunner.query(`INSERT INTO "editor_sessions_aligned" (${to}) SELECT ${from} FROM "editor_sessions"`);
        await queryRunner.query(`DROP TABLE "editor_sessions"`);
        await queryRunner.query(`ALTER TABLE "editor_sessions_aligned" RENAME TO "editor_sessions"`);
        for (const [name, col] of [
            ['IDX_editor_sessions_document_edit', 'documentEditId'],
            ['IDX_editor_sessions_status', 'status'],
            ['IDX_editor_sessions_expires_at', 'expiresAt'],
            ['IDX_editor_sessions_shop_user', 'shopUserId'],
            ['IDX_editor_sessions_customer_user', 'customerUserId'],
            ['IDX_editor_sessions_tenant', 'tenantId'],
        ]) {
            await queryRunner.query(`CREATE INDEX IF NOT EXISTS "${name}" ON "editor_sessions" ("${col}")`);
        }
    }

    public async down(): Promise<void> {}
}
