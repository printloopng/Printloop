import { AppDataSource } from '@/config/data-source';
import { Kiosk, KioskStatus } from '@/database/entities/kiosk.entity';
import { Tenant, TenantStatus } from '@/database/entities/tenant.entity';

const LIVE_ONLINE_WINDOW_MS = 5 * 60 * 1000;

export function payoutAccountMissing(
  tenant: { paystackSubaccountCode?: string | null } | null | undefined,
): { code: string; message: string } | null {
  if (tenant?.paystackSubaccountCode) return null;
  return {
    code: 'SHOP_PAYOUT_ACCOUNT_REQUIRED',
    message:
      'This shop has to connect a Paystack account before it can take print jobs. The payment goes straight to that account.',
  };
}

export async function assertLiveGateMet(
  tenant: Tenant,
): Promise<{ code: string; message: string } | null> {
  if (tenant.lat == null || tenant.lng == null) {
    return {
      code: 'LOCATION_MISSING',
      message:
        'Set a shop address first — discoverability needs coordinates.',
    };
  }
  if (tenant.status !== TenantStatus.ACTIVE) {
    return {
      code: 'TENANT_NOT_ACTIVE',
      message:
        'Your account is still in trial. A PrintLoop operator will activate it after verification.',
    };
  }
  const kiosks = await AppDataSource.getRepository(Kiosk).find({
    where: { tenantId: tenant.id },
  });
  if (!kiosks.some((k) => k.testPrintPassedAt != null)) {
    return {
      code: 'TEST_PRINT_MISSING',
      message:
        'Run a test print first — at least one kiosk needs to confirm it printed successfully.',
    };
  }
  const cutoff = Date.now() - LIVE_ONLINE_WINDOW_MS;
  const onlineNow = kiosks.some(
    (k) =>
      k.status === KioskStatus.ACTIVE &&
      k.lastSeenAt &&
      new Date(k.lastSeenAt).getTime() > cutoff,
  );
  if (!onlineNow) {
    return {
      code: 'NO_KIOSK_ONLINE',
      message:
        'No kiosk is online right now. Bring your kiosk app online and try again.',
    };
  }
  if (!tenant.paystackSubaccountCode) {
    return {
      code: 'SUBACCOUNT_MISSING',
      message:
        'Connect a Paystack account in Payouts first. Student payments go straight to that account, so the shop cannot be listed without one.',
    };
  }
  return null;
}
