import { MigrationInterface, QueryRunner } from 'typeorm';

export class PostgresParity1721400000000 implements MigrationInterface {
    name = 'PostgresParity1721400000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        if (queryRunner.connection.options.type !== 'postgres') return;

        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "disputes" (
                "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                "tenantId" uuid NOT NULL,
                "userId" uuid NOT NULL,
                "printJobId" uuid NOT NULL,
                "reason" text NOT NULL,
                "status" varchar NOT NULL DEFAULT 'pending' CHECK ("status" IN ('pending','resolved','rejected')),
                "resolutionNotes" text,
                "createdAt" timestamptz NOT NULL DEFAULT now(),
                "updatedAt" timestamptz NOT NULL DEFAULT now()
            )
        `);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_dispute_tenant" ON "disputes" ("tenantId")`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_dispute_user" ON "disputes" ("userId")`);

        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "shop_reviews" (
                "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                "tenantId" uuid NOT NULL,
                "userId" uuid NOT NULL,
                "rating" integer NOT NULL,
                "comment" text,
                "photoUrl" text,
                "createdAt" timestamptz NOT NULL DEFAULT now(),
                "updatedAt" timestamptz NOT NULL DEFAULT now()
            )
        `);
        await queryRunner.query(`ALTER TABLE "shop_reviews" ADD COLUMN IF NOT EXISTS "photoUrl" text`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_review_tenant" ON "shop_reviews" ("tenantId")`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_review_user" ON "shop_reviews" ("userId")`);

        await queryRunner.query(`ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "photos" text`);
        await queryRunner.query(
            `ALTER TABLE "pricing_configs" ADD COLUMN IF NOT EXISTS "officeConversion" boolean NOT NULL DEFAULT false`,
        );
        await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "verificationToken" TYPE varchar(64)`);
        await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "resetToken" TYPE varchar(128)`);
    }

    public async down(): Promise<void> {}
}
