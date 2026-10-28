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
    for (const table of NULLABLE_TABLES) {
      await queryRunner.query(`ALTER TABLE "${table}" ALTER COLUMN "tenantId" DROP NOT NULL`);
    }

    const [fallback] = await queryRunner.query(`SELECT "id" FROM "tenants" WHERE "slug" = $1`, ['legacy']);
    if (!fallback) return;
    const id: string = fallback.id;

    await queryRunner.query(`UPDATE "blog_posts" SET "tenantId" = NULL WHERE "tenantId" = $1`, [id]);
    await queryRunner.query(
      `DELETE FROM "tenant_members" WHERE "tenantId" = $1 AND "userId" IN (SELECT "id" FROM "users" WHERE "role" = 'super_admin')`,
      [id],
    );
    await queryRunner.query(
      `UPDATE "users" SET "tenantId" = NULL WHERE "tenantId" = $1 AND "role" IN ('user', 'super_admin')`,
      [id],
    );
    await queryRunner.query(
      `UPDATE "wallets" SET "tenantId" = NULL WHERE "tenantId" = $1 AND "userId" IN (SELECT "id" FROM "users" WHERE "tenantId" IS NULL)`,
      [id],
    );

    const tables = await this.tenantTables(queryRunner);
    let activity = 0;
    for (const table of tables) {
      if (SETUP_TABLES.has(table)) continue;
      const [{ n }] = await queryRunner.query(`SELECT COUNT(*) AS n FROM "${table}" WHERE "tenantId" = $1`, [id]);
      activity += Number(n);
    }

    if (activity === 0) {
      for (const table of tables) {
        await queryRunner.query(`DELETE FROM "${table}" WHERE "tenantId" = $1`, [id]);
      }
      await queryRunner.query(`DELETE FROM "tenants" WHERE "id" = $1`, [id]);
      return;
    }

    const [taken] = await queryRunner.query(`SELECT "id" FROM "tenants" WHERE "slug" = $1`, [DEMO_SHOP.slug]);
    const slug = taken ? `${DEMO_SHOP.slug}-${id.slice(0, 6)}` : DEMO_SHOP.slug;
    await queryRunner.query(`UPDATE "tenants" SET "slug" = $1, "name" = $2 WHERE "id" = $3`, [slug, DEMO_SHOP.name, id]);
  }

  public async down(): Promise<void> {}

  private async tenantTables(queryRunner: QueryRunner): Promise<string[]> {
    const rows: Array<{ table_name: string }> = await queryRunner.query(
      `SELECT table_name FROM information_schema.columns WHERE table_schema = current_schema() AND column_name = 'tenantId'`,
    );
    return rows.map((r) => r.table_name);
  }
}
