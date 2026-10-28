import { Config } from '@/config';
import { type Request, type Response, type NextFunction } from 'express';
import { In, LessThanOrEqual } from 'typeorm';
import jwt from 'jsonwebtoken';
import { AppDataSource } from '@/config/data-source';
import { Tenant, TenantStatus } from '@/database/entities/tenant.entity';
import {
  PricingConfig,
  PaperSize,
  ColorType,
} from '@/database/entities/pricingConfig.entity';
import { TenantBranding } from '@/database/entities/tenantBranding.entity';
import { Kiosk, KioskStatus } from '@/database/entities/kiosk.entity';
import { PrintJob, PrintJobStatus } from '@/database/entities/printJob.entity';
import { ShopReview } from '@/database/entities/shopReview.entity';
import { User } from '@/database/entities/user.entity';
import { randomBytes } from 'node:crypto';
import { haversineKm } from '@/modules/public/services/geocoding.service';
import { consumeJtiOnce } from '@/core/utils/handoffOnce';
import { getJwtSecret } from '@/core/utils/jwt';

const DEFAULT_RADIUS_KM = 10;
const HANDOFF_TTL_SECONDS = 5 * 60;

interface HandoffPayload {
  tenantSlug: string;
  email?: string;
  kind: 'handoff';
}
const MAX_RADIUS_KM = 50;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;
const ONLINE_WINDOW_MS = 5 * 60 * 1000;

interface PublicShop {
  id: string;
  slug: string;
  name: string;
  status: TenantStatus;
  address: string | null;
  lat: number | null;
  lng: number | null;
  
  distanceKm?: number;
  
  agentOnline: boolean;
  
  availability: 'open' | 'busy' | 'closed';
  
  brand: {
    wordmark: string | null;
    primaryColor: string | null;
    logoUrl: string | null;
  };
  
  cheapestPerPage: number | null;
  
  hasColor: boolean;
  
  paperSizes: PaperSize[];
  queueLength: number;
  estimatedWaitMin: number;
  ratingAverage: number;
  ratingCount: number;
  photos: string[];
}

async function buildPublicShops(
  tenants: Tenant[],
  origin: { lat: number; lng: number } | null,
): Promise<PublicShop[]> {
  if (tenants.length === 0) return [];
  const tenantIds = tenants.map((t) => t.id);

  const [pricing, brandings, kiosks, activeJobs, reviews] = await Promise.all([
    AppDataSource.getRepository(PricingConfig).find({
      where: { tenantId: In(tenantIds) },
    }),
    AppDataSource.getRepository(TenantBranding).find({
      where: { tenantId: In(tenantIds) },
    }),
    AppDataSource.getRepository(Kiosk).find({
      where: { tenantId: In(tenantIds) },
    }),
    AppDataSource.getRepository(PrintJob).find({
      where: {
        tenantId: In(tenantIds),
        status: In([PrintJobStatus.READY, PrintJobStatus.PRINTING, PrintJobStatus.RELEASING]),
      },
      select: ['id', 'tenantId'],
    }),
    AppDataSource.getRepository(ShopReview).find({
      where: { tenantId: In(tenantIds) },
      relations: ['user'],
    }),
  ]);

  const pricingByTenant = new Map<string, PricingConfig[]>();
  for (const p of pricing) {
    const tid = p.tenantId!;
    const arr = pricingByTenant.get(tid) || [];
    arr.push(p);
    pricingByTenant.set(tid, arr);
  }
  const brandByTenant = new Map<string, TenantBranding>();
  for (const b of brandings) brandByTenant.set(b.tenantId, b);
  const kiosksByTenant = new Map<string, Kiosk[]>();
  for (const k of kiosks) {
    const tid = k.tenantId!;
    const arr = kiosksByTenant.get(tid) || [];
    arr.push(k);
    kiosksByTenant.set(tid, arr);
  }
  const jobsByTenant = new Map<string, number>();
  for (const j of activeJobs) {
    const tid = j.tenantId!;
    jobsByTenant.set(tid, (jobsByTenant.get(tid) || 0) + 1);
  }
  const reviewsByTenant = new Map<string, ShopReview[]>();
  for (const r of reviews) {
    const tid = r.tenantId;
    const arr = reviewsByTenant.get(tid) || [];
    arr.push(r);
    reviewsByTenant.set(tid, arr);
  }

  const now = Date.now();
  return tenants.map((t) => {
    const tPricing = pricingByTenant.get(t.id) || [];
    const a4bw = tPricing.filter(
      (p) =>
        p.paperSize === PaperSize.A4 && p.colorType === ColorType.BLACK_WHITE,
    );
    const a4Prices = a4bw
      .flatMap((p) => [p.price100Simplex, p.price300Simplex, p.price600Simplex])
      .filter((n): n is number => typeof n === 'number' && Number.isFinite(n));
    const cheapest = a4Prices.length ? Math.min(...a4Prices) : null;

    const b = brandByTenant.get(t.id);
    const tKiosks = kiosksByTenant.get(t.id) || [];

    const colorKnown = tKiosks.some((k) => k.capColor !== null && k.capColor !== undefined);
    const hwColor = colorKnown ? tKiosks.some((k) => k.capColor === true) : true;
    const hasColor = tPricing.some((p) => p.colorType === ColorType.COLOR) && hwColor;

    const a3Known = tKiosks.some((k) => k.capA3 !== null && k.capA3 !== undefined);
    const hwA3 = a3Known ? tKiosks.some((k) => k.capA3 === true) : true;
    const paperSizes = Array.from(new Set(tPricing.map((p) => p.paperSize))).filter(
      (s) => s !== PaperSize.A3 || hwA3,
    );
    const agentOnline = tKiosks.some(
      (k) =>
        k.status === KioskStatus.ACTIVE &&
        (Config.seedDemo || Config.nodeEnv !== 'production' || (k.lastSeenAt && now - new Date(k.lastSeenAt).getTime() < ONLINE_WINDOW_MS)),
    );

    const queueLength = jobsByTenant.get(t.id) || 0;
    const estimatedWaitMin = Math.ceil(queueLength * 1.5);

    const tReviews = reviewsByTenant.get(t.id) || [];
    const ratingAvg = tReviews.length
      ? tReviews.reduce((sum, r) => sum + r.rating, 0) / tReviews.length
      : 0;

    const out: PublicShop = {
      id: t.id,
      slug: t.slug,
      name: t.name,
      status: t.status,
      address: t.address,
      lat: t.lat,
      lng: t.lng,
      agentOnline,
      availability: t.availability,
      brand: {
        wordmark: b?.wordmark ?? null,
        primaryColor: b?.primaryColor ?? null,
        logoUrl: b?.logoUrl ?? null,
      },
      cheapestPerPage: cheapest,
      hasColor,
      paperSizes,
      queueLength,
      estimatedWaitMin,
      ratingAverage: Number(ratingAvg.toFixed(1)),
      ratingCount: tReviews.length,
      photos: t.photos || [],
    };
    if (origin && t.lat != null && t.lng != null) {
      out.distanceKm = haversineKm(origin.lat, origin.lng, t.lat, t.lng);
    }
    return out;
  });
}

function num(raw: unknown, def: number, max: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return def;
  return Math.min(n, max);
}

export class DiscoveryController {

  shopsNearby = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const lat = Number(req.query.lat);
  const lng = Number(req.query.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    res.status(400).json({
      success: false,
      message: 'lat and lng query params are required.',
      code: 'COORDS_REQUIRED',
    });
    return;
  }
  const radiusKm = num(req.query.radius, DEFAULT_RADIUS_KM, MAX_RADIUS_KM);
  const limit = num(req.query.limit, DEFAULT_LIMIT, MAX_LIMIT);

  const dLat = radiusKm / 111;
  const dLng = radiusKm / 110;
  const candidates = await AppDataSource.getRepository(Tenant)
    .createQueryBuilder('t')
    .where('t.isDiscoverable = :d', { d: true })
    .andWhere('t.status = :s', { s: TenantStatus.ACTIVE })
    .andWhere("t.availability != 'closed'")
    .andWhere('t.lat IS NOT NULL AND t.lng IS NOT NULL')
    .andWhere('t.lat BETWEEN :latMin AND :latMax', {
      latMin: lat - dLat,
      latMax: lat + dLat,
    })
    .andWhere('t.lng BETWEEN :lngMin AND :lngMax', {
      lngMin: lng - dLng,
      lngMax: lng + dLng,
    })
    .getMany();

  const enriched = await buildPublicShops(candidates, { lat, lng });
  const inRadius = enriched
    .filter((s) => (s.distanceKm ?? Infinity) <= radiusKm)
    .sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity))
    .slice(0, limit);

  res.json({
    success: true,
    data: {
      origin: { lat, lng },
      radiusKm,
      count: inRadius.length,
      shops: inRadius,
    },
  });
};

  listShops = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const limit = num(req.query.limit, DEFAULT_LIMIT, MAX_LIMIT);
  const tenants = await AppDataSource.getRepository(Tenant)
    .createQueryBuilder('t')
    .where('t.isDiscoverable = :d', { d: true })
    .andWhere('t.status = :s', { s: TenantStatus.ACTIVE })
    .andWhere("t.availability != 'closed'")
    .orderBy('t.name', 'ASC')
    .limit(limit)
    .getMany();
  const enriched = await buildPublicShops(tenants, null);
  res.json({
    success: true,
    data: { count: enriched.length, shops: enriched },
  });
};

  shopBySlug = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const slug = String(req.params.slug || '').trim().toLowerCase();
  if (!slug) {
    res.status(400).json({ success: false, message: 'Slug required.' });
    return;
  }
  const tenant = await AppDataSource.getRepository(Tenant).findOne({
    where: { slug },
  });
  if (!tenant || !tenant.isDiscoverable || tenant.status !== TenantStatus.ACTIVE) {
    res.status(404).json({
      success: false,
      message: 'Shop not found.',
      code: 'SHOP_NOT_FOUND',
    });
    return;
  }
  const origin =
    Number.isFinite(Number(req.query.lat)) &&
    Number.isFinite(Number(req.query.lng))
      ? { lat: Number(req.query.lat), lng: Number(req.query.lng) }
      : null;
  const [pub] = await buildPublicShops([tenant], origin);

  const pricing = await AppDataSource.getRepository(PricingConfig).find({
    where: { tenantId: tenant.id },
  });

  const reviewsRepo = AppDataSource.getRepository(ShopReview);
  const reviews = await reviewsRepo.find({
    where: { tenantId: tenant.id },
    relations: ['user'],
    order: { createdAt: 'DESC' },
  });

  res.json({
    success: true,
    data: {
      shop: pub,
      pricing: pricing.map((p) => ({
        paperSize: p.paperSize,
        colorType: p.colorType,
        price100Simplex: p.price100Simplex,
        price300Simplex: p.price300Simplex,
        price600Simplex: p.price600Simplex,
        price100Duplex: p.price100Duplex,
        price300Duplex: p.price300Duplex,
        price600Duplex: p.price600Duplex,
      })),
      reviews: reviews.map((r) => ({
        id: r.id,
        rating: r.rating,
        comment: r.comment,
        photoUrl: r.photoUrl,
        createdAt: r.createdAt,
        user: {
          firstName: r.user?.firstName || 'Anonymous',
          lastName: r.user?.lastName ? r.user.lastName[0] + '.' : '',
        },
      })),
    },
  });
};

  shopReviews = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const slug = String(req.params.slug || '').trim().toLowerCase();
    const tenant = await AppDataSource.getRepository(Tenant).findOne({ where: { slug } });
    if (!tenant) {
      res.status(404).json({ success: false, message: 'Shop not found.' });
      return;
    }
    const reviews = await AppDataSource.getRepository(ShopReview).find({
      where: { tenantId: tenant.id },
      relations: ['user'],
      order: { createdAt: 'DESC' },
    });
    res.json({
      success: true,
      data: reviews.map((r) => ({
        id: r.id,
        rating: r.rating,
        comment: r.comment,
        photoUrl: r.photoUrl,
        createdAt: r.createdAt,
        user: {
          firstName: r.user?.firstName || 'Anonymous',
          lastName: r.user?.lastName ? r.user.lastName[0] + '.' : '',
        },
      })),
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
};

  createHandoff = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const slug = String(req.body?.slug || '').trim().toLowerCase();
    const email = req.body?.email
      ? String(req.body.email).trim().toLowerCase()
      : undefined;
    if (!slug) {
      res.status(400).json({
        success: false,
        message: 'slug is required.',
        code: 'SLUG_REQUIRED',
      });
      return;
    }
    if (email && !/.+@.+\..+/.test(email)) {
      res.status(400).json({
        success: false,
        message: 'email looks invalid.',
        code: 'EMAIL_INVALID',
      });
      return;
    }
    const tenant = await AppDataSource.getRepository(Tenant).findOne({
      where: { slug },
    });
    if (
      !tenant ||
      !tenant.isDiscoverable ||
      tenant.status !== TenantStatus.ACTIVE
    ) {
      res.status(404).json({
        success: false,
        message: 'Shop not available for handoff.',
        code: 'SHOP_NOT_AVAILABLE',
      });
      return;
    }
    const payload: HandoffPayload = { tenantSlug: tenant.slug, kind: 'handoff' };
    if (email) payload.email = email;
    const token = jwt.sign(payload, getJwtSecret(), {
      expiresIn: HANDOFF_TTL_SECONDS,
    });
    res.json({
      success: true,
      data: { token, expiresIn: HANDOFF_TTL_SECONDS },
    });
  } catch (err: any) {
    console.error('[discovery/handoff] mint error:', err);
    res.status(500).json({
      success: false,
      message: err?.message || 'Could not mint handoff token.',
    });
  }
};

  verifyHandoff = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const token = String(req.query.token || '');
  if (!token) {
    res.status(400).json({
      success: false,
      message: 'token query param required.',
      code: 'TOKEN_REQUIRED',
    });
    return;
  }
  try {
    const decoded = jwt.verify(token, getJwtSecret()) as HandoffPayload &
      jwt.JwtPayload;
    if (decoded.kind !== 'handoff') {
      res.status(400).json({
        success: false,
        message: 'Not a handoff token.',
        code: 'TOKEN_KIND_MISMATCH',
      });
      return;
    }
    if (decoded.jti && !consumeJtiOnce(decoded.jti, decoded.exp)) {
      res.status(401).json({
        success: false,
        message: 'This sign-in link was already used. Tap the course button again.',
        code: 'TOKEN_USED',
      });
      return;
    }
    res.json({
      success: true,
      data: {
        tenantSlug: decoded.tenantSlug,
        email: decoded.email ?? null,
        expiresAt: decoded.exp
          ? new Date(decoded.exp * 1000).toISOString()
          : null,
      },
    });
  } catch (err: any) {
    const expired = err && err.name === 'TokenExpiredError';
    res.status(400).json({
      success: false,
      message: expired
        ? 'Handoff link has expired. Go back to /find and pick again.'
        : 'Handoff link is invalid.',
      code: expired ? 'TOKEN_EXPIRED' : 'TOKEN_INVALID',
    });
  }
};

  seedDemoNearby = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!Config.seedDemo || Config.nodeEnv === 'production') {
      res.status(404).json({ success: false, message: 'Not found' });
      return;
    }
    const lat = Number(req.body.lat);
    const lng = Number(req.body.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      res.status(400).json({ success: false, message: 'Invalid lat/lng' });
      return;
    }

    const tenantRepo = AppDataSource.getRepository(Tenant);
    const count = await tenantRepo.createQueryBuilder('t')
      .where('t.isDiscoverable = :d', { d: true })
      .andWhere('t.lat BETWEEN :latMin AND :latMax', { latMin: lat - 0.05, latMax: lat + 0.05 })
      .andWhere('t.lng BETWEEN :lngMin AND :lngMax', { lngMin: lng - 0.05, lngMax: lng + 0.05 })
      .getCount();

    if (count > 0) {
      res.json({ success: true, seeded: false, message: 'Shops already exist near this location' });
      return;
    }

    const studentUser = await AppDataSource.getRepository(User).findOne({
      where: { email: 'student@printloop.test' },
    });

    const demoShops = [
      {
        name: 'QuickPrint Campus Hub',
        slug: 'quickprint-campus',
        color: '#D14B2C',
        latOffset: 0.003,
        lngOffset: 0.002,
        online: true,
        address: 'Directly opposite the Main Lecture Theater',
        reviews: [
          { rating: 5, comment: 'Super fast printing, very reliable.' },
          { rating: 4, comment: 'Great quality, but queue can be long during exams.' }
        ]
      },
      {
        name: 'Unilag Copy & Bind Center',
        slug: 'unilag-copy',
        color: '#225275',
        latOffset: -0.002,
        lngOffset: 0.004,
        online: true,
        address: 'Beside Faculty of Science block',
        reviews: [
          { rating: 4, comment: 'Nice and clean prints. Affordable prices.' }
        ]
      },
      {
        name: 'Express Laser Prints',
        slug: 'express-laser',
        color: '#D97706',
        latOffset: 0.005,
        lngOffset: -0.003,
        online: true,
        address: 'Commercial Center, Ground Floor',
        reviews: [
          { rating: 5, comment: 'Highly recommended for bulk thesis prints!' }
        ]
      }
    ];

    const pricingRepo = AppDataSource.getRepository(PricingConfig);
    const brandingRepo = AppDataSource.getRepository(TenantBranding);
    const kioskRepo = AppDataSource.getRepository(Kiosk);
    const reviewRepo = AppDataSource.getRepository(ShopReview);

    for (const d of demoShops) {
      let t = await tenantRepo.findOne({ where: { slug: d.slug } });
      if (!t) {
        t = tenantRepo.create({
          name: d.name,
          slug: d.slug,
          status: TenantStatus.ACTIVE,
          isDiscoverable: true,
          lat: lat + d.latOffset,
          lng: lng + d.lngOffset,
          address: d.address,
          photos: [
            'https://images.unsplash.com/photo-1568605117036-5fe5e7bab0b7?auto=format&fit=crop&w=500&q=80',
            'https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?auto=format&fit=crop&w=500&q=80'
          ]
        });
        t = await tenantRepo.save(t);
      } else {
        t.lat = lat + d.latOffset;
        t.lng = lng + d.lngOffset;
        t.isDiscoverable = true;
        t.status = TenantStatus.ACTIVE;
        await tenantRepo.save(t);
      }

      let brand = await brandingRepo.findOne({ where: { tenantId: t.id } });
      if (!brand) {
        brand = brandingRepo.create({
          tenantId: t.id,
          primaryColor: d.color,
          wordmark: d.name
        });
        await brandingRepo.save(brand);
      }

      const pricingCount = await pricingRepo.count({ where: { tenantId: t.id } });
      if (pricingCount === 0) {
        await pricingRepo.save([
          pricingRepo.create({
            tenantId: t.id,
            paperSize: PaperSize.A4, colorType: ColorType.BLACK_WHITE,
            pricePerPage: 5,
            price100Simplex: 5, price300Simplex: 5, price600Simplex: 10,
            price100Duplex: 8, price300Duplex: 8, price600Duplex: 15,
          }),
          pricingRepo.create({
            tenantId: t.id,
            paperSize: PaperSize.A4, colorType: ColorType.COLOR,
            pricePerPage: 25,
            price100Simplex: 25, price300Simplex: 25, price600Simplex: 35,
            price100Duplex: 40, price300Duplex: 40, price600Duplex: 50,
          })
        ]);
      }

      const kiosk = await kioskRepo.findOne({ where: { tenantId: t.id } });
      if (!kiosk) {
        await kioskRepo.save(
          kioskRepo.create({
            tenantId: t.id,
            name: `${d.name} Kiosk`,
            location: d.address,
            campus: 'Demo',
            status: d.online ? KioskStatus.ACTIVE : KioskStatus.OFFLINE,
            apiKey: `KSK_${randomBytes(18).toString('base64url')}`,
            lastSeenAt: d.online ? new Date() : new Date(Date.now() - 24 * 3600 * 1000)
          })
        );
      } else {
        kiosk.status = d.online ? KioskStatus.ACTIVE : KioskStatus.OFFLINE;
        kiosk.lastSeenAt = d.online ? new Date() : new Date(Date.now() - 24 * 3600 * 1000);
        await kioskRepo.save(kiosk);
      }

      if (studentUser) {
        const reviewCount = await reviewRepo.count({ where: { tenantId: t.id } });
        if (reviewCount === 0) {
          for (const r of d.reviews) {
            await reviewRepo.save(
              reviewRepo.create({
                tenantId: t.id,
                userId: studentUser.id,
                rating: r.rating,
                comment: r.comment
              })
            );
          }
        }
      }
    }

    res.json({ success: true, seeded: true, message: 'Seeded demo printshops near your location' });
  } catch (err: any) {
    console.error('Failed to seed nearby shops:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

}

export const discoveryController = new DiscoveryController();
