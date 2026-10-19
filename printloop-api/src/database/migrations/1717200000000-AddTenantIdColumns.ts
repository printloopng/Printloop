import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTenantIdColumns1717200000000 implements MigrationInterface {
  name = 'AddTenantIdColumns1717200000000';

  private static readonly TABLES: string[] = [
    'users',
    'wallets',
    'kiosks',
    'print_jobs',
    'payments',
    'files',
    'pricing_configs',
    'promotions',
    'group_sessions',
    'audit_logs',
  ];

  private static readonly EXTRA_INDEXES: Array<{ name: string; sql: string }> = [
    {
      name: 'idx_print_job_tenant_status',
      sql: `CREATE INDEX IF NOT EXISTS "idx_print_job_tenant_status" ON "print_jobs" ("tenantId", "status")`,
    },
    {
      name: 'idx_audit_log_tenant_action',
      sql: `CREATE INDEX IF NOT EXISTS "idx_audit_log_tenant_action" ON "audit_logs" ("tenantId", "action")`,
    },
  ];

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const table of AddTenantIdColumns1717200000000.TABLES) {
      await this.addTenantIdIfMissing(queryRunner, table);
      await this.createTenantIndex(queryRunner, table);
    }
    for (const idx of AddTenantIdColumns1717200000000.EXTRA_INDEXES) {
      await queryRunner.query(idx.sql);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const idx of AddTenantIdColumns1717200000000.EXTRA_INDEXES) {
      await queryRunner.query(`DROP INDEX IF EXISTS "${idx.name}"`);
    }
    for (const table of AddTenantIdColumns1717200000000.TABLES) {
      await queryRunner.query(
        `DROP INDEX IF EXISTS "idx_${this.entityNameFromTable(table)}_tenant"`,
      );
    }
  }

  private async addTenantIdIfMissing(
    qr: QueryRunner,
    table: string,
  ): Promise<void> {
    const rows: Array<{ name: string }> = await qr.query(
      `PRAGMA table_info("${table}")`,
    );
    if (!rows.some((r) => r.name === 'tenantId')) {
      await qr.query(
        `ALTER TABLE "${table}" ADD COLUMN "tenantId" varchar`,
      );
    }
  }

  private async createTenantIndex(
    qr: QueryRunner,
    table: string,
  ): Promise<void> {
    const indexName = `idx_${this.entityNameFromTable(table)}_tenant`;
    await qr.query(
      `CREATE INDEX IF NOT EXISTS "${indexName}" ON "${table}" ("tenantId")`,
    );
  }

  private entityNameFromTable(table: string): string {
    const map: Record<string, string> = {
      users: 'user',
      wallets: 'wallet',
      kiosks: 'kiosk',
      print_jobs: 'print_job',
      payments: 'payment',
      files: 'file',
      pricing_configs: 'pricing',
      promotions: 'promotion',
      group_sessions: 'group_session',
      audit_logs: 'audit_log',
    };
    return map[table] ?? table;
  }
}
