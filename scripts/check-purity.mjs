// Build gate: the simulation layer may not touch the host machine directly.
//
// src/systems/ + src/state.ts + src/derive.ts are the pure game core — the part
// that a Unity/C# host re-implements or drives verbatim (docs/PORTING.md). They
// must get the wall clock, real entropy, storage, and audio HANDED to them
// through the seams (src/platform.ts, src/bus.ts), never reach out for them.
//
// This is the guard that keeps the seam shut. Every bug the port-hardening pass
// found was a leak this check now forbids:
//   * combat read Date.now() to score a shot        → non-deterministic combat
//   * combat did `new AudioContext()` via sfx        → crashed headlessly
//   * saves went straight to localStorage            → can't route to GDK on Xbox
// Without a gate, the next one gets reintroduced the first time someone reaches
// for `Date.now()` because it's right there.
//
// WHAT IT CHECKS
//   1. No host globals (document/window/localStorage/crypto/Date.now/... ) in
//      the sim core, except in files still being migrated (MIGRATING below).
//   2. No `import ... from "../audio"` anywhere in the sim core (audio is a
//      bus sink now; systems ask for a sound, they don't make one). Zero
//      exceptions — this one is fully paid off, so it stays paid off.
//
// WHAT IT DELIBERATELY DOES NOT CHECK (yet)
//   Module coupling to ../modal and ../ui/* is pervasive (~18 files push HTML
//   strings into the modal). That's a real portability cost, but it's a
//   separate, larger refactor than this pass — locking it here would be a wall,
//   not a ratchet. Tracked in docs/PORTING.md, not enforced here.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const SRC = join(ROOT, "src");

// The pure game core this guard covers.
const IN_SCOPE = (rel) =>
  rel.startsWith("src/systems/") || rel === "src/state.ts" || rel === "src/derive.ts";

// Files that still legitimately touch the host because they haven't been split
// into sim + view yet. This list is the migration TODO, CI-enforced: it may only
// SHRINK. When it's empty, the sim core is fully host-independent.
//   combat.ts — sim tangled with its HTML view + FX     (Stage 1 task 4)
//   intro.ts  — prologue tangled with its modal HTML     (Stage 1 task 5)
// gamepadNav.ts graduated in Stage 1 task 3: it was an input adapter misfiled
// as a system, and now lives in src/ui/ (outside this guard's scope entirely).
const MIGRATING = new Set([
  "src/systems/combat.ts",
  "src/systems/intro.ts",
]);

// Host globals the sim core must not reference. Each is `name.` or a bare
// identifier; the `\.\w`/`\b` shapes avoid matching the same word in prose
// (e.g. "...the Harbormaster's window. Everyone..." is not `window.scrollBy`).
const HOST = [
  { re: /\bdocument\.\w/, what: "document.*" },
  { re: /\bwindow\.\w/, what: "window.*" },
  { re: /\bnavigator\.\w/, what: "navigator.*" },
  { re: /\blocalStorage\b/, what: "localStorage" },
  { re: /\bsessionStorage\b/, what: "sessionStorage" },
  { re: /\bcrypto\.\w/, what: "crypto.*" },
  { re: /\bAudioContext\b/, what: "AudioContext" },
  { re: /\bDate\.now\b/, what: "Date.now()" },
  { re: /\bperformance\.now\b/, what: "performance.now()" },
  { re: /\brequestAnimationFrame\b/, what: "requestAnimationFrame" },
  { re: /\bsetInterval\b/, what: "setInterval" },
  { re: /\bsetTimeout\b/, what: "setTimeout" },
];

// Presentation imports the sim core must not make. Only audio is enforced today
// (see header) — it is fully paid off and stays that way.
const FORBIDDEN_IMPORT = [
  { re: /from\s+["']\.\.?\/audio["']/, what: 'import from "../audio"' },
];

const hostOffenders = [];
const importOffenders = [];

// A crude but adequate string/comment guard: skip `//` lines, and blank out
// anything after a `//` on a code line. Matches the repo's other linters.
function codeOf(line) {
  const t = line.trimStart();
  if (t.startsWith("//") || t.startsWith("*")) return "";
  const c = line.indexOf("//");
  return c >= 0 ? line.slice(0, c) : line;
}

(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) { walk(p); continue; }
    if (!/\.(ts|tsx)$/.test(name)) continue;
    const rel = relative(ROOT, p).replaceAll("\\", "/");
    if (!IN_SCOPE(rel)) continue;

    const lines = readFileSync(p, "utf8").split("\n");
    lines.forEach((raw, i) => {
      const line = codeOf(raw);
      if (!line) return;

      // Import bans apply everywhere in scope, migrating or not.
      for (const { re, what } of FORBIDDEN_IMPORT) {
        if (re.test(line)) importOffenders.push(`${rel}:${i + 1}: ${what} — audio is a bus sink (src/bus.ts), not a sim import`);
      }

      // Host-global bans are waived for files still being migrated.
      if (MIGRATING.has(rel)) return;
      for (const { re, what } of HOST) {
        if (re.test(line)) hostOffenders.push(`${rel}:${i + 1}: ${what} — route through src/platform.ts / src/bus.ts`);
      }
    });
  }
})(SRC);

// Catch a stale allowlist: once a file is cleaned, it must be removed from
// MIGRATING so the guard actually starts covering it. A file that no longer
// references any host global has graduated.
const stale = [];
for (const rel of MIGRATING) {
  const abs = join(ROOT, rel);
  let src;
  try { src = readFileSync(abs, "utf8"); } catch { stale.push(`${rel} (listed in MIGRATING but not found)`); continue; }
  const dirty = src.split("\n").some((raw) => {
    const line = codeOf(raw);
    return line && HOST.some(({ re }) => re.test(line));
  });
  if (!dirty) stale.push(`${rel} is clean — remove it from MIGRATING in scripts/check-purity.mjs so the guard covers it`);
}

let failed = false;
if (hostOffenders.length) {
  failed = true;
  console.error("sim core reaches for the host machine directly:");
  hostOffenders.forEach((o) => console.error("  " + o));
}
if (importOffenders.length) {
  failed = true;
  console.error("sim core imports a presentation module:");
  importOffenders.forEach((o) => console.error("  " + o));
}
if (stale.length) {
  failed = true;
  console.error("purity allowlist is stale:");
  stale.forEach((o) => console.error("  " + o));
}
if (failed) process.exit(1);

console.log(`purity check: clean (sim core host-independent; ${MIGRATING.size} file(s) still migrating)`);
