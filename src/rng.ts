import { S } from "./state";

// Presentation/pre-game randomness ONLY — audio jitter, a random-name button
// before a game exists. Never for a gameplay roll: anything that touches
// GameState must use rand()/ri()/pick() (seeded) or fork() (stable streams).
// This is the single sanctioned Math.random in the codebase; `npm run
// lint:rng` fails the build on any other call site.
export const uiRand = () => Math.random();

// Seeded, save-persisted RNG (mulberry32). Every gameplay roll advances
// S.rngState, so a save file fully determines the future — reproducible bugs
// now, verifiable runs (leaderboards) later.
export function rand(): number {
  S.rngState = (S.rngState + 0x6d2b79f5) | 0;
  let t = S.rngState;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export const ri = (a: number, b: number) => a + Math.floor(rand() * (b - a + 1));
export const pick = <T>(arr: T[]): T => arr[Math.floor(rand() * arr.length)];

// Like pick(), but won't return `avoid` back-to-back when there's another
// option — for flavor pools that read as broken when the same line repeats.
export function pickFresh<T>(arr: T[], avoid: T | null): T {
  if (arr.length <= 1 || avoid === null) return pick(arr);
  const pool = arr.filter((x) => x !== avoid);
  return pool.length ? pick(pool) : pick(arr);
}

// Deterministic side-stream that does NOT advance game state — for content
// that must be stable given (seed, key), e.g. future galaxy/sector generation.
export function fork(key: string): () => number {
  let h = 1779033703 ^ (key.length + S.seed);
  for (let i = 0; i < key.length; i++) {
    h = Math.imul(h ^ key.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
