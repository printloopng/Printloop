import { AppDataSource } from '../config/database';
import { TenantBalance } from '../entities/tenantBalance.entity';
import { Transaction, TransactionType } from '../entities/transaction.entity';
import { Payout, PayoutStatus } from '../entities/payout.entity';

export async function applyTransactionDelta(
  tenantId: string,
  txAmount: number,
  txCommission: number,
): Promise<void> {
  if (!tenantId) return;
  const tenantNetDelta = round2(txAmount - txCommission);
  const commissionDelta = round2(txCommission);

  await upsertWithDelta(tenantId, (row) => {
    row.lifetimeTenantNet = round2(
      Number(row.lifetimeTenantNet) + tenantNetDelta,
    );
    row.lifetimeCommission = round2(
      Number(row.lifetimeCommission) + commissionDelta,
    );
    row.availableBalance = round2(
      Number(row.lifetimeTenantNet) -
        Number(row.lifetimePayouts) -
        Number(row.pendingPayouts),
    );
  });
}

export async function applyPayoutTransition(
  tenantId: string,
  payout: Pick<Payout, 'amount' | 'status'>,
  previousStatus: PayoutStatus,
): Promise<void> {
  if (!tenantId) return;
  const amt = round2(Number(payout.amount));

  await upsertWithDelta(tenantId, (row) => {
    if (
      payout.status === PayoutStatus.PROCESSING &&
      previousStatus !== PayoutStatus.PROCESSING
    ) {
      row.pendingPayouts = round2(Number(row.pendingPayouts) + amt);
    }
    if (
      payout.status === PayoutStatus.PAID &&
      previousStatus !== PayoutStatus.PAID
    ) {
      if (previousStatus === PayoutStatus.PROCESSING) {
        row.pendingPayouts = round2(Number(row.pendingPayouts) - amt);
      }
      row.lifetimePayouts = round2(Number(row.lifetimePayouts) + amt);
    }
    if (
      (payout.status === PayoutStatus.FAILED ||
        payout.status === PayoutStatus.CANCELLED) &&
      previousStatus === PayoutStatus.PROCESSING
    ) {
      row.pendingPayouts = round2(Number(row.pendingPayouts) - amt);
    }
    row.availableBalance = round2(
      Number(row.lifetimeTenantNet) -
        Number(row.lifetimePayouts) -
        Number(row.pendingPayouts),
    );
  });
}

export async function recomputeFromScratch(
  tenantId: string,
): Promise<TenantBalance> {
  const txRepo = AppDataSource.getRepository(Transaction);
  const payoutRepo = AppDataSource.getRepository(Payout);
  const balanceRepo = AppDataSource.getRepository(TenantBalance);

  const txAggregate = await txRepo
    .createQueryBuilder('tx')
    .select(
      `COALESCE(SUM(CAST(tx.amount AS REAL) - CAST(tx.commissionAmount AS REAL)), 0)`,
      'net',
    )
    .addSelect(
      `COALESCE(SUM(CAST(tx.commissionAmount AS REAL)), 0)`,
      'commission',
    )
    .where('tx.tenantId = :tid', { tid: tenantId })
    .andWhere('tx.type IN (:...types)', {
      types: [
        TransactionType.TOPUP,
        TransactionType.PRINT,
        TransactionType.REFUND,
        TransactionType.CREDIT,
      ],
    })
    .getRawOne<{ net: string; commission: string }>();

  const paidAggregate = await payoutRepo
    .createQueryBuilder('p')
    .select(`COALESCE(SUM(CAST(p.amount AS REAL)), 0)`, 'total')
    .where('p.tenantId = :tid', { tid: tenantId })
    .andWhere('p.status = :s', { s: PayoutStatus.PAID })
    .getRawOne<{ total: string }>();

  const pendingAggregate = await payoutRepo
    .createQueryBuilder('p')
    .select(`COALESCE(SUM(CAST(p.amount AS REAL)), 0)`, 'total')
    .where('p.tenantId = :tid', { tid: tenantId })
    .andWhere('p.status IN (:...states)', {
      states: [PayoutStatus.PENDING, PayoutStatus.PROCESSING],
    })
    .getRawOne<{ total: string }>();

  const lifetimeTenantNet = round2(Number(txAggregate?.net ?? 0));
  const lifetimeCommission = round2(Number(txAggregate?.commission ?? 0));
  const lifetimePayouts = round2(Number(paidAggregate?.total ?? 0));
  const pendingPayouts = round2(Number(pendingAggregate?.total ?? 0));
  const availableBalance = round2(
    lifetimeTenantNet - lifetimePayouts - pendingPayouts,
  );

  let row = await balanceRepo.findOne({ where: { tenantId } });
  if (!row) {
    row = balanceRepo.create({ tenantId });
  }
  row.lifetimeTenantNet = lifetimeTenantNet;
  row.lifetimeCommission = lifetimeCommission;
  row.lifetimePayouts = lifetimePayouts;
  row.pendingPayouts = pendingPayouts;
  row.availableBalance = Math.max(0, availableBalance);
  return balanceRepo.save(row);
}

export async function getTenantBalance(
  tenantId: string,
): Promise<TenantBalance> {
  const repo = AppDataSource.getRepository(TenantBalance);
  const row = await repo.findOne({ where: { tenantId } });
  if (row) return row;
  return recomputeFromScratch(tenantId);
}

async function upsertWithDelta(
  tenantId: string,
  mutate: (row: TenantBalance) => void,
): Promise<void> {
  const repo = AppDataSource.getRepository(TenantBalance);
  let row = await repo.findOne({ where: { tenantId } });
  if (!row) {
    row = repo.create({
      tenantId,
      lifetimeTenantNet: 0,
      lifetimeCommission: 0,
      lifetimePayouts: 0,
      pendingPayouts: 0,
      availableBalance: 0,
    });
  }
  mutate(row);
  row.availableBalance = Math.max(0, Number(row.availableBalance));
  await repo.save(row);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
