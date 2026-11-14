import { MigrationInterface, QueryRunner } from 'typeorm';

export class TenantCommissionOverride1721800000000 implements MigrationInterface {
  name = 'TenantCommissionOverride1721800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "tenants" ALTER COLUMN "commissionPct" DROP NOT NULL`);
    await queryRunner.query(`ALTER TABLE "tenants" ALTER COLUMN "commissionPct" DROP DEFAULT`);
    await queryRunner.query(`UPDATE "tenants" SET "commissionPct" = NULL`);
  }

  public async down(): Promise<void> {}
}
