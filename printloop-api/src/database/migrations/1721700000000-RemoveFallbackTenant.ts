import { MigrationInterface, QueryRunner } from 'typeorm';

const NULLABLE_TABLES = ['users', 'wallets', 'blog_posts'];
const SETUP_TABLES = new Set([
  'tenant_members',
  'payout_schedules',
  'tenant_branding',
  'tenant_brandings',
  'edit_pricing_configs',
  'printer_profiles',
  'pricing_configs',
  'promotions',
  'audit_logs',
  'tenant_domains',
  'tenant_webhooks',
]);
const DEMO_SHOP = { slug: 'campus-print', name: 'Campus Print Hub' };

export class RemoveFallbackTenant1721700000000 implements MigrationInterface {
  name = 'RemoveFallbackTenant1721700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const postgres = queryRunner.connection.options.type === 'postgres';
    for (const table of NULLABLE_TABLES) {
      if (postgres) {
        await queryRunner.query(`ALTER TABLE "${table}" ALTER COLUMN "tenantId" DROP NOT NULL`);
      } else {
        await this.relaxSqlite(queryRunner, table);
      }
    }

    const p = (i: number) => (postgres ? `$${i}` : '?');
    const [fallback] = await queryRunner.query(`SELECT "id" FROM "tenants" WHERE "slug" = ${p(1)}`, ['legacy']);
    if (!fallback) return;
    const id: string = fallback.id;

    await queryRunner.query(`UPDATE "blog_posts" SET "tenantId" = NULL WHERE "tenantId" = ${p(1)}`, [id]);
    await queryRunner.query(
      `DELETE FROM "tenant_members" WHERE "tenantId" = ${p(1)} AND "userId" IN (SELECT "id" FROM "users" WHERE "role" = 'super_admin')`,
      [id],
    );
    await queryRunner.query(
      `UPDATE "users" SET "tenantId" = NULL WHERE "tenantId" = ${p(1)} AND "role" IN ('user', 'super_admin')`,
      [id],
    );
    await queryRunner.query(
      `UPDATE "wallets" SET "tenantId" = NULL WHERE "tenantId" = ${p(1)} AND "userId" IN (SELECT "id" FROM "users" WHERE "tenantId" IS NULL)`,
      [id],
    );

    const tables = await this.tenantTables(queryRunner, postgres);
    let activity = 0;
    for (const table of tables) {
      if (SETUP_TABLES.has(table)) continue;
      const [{ n }] = await queryRunner.query(`SELECT COUNT(*) AS n FROM "${table}" WHERE "tenantId" = ${p(1)}`, [id]);
      activity += Number(n);
    }

    if (activity === 0) {
      for (const table of tables) {
        await queryRunner.query(`DELETE FROM "${table}" WHERE "tenantId" = ${p(1)}`, [id]);
      }
      await queryRunner.query(`DELETE FROM "tenants" WHERE "id" = ${p(1)}`, [id]);
      return;
    }

    const [taken] = await queryRunner.query(`SELECT "id" FROM "tenants" WHERE "slug" = ${p(1)}`, [DEMO_SHOP.slug]);
    const slug = taken ? `${DEMO_SHOP.slug}-${id.slice(0, 6)}` : DEMO_SHOP.slug;
    await queryRunner.query(`UPDATE "tenants" SET "slug" = ${p(1)}, "name" = ${p(2)} WHERE "id" = ${p(3)}`, [slug, DEMO_SHOP.name, id]);
  }

  public async down(): Promise<void> {}

  private async tenantTables(queryRunner: QueryRunner, postgres: boolean): Promise<string[]> {
    if (postgres) {
      const rows: Array<{ table_name: string }> = await queryRunner.query(
        `SELECT table_name FROM information_schema.columns WHERE table_schema = current_schema() AND column_name = 'tenantId'`,
      );
      return rows.map((r) => r.table_name);
    }
    const rows: Array<{ name: string }> = await queryRunner.query(`SELECT name FROM sqlite_master WHERE type = 'table'`);
    const out: string[] = [];
    for (const { name } of rows) {
      const cols: Array<{ name: string }> = await queryRunner.query(`PRAGMA table_info("${name}")`);
      if (cols.some((c) => c.name === 'tenantId')) out.push(name);
    }
    return out;
  }

  private async relaxSqlite(queryRunner: QueryRunner, table: string): Promise<void> {
    const [row]: Array<{ sql: string }> = await queryRunner.query(
      `SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?`,
      [table],
    );
    if (!row) return;
    const sql = row.sql.replace(/"tenantId"\s+(varchar|text|uuid)(\(\d+\))?\s+NOT\s+NULL/i, (_m, type, len) => `"tenantId" ${type}${len ?? ''}`);
    if (sql === row.sql) return;
    const [{ schema_version: version }] = await queryRunner.query(`PRAGMA schema_version`);
    await queryRunner.query(`PRAGMA writable_schema = ON`);
    await queryRunner.query(`UPDATE sqlite_master SET sql = ? WHERE type = 'table' AND name = ?`, [sql, table]);
    await queryRunner.query(`PRAGMA schema_version = ${Number(version) + 1}`);
    await queryRunner.query(`PRAGMA writable_schema = OFF`);
  }
}
