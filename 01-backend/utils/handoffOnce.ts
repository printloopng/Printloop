const consumed = new Map<string, number>();

const SWEEP_EVERY = 200;
let opsSinceSweep = 0;

function sweep(): void {
  const now = Date.now();
  for (const [jti, exp] of consumed) {
    if (exp <= now) consumed.delete(jti);
  }
}

export function consumeJtiOnce(jti: string, expSeconds: number | undefined): boolean {
  if (++opsSinceSweep >= SWEEP_EVERY) {
    opsSinceSweep = 0;
    sweep();
  }
  if (consumed.has(jti)) return false;
  const expMs = expSeconds ? expSeconds * 1000 : Date.now() + 10 * 60 * 1000;
  consumed.set(jti, expMs);
  return true;
}
