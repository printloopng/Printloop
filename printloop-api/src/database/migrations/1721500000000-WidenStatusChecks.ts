import { MigrationInterface, QueryRunner } from 'typeorm';
import { PrintJobStatus } from '@/database/entities/printJob.entity';

export class WidenStatusChecks1721500000000 implements MigrationInterface {
    name = 'WidenStatusChecks1721500000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        if (queryRunner.connection.options.type === 'postgres') {
            await queryRunner.query(`ALTER TABLE "document_edits" ALTER COLUMN "editedBy" DROP NOT NULL`);
            return;
        }
        if (queryRunner.connection.options.type !== 'sqlite') return;

        const statuses = Object.values(PrintJobStatus).map((s) => `'${s}'`).join(',');
        const tables: Array<{ name: string; sql: string }> = await queryRunner.query(
            `SELECT name, sql FROM sqlite_master WHERE type = 'table' AND name IN ('print_jobs', 'document_edits')`,
        );
        const rewrites: Array<{ name: string; sql: string }> = [];
        for (const t of tables) {
            let sql = t.sql;
            if (t.name === 'print_jobs') {
                sql = sql.replace(/CHECK\s*\(\s*"status"\s+IN\s*\([^)]*\)\s*\)/i, `CHECK( "status" IN (${statuses}) )`);
            }
            if (t.name === 'document_edits') {
                sql = sql.replace(/"editedBy"\s+TEXT\s+NOT\s+NULL/i, '"editedBy" TEXT');
            }
            if (sql !== t.sql) rewrites.push({ name: t.name, sql });
        }
        if (!rewrites.length) return;

        const [{ schema_version: version }] = await queryRunner.query(`PRAGMA schema_version`);
        await queryRunner.query(`PRAGMA writable_schema = ON`);
        for (const r of rewrites) {
            await queryRunner.query(`UPDATE sqlite_master SET sql = ? WHERE type = 'table' AND name = ?`, [r.sql, r.name]);
        }
        await queryRunner.query(`PRAGMA schema_version = ${Number(version) + 1}`);
        await queryRunner.query(`PRAGMA writable_schema = OFF`);
    }

    public async down(): Promise<void> {}
}
