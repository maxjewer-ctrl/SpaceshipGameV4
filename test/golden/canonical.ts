// Canonical serialization for the golden-master trace harness.
//
// WHY THIS EXISTS
// The end goal (docs/PORTING.md) is to re-implement src/systems/ in another
// language — C# under Unity, most likely — without silently changing a single
// damage roll or market price. The only way to prove that is to run both
// implementations over the same seeds and assert they produce byte-identical
// state traces.
//
// That only works if "serialize a GameState" means exactly the same thing in
// both languages. JSON.stringify does NOT: key order follows insertion order,
// which is a JS engine detail no port will reproduce. So we define our own
// canonical form, and we keep it boring enough to re-implement anywhere:
//
//   * objects   → keys sorted by UTF-16 code unit (JS default sort), no spaces
//   * arrays    → order preserved (order is meaningful in a save)
//   * numbers   → shortest round-trip repr; integers print as integers
//   * strings   → standard JSON escaping
//   * undefined → the key is omitted entirely (matches JSON.stringify)
//   * null      → "null"
//
// The C# side is `JsonSerializer` with a sorted-key contract plus
// `double.ToString("R", CultureInfo.InvariantCulture)`, which produces the same
// shortest-round-trip digits as JS `String(n)` for every value this game holds.

// Fields that describe *what the player is looking at*, not *what is true in
// the world*. state.ts already strips these from saves for the same reason.
// They're view state; a port's UI won't reproduce them and shouldn't have to.
const TRANSIENT = new Set(["screen", "ptab", "sel", "selPlanet"]);

// Exponent notation is where JS and C# number formatting genuinely diverge
// (1e-7 vs 1E-07). No legitimate game value lands there, so rather than paper
// over it we fail loudly — a number in this range means something has gone
// wrong upstream, and we want to know now, not during a port six months out.
function num(n: number): string {
  if (!Number.isFinite(n)) {
    throw new Error(`canonical: non-finite number (${n}) — the sim produced NaN/Infinity`);
  }
  const s = String(n);
  if (s.includes("e") || s.includes("E")) {
    throw new Error(`canonical: number ${s} serializes in exponent notation, which is not portable across languages`);
  }
  return s;
}

export function canonical(v: unknown): string {
  if (v === null) return "null";
  const t = typeof v;
  if (t === "number") return num(v as number);
  if (t === "boolean") return v ? "true" : "false";
  if (t === "string") return JSON.stringify(v);
  if (Array.isArray(v)) return "[" + v.map(canonical).join(",") + "]";
  if (t === "object") {
    const o = v as Record<string, unknown>;
    const keys = Object.keys(o).filter((k) => !TRANSIENT.has(k) && o[k] !== undefined).sort();
    return "{" + keys.map((k) => JSON.stringify(k) + ":" + canonical(o[k])).join(",") + "}";
  }
  // functions/symbols/undefined at the root: never legitimate in a GameState.
  throw new Error(`canonical: cannot serialize ${t}`);
}

// FNV-1a, 32-bit, over the UTF-8 bytes of the canonical string.
//
// Chosen purely because it is trivial to re-implement correctly in any
// language — no library, no endianness question, ~8 lines. It is NOT a
// cryptographic hash and does not need to be: we are detecting accidental
// divergence between two implementations, not defending against an adversary
// who is trying to forge a collision.
export function digest(s: string): string {
  let h = 0x811c9dc5;
  const bytes = new TextEncoder().encode(s);
  for (let i = 0; i < bytes.length; i++) {
    h ^= bytes[i];
    // h *= 16777619, in 32-bit space. Math.imul keeps it exact.
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

export const hashOf = (v: unknown): string => digest(canonical(v));
