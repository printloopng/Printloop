import { AppDataSource } from "@/config/data-source";
import { UserRepository } from "@/modules/customer/repositories/user.repository";
import { WalletRepository } from "@/modules/customer/repositories/wallet.repository";
import { PaymentRepository } from "@/modules/customer/repositories/payment.repository";
import { PrintJobRepository } from "@/modules/customer/repositories/printJob.repository";
import { PrintJobItemRepository } from "@/modules/customer/repositories/printJobItem.repository";
import { TransactionRepository } from "@/modules/customer/repositories/transaction.repository";
import { PromotionRepository } from "@/modules/customer/repositories/promotion.repository";
import { DisputeRepository } from "@/modules/customer/repositories/dispute.repository";
import { GroupSessionRepository } from "@/modules/customer/repositories/groupSession.repository";
import { GroupParticipantRepository } from "@/modules/customer/repositories/groupParticipant.repository";
import { ShopReviewRepository } from "@/modules/customer/repositories/shopReview.repository";
import { FileRepository } from "@/modules/customer/repositories/file.repository";
import { TenantRepository } from "@/modules/saas/repositories/tenant.repository";
import { TenantMemberRepository } from "@/modules/saas/repositories/tenantMember.repository";
import { TenantBalanceRepository } from "@/modules/saas/repositories/tenantBalance.repository";
import { TenantBrandingRepository } from "@/modules/saas/repositories/tenantBranding.repository";
import { TenantDomainRepository } from "@/modules/saas/repositories/tenantDomain.repository";
import { TenantWebhookRepository } from "@/modules/saas/repositories/tenantWebhook.repository";
import { KioskRepository } from "@/modules/saas/repositories/kiosk.repository";
import { PayoutRepository } from "@/modules/saas/repositories/payout.repository";
import { PayoutScheduleRepository } from "@/modules/saas/repositories/payoutSchedule.repository";
import { PrinterProfileRepository } from "@/modules/saas/repositories/printerProfile.repository";
import { DocumentEditRepository } from "@/modules/saas/repositories/documentEdit.repository";
import { EditorSessionRepository } from "@/modules/saas/repositories/editorSession.repository";
import { EditPricingConfigRepository } from "@/modules/saas/repositories/editPricingConfig.repository";
import { PricingConfigRepository } from "@/modules/saas/repositories/pricingConfig.repository";
import { BlogPostRepository } from "@/modules/public/repositories/blogPost.repository";
import { SystemSettingRepository } from "@/modules/platform/repositories/systemSetting.repository";
import { AuditLogRepository } from "@/modules/platform/repositories/auditLog.repository";

export const repos = {
  user: () => new UserRepository(AppDataSource),
  wallet: () => new WalletRepository(AppDataSource),
  payment: () => new PaymentRepository(AppDataSource),
  printJob: () => new PrintJobRepository(AppDataSource),
  printJobItem: () => new PrintJobItemRepository(AppDataSource),
  transaction: () => new TransactionRepository(AppDataSource),
  promotion: () => new PromotionRepository(AppDataSource),
  dispute: () => new DisputeRepository(AppDataSource),
  groupSession: () => new GroupSessionRepository(AppDataSource),
  groupParticipant: () => new GroupParticipantRepository(AppDataSource),
  shopReview: () => new ShopReviewRepository(AppDataSource),
  file: () => new FileRepository(AppDataSource),
  tenant: () => new TenantRepository(AppDataSource),
  tenantMember: () => new TenantMemberRepository(AppDataSource),
  tenantBalance: () => new TenantBalanceRepository(AppDataSource),
  tenantBranding: () => new TenantBrandingRepository(AppDataSource),
  tenantDomain: () => new TenantDomainRepository(AppDataSource),
  tenantWebhook: () => new TenantWebhookRepository(AppDataSource),
  kiosk: () => new KioskRepository(AppDataSource),
  payout: () => new PayoutRepository(AppDataSource),
  payoutSchedule: () => new PayoutScheduleRepository(AppDataSource),
  printerProfile: () => new PrinterProfileRepository(AppDataSource),
  documentEdit: () => new DocumentEditRepository(AppDataSource),
  editorSession: () => new EditorSessionRepository(AppDataSource),
  editPricingConfig: () => new EditPricingConfigRepository(AppDataSource),
  pricingConfig: () => new PricingConfigRepository(AppDataSource),
  blogPost: () => new BlogPostRepository(AppDataSource),
  systemSetting: () => new SystemSettingRepository(AppDataSource),
  auditLog: () => new AuditLogRepository(AppDataSource),
};
