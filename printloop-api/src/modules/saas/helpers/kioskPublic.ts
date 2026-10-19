import { Kiosk, KioskStatus } from '@/database/entities/kiosk.entity';
import { Request } from 'express';
import { KioskService } from '@/modules/saas/services/kiosk.service';

const kioskService = new KioskService();

export function publicKiosk(k: Kiosk) {
  const ONLINE_MS = 5 * 60 * 1000;
  const online =
    k.status === KioskStatus.ACTIVE &&
    k.lastSeenAt &&
    Date.now() - new Date(k.lastSeenAt).getTime() < ONLINE_MS;
  return {
    id: k.id,
    name: k.name,
    location: k.location ?? null,
    printerName: k.printerName ?? null,
    status: k.status,
    online: Boolean(online),
    lastSeenAt: k.lastSeenAt ?? null,
    testPrintPassedAt: k.testPrintPassedAt ?? null,
    totalJobsPrinted: k.totalJobsPrinted ?? 0,
    capColor: k.capColor ?? null,
    capDuplex: k.capDuplex ?? null,
    capA3: k.capA3 ?? null,
    capUpdatedAt: k.capUpdatedAt ?? null,
    createdAt: k.createdAt,
  };
}

export async function ownedKiosk(req: Request, id: string): Promise<Kiosk | null> {
  return kioskService.getKioskById(id, req.tenant!.id);
}
