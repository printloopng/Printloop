import { Request, Response } from 'express';
import { DataSource } from 'typeorm';
import { Kiosk, KioskStatus } from '@/database/entities/kiosk.entity';
import { KioskService } from '@/modules/saas/services/kiosk.service';
import { ownedKiosk, publicKiosk } from '@/modules/saas/helpers/kioskPublic';
import {
  createSaasKioskBodySchema,
  kioskStatusBodySchema,
} from '@/modules/saas/validation/saasKiosk.validation';

export class SaasKioskController {
  private kioskService = new KioskService();

  constructor(private ds: DataSource) {}

  listKiosks = async (req: Request, res: Response) => {
    try {
      const kiosks = await this.kioskService.listKiosks({ tenantId: req.tenant!.id });
      res.json({ success: true, data: { kiosks: kiosks.map(publicKiosk) } });
    } catch (err: any) {
      console.error('[saas/kiosks:list]', err);
      res.status(500).json({ success: false, message: 'Could not list printers' });
    }
  };

  createKiosk = async (req: Request, res: Response) => {
    try {
      const parsed = createSaasKioskBodySchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        res.status(400).json({ success: false, message: 'Printer name is required' });
        return;
      }
      const { name, location, printerName } = parsed.data;
      const kiosk = await this.kioskService.createKiosk({
        name: name.trim(),
        tenantId: req.tenant!.id,
        location: location?.trim() || undefined,
        printerName: printerName?.trim() || undefined,
      });
      res.status(201).json({
        success: true,
        data: { kiosk: { ...publicKiosk(kiosk), apiKey: kiosk.apiKey } },
      });
    } catch (err: any) {
      console.error('[saas/kiosks:create]', err);
      res.status(500).json({ success: false, message: 'Could not add printer' });
    }
  };

  updateStatus = async (req: Request, res: Response) => {
    const k = await ownedKiosk(req, req.params.id);
    if (!k) {
      res.status(404).json({ success: false, message: 'Printer not found' });
      return;
    }
    kioskStatusBodySchema.safeParse(req.body ?? {});
    const want = String((req.body || {}).status || '').toUpperCase();
    if (!(want in KioskStatus)) {
      res.status(400).json({ success: false, message: 'Invalid status' });
      return;
    }
    const updated = await this.kioskService.updateKioskStatus(
      k.id,
      KioskStatus[want as keyof typeof KioskStatus],
    );
    res.json({ success: true, data: updated ? publicKiosk(updated) : null });
  };

  regenerateKey = async (req: Request, res: Response) => {
    const k = await ownedKiosk(req, req.params.id);
    if (!k) {
      res.status(404).json({ success: false, message: 'Printer not found' });
      return;
    }
    const updated = await this.kioskService.regenerateApiKey(k.id);
    res.json({
      success: true,
      data: { id: k.id, apiKey: updated?.apiKey },
    });
  };

  testPrint = async (req: Request, res: Response) => {
    const k = await ownedKiosk(req, req.params.id);
    if (!k) {
      res.status(404).json({ success: false, message: 'Printer not found' });
      return;
    }
    const repo = this.ds.getRepository(Kiosk);
    k.testPrintPassedAt = new Date();
    await repo.save(k);
    res.json({
      success: true,
      data: { id: k.id, testPrintPassedAt: k.testPrintPassedAt },
    });
  };

  deleteKiosk = async (req: Request, res: Response) => {
    const k = await ownedKiosk(req, req.params.id);
    if (!k) {
      res.status(404).json({ success: false, message: 'Printer not found' });
      return;
    }
    const ok = await this.kioskService.deleteKiosk(k.id);
    res.json({ success: ok });
  };
}
