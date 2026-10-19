import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "src");

const MAP = {
  user: { module: "customer", className: "User" },
  wallet: { module: "customer", className: "Wallet" },
  payment: { module: "customer", className: "Payment" },
  printJob: { module: "customer", className: "PrintJob" },
  printJobItem: { module: "customer", className: "PrintJobItem" },
  transaction: { module: "customer", className: "Transaction" },
  promotion: { module: "customer", className: "Promotion" },
  dispute: { module: "customer", className: "Dispute" },
  groupSession: { module: "customer", className: "GroupSession" },
  groupParticipant: { module: "customer", className: "GroupParticipant" },
  shopReview: { module: "customer", className: "ShopReview" },
  file: { module: "customer", className: "File" },

  tenant: { module: "saas", className: "Tenant" },
  tenantMember: { module: "saas", className: "TenantMember" },
  tenantBalance: { module: "saas", className: "TenantBalance" },
  tenantBranding: { module: "saas", className: "TenantBranding" },
  tenantDomain: { module: "saas", className: "TenantDomain" },
  tenantWebhook: { module: "saas", className: "TenantWebhook" },
  kiosk: { module: "saas", className: "Kiosk" },
  payout: { module: "saas", className: "Payout" },
  payoutSchedule: { module: "saas", className: "PayoutSchedule" },
  printerProfile: { module: "saas", className: "PrinterProfile" },
  documentEdit: { module: "saas", className: "DocumentEdit" },
  editorSession: { module: "saas", className: "EditorSession" },
  editPricingConfig: { module: "saas", className: "EditPricingConfig" },
  pricingConfig: { module: "saas", className: "PricingConfig" },

  blogPost: { module: "public", className: "BlogPost" },

  systemSetting: { module: "platform", className: "SystemSetting" },
  auditLog: { module: "platform", className: "AuditLog" },
};

function toKebab(entity) {
  return entity.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase();
}

for (const [entity, { module, className }] of Object.entries(MAP)) {
  const dir = path.join(root, "modules", module, "repositories");
  fs.mkdirSync(dir, { recursive: true });
  const fileName = `${entity}.repository.ts`;
  const file = path.join(dir, fileName);
  if (fs.existsSync(file)) {
    console.log("skip existing", fileName);
    continue;
  }
  const entityImport = `@/database/entities/${entity}.entity`;
  const alias = entity;
  const content = `import { DataSource } from "typeorm";
import { RedisClient } from "@/common";
import { BaseRepository } from "@/repository/base.repository";
import { ${className} } from "${entityImport}";

export class ${className}Repository extends BaseRepository<${className}> {
  constructor(dataSource: DataSource, redis?: RedisClient) {
    super(${className}, dataSource, redis);
  }

  protected getAlias(): string {
    return "${alias}";
  }
}
`;
  fs.writeFileSync(file, content);
  console.log("wrote", `modules/${module}/repositories/${fileName}`);
}
