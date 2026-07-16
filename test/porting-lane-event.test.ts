import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadScenario } from "../src/debug/scenarios";
import { clearModal, hasModal, modalHTML } from "../src/modal";
import { S } from "../src/state";
import { rollEvent, traderBuy } from "../src/systems/events";

const FIXTURE = join(import.meta.dirname, "porting", "fixtures", "lane-event-traces.json");

function snapshot(event: string | null) {
  return {
    rngState: S.rngState,
    event,
    credits: S.credits,
    food: S.food,
    prestige: S.prestige,
    modalOpen: hasModal(),
    latestLog: S.logLines[0] ?? null,
  };
}

function buildFixture() {
  loadScenario("fresh", 2);
  clearModal();
  // Isolate the daily weighted event roll from market/scenario construction.
  // Browser mulberry32 seed 2 selects pool index 13: the Tinker Barge.
  S.rngState = 2;
  const initial = snapshot(null);

  rollEvent();
  const selectedKey = modalHTML()?.includes('Tinker Barge "Bargain"') ? "tinker-trader" : "unexpected";
  const selected = snapshot(selectedKey);

  traderBuy("food");
  const resolved = snapshot(null);
  return { schema: 1, seed: 2, choice: "buy-food", initial, selected, resolved };
}

describe("browser-to-C# bounded lane event", () => {
  it("pins Tinker Barge selection and the buy-food outcome", () => {
    const actual = buildFixture();
    if (process.env.UPDATE_PORTING === "1") {
      mkdirSync(dirname(FIXTURE), { recursive: true });
      writeFileSync(FIXTURE, JSON.stringify(actual, null, 2) + "\n");
    }
    expect(existsSync(FIXTURE), `Missing ${FIXTURE}; run with UPDATE_PORTING=1 once.`).toBe(true);
    expect(actual).toEqual(JSON.parse(readFileSync(FIXTURE, "utf8")));
  });
});
