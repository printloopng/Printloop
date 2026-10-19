import { repos } from '@/config/repos';
import { PrintJobStatus } from '@/database/entities/printJob.entity';
import { KioskStatus } from '@/database/entities/kiosk.entity';
import { GroupSessionStatus } from '@/database/entities/groupSession.entity';
import { Tenant } from '@/database/entities/tenant.entity';

export interface DashboardStats {
  users: {
    total: number;
    activeToday: number;
    activeThisWeek: number;
    blocked: number;
  };
  jobs: {
    total: number;
    completedToday: number;
    pendingNow: number;
    failedToday: number;
    byStatus: Array<{ status: string; count: number }>;
  };
  revenue: {
    today: number;
    thisWeek: number;
    thisMonth: number;
    allTime: number;
    byDay: Array<{ date: string; revenue: number; jobCount: number }>;
  };
  pages: {
    today: number;
    thisWeek: number;
    thisMonth: number;
    allTime: number;
  };
  kiosks: {
    total: number;
    online: number;
    offline: number;
    maintenance: number;
    disabled: number;
  };
  groupSessions: {
    open: number;
    closed: number;
    totalThisMonth: number;
  };
}

export class AdminDashboardService {
  async getStats(tenant: Tenant): Promise<DashboardStats> {
    const tid = tenant.id;
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const startOfWeek = new Date();
    startOfWeek.setDate(startOfWeek.getDate() - 7);

    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const userRepo = repos.user();
    const jobRepo = repos.printJob();
    const paymentRepo = repos.payment();
    const kioskRepo = repos.kiosk();
    const sessionRepo = repos.groupSession();

    const [
      userTotal,
      userActiveToday,
      userActiveWeek,
      userBlocked,
      jobTotal,
      jobCompletedToday,
      jobPending,
      jobFailedToday,
      jobByStatus,
      revenueToday,
      revenueWeek,
      revenueMonth,
      revenueAllTime,
      revenueByDay,
      pagesToday,
      pagesWeek,
      pagesMonth,
      pagesAllTime,
      kioskCounts,
      groupSessionsOpen,
      groupSessionsClosed,
      groupSessionsMonth,
    ] = await Promise.all([
      userRepo.count({ where: { tenantId: tid } }),
      userRepo.countActiveLoginsSince(tid, startOfDay),
      userRepo.countActiveLoginsSince(tid, startOfWeek),
      userRepo.count({ where: { tenantId: tid, isBlocked: true } }),

      jobRepo.count({ where: { tenantId: tid } }),
      jobRepo.countCompletedSince(tid, startOfDay),
      jobRepo.count({ where: { tenantId: tid, status: PrintJobStatus.READY } }),
      jobRepo.countFailedSince(tid, startOfDay),
      jobRepo.countGroupedByStatus(tid),

      paymentRepo.sumSuccessfulRevenue(tid, startOfDay),
      paymentRepo.sumSuccessfulRevenue(tid, startOfWeek),
      paymentRepo.sumSuccessfulRevenue(tid, startOfMonth),
      paymentRepo.sumSuccessfulRevenue(tid),
      paymentRepo.revenueByDaySince(tid, thirtyDaysAgo),

      jobRepo.sumDonePages(tid, startOfDay),
      jobRepo.sumDonePages(tid, startOfWeek),
      jobRepo.sumDonePages(tid, startOfMonth),
      jobRepo.sumDonePages(tid),

      kioskRepo.countGroupedByStatus(tid),

      sessionRepo.count({ where: { tenantId: tid, status: GroupSessionStatus.OPEN } }),
      sessionRepo.count({ where: { tenantId: tid, status: GroupSessionStatus.CLOSED } }),
      sessionRepo.countCreatedSince(tid, startOfMonth),
    ]);

    const kioskByStatus: Record<string, number> = {};
    for (const row of kioskCounts) kioskByStatus[row.status] = parseInt(row.count, 10);

    return {
      users: {
        total: userTotal,
        activeToday: userActiveToday,
        activeThisWeek: userActiveWeek,
        blocked: userBlocked,
      },
      jobs: {
        total: jobTotal,
        completedToday: jobCompletedToday,
        pendingNow: jobPending,
        failedToday: jobFailedToday,
        byStatus: jobByStatus.map((r) => ({ status: r.status, count: parseInt(r.count, 10) })),
      },
      revenue: {
        today: revenueToday,
        thisWeek: revenueWeek,
        thisMonth: revenueMonth,
        allTime: revenueAllTime,
        byDay: revenueByDay,
      },
      pages: {
        today: pagesToday,
        thisWeek: pagesWeek,
        thisMonth: pagesMonth,
        allTime: pagesAllTime,
      },
      kiosks: {
        total: Object.values(kioskByStatus).reduce((a, b) => a + b, 0),
        online: kioskByStatus[KioskStatus.ACTIVE] || 0,
        offline: kioskByStatus[KioskStatus.OFFLINE] || 0,
        maintenance: kioskByStatus[KioskStatus.MAINTENANCE] || 0,
        disabled: kioskByStatus[KioskStatus.DISABLED] || 0,
      },
      groupSessions: {
        open: groupSessionsOpen,
        closed: groupSessionsClosed,
        totalThisMonth: groupSessionsMonth,
      },
    };
  }
}
