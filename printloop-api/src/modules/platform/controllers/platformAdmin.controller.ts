import { Request, Response, NextFunction } from 'express';
import { AppDataSource } from '@/config/data-source';
import { User, UserRole } from '@/database/entities/user.entity';
import { PrintJob } from '@/database/entities/printJob.entity';
import { Payment } from '@/database/entities/payment.entity';
import { SystemSetting } from '@/database/entities/systemSetting.entity';
import { BlogPost, BlogPostStatus } from '@/database/entities/blogPost.entity';
import { Dispute, DisputeStatus } from '@/database/entities/dispute.entity';
import { AuditLog } from '@/database/entities/auditLog.entity';
import { Kiosk } from '@/database/entities/kiosk.entity';
import { Payout } from '@/database/entities/payout.entity';
import { Tenant } from '@/database/entities/tenant.entity';
import { TenantMember } from '@/database/entities/tenantMember.entity';
import { writeAudit } from '@/core/services/audit.service';
import { paginate, scrubUser } from '@/modules/saas/controllers/shopAdmin.controller';

function slugify(input: string): string {
  return (
    String(input)
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 140) || 'post'
  );
}

async function uniqueBlogSlug(base: string, excludeId?: string): Promise<string> {
  const repo = AppDataSource.getRepository(BlogPost);
  const baseSlug = slugify(base);
  let candidate = baseSlug;
  for (let i = 2; ; i++) {
    const existing = await repo.findOne({ where: { slug: candidate } });
    if (!existing || existing.id === excludeId) return candidate;
    candidate = `${baseSlug}-${i}`;
  }
}

function coerceSetting(setting: SystemSetting, raw: unknown): string | null {
  const value = typeof raw === 'string' ? raw : JSON.stringify(raw);
  switch (setting.valueType) {
    case 'number':
      return Number.isFinite(Number(raw)) ? String(Number(raw)) : null;
    case 'boolean':
      return raw === true || raw === 'true' ? 'true' : raw === false || raw === 'false' ? 'false' : null;
    case 'json':
      try {
        JSON.parse(value);
        return value;
      } catch {
        return null;
      }
    default:
      return String(raw ?? '');
  }
}

export class PlatformAdminController {
  listUsers = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { search, role, tenantId } = req.query as Record<string, string>;
      const { page, limit, skip } = paginate(req.query);
      const qb = AppDataSource.getRepository(User).createQueryBuilder('u').where('1 = 1');
      if (role) qb.andWhere('u.role = :role', { role });
      if (tenantId) qb.andWhere('u.tenantId = :tenantId', { tenantId });
      if (search) {
        qb.andWhere(
          '(LOWER(u.email) LIKE :q OR LOWER(u.firstName) LIKE :q OR LOWER(u.lastName) LIKE :q OR u.phoneNumber LIKE :p)',
          { q: `%${search.toLowerCase()}%`, p: `%${search}%` },
        );
      }
      const [users, total] = await qb.orderBy('u.createdAt', 'DESC').skip(skip).take(limit).getManyAndCount();
      res.json({ success: true, data: { users: users.map(scrubUser), total, page, limit, totalPages: Math.ceil(total / limit) } });
    } catch (err) {
      next(err);
    }
  };

  getUser = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = await AppDataSource.getRepository(User).findOne({ where: { id: req.params.id } });
      if (!user) {
        res.status(404).json({ success: false, message: 'User not found' });
        return;
      }
      const [totalJobs, spent, recentJobs, memberships] = await Promise.all([
        AppDataSource.getRepository(PrintJob).count({ where: { userId: user.id } }),
        AppDataSource.getRepository(Payment)
          .createQueryBuilder('p')
          .select('COALESCE(SUM(p.amount), 0)', 'total')
          .where('p.userId = :id AND p.status = :s', { id: user.id, s: 'SUCCESS' })
          .getRawOne(),
        AppDataSource.getRepository(PrintJob).find({ where: { userId: user.id }, order: { createdAt: 'DESC' }, take: 10 }),
        AppDataSource.getRepository(TenantMember).find({ where: { userId: user.id }, relations: ['tenant'] }),
      ]);
      res.json({
        success: true,
        data: {
          user: scrubUser(user),
          stats: { totalJobs, totalSpent: parseFloat(spent?.total || '0') },
          recentJobs,
          memberships: memberships.map((m) => ({ tenantId: m.tenantId, tenantName: m.tenant?.name, role: m.role })),
        },
      });
    } catch (err) {
      next(err);
    }
  };

  blockUser = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { isBlocked, reason } = req.body || {};
      const repo = AppDataSource.getRepository(User);
      const user = await repo.findOne({ where: { id: req.params.id } });
      if (!user) {
        res.status(404).json({ success: false, message: 'User not found' });
        return;
      }
      if (user.id === (req as any).user?.id) {
        res.status(409).json({ success: false, message: "You can't block yourself." });
        return;
      }
      user.isBlocked = Boolean(isBlocked);
      user.blockReason = (isBlocked ? String(reason || '').slice(0, 500) || null : null) as any;
      await repo.save(user);
      await writeAudit(req, isBlocked ? 'user.blocked' : 'user.unblocked', `user:${user.id}`, { reason });
      res.json({ success: true, message: `User ${isBlocked ? 'blocked' : 'unblocked'}` });
    } catch (err) {
      next(err);
    }
  };

  setUserRole = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const role = req.body?.role;
      if (![UserRole.USER, UserRole.ADMIN, UserRole.SUPER_ADMIN].includes(role)) {
        res.status(400).json({ success: false, message: 'Invalid role' });
        return;
      }
      const repo = AppDataSource.getRepository(User);
      const user = await repo.findOne({ where: { id: req.params.id } });
      if (!user) {
        res.status(404).json({ success: false, message: 'User not found' });
        return;
      }
      if (user.id === (req as any).user?.id && role !== UserRole.SUPER_ADMIN) {
        res.status(409).json({ success: false, message: "You can't remove your own platform access." });
        return;
      }
      if (user.role === UserRole.SUPER_ADMIN && role !== UserRole.SUPER_ADMIN) {
        const supers = await repo.count({ where: { role: UserRole.SUPER_ADMIN } });
        if (supers <= 1) {
          res.status(409).json({ success: false, message: 'At least one super admin must remain.' });
          return;
        }
      }
      const from = user.role;
      user.role = role;
      user.adminPrivileges = role === UserRole.ADMIN ? user.adminPrivileges || [] : [];
      await repo.save(user);
      await writeAudit(req, 'user.role_changed', `user:${user.id}`, { from, to: role });
      res.json({ success: true, data: { user: scrubUser(user) } });
    } catch (err) {
      next(err);
    }
  };

  listSettings = async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const settings = await AppDataSource.getRepository(SystemSetting).find({ order: { category: 'ASC', key: 'ASC' } });
      res.json({ success: true, data: { settings } });
    } catch (err) {
      next(err);
    }
  };

  updateSetting = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const repo = AppDataSource.getRepository(SystemSetting);
      const setting = await repo.findOne({ where: { key: req.params.key } });
      if (!setting) {
        res.status(404).json({ success: false, message: 'Setting not found' });
        return;
      }
      if (setting.isReadOnly) {
        res.status(403).json({ success: false, message: 'Setting is read-only' });
        return;
      }
      const value = coerceSetting(setting, req.body?.value);
      if (value === null) {
        res.status(400).json({ success: false, message: `Value must be a valid ${setting.valueType}` });
        return;
      }
      const from = setting.value;
      setting.value = value;
      await repo.save(setting);
      await writeAudit(req, 'setting.updated', `setting:${setting.key}`, { from, to: value });
      res.json({ success: true, data: { setting } });
    } catch (err) {
      next(err);
    }
  };

  listBlog = async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const posts = await AppDataSource.getRepository(BlogPost).find({ order: { updatedAt: 'DESC' } });
      res.json({ success: true, data: posts });
    } catch (err) {
      next(err);
    }
  };

  createBlogPost = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { title, excerpt, content, coverImageUrl, authorName, tags, status } = req.body || {};
      if (!title || !content) {
        res.status(400).json({ success: false, message: 'title and content are required' });
        return;
      }
      const repo = AppDataSource.getRepository(BlogPost);
      const published = status === BlogPostStatus.PUBLISHED;
      const post = await repo.save(
        repo.create({
          tenantId: null,
          slug: await uniqueBlogSlug(title),
          title: String(title).slice(0, 200),
          excerpt: excerpt ? String(excerpt).slice(0, 400) : null,
          content: String(content),
          coverImageUrl: coverImageUrl || null,
          authorName: authorName || null,
          tags: Array.isArray(tags) ? tags.slice(0, 10).map(String) : null,
          status: published ? BlogPostStatus.PUBLISHED : BlogPostStatus.DRAFT,
          publishedAt: published ? new Date() : null,
        }),
      );
      await writeAudit(req, 'blog.created', `post:${post.id}`, { slug: post.slug, title: post.title });
      res.status(201).json({ success: true, data: post });
    } catch (err) {
      next(err);
    }
  };

  updateBlogPost = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const repo = AppDataSource.getRepository(BlogPost);
      const post = await repo.findOne({ where: { id: req.params.id } });
      if (!post) {
        res.status(404).json({ success: false, message: 'Post not found' });
        return;
      }
      const { title, excerpt, content, coverImageUrl, authorName, tags, status } = req.body || {};
      if (title) post.title = String(title).slice(0, 200);
      if (excerpt !== undefined) post.excerpt = excerpt ? String(excerpt).slice(0, 400) : null;
      if (content !== undefined) post.content = String(content);
      if (coverImageUrl !== undefined) post.coverImageUrl = coverImageUrl || null;
      if (authorName !== undefined) post.authorName = authorName || null;
      if (tags !== undefined) post.tags = Array.isArray(tags) ? tags.slice(0, 10).map(String) : null;
      if (status === BlogPostStatus.PUBLISHED && post.status !== BlogPostStatus.PUBLISHED) {
        post.status = BlogPostStatus.PUBLISHED;
        post.publishedAt = post.publishedAt ?? new Date();
      } else if (status === BlogPostStatus.DRAFT) {
        post.status = BlogPostStatus.DRAFT;
        post.publishedAt = null;
      }
      await repo.save(post);
      await writeAudit(req, 'blog.updated', `post:${post.id}`, { slug: post.slug, title: post.title });
      res.json({ success: true, data: post });
    } catch (err) {
      next(err);
    }
  };

  deleteBlogPost = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const repo = AppDataSource.getRepository(BlogPost);
      const post = await repo.findOne({ where: { id: req.params.id } });
      if (!post) {
        res.status(404).json({ success: false, message: 'Post not found' });
        return;
      }
      await repo.remove(post);
      await writeAudit(req, 'blog.deleted', `post:${req.params.id}`, { slug: post.slug });
      res.json({ success: true, message: 'Post deleted' });
    } catch (err) {
      next(err);
    }
  };

  listDisputes = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { status, tenantId } = req.query as Record<string, string>;
      const { page, limit, skip } = paginate(req.query);
      const qb = AppDataSource.getRepository(Dispute)
        .createQueryBuilder('d')
        .leftJoinAndSelect('d.user', 'user')
        .leftJoinAndSelect('d.printJob', 'job')
        .leftJoinAndSelect('d.tenant', 'tenant')
        .where('1 = 1');
      if (status) qb.andWhere('d.status = :status', { status });
      if (tenantId) qb.andWhere('d.tenantId = :tenantId', { tenantId });
      const [rows, total] = await qb.orderBy('d.createdAt', 'DESC').skip(skip).take(limit).getManyAndCount();
      res.json({
        success: true,
        data: {
          disputes: rows.map((d: any) => ({ ...d, user: scrubUser(d.user), tenant: d.tenant ? { id: d.tenant.id, name: d.tenant.name, slug: d.tenant.slug } : null })),
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

  resolveDispute = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { status, resolutionNotes } = req.body || {};
      if (![DisputeStatus.RESOLVED, DisputeStatus.REJECTED].includes(status)) {
        res.status(400).json({ success: false, message: 'Status must be resolved or rejected.' });
        return;
      }
      const repo = AppDataSource.getRepository(Dispute);
      const dispute = await repo.findOne({ where: { id: req.params.id } });
      if (!dispute) {
        res.status(404).json({ success: false, message: 'Dispute not found.' });
        return;
      }
      if (dispute.status !== DisputeStatus.PENDING) {
        res.status(409).json({ success: false, message: 'Dispute has already been resolved or rejected.' });
        return;
      }
      dispute.status = status;
      dispute.resolutionNotes = String(resolutionNotes || '').slice(0, 2000) || `${status} by PrintLoop`;
      await repo.save(dispute);
      await writeAudit(req, `dispute.${status}`, `dispute:${dispute.id}`, { tenantId: dispute.tenantId });
      res.json({ success: true, data: dispute });
    } catch (err) {
      next(err);
    }
  };

  summaryReport = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const days = Math.min(365, Math.max(1, parseInt(String(req.query.days || '30'), 10) || 30));
      const since = new Date(Date.now() - days * 864e5);
      const [gmv, byTenant, jobs, payouts, tenants] = await Promise.all([
        AppDataSource.getRepository(Payment)
          .createQueryBuilder('p')
          .select('COUNT(*)', 'transactions')
          .addSelect('COALESCE(SUM(p.amount), 0)', 'gmv')
          .where('p.status = :s AND p.createdAt >= :since', { s: 'SUCCESS', since })
          .getRawOne(),
        AppDataSource.getRepository(Payment)
          .createQueryBuilder('p')
          .select('p.tenantId', 'tenantId')
          .addSelect('COUNT(*)', 'transactions')
          .addSelect('COALESCE(SUM(p.amount), 0)', 'gmv')
          .where('p.status = :s AND p.createdAt >= :since', { s: 'SUCCESS', since })
          .groupBy('p.tenantId')
          .getRawMany(),
        AppDataSource.getRepository(PrintJob)
          .createQueryBuilder('j')
          .select('j.status', 'status')
          .addSelect('COUNT(*)', 'count')
          .where('j.createdAt >= :since', { since })
          .groupBy('j.status')
          .getRawMany(),
        AppDataSource.getRepository(Payout)
          .createQueryBuilder('po')
          .select('po.status', 'status')
          .addSelect('COUNT(*)', 'count')
          .addSelect('COALESCE(SUM(po.amount), 0)', 'amount')
          .where('po.createdAt >= :since', { since })
          .groupBy('po.status')
          .getRawMany(),
        AppDataSource.getRepository(Tenant).find({ select: { id: true, name: true, slug: true, commissionPct: true } }),
      ]);
      const tenantById = new Map(tenants.map((t) => [t.id, t]));
      const shops = byTenant.map((r) => {
        const t = tenantById.get(r.tenantId);
        const value = parseFloat(r.gmv || '0');
        return {
          tenantId: r.tenantId,
          name: t?.name ?? null,
          slug: t?.slug ?? null,
          transactions: parseInt(r.transactions || '0', 10),
          gmv: value,
          commission: Math.round(value * Number(t?.commissionPct ?? 0)) / 100,
        };
      });
      res.json({
        success: true,
        data: {
          days,
          gmv: parseFloat(gmv?.gmv || '0'),
          transactions: parseInt(gmv?.transactions || '0', 10),
          commission: shops.reduce((sum, s) => sum + s.commission, 0),
          shops: shops.sort((a, b) => b.gmv - a.gmv),
          jobsByStatus: jobs.map((j) => ({ status: j.status, count: Number(j.count) || 0 })),
          payoutsByStatus: payouts.map((p) => ({ status: p.status, count: Number(p.count) || 0, amount: Number(p.amount) || 0 })),
        },
      });
    } catch (err) {
      next(err);
    }
  };

  auditLogs = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { actorId, action, tenantId, fromDate, toDate } = req.query as Record<string, string>;
      const { page, limit, skip } = paginate(req.query);
      const qb = AppDataSource.getRepository(AuditLog).createQueryBuilder('log').where('1 = 1');
      if (actorId) qb.andWhere('log.actorId = :actorId', { actorId });
      if (action) qb.andWhere('log.action = :action', { action });
      if (tenantId) qb.andWhere('log.tenantId = :tenantId', { tenantId });
      if (fromDate) qb.andWhere('log.createdAt >= :fromDate', { fromDate: new Date(fromDate) });
      if (toDate) qb.andWhere('log.createdAt <= :toDate', { toDate: new Date(toDate) });
      const [logs, total] = await qb.orderBy('log.createdAt', 'DESC').skip(skip).take(limit).getManyAndCount();
      res.json({ success: true, data: { logs, total, page, limit, totalPages: Math.ceil(total / limit) } });
    } catch (err) {
      next(err);
    }
  };

  kioskFleet = async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const [kiosks, tenants] = await Promise.all([
        AppDataSource.getRepository(Kiosk).find({ order: { lastSeenAt: 'DESC' } }),
        AppDataSource.getRepository(Tenant).find({ select: { id: true, name: true, slug: true } }),
      ]);
      const tenantById = new Map(tenants.map((t) => [t.id, t]));
      const cutoff = Date.now() - 5 * 60 * 1000;
      res.json({
        success: true,
        data: {
          kiosks: kiosks.map((k: any) => ({
            id: k.id,
            name: k.name,
            location: k.location,
            status: k.status,
            lastSeenAt: k.lastSeenAt,
            online: Boolean(k.lastSeenAt && new Date(k.lastSeenAt).getTime() > cutoff),
            tenant: tenantById.get(k.tenantId) ?? null,
          })),
        },
      });
    } catch (err) {
      next(err);
    }
  };

  listPayouts = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { status, tenantId } = req.query as Record<string, string>;
      const { page, limit, skip } = paginate(req.query);
      const qb = AppDataSource.getRepository(Payout)
        .createQueryBuilder('po')
        .leftJoinAndSelect('po.tenant', 'tenant')
        .where('1 = 1');
      if (status) qb.andWhere('po.status = :status', { status });
      if (tenantId) qb.andWhere('po.tenantId = :tenantId', { tenantId });
      const [rows, total] = await qb.orderBy('po.createdAt', 'DESC').skip(skip).take(limit).getManyAndCount();
      res.json({
        success: true,
        data: {
          payouts: rows.map((p: any) => ({ ...p, tenant: p.tenant ? { id: p.tenant.id, name: p.tenant.name, slug: p.tenant.slug } : null })),
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
}

export const platformAdminController = new PlatformAdminController();
