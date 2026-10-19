import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddKioskTestPrintPassedAt1718400000000
  implements MigrationInterface
{
  name = 'AddKioskTestPrintPassedAt1718400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (queryRunner.connection.options.type === 'postgres') return;
    const rows: Array<{ name: string }> = await queryRunner.query(
      `PRAGMA table_info("kiosks")`,
    );
    if (!rows.some((r) => r.name === 'testPrintPassedAt')) {
      await queryRunner.query(
        `ALTER TABLE "kiosks" ADD COLUMN "testPrintPassedAt" datetime`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    void queryRunner;
  }
}
