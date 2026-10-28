import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPrintJobRenderFields1718700000000 implements MigrationInterface {
  name = 'AddPrintJobRenderFields1718700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const checkCol = await queryRunner.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'print_jobs' AND column_name = 'renderedKey'
    `);
    if (checkCol.length === 0) {
      await queryRunner.query(`ALTER TABLE "print_jobs" ADD COLUMN "renderedKey" varchar(255)`);
      await queryRunner.query(`ALTER TABLE "print_jobs" ADD COLUMN "renderedPdfUrl" varchar(255)`);
      await queryRunner.query(`ALTER TABLE "print_jobs" ADD COLUMN "previewImageUrls" text`);
      await queryRunner.query(`ALTER TABLE "print_jobs" ADD COLUMN "renderingStatus" varchar(20) NOT NULL DEFAULT 'pending'`);
      await queryRunner.query(`ALTER TABLE "print_jobs" ADD COLUMN "renderingError" text`);
      await queryRunner.query(`ALTER TABLE "print_jobs" ADD COLUMN "renderingStartedAt" timestamptz`);
      await queryRunner.query(`ALTER TABLE "print_jobs" ADD COLUMN "renderingCompletedAt" timestamptz`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    void queryRunner;
  }
}
