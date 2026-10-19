import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserTotp1718200000000 implements MigrationInterface {
  name = 'AddUserTotp1718200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (queryRunner.connection.options.type === 'postgres') return;
    await this.addColumnIfMissing(
      queryRunner,
      'users',
      'totpSecret',
      `ALTER TABLE "users" ADD COLUMN "totpSecret" varchar(64)`,
    );
    await this.addColumnIfMissing(
      queryRunner,
      'users',
      'totpEnabled',
      `ALTER TABLE "users" ADD COLUMN "totpEnabled" boolean NOT NULL DEFAULT (0)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    void queryRunner;
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
