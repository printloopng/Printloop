import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPrintJobFinalCost1720000000000 implements MigrationInterface {
  name = 'AddPrintJobFinalCost1720000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const checkCol = await queryRunner.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'print_jobs' AND column_name = 'finalCost'
    `);
    if (checkCol.length === 0) {
      await queryRunner.query(`ALTER TABLE "print_jobs" ADD COLUMN "finalCost" decimal(10,2)`);
      await queryRunner.query(`ALTER TABLE "print_jobs" ADD COLUMN "costReconciledAt" timestamptz`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    void queryRunner;
  }
}
