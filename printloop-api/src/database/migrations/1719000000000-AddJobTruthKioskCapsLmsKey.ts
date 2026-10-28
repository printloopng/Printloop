import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddJobTruthKioskCapsLmsKey1719000000000 implements MigrationInterface {
  name = 'AddJobTruthKioskCapsLmsKey1719000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "kiosks" ADD COLUMN IF NOT EXISTS "capColor" boolean DEFAULT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "kiosks" ADD COLUMN IF NOT EXISTS "capDuplex" boolean DEFAULT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "kiosks" ADD COLUMN IF NOT EXISTS "capA3" boolean DEFAULT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "kiosks" ADD COLUMN IF NOT EXISTS "capMedia" text DEFAULT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "kiosks" ADD COLUMN IF NOT EXISTS "capUpdatedAt" TIMESTAMPTZ DEFAULT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "print_jobs" ADD COLUMN IF NOT EXISTS "agentConfirmation" varchar(64) DEFAULT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "lmsKey" varchar(64) DEFAULT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "kiosks" DROP COLUMN IF EXISTS "capColor"`);
    await queryRunner.query(`ALTER TABLE "kiosks" DROP COLUMN IF EXISTS "capDuplex"`);
    await queryRunner.query(`ALTER TABLE "kiosks" DROP COLUMN IF EXISTS "capA3"`);
    await queryRunner.query(`ALTER TABLE "kiosks" DROP COLUMN IF EXISTS "capMedia"`);
    await queryRunner.query(`ALTER TABLE "kiosks" DROP COLUMN IF EXISTS "capUpdatedAt"`);
    await queryRunner.query(
      `ALTER TABLE "print_jobs" DROP COLUMN IF EXISTS "agentConfirmation"`,
    );
    await queryRunner.query(`ALTER TABLE "tenants" DROP COLUMN IF EXISTS "lmsKey"`);
  }
}
