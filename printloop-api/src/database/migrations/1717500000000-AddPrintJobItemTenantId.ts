import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPrintJobItemTenantId1717500000000
  implements MigrationInterface
{
  name = 'AddPrintJobItemTenantId1717500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await this.addColumnIfMissing(
      queryRunner,
      'print_job_items',
      'tenantId',
      `ALTER TABLE "print_job_items" ADD COLUMN "tenantId" varchar`,
    );

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_pji_tenant" ON "print_job_items" ("tenantId")`,
    );

    await queryRunner.query(`
      UPDATE "print_job_items"
         SET "tenantId" = (
           SELECT pj."tenantId"
             FROM "print_jobs" pj
            WHERE pj."id" = "print_job_items"."printJobId"
         )
       WHERE "tenantId" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_pji_tenant"`);
  }

  private async addColumnIfMissing(
    qr: QueryRunner,
    table: string,
    column: string,
    addSql: string,
  ): Promise<void> {
    const rows: Array<{ name: string }> = await qr.query(
      `PRAGMA table_info("${table}")`,
    );
    if (!rows.some((r) => r.name === column)) {
      await qr.query(addSql);
    }
  }
}
