import { MigrationInterface, QueryRunner } from 'typeorm';

export class NullablePaymentUser1721600000000 implements MigrationInterface {
    name = 'NullablePaymentUser1721600000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        if (queryRunner.connection.options.type === 'postgres') {
            await queryRunner.query(`ALTER TABLE "payments" ALTER COLUMN "userId" DROP NOT NULL`);
            return;
        }
        if (queryRunner.connection.options.type !== 'sqlite') return;

        const [table]: Array<{ sql: string }> = await queryRunner.query(
            `SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'payments'`,
        );
        if (!table) return;
        const sql = table.sql.replace(/"userId"\s+(varchar|text|uuid)(\(\d+\))?\s+NOT\s+NULL/i, (_m, type, len) => `"userId" ${type}${len ?? ''}`);
        if (sql === table.sql) return;

        const [{ schema_version: version }] = await queryRunner.query(`PRAGMA schema_version`);
        await queryRunner.query(`PRAGMA writable_schema = ON`);
        await queryRunner.query(`UPDATE sqlite_master SET sql = ? WHERE type = 'table' AND name = 'payments'`, [sql]);
        await queryRunner.query(`PRAGMA schema_version = ${Number(version) + 1}`);
        await queryRunner.query(`PRAGMA writable_schema = OFF`);
    }

    public async down(): Promise<void> {}
}
