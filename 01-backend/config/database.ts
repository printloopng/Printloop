import { DataSource, type DataSourceOptions } from 'typeorm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './index.js';
import { Kiosk } from '../entities/kiosk.entity';
import { PricingConfig } from '../entities/pricingConfig.entity';
import { SystemSetting } from '../entities/systemSetting.entity';
import { GroupParticipant } from '../entities/groupParticipant.entity';
import { File } from '../entities/file.entity';
import { User } from '../entities/user.entity';
import { PrintJob } from '../entities/printJob.entity';
import { PrintJobItem } from '../entities/printJobItem.entity';
import { Wallet } from '../entities/wallet.entity';
import { Transaction } from '../entities/transaction.entity';
import { GroupSession } from '../entities/groupSession.entity';
import { AuditLog } from '../entities/auditLog.entity';
import { Payment } from '../entities/payment.entity';
import { Promotion } from '../entities/promotion.entity';
import { Tenant } from '../entities/tenant.entity';
import { TenantMember } from '../entities/tenantMember.entity';
import { Payout } from '../entities/payout.entity';
import { PayoutSchedule } from '../entities/payoutSchedule.entity';
import { InitSchema1700000000000 } from '../migrations/1700000000000-InitSchema';
import { CreateSaasFoundation1717100000000 } from '../migrations/1717100000000-CreateSaasFoundation';
import { AddTenantIdColumns1717200000000 } from '../migrations/1717200000000-AddTenantIdColumns';
import { TightenTenantUniqueness1717300000000 } from '../migrations/1717300000000-TightenTenantUniqueness';
import { AddRenderingStatus1717400000000 } from '../migrations/1717400000000-AddRenderingStatus';
import { AddPrintJobItemTenantId1717500000000 } from '../migrations/1717500000000-AddPrintJobItemTenantId';
import { CreateTenantBalances1717600000000 } from '../migrations/1717600000000-CreateTenantBalances';
import { TightenTenantIdNotNull1717700000000 } from '../migrations/1717700000000-TightenTenantIdNotNull';
import { CreateTenantBrandings1717800000000 } from '../migrations/1717800000000-CreateTenantBrandings';
import { CreateTenantWebhooks1717900000000 } from '../migrations/1717900000000-CreateTenantWebhooks';
import { CreateTenantDomains1718000000000 } from '../migrations/1718000000000-CreateTenantDomains';
import { AddUserTotp1718200000000 } from '../migrations/1718200000000-AddUserTotp';
import { AddTenantLocation1718300000000 } from '../migrations/1718300000000-AddTenantLocation';
import { AddKioskTestPrintPassedAt1718400000000 } from '../migrations/1718400000000-AddKioskTestPrintPassedAt';
import { AllowNullablePrintJobCode1718500000000 } from '../migrations/1718500000000-AllowNullablePrintJobCode';
import { PostgresBaseline1718100000000 } from '../migrations/1718100000000-PostgresBaseline';
import { TenantDomain } from '../entities/tenantDomain.entity';
import { TenantBalance } from '../entities/tenantBalance.entity';
import { Dispute } from '../entities/dispute.entity';
import { ShopReview } from '../entities/shopReview.entity';
import { CreateDisputesAndReviews1718600000000 } from '../migrations/1718600000000-CreateDisputesAndReviews';
import { AddPrintJobRenderFields1718700000000 } from '../migrations/1718700000000-AddPrintJobRenderFields';
import { AddPrintJobFinalCost1720000000000 } from '../migrations/1720000000000-AddPrintJobFinalCost';
import { AddPaymentAuthorizationCode1720100000000 } from '../migrations/1720100000000-AddPaymentAuthorizationCode';
import { CreateBlogPosts1720200000000 } from '../migrations/1720200000000-CreateBlogPosts';
import { CreatePrinterProfiles1720300000000 } from '../migrations/1720300000000-CreatePrinterProfiles';
import { AddTenantAvailability1720400000000 } from '../migrations/1720400000000-AddTenantAvailability';
import { AddAcceptWindowFields1720500000000 } from '../migrations/1720500000000-AddAcceptWindowFields';
import { AddKioskLastOfflineAlertAt1718800000000 } from '../migrations/1718800000000-AddKioskLastOfflineAlertAt';
import { AddJobTruthKioskCapsLmsKey1719000000000 } from '../migrations/1719000000000-AddJobTruthKioskCapsLmsKey';
import { AddOfficeConversionToPricing1720600000000 } from '../migrations/1720600000000-AddOfficeConversionToPricing';
import { AddEditingFieldsToPrintJob1720700000000 } from '../migrations/1720700000000-AddEditingFieldsToPrintJob';
import { CreateDocumentEditsTable1720900000000 } from '../migrations/1720900000000-CreateDocumentEditsTable';
import { CreateEditPricingConfigsTable1721000000000 } from '../migrations/1721000000000-CreateEditPricingConfigsTable';
import { CreateEditorSessionsTable1721100000000 } from '../migrations/1721100000000-CreateEditorSessionsTable';
import { AddTenantIdToDocumentEditAndEditorSession1721200000000 } from '../migrations/1721200000000-AddTenantIdToDocumentEditAndEditorSession';
import { TenantBranding } from '../entities/tenantBranding.entity';
import { TenantWebhook } from '../entities/tenantWebhook.entity';
import { BlogPost } from '../entities/blogPost.entity';
import { PrinterProfile } from '../entities/printerProfile.entity';
import { DocumentEdit } from '../entities/documentEdit.entity';
import { EditPricingConfig } from '../entities/editPricingConfig.entity';
import { EditorSession } from '../entities/editorSession.entity';

const dbFile = config.database.file;

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
];

const MIGRATIONS = (() => {
  const url = (process.env.DATABASE_URL || '').toLowerCase();
  const isPg = url.startsWith('postgres://') || url.startsWith('postgresql://');
  return isPg ? POSTGRES_MIGRATIONS : SQLITE_MIGRATIONS;
})();

const driverFromUrl = (config.database.url || '').toLowerCase();
const usePostgres =
  driverFromUrl.startsWith('postgres://') ||
  driverFromUrl.startsWith('postgresql://');

const dataSourceOptions: DataSourceOptions = usePostgres
  ? {
      type: 'postgres',
      url: config.database.url,
      extra: {
        max: config.database.poolMax,
      },
      ssl:
        config.database.ssl
          ? { rejectUnauthorized: false }
          : false,
      synchronize: false,
      migrationsRun: true,
      logging: config.database.logging,
      entities: ENTITIES as any,
      migrations: MIGRATIONS as any,
    }
  : {
      type: 'sqlite',
      database: dbFile,
      synchronize: false,
      migrationsRun: true,
      logging: config.database.logging,
      entities: ENTITIES as any,
      migrations: MIGRATIONS as any,
    };

export const AppDataSource = new DataSource(dataSourceOptions);

console.log(
  `[database] driver=${usePostgres ? 'postgres' : 'sqlite'}` +
    (usePostgres ? ` (DATABASE_URL set)` : ` file=${dbFile}`),
);

export async function runPostInitMigrations(): Promise<void> {
  try {
    const isPg = !!process.env.DATABASE_URL;
    if (isPg) {
      await AppDataSource.query(`ALTER TABLE "shop_reviews" ADD COLUMN IF NOT EXISTS "photoUrl" TEXT`);
    } else {
      await AppDataSource.query(`ALTER TABLE "shop_reviews" ADD COLUMN "photoUrl" TEXT`);
    }
  } catch (err: any) {
    const msg = err?.message || '';
    if (!msg.includes('duplicate column') && !msg.includes('already exists') && !msg.includes('duplicate')) {
      console.warn('[migrations] shop_reviews photoUrl column addition skipped/already exists:', msg || err);
    }
  }

  try {
    await AppDataSource.query(
      `UPDATE promotions SET code = UPPER(code) WHERE code != UPPER(code)`,
    );
  } catch (err) {
    console.warn('[migrations] promotion code normalization skipped:', err);
  }

  const PRICING_BACKFILL: Array<{
    paper: 'A4' | 'A3';
    color: 'BLACK_WHITE' | 'COLOR';
    cells: [number, number, number, number, number, number];
  }> = [
    { paper: 'A4', color: 'BLACK_WHITE', cells: [50, 70, 100, 65, 90, 120] },
    { paper: 'A4', color: 'COLOR',       cells: [100, 200, 300, 150, 250, 350] },
    { paper: 'A3', color: 'BLACK_WHITE', cells: [100, 150, 300, 150, 230, 400] },
    { paper: 'A3', color: 'COLOR',       cells: [250, 400, 650, 390, 400, 650] },
  ];
  for (const row of PRICING_BACKFILL) {
    try {
      await AppDataSource.query(
        `UPDATE pricing_configs
           SET price100Simplex = COALESCE(price100Simplex, ?),
               price300Simplex = COALESCE(price300Simplex, ?),
               price600Simplex = COALESCE(price600Simplex, ?),
               price100Duplex  = COALESCE(price100Duplex,  ?),
               price300Duplex  = COALESCE(price300Duplex,  ?),
               price600Duplex  = COALESCE(price600Duplex,  ?)
         WHERE paperSize = ? AND colorType = ?`,
        [...row.cells, row.paper, row.color],
      );
    } catch (err) {
      console.warn(
        `[migrations] pricing backfill skipped for ${row.paper}/${row.color}:`,
        err,
      );
    }
  }
}
