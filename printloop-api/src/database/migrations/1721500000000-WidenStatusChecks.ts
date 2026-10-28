import { MigrationInterface, QueryRunner } from 'typeorm';

export class WidenStatusChecks1721500000000 implements MigrationInterface {
    name = 'WidenStatusChecks1721500000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "document_edits" ALTER COLUMN "editedBy" DROP NOT NULL`);
    }

    public async down(): Promise<void> {}
}
