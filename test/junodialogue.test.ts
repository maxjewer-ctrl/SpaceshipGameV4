import { describe, it, expect, beforeEach } from "vitest";
import { S, newState, setState } from "../src/state";
import { JUNO_DIALOGUE } from "../src/content";
import { modalHTML, clearModal, hasModal } from "../src/modal";
import { sentiment, crewKey } from "../src/systems/ledger";
import { trustTier } from "../src/systems/trust";
import {
  openJunoDialogue, junoChoose, junoContinue, checkJunoArc, checkJunoReq,
} from "../src/systems/junodialogue";
import type { CrewMember } from "../src/types";

// Drive Juno's data-driven conversation tree the way the UI does — through the
// module-global S — and assert the engine's contract: gates read the right
// state, choices persist via flags + the ledger ("@juno" rewritten to her key),
// once-choices hide, and docking beats fire one-at-a-time behind their gates.

function juno(): CrewMember {
  return S.crew.find((c) => c.key === "juno")!;
}
function idxOf(nodeKey: string, labelPart: string): number {
  return JUNO_DIALOGUE.nodes[nodeKey].choices.findIndex((c) => c.label.includes(labelPart));
}
// Seat Juno at a chosen trust tier by setting time aboard + a seed memory.
function seatJuno(opts: { days?: number; bond?: number } = {}) {
  const j: CrewMember = {
    id: 1, name: "Juno Vale", role: "mechanic", fee: 0, salary: 6,
    key: "juno", daysAboard: opts.days ?? 40, revealed: {},
  };
  S.crew = [j];
  if (opts.bond) S.ledger.push({ who: crewKey(j), fact: "seed", weight: opts.bond, day: S.day });
}

beforeEach(() => {
  setState(newState("Kestrel"));
  S.loc = "foundry"; S.docked = true; S.screen = "stationwalk";
  S.rep = { union: 0, frontier: 0, syndicate: 0 };
  clearModal();
});

describe("Juno dialogue — gating", () => {
  it("hides trust-gated topics from a stranger and shows them once bonded", () => {
    seatJuno({ days: 0, bond: 0 });
    expect(trustTier(juno())).toBe("stranger");
    openJunoDialogue();
    let html = modalHTML() || "";
    expect(html).toContain("How's she holding"); // always-on topic present
    expect(html).not.toContain("Tell me about Osei"); // hidden:true, gate fails

    seatJuno({ days: 40, bond: 10 });
    expect(trustTier(juno())).toBe("bonded");
    openJunoDialogue();
    html = modalHTML() || "";
    expect(html).toContain("Tell me about Osei");
  });

  it("gates the confession's faction-specific choices on standing", () => {
    seatJuno({ days: 40, bond: 10 });
    // union-tension line requires rep.union >= 6
    expect(checkJunoReq({ rep: ["union", 6] }, juno())[0]).toBe(false);
    S.rep.union = 8;
    expect(checkJunoReq({ rep: ["union", 6] }, juno())[0]).toBe(true);
    // frontier-kin line requires rep.frontier >= 5
    S.rep.frontier = 6;
    expect(checkJunoReq({ rep: ["frontier", 5] }, juno())[0]).toBe(true);
  });

  it("reads campaign stage for event-gated topics", () => {
    seatJuno({ days: 40, bond: 10 });
    expect(checkJunoReq({ sil: 2 }, juno())[0]).toBe(false);
    S.campaign.silence.stage = 2;
    expect(checkJunoReq({ sil: 2 }, juno())[0]).toBe(true);
  });
});

describe("Juno dialogue — choices persist", () => {
  it("rewrites @juno memories to her ledger key and moves sentiment", () => {
    seatJuno({ days: 40, bond: 10 });
    const before = sentiment(crewKey(juno()));
    openJunoDialogue();
    // Osei → 'You did everything you could' writes a +3 @juno memory
    junoChoose("osei_1", idxOf("osei_1", "did everything you could"));
    junoContinue(); // clear the reply interstitial
    const after = sentiment(crewKey(juno()));
    expect(after).toBe(before + 3);
    // the memory landed under her real key, not the literal sentinel
    expect(S.ledger.some((m) => m.who === "@juno")).toBe(false);
    expect(S.ledger.some((m) => m.who === crewKey(juno()) && m.fact === "grieved_osei_together")).toBe(true);
  });

  it("sets flags that unlock later branches, and spends credits on the manumission", () => {
    seatJuno({ days: 40, bond: 10 });
    S.flags.juno_tell_asked = true;
    S.credits = 300;
    openJunoDialogue();
    junoChoose("confession", idxOf("confession", "secret's safe"));
    junoContinue();
    expect(S.flags.juno_secret_confessed).toBe(true);
    expect(S.flags.juno_secret_kept).toBe(true);
    // want topic now unlocked → back her manumission
    junoChoose("want_ask", idxOf("want_ask", "file it"));
    junoContinue();
    expect(S.credits).toBe(210); // 300 - 90
    expect(S.flags.juno_want_resolved).toBe(true);
    expect(juno().perk).toBe(true); // perk granted via crew-verb effect
  });
});

describe("Juno dialogue — docking beats", () => {
  it("fires exactly one eligible, un-fired beat per dock, behind its gate", () => {
    seatJuno({ days: 3, bond: 2 }); // shipmate: only the grief beat qualifies
    expect(trustTier(juno())).toBe("shipmate");

    checkJunoArc();
    expect(hasModal()).toBe(true);
    expect(modalHTML()).toContain("Osei"); // beat_grief
    expect(S.flags.juno_beat_grief).toBe(true);

    // resolve it, then a second dock: no other beat qualifies at shipmate → quiet
    clearModal();
    checkJunoArc();
    expect(hasModal()).toBe(false);
  });

  it("does not re-fire a beat whose flag is already set", () => {
    seatJuno({ days: 3, bond: 2 });
    S.flags.juno_beat_grief = true; // pretend grief already happened
    checkJunoArc();
    expect(hasModal()).toBe(false);
  });
});
