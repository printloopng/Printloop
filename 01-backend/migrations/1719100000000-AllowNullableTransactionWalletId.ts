import { MigrationInterface, QueryRunner } from 'typeorm';

export class AllowNullableTransactionWalletId1719100000000
  implements MigrationInterface
{
  name = 'AllowNullableTransactionWalletId1719100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (queryRunner.connection.options.type === 'postgres') {
      await queryRunner.query(
        `ALTER TABLE "transactions" ALTER COLUMN "walletId" DROP NOT NULL`,
      );
      return;
    }

    await queryRunner.query(`PRAGMA foreign_keys = OFF`);
    try {
      await queryRunner.query(`
        CREATE TABLE "transactions_new" (
          "id" varchar PRIMARY KEY NOT NULL,
          "walletId" varchar,
          "tenantId" varchar NOT NULL,
          "type" varchar CHECK( "type" IN ('topup','print','refund','credit') ) NOT NULL,
          "amount" decimal(10,2) NOT NULL,
          "commissionAmount" decimal(10,2) NOT NULL DEFAULT (0),
          "description" varchar(255) NOT NULL,
          "balanceAfter" decimal(10,2) NOT NULL,
          "reference" varchar(100),
          "createdAt" datetime NOT NULL DEFAULT (datetime('now'))
        )
      `);
      await queryRunner.query(`
        INSERT INTO "transactions_new" (
          "id","walletId","tenantId","type","amount","commissionAmount",
          "description","balanceAfter","reference","createdAt"
        )
        SELECT
          "id","walletId","tenantId","type","amount","commissionAmount",
          "description","balanceAfter","reference","createdAt"
        FROM "transactions"
      `);
      await queryRunner.query(`DROP TABLE "transactions"`);
      await queryRunner.query(`ALTER TABLE "transactions_new" RENAME TO "transactions"`);
      await queryRunner.query(
        `CREATE INDEX IF NOT EXISTS "idx_transaction_tenant" ON "transactions" ("tenantId")`,
      );
    } finally {
      await queryRunner.query(`PRAGMA foreign_keys = ON`);
    }
  }

  public async down(): Promise<void> {
    throw new Error(
      'AllowNullableTransactionWalletId is one-way. Restore from backup.',
    );
  }
}
