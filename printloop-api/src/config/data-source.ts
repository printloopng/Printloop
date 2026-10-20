import "reflect-metadata";
import { DataSource, getMetadataArgsStorage, type DataSourceOptions } from "typeorm";
import path from "path";
import fs from "fs";
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

import { InitSchema1700000000000 } from "@/database/migrations/1700000000000-InitSchema";
import { CreateSaasFoundation1717100000000 } from "@/database/migrations/1717100000000-CreateSaasFoundation";
import { AddTenantIdColumns1717200000000 } from "@/database/migrations/1717200000000-AddTenantIdColumns";
import { TightenTenantUniqueness1717300000000 } from "@/database/migrations/1717300000000-TightenTenantUniqueness";
import { AddRenderingStatus1717400000000 } from "@/database/migrations/1717400000000-AddRenderingStatus";
import { AddPrintJobItemTenantId1717500000000 } from "@/database/migrations/1717500000000-AddPrintJobItemTenantId";
import { CreateTenantBalances1717600000000 } from "@/database/migrations/1717600000000-CreateTenantBalances";
import { TightenTenantIdNotNull1717700000000 } from "@/database/migrations/1717700000000-TightenTenantIdNotNull";
import { CreateTenantBrandings1717800000000 } from "@/database/migrations/1717800000000-CreateTenantBrandings";
import { CreateTenantWebhooks1717900000000 } from "@/database/migrations/1717900000000-CreateTenantWebhooks";
import { CreateTenantDomains1718000000000 } from "@/database/migrations/1718000000000-CreateTenantDomains";
import { AddUserTotp1718200000000 } from "@/database/migrations/1718200000000-AddUserTotp";
import { AddTenantLocation1718300000000 } from "@/database/migrations/1718300000000-AddTenantLocation";
import { AddKioskTestPrintPassedAt1718400000000 } from "@/database/migrations/1718400000000-AddKioskTestPrintPassedAt";
import { AllowNullablePrintJobCode1718500000000 } from "@/database/migrations/1718500000000-AllowNullablePrintJobCode";
import { PostgresBaseline1718100000000 } from "@/database/migrations/1718100000000-PostgresBaseline";
import { CreateDisputesAndReviews1718600000000 } from "@/database/migrations/1718600000000-CreateDisputesAndReviews";
import { AddPrintJobRenderFields1718700000000 } from "@/database/migrations/1718700000000-AddPrintJobRenderFields";
import { AddPrintJobFinalCost1720000000000 } from "@/database/migrations/1720000000000-AddPrintJobFinalCost";
import { AddPaymentAuthorizationCode1720100000000 } from "@/database/migrations/1720100000000-AddPaymentAuthorizationCode";
import { CreateBlogPosts1720200000000 } from "@/database/migrations/1720200000000-CreateBlogPosts";
import { CreatePrinterProfiles1720300000000 } from "@/database/migrations/1720300000000-CreatePrinterProfiles";
import { AddTenantAvailability1720400000000 } from "@/database/migrations/1720400000000-AddTenantAvailability";
import { AddAcceptWindowFields1720500000000 } from "@/database/migrations/1720500000000-AddAcceptWindowFields";
import { AddKioskLastOfflineAlertAt1718800000000 } from "@/database/migrations/1718800000000-AddKioskLastOfflineAlertAt";
import { AddJobTruthKioskCapsLmsKey1719000000000 } from "@/database/migrations/1719000000000-AddJobTruthKioskCapsLmsKey";
import { AddOfficeConversionToPricing1720600000000 } from "@/database/migrations/1720600000000-AddOfficeConversionToPricing";
import { AddEditingFieldsToPrintJob1720700000000 } from "@/database/migrations/1720700000000-AddEditingFieldsToPrintJob";
import { CreateDocumentEditsTable1720900000000 } from "@/database/migrations/1720900000000-CreateDocumentEditsTable";
import { CreateEditPricingConfigsTable1721000000000 } from "@/database/migrations/1721000000000-CreateEditPricingConfigsTable";
import { CreateEditorSessionsTable1721100000000 } from "@/database/migrations/1721100000000-CreateEditorSessionsTable";
import { AddTenantIdToDocumentEditAndEditorSession1721200000000 } from "@/database/migrations/1721200000000-AddTenantIdToDocumentEditAndEditorSession";
import { AlignEditTablesWithEntities1721300000000 } from "@/database/migrations/1721300000000-AlignEditTablesWithEntities";
import { PostgresParity1721400000000 } from "@/database/migrations/1721400000000-PostgresParity";
import { WidenStatusChecks1721500000000 } from "@/database/migrations/1721500000000-WidenStatusChecks";
import { NullablePaymentUser1721600000000 } from "@/database/migrations/1721600000000-NullablePaymentUser";

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

const SQLITE_MIGRATIONS = [
  InitSchema1700000000000,
  CreateSaasFoundation1717100000000,
  AddTenantIdColumns1717200000000,
  TightenTenantUniqueness1717300000000,
  AddRenderingStatus1717400000000,
  AddPrintJobItemTenantId1717500000000,
  CreateTenantBalances1717600000000,
  TightenTenantIdNotNull1717700000000,
  CreateTenantBrandings1717800000000,
  CreateTenantWebhooks1717900000000,
  CreateTenantDomains1718000000000,
  AddUserTotp1718200000000,
  AddTenantLocation1718300000000,
  AddKioskTestPrintPassedAt1718400000000,
  AllowNullablePrintJobCode1718500000000,
  CreateDisputesAndReviews1718600000000,
  AddPrintJobRenderFields1718700000000,
  AddKioskLastOfflineAlertAt1718800000000,
  AddJobTruthKioskCapsLmsKey1719000000000,
  AddPrintJobFinalCost1720000000000,
  AddPaymentAuthorizationCode1720100000000,
  CreateBlogPosts1720200000000,
  CreatePrinterProfiles1720300000000,
  AddTenantAvailability1720400000000,
  AddAcceptWindowFields1720500000000,
  AddOfficeConversionToPricing1720600000000,
  AddEditingFieldsToPrintJob1720700000000,
  CreateDocumentEditsTable1720900000000,
  CreateEditPricingConfigsTable1721000000000,
  CreateEditorSessionsTable1721100000000,
  AddTenantIdToDocumentEditAndEditorSession1721200000000,
  AlignEditTablesWithEntities1721300000000,
  PostgresParity1721400000000,
  WidenStatusChecks1721500000000,
  NullablePaymentUser1721600000000,
];

const POSTGRES_MIGRATIONS = [
  PostgresBaseline1718100000000,
  AddPrintJobRenderFields1718700000000,
  AddKioskLastOfflineAlertAt1718800000000,
  AddJobTruthKioskCapsLmsKey1719000000000,
  AddPrintJobFinalCost1720000000000,
  AddPaymentAuthorizationCode1720100000000,
  CreateBlogPosts1720200000000,
  CreatePrinterProfiles1720300000000,
  AddTenantAvailability1720400000000,
  AddAcceptWindowFields1720500000000,
  AddEditingFieldsToPrintJob1720700000000,
  CreateDocumentEditsTable1720900000000,
  CreateEditPricingConfigsTable1721000000000,
  CreateEditorSessionsTable1721100000000,
  AddTenantIdToDocumentEditAndEditorSession1721200000000,
  AlignEditTablesWithEntities1721300000000,
  PostgresParity1721400000000,
  WidenStatusChecks1721500000000,
  NullablePaymentUser1721600000000,
];

const dbUrl = (Config.database.url || process.env.DATABASE_URL || "").toLowerCase();
const usePostgres =
  dbUrl.startsWith("postgres://") || dbUrl.startsWith("postgresql://");

const MIGRATIONS = usePostgres ? POSTGRES_MIGRATIONS : SQLITE_MIGRATIONS;
const dbFile = Config.database.file;

if (!usePostgres) {
  fs.mkdirSync(path.dirname(path.resolve(dbFile)), { recursive: true });
}

const decimalAsNumber = {
  to: (value: unknown) => value,
  from: (value: unknown) => (value === null || value === undefined ? value : Number(value)),
};

if (usePostgres) {
  for (const column of getMetadataArgsStorage().columns) {
    if (column.options.type === "datetime") column.options.type = "timestamptz";
    if ((column.options.type === "decimal" || column.options.type === "numeric") && !column.options.transformer) {
      column.options.transformer = decimalAsNumber;
    }
  }
}

const dataSourceOptions: DataSourceOptions = usePostgres
  ? {
      type: "postgres",
      url: Config.database.url || process.env.DATABASE_URL,
      extra: { max: Config.database.poolMax },
      ssl: Config.database.ssl ? { rejectUnauthorized: false } : false,
      synchronize: false,
      migrationsRun: true,
      logging: false,
      entities: ENTITIES as any,
      migrations: MIGRATIONS as any,
    }
  : {
      type: "sqlite",
      database: dbFile,
      synchronize: false,
      migrationsRun: true,
      logging: false,
      entities: ENTITIES as any,
      migrations: MIGRATIONS as any,
    };

export const AppDataSource = new DataSource(dataSourceOptions);

console.log(
  `[database] driver=${usePostgres ? "postgres" : "sqlite"}` +
    (usePostgres ? " (DATABASE_URL set)" : ` file=${dbFile}`),
);

export async function runPostInitMigrations(): Promise<void> {
  try {
    if (usePostgres) {
      await AppDataSource.query(
        `ALTER TABLE "shop_reviews" ADD COLUMN IF NOT EXISTS "photoUrl" TEXT`,
      );
    } else {
      await AppDataSource.query(
        `ALTER TABLE "shop_reviews" ADD COLUMN "photoUrl" TEXT`,
      );
    }
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
