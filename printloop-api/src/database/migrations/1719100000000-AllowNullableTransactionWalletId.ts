import { MigrationInterface, QueryRunner } from 'typeorm';

export class AllowNullableTransactionWalletId1719100000000
  implements MigrationInterface
{
  name = 'AllowNullableTransactionWalletId1719100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "transactions" ALTER COLUMN "walletId" DROP NOT NULL`,
    );
  }

  public async down(): Promise<void> {}
}
