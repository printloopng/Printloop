import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddKioskLastOfflineAlertAt1718800000000 implements MigrationInterface {
  name = 'AddKioskLastOfflineAlertAt1718800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "kiosks"
      ADD COLUMN IF NOT EXISTS "lastOfflineAlertAt" TIMESTAMPTZ DEFAULT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "kiosks" DROP COLUMN IF EXISTS "lastOfflineAlertAt"`,
    );
  }
}
