import { describe, it, expect } from "vitest";
import { SCENARIOS, loadSeeded, checkInvariants, S } from "./harness";

// Every scenario must build into a sound state — the presets are the entry
// points the playtest skill and the whole game lean on.
describe("scenario presets load sound", () => {
  for (const name of SCENARIOS) {
    it(`${name} builds a valid state`, () => {
      loadSeeded(name, 12345);
      const v = checkInvariants(`scenario:${name}`);
      expect(v, JSON.stringify(v, null, 2)).toEqual([]);
      expect(S.day).toBeGreaterThanOrEqual(1);
      expect(S.market).toBeTruthy();
      expect(S.modules.length).toBeGreaterThan(0);
    });
  }
});
