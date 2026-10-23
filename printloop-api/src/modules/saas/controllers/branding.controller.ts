import { Request, Response } from 'express';
import multer from 'multer';
import { DataSource } from 'typeorm';
import { saveBuffer } from '@/core/utils/fileStore';
import { Tenant } from '@/database/entities/tenant.entity';
import {
  brandingPutBodySchema,
  deletePhotoBodySchema,
} from '@/modules/saas/validation/branding.validation';

const COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const URL_RE = /^https?:\/\/.+/i;

export const photoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

export class BrandingController {
  constructor(private ds: DataSource) {}

  getBranding = async (req: Request, res: Response) => {
    const { TenantBranding } = await import('@/database/entities/tenantBranding.entity');
    const repo = this.ds.getRepository(TenantBranding);
    const row =
      (await repo.findOne({ where: { tenantId: req.tenant!.id } })) ??
      repo.create({ tenantId: req.tenant!.id });
    res.json({ success: true, data: row });
  };

  putBranding = async (req: Request, res: Response) => {
    try {
      const parsed = brandingPutBodySchema.safeParse(req.body ?? {});
      const body = parsed.success ? parsed.data : req.body || {};
      for (const f of ['primaryColor', 'secondaryColor', 'accentColor']) {
        if (body[f] != null && !COLOR_RE.test(String(body[f]))) {
          res.status(400).json({
            success: false,
            message: `${f} must be a 7-char #RRGGBB hex (got "${body[f]}")`,
          });
          return;
        }
      }
      for (const f of ['logoUrl', 'faviconUrl']) {
        if (body[f] != null && body[f] !== '' && !URL_RE.test(String(body[f]))) {
          res.status(400).json({
            success: false,
            message: `${f} must be an http(s):// URL`,
          });
          return;
        }
      }
      const { TenantBranding } = await import('@/database/entities/tenantBranding.entity');
      const repo = this.ds.getRepository(TenantBranding);
      let row = await repo.findOne({ where: { tenantId: req.tenant!.id } });
      if (!row) row = repo.create({ tenantId: req.tenant!.id });
      const fields = [
        'wordmark',
        'tagline',
        'logoUrl',
        'faviconUrl',
        'primaryColor',
        'secondaryColor',
        'accentColor',
        'emailFromName',
        'supportEmail',
        'supportPhone',
      ] as const;
      for (const f of fields) {
        if (f in body) (row as any)[f] = body[f] === '' ? null : body[f];
      }
      const saved = await repo.save(row);
      res.json({ success: true, data: saved });
    } catch (err: any) {
      console.error('Branding update error:', err);
      res
        .status(500)
        .json({ success: false, message: err?.message || 'Failed to save branding' });
    }
  };

  uploadPhoto = async (req: Request, res: Response) => {
    try {
      const file = req.file;
      if (!file) {
        res.status(400).json({ success: false, message: 'No image file uploaded' });
        return;
      }
      if (!file.mimetype.startsWith('image/')) {
        res.status(400).json({ success: false, message: 'Uploaded file must be an image' });
        return;
      }
      const stored = await saveBuffer(file.buffer, file.originalname);
      const tenant = req.tenant!;
      tenant.photos = tenant.photos || [];
      tenant.photos.push(stored.url);
      await this.ds.getRepository(Tenant).save(tenant);
      res.json({ success: true, data: { photos: tenant.photos } });
    } catch (err: any) {
      console.error('Photo upload error:', err);
      res.status(500).json({ success: false, message: err.message || 'Failed to upload photo' });
    }
  };

  deletePhoto = async (req: Request, res: Response) => {
    try {
      const parsed = deletePhotoBodySchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        res.status(400).json({ success: false, message: 'Photo URL is required' });
        return;
      }
      const { url } = parsed.data;
      const tenant = req.tenant!;
      if (!tenant.photos || !tenant.photos.includes(url)) {
        res.status(404).json({ success: false, message: 'Photo not found in shop profile' });
        return;
      }
      tenant.photos = tenant.photos.filter((p: string) => p !== url);
      await this.ds.getRepository(Tenant).save(tenant);
      res.json({ success: true, data: { photos: tenant.photos } });
    } catch (err: any) {
      console.error('Photo delete error:', err);
      res.status(500).json({ success: false, message: err.message || 'Failed to delete photo' });
    }
  };
}
