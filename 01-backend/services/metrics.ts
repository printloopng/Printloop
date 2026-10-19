/**
 * Lightweight in-process gauges. No Prometheus dependency — values are
 * held in memory for logs / future exporters. Safe no-ops in local dev.
 */

class SimpleGauge {
  private value = 0;
  constructor(public readonly name: string) {}
  set(n: number): void {
    this.value = n;
  }
  get(): number {
    return this.value;
  }
}

/** Count of PrintJobs currently stuck in RENDERING past the reconcile threshold. */
export const stuckRendersGauge = new SimpleGauge('printloop_stuck_renders');
