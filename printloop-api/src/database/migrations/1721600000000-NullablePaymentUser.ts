import { MigrationInterface, QueryRunner } from 'typeorm';

export class NullablePaymentUser1721600000000 implements MigrationInterface {
    name = 'NullablePaymentUser1721600000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "payments" ALTER COLUMN "userId" DROP NOT NULL`);
    }

    public async down(): Promise<void> {}
}
