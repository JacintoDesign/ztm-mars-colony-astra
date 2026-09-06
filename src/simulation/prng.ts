/**
 * Deterministic pseudo-random number generator (Mulberry32).
 * State is stored as a 32-bit unsigned integer in colony state (`seed`).
 * NEVER uses Math.random() in simulation ticks per AGENTS.md and CONTRACT.md.
 */

export class SeededPRNG {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
    if (this.state === 0) {
      this.state = 133742;
    }
  }

  public getState(): number {
    return this.state;
  }

  public setState(seed: number): void {
    this.state = seed >>> 0;
    if (this.state === 0) {
      this.state = 133742;
    }
  }

  /**
   * Generates a deterministic float in [0, 1).
   */
  public nextFloat(): number {
    this.state = (this.state + 0x6d2b79f5) | 0;
    let t = Math.imul(this.state ^ (this.state >>> 15), 1 | this.state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /**
   * Generates a deterministic integer in [min, max] inclusive.
   */
  public nextInt(min: number, max: number): number {
    const f = this.nextFloat();
    return Math.floor(f * (max - min + 1)) + min;
  }

  /**
   * Returns true with given probability in [0, 1].
   */
  public chance(probability: number): boolean {
    return this.nextFloat() < probability;
  }

  /**
   * Deterministically picks one element from an array.
   */
  public pick<T>(array: readonly T[]): T | undefined {
    if (array.length === 0) return undefined;
    const idx = this.nextInt(0, array.length - 1);
    return array[idx];
  }
}

/**
 * Creates a fresh initial seed value based on timestamp / entropy.
 */
export function generateInitialSeed(): number {
  const t = Date.now();
  const r = (Math.random() * 0xffffffff) >>> 0;
  return (t ^ r) >>> 0 || 424242;
}
