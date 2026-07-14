// Bundle-size budget gate (BETA_PLAN §2): total gzipped JS under the beta
// ceiling. three.js is the floor (~162 KB gzipped); this fails the build if a
// second heavy dependency creeps back in, or the app chunk balloons.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// fileURLToPath, not .pathname: on Windows the latter yields "/C:/a%20b/..." --
// slash-prefixed and percent-encoded -- so any checkout under a path with a
// space in it (e.g. "GitHub Repositories") failed with ENOENT.
const DIST = fileURLToPath(new URL("../dist/assets", import.meta.url));
const BUDGET_KB = 1500;

let total = 0;
const rows = [];
for (const name of readdirSync(DIST)) {
  if (!name.endsWith(".js")) continue;
  const p = join(DIST, name);
  if (!statSync(p).isFile()) continue;
  const gz = gzipSync(readFileSync(p)).length;
  total += gz;
  rows.push([name, gz]);
}

rows.sort((a, b) => b[1] - a[1]);
for (const [name, gz] of rows.slice(0, 8)) {
  console.log(`  ${(gz / 1024).toFixed(1).padStart(7)} KB  ${name}`);
}
const totalKB = total / 1024;
console.log(`  ${"-".repeat(7)}`);
console.log(`  ${totalKB.toFixed(1).padStart(7)} KB  total gzipped JS  (budget ${BUDGET_KB} KB)`);

if (totalKB > BUDGET_KB) {
  console.error(`\nBundle over budget: ${totalKB.toFixed(1)} KB > ${BUDGET_KB} KB`);
  process.exit(1);
}
console.log("bundle check: within budget");
