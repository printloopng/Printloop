import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTenantAvailability1720400000000 implements MigrationInterface {
  name = 'AddTenantAvailability1720400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const checkCol = await queryRunner.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'tenants' AND column_name = 'availability'
    `);
    if (checkCol.length === 0) {
      await queryRunner.query(
        `ALTER TABLE "tenants" ADD COLUMN "availability" varchar NOT NULL DEFAULT 'open'`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    void queryRunner;
  }
}
