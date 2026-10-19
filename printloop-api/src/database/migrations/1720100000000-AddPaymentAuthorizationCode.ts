import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPaymentAuthorizationCode1720100000000 implements MigrationInterface {
  name = 'AddPaymentAuthorizationCode1720100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (queryRunner.connection.options.type === 'sqlite') {
      const rows: Array<{ name: string }> = await queryRunner.query(
        `PRAGMA table_info("payments")`,
      );
      if (!rows.some((r) => r.name === 'authorizationCode')) {
        await queryRunner.query(
          `ALTER TABLE "payments" ADD COLUMN "authorizationCode" varchar(120)`,
        );
      }
    }

    if (queryRunner.connection.options.type === 'postgres') {
      const checkCol = await queryRunner.query(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_name = 'payments' AND column_name = 'authorizationCode'
      `);
      if (checkCol.length === 0) {
        await queryRunner.query(
          `ALTER TABLE "payments" ADD COLUMN "authorizationCode" varchar(120)`,
        );
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    void queryRunner;
  }
}
