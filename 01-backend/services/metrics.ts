
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

export const stuckRendersGauge = new SimpleGauge('printloop_stuck_renders');
