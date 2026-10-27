export const PAYOUT_FILTERS = ["all", "pending", "processing", "paid", "failed"] as const;
export type PayoutFilter = (typeof PAYOUT_FILTERS)[number];

export function isPayoutFilter(value: string | undefined): value is PayoutFilter {
  return PAYOUT_FILTERS.includes(value as PayoutFilter);
}
