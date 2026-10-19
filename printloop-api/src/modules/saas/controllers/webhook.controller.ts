import { Request, Response } from 'express';
import { AppDataSource } from '@/config/data-source';
import {
  createWebhookBodySchema,
  patchWebhookBodySchema,
} from '@/modules/saas/validation/webhook.validation';

export class WebhookController {
  listWebhooks = async (req: Request, res: Response) => {
    const { TenantWebhook } = await import('@/database/entities/tenantWebhook.entity');
    const rows = await AppDataSource.getRepository(TenantWebhook).find({
      where: { tenantId: req.tenant!.id },
      order: { createdAt: 'DESC' },
    });
    res.json({
      success: true,
      data: rows.map((r) => ({ ...r, secret: '***' })),
    });
  };

  createWebhook = async (req: Request, res: Response) => {
    try {
      const parsed = createWebhookBodySchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        res
          .status(400)
          .json({ success: false, message: 'name and url are required' });
        return;
      }
      const { TenantWebhook, WebhookEvent } = await import(
        '@/database/entities/tenantWebhook.entity'
      );
      const { generateWebhookSecret } = await import(
        '@/modules/saas/services/tenantWebhook.service'
      );
      const { name, url, events } = parsed.data;
      const allowed = Object.values(WebhookEvent) as string[];
      const cleaned: any[] = Array.isArray(events)
        ? events.filter((e: string) => allowed.includes(e))
        : [];
      const repo = AppDataSource.getRepository(TenantWebhook);
      const row = repo.create({
        tenantId: req.tenant!.id,
        name: String(name).slice(0, 100),
        url: String(url).slice(0, 1024),
        secret: generateWebhookSecret(),
        events: cleaned,
        isActive: true,
      });
      const saved = await repo.save(row);
      res.status(201).json({ success: true, data: saved });
    } catch (err: any) {
      console.error('Webhook create error:', err);
      res
        .status(500)
        .json({ success: false, message: err?.message || 'Create failed' });
    }
  };

  patchWebhook = async (req: Request, res: Response) => {
    try {
      patchWebhookBodySchema.safeParse(req.body ?? {});
      const { TenantWebhook, WebhookEvent } = await import(
        '@/database/entities/tenantWebhook.entity'
      );
      const repo = AppDataSource.getRepository(TenantWebhook);
      const row = await repo.findOne({
        where: { id: req.params.id, tenantId: req.tenant!.id },
      });
      if (!row) {
        res.status(404).json({ success: false, message: 'Webhook not found' });
        return;
      }
      const { name, events, isActive } = req.body || {};
      if (name != null) row.name = String(name).slice(0, 100);
      if (Array.isArray(events)) {
        const allowed = Object.values(WebhookEvent) as string[];
        row.events = events.filter((e: string) => allowed.includes(e)) as any;
      }
      if (typeof isActive === 'boolean') row.isActive = isActive;
      const saved = await repo.save(row);
      res.json({ success: true, data: { ...saved, secret: '***' } });
    } catch (err: any) {
      console.error('Webhook patch error:', err);
      res
        .status(500)
        .json({ success: false, message: err?.message || 'Update failed' });
    }
  };

  deleteWebhook = async (req: Request, res: Response) => {
    try {
      const { TenantWebhook } = await import('@/database/entities/tenantWebhook.entity');
      const repo = AppDataSource.getRepository(TenantWebhook);
      const row = await repo.findOne({
        where: { id: req.params.id, tenantId: req.tenant!.id },
      });
      if (!row) {
        res.status(404).json({ success: false, message: 'Webhook not found' });
        return;
      }
      await repo.remove(row);
      res.json({ success: true });
    } catch (err: any) {
      console.error('Webhook delete error:', err);
      res
        .status(500)
        .json({ success: false, message: err?.message || 'Delete failed' });
    }
  };
}
