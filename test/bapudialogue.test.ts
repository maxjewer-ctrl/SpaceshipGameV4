import { describe, it, expect, beforeEach } from "vitest";
import { S, newState, setState } from "../src/state";
import { CREW_TREES } from "../src/content";
import { modalHTML, clearModal, hasModal } from "../src/modal";
import { sentiment, crewKey } from "../src/systems/ledger";
import { trustTier } from "../src/systems/trust";
import {
  openCrewDialogue, crewDialogueChoose, crewDialogueContinue, checkCrewDialogueArcs,
} from "../src/systems/crewdialogue";
import type { CrewMember } from "../src/types";

// Bapu Okafor is the second tree built on the shared crewdialogue.ts engine —
// exercises the same interpreter with independent content and an independent
// flag namespace ("bapu_*"), plus the two things his tree does that Juno's
// doesn't: a mission payoff that grants a role perk on wound resolution, and a
// beat that cross-references an *existing* Long Silence NPC fragment
// (sk_survivor, from survivor_ondine in npcs.json) to trigger a recognition
// scene — proof two independently-authored systems talk to each other cleanly.

function bapu(): CrewMember {
  return S.crew.find((c) => c.key === "bapu")!;
}
function idxOf(nodeKey: string, labelPart: string): number {
  return CREW_TREES.bapu.nodes[nodeKey].choices.findIndex((c) => c.label.includes(labelPart));
}
function seatBapu(opts: { days?: number; bond?: number } = {}) {
  const b: CrewMember = {
    id: 2, name: "Bapu Okafor", role: "cook", fee: 80, salary: 6,
    key: "bapu", daysAboard: opts.days ?? 20, revealed: {},
  };
  S.crew = [b];
  if (opts.bond) S.ledger.push({ who: crewKey(b), fact: "seed", weight: opts.bond, day: S.day });
}

beforeEach(() => {
  setState(newState("Kestrel"));
  S.loc = "solace"; S.docked = true; S.screen = "stationwalk";
  S.rep = { union: 0, frontier: 0, syndicate: 0 };
  clearModal();
});

describe("Bapu dialogue — gating shares the engine, not the content", () => {
  it("hides trust-gated topics from a stranger and reveals them once trusted", () => {
    seatBapu({ days: 0, bond: 0 });
    expect(trustTier(bapu())).toBe("stranger");
    openCrewDialogue(2);
    let html = modalHTML() || "";
    expect(html).toContain("How's the galley holding up"); // always-on
    expect(html).not.toContain("before the fall"); // trusted-gated, hidden

    seatBapu({ days: 10, bond: 5 });
    expect(trustTier(bapu())).toBe("trusted");
    openCrewDialogue(2);
    html = modalHTML() || "";
    expect(html).toContain("before the fall");
  });

  it("keeps a separate flag namespace from Juno's tree", () => {
    seatBapu({ days: 10, bond: 5 });
    openCrewDialogue(2);
    crewDialogueChoose("bapu", "secret_1", idxOf("secret_1", "That's a lot to carry"));
    crewDialogueContinue();
    expect(S.flags.bapu_secret_told).toBe(true);
    expect(S.flags.juno_secret_confessed).toBeUndefined();
  });
});

describe("Bapu dialogue — the Taste of Home mission", () => {
  it("grants a mission to Kestrel's Rest and resolves via the payoff beat", () => {
    seatBapu({ days: 3, bond: 1 });
    openCrewDialogue(2);
    crewDialogueChoose("bapu", "taste_ask", idxOf("taste_ask", "Kestrel's Rest it is"));
    crewDialogueContinue();
    expect(S.flags.bapu_taste_offered).toBe(true);
    expect(S.jobs.some((j) => j.tag === "bapu_taste" && j.dest === "kestrel")).toBe(true);

    clearModal();
    S.flags.job_bapu_taste = true;
    S.loc = "kestrel";
    checkCrewDialogueArcs();
    expect(modalHTML() || "").toContain("Harvest Trade dish");
    const foodBefore = S.food;
    crewDialogueChoose("bapu", "beat_taste", 0);
    expect(S.flags.bapu_taste_done).toBe(true);
    expect(S.food).toBe(foodBefore + 3);
  });
});

describe("Bapu dialogue — the Edge of the Dark mission grants his perk", () => {
  it("resolves his wound and grants the cook perk on completion", () => {
    seatBapu({ days: 20, bond: 10 }); // bonded
    expect(trustTier(bapu())).toBe("bonded");
    openCrewDialogue(2);
    crewDialogueChoose("bapu", "edge_ask", idxOf("edge_ask", "stand at the edge together"));
    crewDialogueContinue();
    expect(S.jobs.some((j) => j.tag === "bapu_edge" && j.dest === "verge")).toBe(true);
    expect(bapu().perk).toBeFalsy(); // not yet — he has to get there

    clearModal();
    S.flags.job_bapu_edge = true;
    S.loc = "verge";
    checkCrewDialogueArcs();
    expect(modalHTML() || "").toContain("last window before the black");
    crewDialogueChoose("bapu", "beat_edge", 0);
    expect(bapu().perk).toBe(true);
    expect(S.flags.bapu_edge_done).toBe(true);
  });
});

describe("Bapu dialogue — the hymn crosses over with the Long Silence", () => {
  it("fires the recognition beat once the sk_survivor fragment is learned", () => {
    seatBapu({ days: 10, bond: 5 });
    S.flags.sk_survivor = true; // learned from survivor_ondine (npcs.json), independently of Bapu
    checkCrewDialogueArcs();
    expect(modalHTML() || "").toContain("That's my hymn, Captain");
    crewDialogueChoose("bapu", "beat_hymn", 0);
    expect(S.flags.bapu_recognized_hymn).toBe(true);

    // doesn't re-fire once resolved
    clearModal();
    checkCrewDialogueArcs();
    expect(modalHTML() || "").not.toContain("That's my hymn");
  });

  it("unlocks the Church of the Open Door topic only after recognition", () => {
    seatBapu({ days: 10, bond: 5 });
    openCrewDialogue(2);
    expect(modalHTML() || "").not.toContain("Church of the Open Door");
    S.flags.bapu_recognized_hymn = true;
    openCrewDialogue(2);
    expect(modalHTML() || "").toContain("Church of the Open Door");
  });
});

describe("Bapu dialogue — the Elysium ending forks on an earlier promise", () => {
  it("plays the kept-promise variant when the captain promised earlier", () => {
    seatBapu({ days: 20, bond: 10 });
    openCrewDialogue(2);
    crewDialogueChoose("bapu", "want_ask", idxOf("want_ask", "I'll find it"));
    crewDialogueContinue();
    expect(S.flags.bapu_elysium_promised).toBe(true);

    clearModal();
    S.flags.arc_broadcast = true;
    checkCrewDialogueArcs();
    expect(modalHTML() || "").toContain("You promised");
  });

  it("plays the surprise variant when no promise was made", () => {
    seatBapu({ days: 20, bond: 10 });
    S.flags.arc_broadcast = true; // no bapu_elysium_promised set
    checkCrewDialogueArcs();
    expect(modalHTML() || "").toContain("never once asked you to go looking");
  });
});

describe("Bapu dialogue — beat pacing is independent per crew member", () => {
  it("Bapu's ambient cooldown doesn't block Juno's beats and vice versa", () => {
    seatBapu({ days: 3, bond: 1 });
    const j: CrewMember = {
      id: 1, name: "Juno Vale", role: "mechanic", fee: 0, salary: 6,
      key: "juno", daysAboard: 40, revealed: {},
    };
    S.crew.push(j);
    S.ledger.push({ who: crewKey(j), fact: "seed", weight: 10, day: S.day });

    checkCrewDialogueArcs(); // fires the first eligible beat across both crew
    expect(hasModal()).toBe(true);
    const first = modalHTML() || "";
    clearModal();
    checkCrewDialogueArcs(); // a different crew member's beat can still fire this dock
    const second = modalHTML() || "";
    // two distinct beats fired (order depends on CREW_TREES key order, but both should be reachable)
    expect(first === second).toBe(false);
  });
});
