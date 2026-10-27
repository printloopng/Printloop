import { isPlatformStaff } from '@/common/middleware/impersonation';
import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { AppDataSource } from '@/config/data-source';
import { PricingConfig, PaperSize, ColorType } from '@/database/entities/pricingConfig.entity';
import { Promotion } from '@/database/entities/promotion.entity';
import { PrinterProfile, type PrinterCapabilities } from '@/database/entities/printerProfile.entity';
import { Payment } from '@/database/entities/payment.entity';
import { Dispute, DisputeStatus } from '@/database/entities/dispute.entity';
import { PrintJob } from '@/database/entities/printJob.entity';
import { Kiosk } from '@/database/entities/kiosk.entity';
import { AuditLog } from '@/database/entities/auditLog.entity';
import { GroupSession } from '@/database/entities/groupSession.entity';
import { User, UserRole } from '@/database/entities/user.entity';
import { TenantMember, TenantMemberRole } from '@/database/entities/tenantMember.entity';
import { writeAudit } from '@/core/services/audit.service';
import { EmailService } from '@/core/services/email.service';
import { AdminDashboardService } from '@/modules/platform/services/adminDashboard.service';
import { mintToken, INVITE_TTL_MS } from '@/core/utils/resetToken';
import { appUrls } from '@/core/utils/appUrls';

const SENSITIVE_USER_FIELDS = ['passwordHash', 'salt', 'verificationToken', 'resetToken', 'printToken', 'totpSecret'];
const PAPER_SIZES = ['A4', 'A3', 'LETTER', 'LEGAL'];
const DPI_CHOICES = [100, 300, 600];
const dashboard = new AdminDashboardService();

export function paginate(query: any) {
  const page = Math.max(1, parseInt(String(query.page || '1'), 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(String(query.limit || '50'), 10) || 50));
  return { page, limit, skip: (page - 1) * limit };
}

export function scrubUser<T extends Record<string, any> | null | undefined>(u: T): T {
  if (!u || typeof u !== 'object') return u;
  const copy: any = { ...u };
  for (const f of SENSITIVE_USER_FIELDS) delete copy[f];
  return copy;
}

const num = (v: unknown) => (v === null ? null : Number(v));

function memberRole(req: Request): TenantMemberRole | null {
  const user = (req as any).user;
  if (isPlatformStaff(req)) return TenantMemberRole.OWNER;
  const m = (req.tenantMemberships || []).find((x) => x.tenantId === req.tenant?.id);
  return (m?.role as TenantMemberRole) ?? null;
}

function sanitizeCapabilities(raw: any): PrinterCapabilities | null {
  const maxDpi = DPI_CHOICES.includes(Number(raw?.maxDpi)) ? (Number(raw?.maxDpi) as 100 | 300 | 600) : null;
  const colorMode = raw?.colorMode === 'bw' ? 'bw' : raw?.colorMode === 'color' ? 'color' : null;
  const paperSize = PAPER_SIZES.includes(String(raw?.paperSize).toUpperCase())
    ? (String(raw?.paperSize).toUpperCase() as PrinterCapabilities['paperSize'])
    : null;
  if (maxDpi == null || colorMode == null) return null;
  return { maxDpi, colorMode, paperSize, duplex: Boolean(raw?.duplex) };
}

function promotionFields(body: any): Partial<Promotion> {
  const out: Partial<Promotion> = {};
  if (typeof body.code === 'string') out.code = body.code.trim().toUpperCase().slice(0, 64);
  if (typeof body.name === 'string') out.name = body.name.slice(0, 255);
  if (body.description !== undefined) out.description = body.description ? String(body.description) : (null as any);
  if (body.discountType !== undefined) out.discountType = String(body.discountType) as any;
  if (body.discountValue !== undefined) out.discountValue = Number(body.discountValue) || 0;
  if (body.status !== undefined) out.status = String(body.status) as any;
  if (body.maxUses !== undefined) out.maxUses = body.maxUses === null ? (null as any) : Number(body.maxUses);
  if (body.startsAt !== undefined) out.startsAt = body.startsAt ? new Date(body.startsAt) : (null as any);
  if (body.endsAt !== undefined) out.endsAt = body.endsAt ? new Date(body.endsAt) : (null as any);
  return out;
}

export class ShopAdminController {
  dashboardStats = async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json({ success: true, data: await dashboard.getStats(req.tenant!) });
    } catch (err) {
      next(err);
    }
  };

  groupSessions = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const sessions = await AppDataSource.getRepository(GroupSession).find({
        where: { tenantId: req.tenant!.id },
        order: { createdAt: 'DESC' },
        take: 100,
      });
      res.json({ success: true, data: { sessions } });
    } catch (err) {
      next(err);
    }
  };

  listPricing = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const configs = await AppDataSource.getRepository(PricingConfig).find({
        where: { tenantId: req.tenant!.id },
        order: { paperSize: 'ASC', colorType: 'ASC' },
      });
      res.json({ success: true, data: { configs } });
    } catch (err) {
      next(err);
    }
  };

  createPricing = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const b = req.body || {};
      if (!Object.values(PaperSize).includes(b.paperSize)) {
        res.status(400).json({ success: false, message: `paperSize must be one of: ${Object.values(PaperSize).join(', ')}` });
        return;
      }
      if (!Object.values(ColorType).includes(b.colorType)) {
        res.status(400).json({ success: false, message: `colorType must be one of: ${Object.values(ColorType).join(', ')}` });
        return;
      }
      const repo = AppDataSource.getRepository(PricingConfig);
      const tenantId = req.tenant!.id;
      if (await repo.findOne({ where: { tenantId, paperSize: b.paperSize, colorType: b.colorType } })) {
        res.status(409).json({ success: false, message: 'A config for this paper size + colour already exists' });
        return;
      }
      const config = await repo.save(
        repo.create({
          tenantId,
          paperSize: b.paperSize,
          colorType: b.colorType,
          pricePerPage: Number(b.pricePerPage) || 0,
          duplexMultiplier: b.duplexMultiplier !== undefined ? Number(b.duplexMultiplier) : 1,
          highResolutionMultiplier: b.highResolutionMultiplier !== undefined ? Number(b.highResolutionMultiplier) : 1,
          isActive: true,
          currency: 'NGN',
          notes: b.notes ?? null,
          price100Simplex: b.price100Simplex != null ? Number(b.price100Simplex) : null,
          price300Simplex: b.price300Simplex != null ? Number(b.price300Simplex) : null,
          price600Simplex: b.price600Simplex != null ? Number(b.price600Simplex) : null,
          price100Duplex: b.price100Duplex != null ? Number(b.price100Duplex) : null,
          price300Duplex: b.price300Duplex != null ? Number(b.price300Duplex) : null,
          price600Duplex: b.price600Duplex != null ? Number(b.price600Duplex) : null,
        }),
      );
      await writeAudit(req, 'pricing.created', `pricing:${config.id}`, { paperSize: b.paperSize, colorType: b.colorType });
      res.status(201).json({ success: true, data: { config } });
    } catch (err) {
      next(err);
    }
  };

  updatePricing = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const repo = AppDataSource.getRepository(PricingConfig);
      const config = await repo.findOne({ where: { id: req.params.id, tenantId: req.tenant!.id } });
      if (!config) {
        res.status(404).json({ success: false, message: 'Pricing config not found' });
        return;
      }
      const b = req.body || {};
      if (b.pricePerPage !== undefined) config.pricePerPage = Number(b.pricePerPage);
      if (b.duplexMultiplier !== undefined) config.duplexMultiplier = Number(b.duplexMultiplier);
      if (b.highResolutionMultiplier !== undefined) config.highResolutionMultiplier = Number(b.highResolutionMultiplier);
      if (b.isActive !== undefined) config.isActive = Boolean(b.isActive);
      if (b.notes !== undefined) config.notes = b.notes;
      for (const k of ['price100Simplex', 'price300Simplex', 'price600Simplex', 'price100Duplex', 'price300Duplex', 'price600Duplex'] as const) {
        if (b[k] !== undefined) (config as any)[k] = num(b[k]);
      }
      await repo.save(config);
      await writeAudit(req, 'pricing.updated', `pricing:${config.id}`, b);
      res.json({ success: true, data: { config } });
    } catch (err) {
      next(err);
    }
  };

  deletePricing = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const repo = AppDataSource.getRepository(PricingConfig);
      const config = await repo.findOne({ where: { id: req.params.id, tenantId: req.tenant!.id } });
      if (!config) {
        res.status(404).json({ success: false, message: 'Pricing config not found' });
        return;
      }
      await repo.remove(config);
      await writeAudit(req, 'pricing.deleted', `pricing:${req.params.id}`, {
        paperSize: config.paperSize,
        colorType: config.colorType,
      });
      res.json({ success: true, message: 'Pricing config deleted' });
    } catch (err) {
      next(err);
    }
  };

  listPromotions = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const promotions = await AppDataSource.getRepository(Promotion).find({
        where: { tenantId: req.tenant!.id },
        order: { createdAt: 'DESC' },
      });
      res.json({ success: true, data: { promotions } });
    } catch (err) {
      next(err);
    }
  };

  createPromotion = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const fields = promotionFields(req.body || {});
      if (!fields.code || !fields.name) {
        res.status(400).json({ success: false, message: 'code and name are required' });
        return;
      }
      const repo = AppDataSource.getRepository(Promotion);
      if (await repo.findOne({ where: { tenantId: req.tenant!.id, code: fields.code } })) {
        res.status(409).json({ success: false, message: 'A promotion with this code already exists' });
        return;
      }
      const promotion = await repo.save(repo.create({ ...fields, tenantId: req.tenant!.id }));
      await writeAudit(req, 'promotion.created', `promotion:${promotion.id}`, fields);
      res.status(201).json({ success: true, data: { promotion } });
    } catch (err) {
      next(err);
    }
  };

  updatePromotion = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const repo = AppDataSource.getRepository(Promotion);
      const promotion = await repo.findOne({ where: { id: req.params.id, tenantId: req.tenant!.id } });
      if (!promotion) {
        res.status(404).json({ success: false, message: 'Promotion not found' });
        return;
      }
      const fields = promotionFields(req.body || {});
      Object.assign(promotion, fields);
      await repo.save(promotion);
      await writeAudit(req, 'promotion.updated', `promotion:${promotion.id}`, fields);
      res.json({ success: true, data: { promotion } });
    } catch (err) {
      next(err);
    }
  };

  deletePromotion = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const repo = AppDataSource.getRepository(Promotion);
      const promotion = await repo.findOne({ where: { id: req.params.id, tenantId: req.tenant!.id } });
      if (!promotion) {
        res.status(404).json({ success: false, message: 'Promotion not found' });
        return;
      }
      await repo.remove(promotion);
      await writeAudit(req, 'promotion.deleted', `promotion:${req.params.id}`, { code: promotion.code });
      res.json({ success: true, message: 'Promotion deleted' });
    } catch (err) {
      next(err);
    }
  };

  listPrinterProfiles = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const profiles = await AppDataSource.getRepository(PrinterProfile).find({
        where: { tenantId: req.tenant!.id },
        order: { isDefault: 'DESC', createdAt: 'ASC' },
      });
      res.json({ success: true, data: profiles });
    } catch (err) {
      next(err);
    }
  };

  private async clearOtherDefaults(tenantId: string, excludeId?: string) {
    await AppDataSource.getRepository(PrinterProfile)
      .createQueryBuilder()
      .update(PrinterProfile)
      .set({ isDefault: false })
      .where('tenantId = :tenantId AND id != :id', { tenantId, id: excludeId ?? '00000000-0000-0000-0000-000000000000' })
      .execute();
  }

  createPrinterProfile = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { displayName, ippUri, driverKind, isDefault, capabilities } = req.body || {};
      if (!displayName) {
        res.status(400).json({ success: false, message: 'displayName is required' });
        return;
      }
      const caps = sanitizeCapabilities(capabilities);
      if (!caps) {
        res.status(400).json({
          success: false,
          message: 'capabilities.maxDpi (100|300|600) and capabilities.colorMode (bw|color) are required',
        });
        return;
      }
      const repo = AppDataSource.getRepository(PrinterProfile);
      if (isDefault) await this.clearOtherDefaults(req.tenant!.id);
      const profile = await repo.save(
        repo.create({
          tenantId: req.tenant!.id,
          displayName: String(displayName).slice(0, 120),
          ippUri: ippUri || null,
          driverKind: String(driverKind || 'unknown').slice(0, 20),
          capabilities: caps,
          isDefault: Boolean(isDefault),
        }),
      );
      await writeAudit(req, 'printer_profile.created', `profile:${profile.id}`, { displayName: profile.displayName });
      res.status(201).json({ success: true, data: profile });
    } catch (err) {
      next(err);
    }
  };

  updatePrinterProfile = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const repo = AppDataSource.getRepository(PrinterProfile);
      const profile = await repo.findOne({ where: { id: req.params.id, tenantId: req.tenant!.id } });
      if (!profile) {
        res.status(404).json({ success: false, message: 'Printer profile not found' });
        return;
      }
      const { displayName, ippUri, driverKind, isDefault, isActive, capabilities } = req.body || {};
      if (displayName !== undefined) profile.displayName = String(displayName).slice(0, 120);
      if (ippUri !== undefined) profile.ippUri = ippUri || null;
      if (driverKind !== undefined) profile.driverKind = String(driverKind).slice(0, 20);
      if (isActive !== undefined) profile.isActive = Boolean(isActive);
      if (capabilities) {
        const caps = sanitizeCapabilities(capabilities);
        if (!caps) {
          res.status(400).json({ success: false, message: 'Invalid capabilities' });
          return;
        }
        profile.capabilities = caps;
      }
      if (isDefault) {
        await this.clearOtherDefaults(req.tenant!.id, profile.id);
        profile.isDefault = true;
      } else if (isDefault === false) {
        profile.isDefault = false;
      }
      await repo.save(profile);
      await writeAudit(req, 'printer_profile.updated', `profile:${profile.id}`, { displayName: profile.displayName });
      res.json({ success: true, data: profile });
    } catch (err) {
      next(err);
    }
  };

  deletePrinterProfile = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const repo = AppDataSource.getRepository(PrinterProfile);
      const profile = await repo.findOne({ where: { id: req.params.id, tenantId: req.tenant!.id } });
      if (!profile) {
        res.status(404).json({ success: false, message: 'Printer profile not found' });
        return;
      }
      await repo.remove(profile);
      await writeAudit(req, 'printer_profile.deleted', `profile:${profile.id}`, { displayName: profile.displayName });
      res.json({ success: true, message: 'Printer profile deleted' });
    } catch (err) {
      next(err);
    }
  };

  listPayments = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { method, status, userId, fromDate, toDate } = req.query as Record<string, string>;
      const { page, limit, skip } = paginate(req.query);
      const qb = AppDataSource.getRepository(Payment)
        .createQueryBuilder('p')
        .leftJoinAndSelect('p.user', 'user')
        .where('p.tenantId = :tid', { tid: req.tenant!.id });
      if (method) qb.andWhere('p.method = :method', { method });
      if (status) qb.andWhere('p.status = :status', { status });
      if (userId) qb.andWhere('p.userId = :userId', { userId });
      if (fromDate) qb.andWhere('p.createdAt >= :fromDate', { fromDate: new Date(fromDate) });
      if (toDate) qb.andWhere('p.createdAt <= :toDate', { toDate: new Date(toDate) });
      const [payments, total] = await qb.orderBy('p.createdAt', 'DESC').skip(skip).take(limit).getManyAndCount();
      res.json({
        success: true,
        data: {
          payments: payments.map(({ authorizationCode: _secret, ...p }: any) => ({ ...p, user: scrubUser(p.user) })),
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        },
      });
    } catch (err) {
      next(err);
    }
  };

  listDisputes = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const disputes = await AppDataSource.getRepository(Dispute).find({
        where: { tenantId: req.tenant!.id },
        relations: ['user', 'printJob'],
        order: { createdAt: 'DESC' },
      });
      res.json({ success: true, data: disputes.map((d: any) => ({ ...d, user: scrubUser(d.user) })) });
    } catch (err) {
      next(err);
    }
  };

  resolveDispute = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { status, resolutionNotes } = req.body || {};
      if (![DisputeStatus.RESOLVED, DisputeStatus.REJECTED].includes(status)) {
        res.status(400).json({ success: false, message: 'Status must be resolved or rejected.' });
        return;
      }
      const repo = AppDataSource.getRepository(Dispute);
      const dispute = await repo.findOne({ where: { id: req.params.id, tenantId: req.tenant!.id } });
      if (!dispute) {
        res.status(404).json({ success: false, message: 'Dispute not found.' });
        return;
      }
      if (dispute.status !== DisputeStatus.PENDING) {
        res.status(409).json({ success: false, message: 'Dispute has already been resolved or rejected.' });
        return;
      }
      dispute.status = status;
      dispute.resolutionNotes =
        String(resolutionNotes || '').slice(0, 2000) ||
        (status === DisputeStatus.RESOLVED ? 'Resolved by shop' : 'Rejected by shop');
      await repo.save(dispute);
      await writeAudit(req, `dispute.${status}`, `dispute:${dispute.id}`, { resolutionNotes: dispute.resolutionNotes });
      res.json({ success: true, data: dispute });
    } catch (err) {
      next(err);
    }
  };

  revenueReport = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { fromDate, toDate, format = 'json', days } = req.query as Record<string, string>;
      const qb = AppDataSource.getRepository(Payment)
        .createQueryBuilder('p')
        .select('DATE(p.createdAt)', 'date')
        .addSelect('COUNT(*)', 'transactions')
        .addSelect('COALESCE(SUM(p.amount), 0)', 'revenue')
        .where('p.status = :s AND p.tenantId = :tid', { s: 'SUCCESS', tid: req.tenant!.id });
      if (days) qb.andWhere('p.createdAt >= :since', { since: new Date(Date.now() - (parseInt(days, 10) || 30) * 864e5) });
      if (fromDate) qb.andWhere('p.createdAt >= :fromDate', { fromDate: new Date(fromDate) });
      if (toDate) qb.andWhere('p.createdAt <= :toDate', { toDate: new Date(toDate) });
      const rows = (await qb.groupBy('DATE(p.createdAt)').orderBy('DATE(p.createdAt)', 'ASC').getRawMany()).map((r) => ({
        date: String(r.date instanceof Date ? r.date.toISOString().slice(0, 10) : r.date),
        transactions: Number(r.transactions) || 0,
        revenue: Number(r.revenue) || 0,
      }));
      if (format === 'csv') {
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename="revenue-report.csv"');
        res.send('Date,Transactions,Revenue\n' + rows.map((r) => `${r.date},${r.transactions},${r.revenue}`).join('\n'));
        return;
      }
      const summary = rows.reduce(
        (acc, r) => ({
          totalRevenue: acc.totalRevenue + r.revenue,
          totalTransactions: acc.totalTransactions + r.transactions,
        }),
        { totalRevenue: 0, totalTransactions: 0 },
      );
      res.json({ success: true, data: { rows, summary } });
    } catch (err) {
      next(err);
    }
  };

  kioskReport = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const rows = await AppDataSource.getRepository(PrintJob)
        .createQueryBuilder('j')
        .select('j.kioskId', 'kioskId')
        .addSelect('COUNT(*)', 'totalJobs')
        .addSelect('COALESCE(SUM(j.totalPages), 0)', 'totalPages')
        .addSelect('COALESCE(SUM(j.cost), 0)', 'revenue')
        .where('j.tenantId = :tid AND j.kioskId IS NOT NULL', { tid: req.tenant!.id })
        .groupBy('j.kioskId')
        .getRawMany();
      const kiosks = await AppDataSource.getRepository(Kiosk).find({ where: { tenantId: req.tenant!.id } });
      const names = new Map(kiosks.map((k) => [k.id, k.name]));
      res.json({
        success: true,
        data: {
          kiosks: rows.map((r) => ({
            kioskId: r.kioskId,
            kioskName: names.get(r.kioskId) ?? null,
            totalJobs: Number(r.totalJobs) || 0,
            totalPages: Number(r.totalPages) || 0,
            revenue: Number(r.revenue) || 0,
          })),
        },
      });
    } catch (err) {
      next(err);
    }
  };

  auditLogs = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { actorId, action, fromDate, toDate } = req.query as Record<string, string>;
      const { page, limit, skip } = paginate(req.query);
      const qb = AppDataSource.getRepository(AuditLog)
        .createQueryBuilder('log')
        .where('log.tenantId = :tid', { tid: req.tenant!.id });
      if (actorId) qb.andWhere('log.actorId = :actorId', { actorId });
      if (action) qb.andWhere('log.action = :action', { action });
      if (fromDate) qb.andWhere('log.createdAt >= :fromDate', { fromDate: new Date(fromDate) });
      if (toDate) qb.andWhere('log.createdAt <= :toDate', { toDate: new Date(toDate) });
      const [logs, total] = await qb.orderBy('log.createdAt', 'DESC').skip(skip).take(limit).getManyAndCount();
      res.json({ success: true, data: { logs, total, page, limit, totalPages: Math.ceil(total / limit) } });
    } catch (err) {
      next(err);
    }
  };

  listCustomers = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { search } = req.query as Record<string, string>;
      const { page, limit, skip } = paginate(req.query);
      const qb = AppDataSource.getRepository(User)
        .createQueryBuilder('u')
        .where(
          '(u.tenantId = :tid AND u.role = :customer) OR u.id IN (SELECT pj."userId" FROM print_jobs pj WHERE pj."tenantId" = :tid)',
          { tid: req.tenant!.id, customer: UserRole.USER },
        );
      if (search) {
        qb.andWhere(
          '(LOWER(u.email) LIKE :q OR LOWER(u.firstName) LIKE :q OR LOWER(u.lastName) LIKE :q OR u.phoneNumber LIKE :p)',
          { q: `%${search.toLowerCase()}%`, p: `%${search}%` },
        );
      }
      const [users, total] = await qb.orderBy('u.createdAt', 'DESC').skip(skip).take(limit).getManyAndCount();
      res.json({
        success: true,
        data: { customers: users.map(scrubUser), total, page, limit, totalPages: Math.ceil(total / limit) },
      });
    } catch (err) {
      next(err);
    }
  };

  getCustomer = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tid = req.tenant!.id;
      const user = await AppDataSource.getRepository(User).findOne({ where: { id: req.params.id } });
      const jobRepo = AppDataSource.getRepository(PrintJob);
      const totalJobs = user ? await jobRepo.count({ where: { userId: user.id, tenantId: tid } }) : 0;
      if (!user || (user.tenantId !== tid && totalJobs === 0)) {
        res.status(404).json({ success: false, message: 'Customer not found' });
        return;
      }
      const [spent, recentJobs] = await Promise.all([
        AppDataSource.getRepository(Payment)
          .createQueryBuilder('p')
          .select('COALESCE(SUM(p.amount), 0)', 'total')
          .where('p.userId = :id AND p.status = :s AND p.tenantId = :tid', { id: user.id, s: 'SUCCESS', tid })
          .getRawOne(),
        jobRepo.find({ where: { userId: user.id, tenantId: tid }, order: { createdAt: 'DESC' }, take: 10 }),
      ]);
      res.json({
        success: true,
        data: { customer: scrubUser(user), stats: { totalJobs, totalSpent: parseFloat(spent?.total || '0') }, recentJobs },
      });
    } catch (err) {
      next(err);
    }
  };

  blockCustomer = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { isBlocked, reason } = req.body || {};
      const repo = AppDataSource.getRepository(User);
      const user = await repo.findOne({ where: { id: req.params.id } });
      if (!user || user.tenantId !== req.tenant!.id || user.role !== UserRole.USER) {
        res.status(404).json({
          success: false,
          message: 'Only customers who registered with this shop can be blocked here. Report others to PrintLoop.',
        });
        return;
      }
      user.isBlocked = Boolean(isBlocked);
      user.blockReason = (isBlocked ? String(reason || '').slice(0, 500) || null : null) as any;
      await repo.save(user);
      await writeAudit(req, isBlocked ? 'customer.blocked' : 'customer.unblocked', `user:${user.id}`, { reason });
      res.json({ success: true, message: `Customer ${isBlocked ? 'blocked' : 'unblocked'}` });
    } catch (err) {
      next(err);
    }
  };

  listTeam = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const members = await AppDataSource.getRepository(TenantMember).find({
        where: { tenantId: req.tenant!.id },
        relations: ['user'],
        order: { createdAt: 'ASC' },
      });
      res.json({
        success: true,
        data: {
          members: members.map((m) => ({
            userId: m.userId,
            role: m.role,
            joinedAt: m.createdAt,
            firstName: m.user?.firstName,
            lastName: m.user?.lastName,
            email: m.user?.email,
            phoneNumber: m.user?.phoneNumber,
            isBlocked: m.user?.isBlocked,
          })),
        },
      });
    } catch (err) {
      next(err);
    }
  };

  inviteMember = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const actor = memberRole(req);
      const email = String(req.body?.email || '').trim().toLowerCase();
      const role = req.body?.role === TenantMemberRole.ADMIN ? TenantMemberRole.ADMIN : TenantMemberRole.STAFF;
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        res.status(400).json({ success: false, message: 'A valid email is required' });
        return;
      }
      if (role === TenantMemberRole.ADMIN && actor !== TenantMemberRole.OWNER) {
        res.status(403).json({ success: false, message: 'Only the shop owner can add admins.' });
        return;
      }
      const tenant = req.tenant!;
      const userRepo = AppDataSource.getRepository(User);
      const memberRepo = AppDataSource.getRepository(TenantMember);
      let user =
        (await userRepo.findOne({ where: { email, tenantId: tenant.id } })) ??
        (await userRepo.findOne({ where: { email } }));
      let inviteToken: string | null = null;
      if (!user) {
        const { token } = mintToken(INVITE_TTL_MS);
        inviteToken = token;
        const created = userRepo.create({
            tenantId: tenant.id,
            email,
            firstName: String(req.body?.firstName || '').slice(0, 100) || 'Team',
            lastName: String(req.body?.lastName || '').slice(0, 100) || 'Member',
            phoneNumber: req.body?.phoneNumber ? String(req.body.phoneNumber).slice(0, 32) : '',
            passwordHash: await bcrypt.hash(randomBytes(32).toString('hex'), 12),
            salt: 'bcrypt',
            isEmailVerified: false,
            role: UserRole.ADMIN,
            adminPrivileges: [],
            resetToken: token,
          } as Partial<User>);
        user = await userRepo.save(created);
      } else if (user.role === UserRole.USER) {
        user.role = UserRole.ADMIN;
        user.adminPrivileges = user.adminPrivileges || [];
        await userRepo.save(user);
      }
      if (await memberRepo.findOne({ where: { tenantId: tenant.id, userId: user.id } })) {
        res.status(409).json({ success: false, message: 'This person is already on the team' });
        return;
      }
      await memberRepo.save(memberRepo.create({ tenantId: tenant.id, userId: user.id, role }));
      const link = inviteToken
        ? `${appUrls.shop}/reset-password?invite=1&email=${encodeURIComponent(email)}&token=${encodeURIComponent(inviteToken)}`
        : `${appUrls.shop}/login`;
      try {
        await new EmailService().send({
          to: email,
          subject: `You've been added to ${tenant.name} on PrintLoop`,
          text: `You now have ${role} access to ${tenant.name}. ${inviteToken ? 'Set your password' : 'Sign in'}: ${link}`,
          html: `<p>You now have <strong>${role}</strong> access to <strong>${tenant.name}</strong> on PrintLoop.</p><p><a href="${link}">${inviteToken ? 'Set your password' : 'Sign in'}</a></p>`,
        });
      } catch (mailErr) {
        console.warn('[team] invite email failed:', mailErr);
      }
      await writeAudit(req, 'team.member_added', `user:${user.id}`, { email, role });
      res.status(201).json({ success: true, data: { userId: user.id, email, role, invited: Boolean(inviteToken) } });
    } catch (err) {
      next(err);
    }
  };

  updateMember = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const actor = memberRole(req);
      const role = req.body?.role;
      if (![TenantMemberRole.ADMIN, TenantMemberRole.STAFF].includes(role)) {
        res.status(400).json({ success: false, message: 'role must be admin or staff' });
        return;
      }
      if (actor !== TenantMemberRole.OWNER) {
        res.status(403).json({ success: false, message: 'Only the shop owner can change roles.' });
        return;
      }
      const repo = AppDataSource.getRepository(TenantMember);
      const member = await repo.findOne({ where: { tenantId: req.tenant!.id, userId: req.params.userId } });
      if (!member) {
        res.status(404).json({ success: false, message: 'Team member not found' });
        return;
      }
      if (member.role === TenantMemberRole.OWNER) {
        res.status(409).json({ success: false, message: "The owner's role can't be changed." });
        return;
      }
      const from = member.role;
      member.role = role;
      await repo.save(member);
      await writeAudit(req, 'team.role_changed', `user:${member.userId}`, { from, to: role });
      res.json({ success: true, data: { userId: member.userId, role } });
    } catch (err) {
      next(err);
    }
  };

  removeMember = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const actor = memberRole(req);
      const repo = AppDataSource.getRepository(TenantMember);
      const member = await repo.findOne({ where: { tenantId: req.tenant!.id, userId: req.params.userId } });
      if (!member) {
        res.status(404).json({ success: false, message: 'Team member not found' });
        return;
      }
      if (member.role === TenantMemberRole.OWNER) {
        res.status(409).json({ success: false, message: "The owner can't be removed." });
        return;
      }
      if (member.role === TenantMemberRole.ADMIN && actor !== TenantMemberRole.OWNER) {
        res.status(403).json({ success: false, message: 'Only the shop owner can remove admins.' });
        return;
      }
      await repo.remove(member);
      await writeAudit(req, 'team.member_removed', `user:${req.params.userId}`, { role: member.role });
      res.json({ success: true, message: 'Team member removed' });
    } catch (err) {
      next(err);
    }
  };
}

export const shopAdminController = new ShopAdminController();
