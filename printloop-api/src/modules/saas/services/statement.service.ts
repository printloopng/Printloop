import { repos } from '@/config/repos';

export interface StatementMonth {
  year: number;
  month: number;
}

export function parseMonth(input: string | undefined): StatementMonth {
  const now = new Date();
  if (!input || !/^\d{4}-\d{2}$/.test(input)) {
    return { year: now.getUTCFullYear(), month: now.getUTCMonth() + 1 };
  }
  const [y, m] = input.split('-').map(Number);
  if (m < 1 || m > 12) {
    return { year: now.getUTCFullYear(), month: now.getUTCMonth() + 1 };
  }
  return { year: y, month: m };
}

function monthRange({ year, month }: StatementMonth): [Date, Date] {
  const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));
  const end = new Date(Date.UTC(year, month, 1, 0, 0, 0));
  return [start, end];
}

function csvCell(v: unknown): string {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function csvRow(cells: unknown[]): string {
  return cells.map(csvCell).join(',');
}

export async function buildMonthlyStatementCsv(
  tenantId: string,
  tenantSlug: string,
  m: StatementMonth,
): Promise<{ csv: string; filename: string }> {
  const [start, end] = monthRange(m);
  const mm = String(m.month).padStart(2, '0');

  const txns = await repos.transaction().findInMonthRange(tenantId, start, end);
  const payouts = await repos.payout().findInMonthRange(tenantId, start, end);

  const lines: string[] = [];
  lines.push(`PrintLoop statement,${tenantSlug},${m.year}-${mm}`);
  lines.push('');

  lines.push('TRANSACTIONS');
  lines.push(
    csvRow(['date', 'type', 'description', 'gross', 'commission', 'net', 'reference']),
  );
  let grossSum = 0;
  let commissionSum = 0;
  let netSum = 0;
  for (const tx of txns) {
    const gross = Number(tx.amount);
    const commission = Number(tx.commissionAmount);
    const net = Math.round((gross - commission) * 100) / 100;
    grossSum += gross;
    commissionSum += commission;
    netSum += net;
    lines.push(
      csvRow([
        new Date(tx.createdAt).toISOString(),
        tx.type,
        tx.description,
        gross.toFixed(2),
        commission.toFixed(2),
        net.toFixed(2),
        tx.reference ?? '',
      ]),
    );
  }
  lines.push(
    csvRow([
      'TOTAL',
      '',
      `${txns.length} transactions`,
      grossSum.toFixed(2),
      commissionSum.toFixed(2),
      netSum.toFixed(2),
      '',
    ]),
  );
  lines.push('');

  lines.push('PAYOUTS');
  lines.push(csvRow(['date', 'status', 'trigger', 'amount', 'fee', 'reference']));
  let payoutSum = 0;
  for (const p of payouts) {
    payoutSum += Number(p.amount);
    lines.push(
      csvRow([
        new Date(p.createdAt).toISOString(),
        p.status,
        p.trigger,
        Number(p.amount).toFixed(2),
        Number(p.feeAmount).toFixed(2),
        p.paystackTransferReference ?? '',
      ]),
    );
  }
  lines.push(csvRow(['TOTAL', '', `${payouts.length} payouts`, payoutSum.toFixed(2), '', '']));

  const csv = lines.join('\r\n') + '\r\n';
  const filename = `printloop-statement-${tenantSlug}-${m.year}-${mm}.csv`;
  return { csv, filename };
}
