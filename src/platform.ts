// THE PLATFORM SEAM
//
// Everything the game needs from the machine it happens to be running on, in
// one interface. Nothing else in src/ may touch localStorage, crypto, or the
// wall clock directly — scripts/check-purity.mjs fails the build if it does.
//
// WHY
// The browser is one host. A Unity/C# host (docs/PORTING.md) is another, and on
// Xbox specifically the differences are not cosmetic: saves must go through GDK
// save containers tied to a signed-in Xbox Live user, not a key-value store the
// title owns. A port that has to hunt down every localStorage call scattered
// through the sim is a port that misses one. Routing them through here means the
// console work is "write one adapter", not "audit twelve files".
//
// The clock matters for a second reason. Ship combat's aim minigame reads
// elapsed time to score a shot, so time is a GAMEPLAY INPUT, not just a
// convenience. Left as a bare Date.now() it made combat non-deterministic —
// unreproducible from a seed, and therefore impossible to golden-master or to
// verify a port against. Behind this seam, a test or a replay can supply the
// clock and get the same fight every time.

export interface PlatformStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface Platform {
  /** Milliseconds since an arbitrary epoch. Monotonic within a session is all the game needs. */
  now(): number;
  /** A fresh 32-bit signed int of real entropy. Used ONCE, to seed a new game. Never for a gameplay roll — those come from the seeded stream in rng.ts. */
  entropy(): number;
  storage: PlatformStorage;
}

// Storage that never throws. Every caller in the codebase already wrapped
// localStorage in try/catch because private-mode Safari and quota exhaustion
// make it throw; centralising that here means callers can just read and write.
// A host with no storage at all (or a blocked one) degrades to in-memory: the
// game runs, saves simply don't survive the session.
function safeLocalStorage(): PlatformStorage {
  const memory = new Map<string, string>();
  const fallback: PlatformStorage = {
    getItem: (k) => (memory.has(k) ? memory.get(k)! : null),
    setItem: (k, v) => { memory.set(k, v); },
    removeItem: (k) => { memory.delete(k); },
  };

  try {
    // Touch it, don't just check for existence: Safari in private mode exposes
    // localStorage and throws only on write.
    const probe = "__kestrel_probe__";
    localStorage.setItem(probe, "1");
    localStorage.removeItem(probe);
  } catch {
    return fallback;
  }

  return {
    getItem: (k) => { try { return localStorage.getItem(k); } catch { return fallback.getItem(k); } },
    setItem: (k, v) => { try { localStorage.setItem(k, v); } catch { fallback.setItem(k, v); } },
    removeItem: (k) => { try { localStorage.removeItem(k); } catch { fallback.removeItem(k); } },
  };
}

export const browserPlatform: Platform = {
  now: () => Date.now(),
  entropy: () => (crypto.getRandomValues(new Int32Array(1))[0] ^ Date.now()) | 0,
  get storage() { return lazyStorage(); },
};

// localStorage is probed on first use rather than at module load, so importing
// this module is safe in a context that has no DOM yet (or ever).
let _storage: PlatformStorage | null = null;
function lazyStorage(): PlatformStorage {
  if (!_storage) _storage = safeLocalStorage();
  return _storage;
}

let current: Platform = browserPlatform;

export const platform = {
  now: () => current.now(),
  entropy: () => current.entropy(),
  get storage() { return current.storage; },
};

/** Swap the host. Tests use this to pin the clock; an engine port supplies its own. */
export function setPlatform(p: Platform) { current = p; }
export function resetPlatform() { current = browserPlatform; _storage = null; }

// A fully deterministic host: frozen clock you advance by hand, counter-based
// entropy, in-memory storage. Everything a replay or a golden-master trace
// needs to make a run reproduce exactly.
export function fakePlatform(opts: { now?: number; entropy?: number } = {}): Platform & { advance(ms: number): void; setNow(ms: number): void } {
  let t = opts.now ?? 0;
  let e = opts.entropy ?? 1;
  const mem = new Map<string, string>();
  return {
    now: () => t,
    entropy: () => e++,
    storage: {
      getItem: (k) => (mem.has(k) ? mem.get(k)! : null),
      setItem: (k, v) => { mem.set(k, v); },
      removeItem: (k) => { mem.delete(k); },
    },
    advance: (ms: number) => { t += ms; },
    setNow: (ms: number) => { t = ms; },
  };
}
