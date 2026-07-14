// Build gate: no Math.random outside src/rng.ts. Gameplay rolls must go
// through the seeded stream (rand/ri/pick/fork); presentation/pre-game
// randomness through uiRand. See BETA_PLAN.md §3.6.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const SRC = join(ROOT, "src");
const ALLOWED = new Set(["src/rng.ts"]);

const offenders = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) { walk(p); continue; }
    if (!/\.(ts|tsx|js|mjs)$/.test(name)) continue;
    const rel = relative(ROOT, p).replaceAll("\\", "/");
    if (ALLOWED.has(rel)) continue;
    readFileSync(p, "utf8").split("\n").forEach((line, i) => {
      if (line.includes("Math.random") && !line.trimStart().startsWith("//")) {
        offenders.push(`${rel}:${i + 1}: ${line.trim()}`);
      }
    });
  }
})(SRC);

if (offenders.length) {
  console.error("Math.random outside src/rng.ts — use rand()/fork() (gameplay) or uiRand() (presentation):");
  offenders.forEach((o) => console.error("  " + o));
  process.exit(1);
}
console.log("rng check: clean");
