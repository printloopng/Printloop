import { describe, it, expect } from 'vitest';
import {
  computeCommissionSplit,
  commissionInKobo,
  tenantNetFromTransaction,
} from './commission.service';

const tenant = (pct: number) => ({ commissionPct: pct }) as any;

describe('computeCommissionSplit', () => {
  it('splits 10% of a clean amount', () => {
    const s = computeCommissionSplit(tenant(0.1), 200);
    expect(s.commissionAmount).toBe(20);
    expect(s.tenantNetAmount).toBe(180);
    expect(s.grossAmount).toBe(200);
    expect(s.rateUsed).toBe(0.1);
  });

  it('rounds commission half-up to 2dp and keeps gross = commission + net', () => {
    const s = computeCommissionSplit(tenant(0.1), 99.99);
    expect(s.commissionAmount).toBe(10);
    expect(s.tenantNetAmount).toBe(89.99);
    expect(
      Math.round((s.commissionAmount + s.tenantNetAmount) * 100) / 100,
    ).toBe(99.99);
  });

  it('handles a 7% negotiated rate', () => {
    const s = computeCommissionSplit(tenant(0.07), 1000);
    expect(s.commissionAmount).toBe(70);
    expect(s.tenantNetAmount).toBe(930);
  });

  it('clamps a misconfigured >50% rate to 50%', () => {
    const s = computeCommissionSplit(tenant(0.99), 100);
    expect(s.rateUsed).toBe(0.5);
    expect(s.commissionAmount).toBe(50);
  });

  it('treats a negative rate as 0', () => {
    const s = computeCommissionSplit(tenant(-0.2), 100);
    expect(s.rateUsed).toBe(0);
    expect(s.commissionAmount).toBe(0);
    expect(s.tenantNetAmount).toBe(100);
  });

  it('throws on a non-positive gross', () => {
    expect(() => computeCommissionSplit(tenant(0.1), 0)).toThrow();
    expect(() => computeCommissionSplit(tenant(0.1), -5)).toThrow();
  });
});

describe('commissionInKobo', () => {
  it('floors commission to integer minor units', () => {
    const s = computeCommissionSplit(tenant(0.1), 199.99);
    expect(commissionInKobo(s)).toBe(2000);
  });

  it('never sends a fractional kobo', () => {
    const s = computeCommissionSplit(tenant(0.075), 33.33);
    expect(Number.isInteger(commissionInKobo(s))).toBe(true);
  });
});

describe('tenantNetFromTransaction', () => {
  it('is gross minus commission, 2dp', () => {
    expect(tenantNetFromTransaction(200, 20)).toBe(180);
    expect(tenantNetFromTransaction(99.99, 10)).toBe(89.99);
  });
});
