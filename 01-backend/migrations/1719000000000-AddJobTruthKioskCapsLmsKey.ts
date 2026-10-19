import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddJobTruthKioskCapsLmsKey1719000000000 implements MigrationInterface {
  name = 'AddJobTruthKioskCapsLmsKey1719000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const sqlite = queryRunner.connection.options.type === 'sqlite';

    if (sqlite) {
      const addIfMissing = async (
        table: string,
        column: string,
        ddl: string,
      ): Promise<void> => {
        const rows: Array<{ name: string }> = await queryRunner.query(
          `PRAGMA table_info("${table}")`,
        );
        if (!rows.some((r) => r.name === column)) {
          await queryRunner.query(
            `ALTER TABLE "${table}" ADD COLUMN "${column}" ${ddl}`,
          );
        }
      };
      await addIfMissing('kiosks', 'capColor', 'boolean');
      await addIfMissing('kiosks', 'capDuplex', 'boolean');
      await addIfMissing('kiosks', 'capA3', 'boolean');
      await addIfMissing('kiosks', 'capMedia', 'text');
      await addIfMissing('kiosks', 'capUpdatedAt', 'datetime');
      await addIfMissing('print_jobs', 'agentConfirmation', 'varchar(64)');
      await addIfMissing('tenants', 'lmsKey', 'varchar(64)');
    } else {
      await queryRunner.query(
        `ALTER TABLE "kiosks" ADD COLUMN IF NOT EXISTS "capColor" boolean DEFAULT NULL`,
      );
      await queryRunner.query(
        `ALTER TABLE "kiosks" ADD COLUMN IF NOT EXISTS "capDuplex" boolean DEFAULT NULL`,
      );
      await queryRunner.query(
        `ALTER TABLE "kiosks" ADD COLUMN IF NOT EXISTS "capA3" boolean DEFAULT NULL`,
      );
      await queryRunner.query(
        `ALTER TABLE "kiosks" ADD COLUMN IF NOT EXISTS "capMedia" text DEFAULT NULL`,
      );
      await queryRunner.query(
        `ALTER TABLE "kiosks" ADD COLUMN IF NOT EXISTS "capUpdatedAt" TIMESTAMPTZ DEFAULT NULL`,
      );
      await queryRunner.query(
        `ALTER TABLE "print_jobs" ADD COLUMN IF NOT EXISTS "agentConfirmation" varchar(64) DEFAULT NULL`,
      );
      await queryRunner.query(
        `ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "lmsKey" varchar(64) DEFAULT NULL`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (queryRunner.connection.options.type === 'sqlite') {
    } else {
      await queryRunner.query(`ALTER TABLE "kiosks" DROP COLUMN IF EXISTS "capColor"`);
      await queryRunner.query(`ALTER TABLE "kiosks" DROP COLUMN IF EXISTS "capDuplex"`);
      await queryRunner.query(`ALTER TABLE "kiosks" DROP COLUMN IF EXISTS "capA3"`);
      await queryRunner.query(`ALTER TABLE "kiosks" DROP COLUMN IF EXISTS "capMedia"`);
      await queryRunner.query(`ALTER TABLE "kiosks" DROP COLUMN IF EXISTS "capUpdatedAt"`);
      await queryRunner.query(
        `ALTER TABLE "print_jobs" DROP COLUMN IF EXISTS "agentConfirmation"`,
      );
      await queryRunner.query(`ALTER TABLE "tenants" DROP COLUMN IF EXISTS "lmsKey"`);
    }
  }
}
