import { describe, it, expect } from "vitest";
import { SCENARIOS, simulate } from "./harness";

// The core beta stability gate (BETA_PLAN §2): every scenario, across many
// seeded RNG streams, driven 40 in-game days, must never NaN, go negative,
// throw, or soft-lock. A failure prints the exact scenario+seed+day so the
// bug is reproducible from the seed alone.
const SEEDS = Array.from({ length: 40 }, (_, i) => 1000 + i * 7919);
const DAYS = 40;

describe("seeded 40-day runs stay sound", () => {
  for (const scenario of SCENARIOS) {
    it(`${scenario} × ${SEEDS.length} seeds`, () => {
      const failures: string[] = [];
      for (const seed of SEEDS) {
        const r = simulate(scenario, seed, DAYS);
        if (r.error) failures.push(`seed ${seed}: threw on day ${r.error.day}: ${r.error.message}`);
        if (r.violations.length) failures.push(`seed ${seed}: ${r.violations.map((v) => `${v.field}=${JSON.stringify(v.value)} (${v.note})`).join("; ")}`);
        if (r.softLock) failures.push(`seed ${seed}: soft-locked after ${r.daysAdvanced} days`);
      }
      expect(failures, `\n${scenario}:\n  ${failures.join("\n  ")}`).toEqual([]);
    });
  }
});
