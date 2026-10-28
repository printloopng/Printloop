import "reflect-metadata";
import path from "path";
import { DataSource, getMetadataArgsStorage } from "typeorm";
import { Config } from "./index";

import { Kiosk } from "@/database/entities/kiosk.entity";
import { PricingConfig } from "@/database/entities/pricingConfig.entity";
import { SystemSetting } from "@/database/entities/systemSetting.entity";
import { GroupParticipant } from "@/database/entities/groupParticipant.entity";
import { File } from "@/database/entities/file.entity";
import { User } from "@/database/entities/user.entity";
import { PrintJob } from "@/database/entities/printJob.entity";
import { PrintJobItem } from "@/database/entities/printJobItem.entity";
import { Wallet } from "@/database/entities/wallet.entity";
import { Transaction } from "@/database/entities/transaction.entity";
import { GroupSession } from "@/database/entities/groupSession.entity";
import { AuditLog } from "@/database/entities/auditLog.entity";
import { Payment } from "@/database/entities/payment.entity";
import { Promotion } from "@/database/entities/promotion.entity";
import { Tenant } from "@/database/entities/tenant.entity";
import { TenantMember } from "@/database/entities/tenantMember.entity";
import { Payout } from "@/database/entities/payout.entity";
import { PayoutSchedule } from "@/database/entities/payoutSchedule.entity";
import { TenantDomain } from "@/database/entities/tenantDomain.entity";
import { TenantBalance } from "@/database/entities/tenantBalance.entity";
import { Dispute } from "@/database/entities/dispute.entity";
import { ShopReview } from "@/database/entities/shopReview.entity";
import { TenantBranding } from "@/database/entities/tenantBranding.entity";
import { TenantWebhook } from "@/database/entities/tenantWebhook.entity";
import { BlogPost } from "@/database/entities/blogPost.entity";
import { PrinterProfile } from "@/database/entities/printerProfile.entity";
import { DocumentEdit } from "@/database/entities/documentEdit.entity";
import { EditPricingConfig } from "@/database/entities/editPricingConfig.entity";
import { EditorSession } from "@/database/entities/editorSession.entity";

const ENTITIES = [
  Kiosk,
  PricingConfig,
  SystemSetting,
  GroupParticipant,
  File,
  User,
  PrintJob,
  PrintJobItem,
  Wallet,
  Transaction,
  GroupSession,
  AuditLog,
  Payment,
  Promotion,
  Tenant,
  TenantMember,
  Payout,
  PayoutSchedule,
  TenantBalance,
  TenantBranding,
  TenantWebhook,
  TenantDomain,
  Dispute,
  ShopReview,
  BlogPost,
  PrinterProfile,
  DocumentEdit,
  EditPricingConfig,
  EditorSession,
];


const runningCompiled = __filename.replace(/\\/g, "/").includes("/dist/");

const decimalAsNumber = {
  to: (value: unknown) => value,
  from: (value: unknown) => (value === null || value === undefined ? value : Number(value)),
};

for (const column of getMetadataArgsStorage().columns) {
  if (column.options.type === "datetime") column.options.type = "timestamptz";
  if ((column.options.type === "decimal" || column.options.type === "numeric") && !column.options.transformer) {
    column.options.transformer = decimalAsNumber;
  }
}

export const AppDataSource = new DataSource({
  type: "postgres",
  url: Config.database.url,
  synchronize: false,
  migrationsRun: true,
  logging: false,
  ssl: Config.database.ssl ? { rejectUnauthorized: false } : false,
  extra: {
    connectionTimeoutMillis: 8000,
    max: 10,
    idleTimeoutMillis: 30000,
  },
  entities: ENTITIES as any,
  migrations: [
    runningCompiled
      ? path.join(__dirname, "..", "database", "migrations", "*.js")
      : "src/database/migrations/*.ts",
  ],
});

export async function runPostInitMigrations(): Promise<void> {
  try {
    await AppDataSource.query(
      `ALTER TABLE "shop_reviews" ADD COLUMN IF NOT EXISTS "photoUrl" TEXT`,
    );
  } catch (err: any) {
    const msg = err?.message || "";
    if (
      !msg.includes("duplicate column") &&
      !msg.includes("already exists") &&
      !msg.includes("duplicate")
    ) {
      console.warn("[migrations] shop_reviews photoUrl skipped:", msg || err);
    }
  }

  try {
    await AppDataSource.query(
      `UPDATE promotions SET code = UPPER(code) WHERE code != UPPER(code)`,
    );
  } catch (err) {
    console.warn("[migrations] promotion code normalization skipped:", err);
  }
}
