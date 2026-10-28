import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreatePrinterProfiles1720300000000 implements MigrationInterface {
  name = 'CreatePrinterProfiles1720300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const rows: Array<{ table_name: string }> = await queryRunner.query(
      `SELECT table_name FROM information_schema.tables WHERE table_name = 'printer_profiles'`,
    );
    if (rows.length === 0) {
      await queryRunner.query(`
        CREATE TABLE "printer_profiles" (
          "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
          "tenantId" uuid NOT NULL,
          "kioskId" uuid,
          "displayName" varchar(120) NOT NULL,
          "ippUri" varchar(500),
          "driverKind" varchar(20) NOT NULL DEFAULT ('unknown'),
          "capabilities" text NOT NULL,
          "isDefault" boolean NOT NULL DEFAULT false,
          "isActive" boolean NOT NULL DEFAULT true,
          "createdAt" timestamptz NOT NULL DEFAULT now(),
          "updatedAt" timestamptz NOT NULL DEFAULT now()
        )
      `);
      await queryRunner.query(
        `CREATE INDEX "idx_printer_profile_tenant" ON "printer_profiles" ("tenantId")`,
      );
    }
    const jobCols = await queryRunner.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'print_jobs' AND column_name = 'printerProfileId'
    `);
    if (jobCols.length === 0) {
      await queryRunner.query(
        `ALTER TABLE "print_jobs" ADD COLUMN "printerProfileId" uuid`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    void queryRunner;
  }
}
