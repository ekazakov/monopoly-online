/** Serializable RNG state. Keep it inside the game state. */
export interface RngState {
  readonly seed: number;
}

export type Dice = readonly [number, number];

export interface Rolled<T> {
  readonly value: T;
  readonly rng: RngState;
}

export function createRng(seed: number): RngState {
  return { seed: seed >>> 0 };
}

/** Mulberry32. Returns a float in [0, 1) and the next state. */
function nextFloat(rng: RngState): Rolled<number> {
  const seed = (rng.seed + 0x6d2b79f5) >>> 0;
  let t = seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return { value: ((t ^ (t >>> 14)) >>> 0) / 4294967296, rng: { seed } };
}

/** Integer in [0, max). */
export function nextInt(rng: RngState, max: number): Rolled<number> {
  if (!Number.isInteger(max) || max < 1)
    throw new RangeError(`max must be a positive integer: ${max}`);
  const { value, rng: next } = nextFloat(rng);
  return { value: Math.floor(value * max), rng: next };
}

export function rollDice(rng: RngState): Rolled<Dice> {
  const first = nextInt(rng, 6);
  const second = nextInt(first.rng, 6);
  return { value: [first.value + 1, second.value + 1], rng: second.rng };
}

/** Fisher-Yates shuffle. Returns a new array and leaves the input unchanged. */
export function shuffle<T>(rng: RngState, items: readonly T[]): Rolled<T[]> {
  const result = [...items];
  let state = rng;
  for (let i = result.length - 1; i > 0; i--) {
    const roll = nextInt(state, i + 1);
    state = roll.rng;
    const a = result[i] as T;
    result[i] = result[roll.value] as T;
    result[roll.value] = a;
  }
  return { value: result, rng: state };
}
