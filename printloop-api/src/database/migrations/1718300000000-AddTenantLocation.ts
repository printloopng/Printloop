import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTenantLocation1718300000000 implements MigrationInterface {
  name = 'AddTenantLocation1718300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (queryRunner.connection.options.type === 'postgres') return;
    await this.addColumnIfMissing(
      queryRunner,
      'tenants',
      'address',
      `ALTER TABLE "tenants" ADD COLUMN "address" varchar(255)`,
    );
    await this.addColumnIfMissing(
      queryRunner,
      'tenants',
      'lat',
      `ALTER TABLE "tenants" ADD COLUMN "lat" float`,
    );
    await this.addColumnIfMissing(
      queryRunner,
      'tenants',
      'lng',
      `ALTER TABLE "tenants" ADD COLUMN "lng" float`,
    );
    await this.addColumnIfMissing(
      queryRunner,
      'tenants',
      'isDiscoverable',
      `ALTER TABLE "tenants" ADD COLUMN "isDiscoverable" boolean NOT NULL DEFAULT (0)`,
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
