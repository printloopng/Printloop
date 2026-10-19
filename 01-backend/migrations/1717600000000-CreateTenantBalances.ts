import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateTenantBalances1717600000000
  implements MigrationInterface
{
  name = 'CreateTenantBalances1717600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "tenant_balances" (
        "tenantId" varchar PRIMARY KEY NOT NULL,
        "lifetimeTenantNet" decimal(14,2) NOT NULL DEFAULT (0),
        "lifetimeCommission" decimal(14,2) NOT NULL DEFAULT (0),
        "lifetimePayouts" decimal(14,2) NOT NULL DEFAULT (0),
        "pendingPayouts" decimal(14,2) NOT NULL DEFAULT (0),
        "availableBalance" decimal(14,2) NOT NULL DEFAULT (0),
        "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
        "updatedAt" datetime NOT NULL DEFAULT (datetime('now')),
        CONSTRAINT "FK_tenant_balances_tenant" FOREIGN KEY ("tenantId") REFERENCES "tenants" ("id") ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "tenant_balances"`);
  }
}
