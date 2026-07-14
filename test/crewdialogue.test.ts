import { describe, it, expect, beforeEach } from "vitest";
import { S, newState, setState } from "../src/state";
import { CREW_TREES } from "../src/content";
import { modalHTML, clearModal, hasModal } from "../src/modal";
import { sentiment, crewKey } from "../src/systems/ledger";
import { trustTier } from "../src/systems/trust";
import {
  openCrewDialogue, crewDialogueChoose, crewDialogueContinue, checkCrewDialogueArcs, checkCrewReq,
} from "../src/systems/crewdialogue";
import type { CrewMember } from "../src/types";

// Drive Juno's data-driven conversation tree — the first tree built on the
// generic crewdialogue.ts engine — the way the UI does, through the
// module-global S. Asserts the engine's contract: gates read the right
// state, choices persist via flags + the ledger ("@self" rewritten to her
// key), once-choices hide, and docking beats fire one-at-a-time behind their
// gates. See test/bapudialogue.test.ts for a second tree exercising the same
// engine with different content.

function juno(): CrewMember {
  return S.crew.find((c) => c.key === "juno")!;
}
function idxOf(nodeKey: string, labelPart: string): number {
  return CREW_TREES.juno.nodes[nodeKey].choices.findIndex((c) => c.label.includes(labelPart));
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
    openCrewDialogue(1);
    let html = modalHTML() || "";
    expect(html).toContain("How's she holding"); // always-on topic present
    expect(html).not.toContain("Tell me about Osei"); // hidden:true, gate fails

    seatJuno({ days: 40, bond: 10 });
    expect(trustTier(juno())).toBe("bonded");
    openCrewDialogue(1);
    html = modalHTML() || "";
    expect(html).toContain("Tell me about Osei");
  });

  it("gates the confession's faction-specific choices on standing", () => {
    seatJuno({ days: 40, bond: 10 });
    // union-tension line requires rep.union >= 6
    expect(checkCrewReq({ rep: ["union", 6] }, juno())[0]).toBe(false);
    S.rep.union = 8;
    expect(checkCrewReq({ rep: ["union", 6] }, juno())[0]).toBe(true);
    // frontier-kin line requires rep.frontier >= 5
    S.rep.frontier = 6;
    expect(checkCrewReq({ rep: ["frontier", 5] }, juno())[0]).toBe(true);
  });

  it("reads campaign stage for event-gated topics", () => {
    seatJuno({ days: 40, bond: 10 });
    expect(checkCrewReq({ sil: 2 }, juno())[0]).toBe(false);
    S.campaign.silence.stage = 2;
    expect(checkCrewReq({ sil: 2 }, juno())[0]).toBe(true);
  });
});

describe("Juno dialogue — choices persist", () => {
  it("rewrites @juno memories to her ledger key and moves sentiment", () => {
    seatJuno({ days: 40, bond: 10 });
    const before = sentiment(crewKey(juno()));
    openCrewDialogue(1);
    // Osei → 'You did everything you could' writes a +3 @juno memory
    crewDialogueChoose("juno", "osei_1", idxOf("osei_1", "did everything you could"));
    crewDialogueContinue(); // clear the reply interstitial
    const after = sentiment(crewKey(juno()));
    expect(after).toBe(before + 3);
    // the memory landed under her real key, not the literal sentinel
    expect(S.ledger.some((m) => m.who === "@self")).toBe(false);
    expect(S.ledger.some((m) => m.who === crewKey(juno()) && m.fact === "grieved_osei_together")).toBe(true);
  });

  it("turns the manumission into a mission to Foundry, resolved by the stamp beat", () => {
    seatJuno({ days: 40, bond: 10 });
    S.flags.juno_tell_asked = true;
    S.credits = 300;
    openCrewDialogue(1);
    crewDialogueChoose("juno", "confession", idxOf("confession", "secret's safe"));
    crewDialogueContinue();
    expect(S.flags.juno_secret_confessed).toBe(true);
    expect(S.flags.juno_secret_kept).toBe(true);
    // want topic now unlocked → backing her grants a mission, not an instant fix
    crewDialogueChoose("juno", "want_ask", idxOf("want_ask", "Retain the advocate"));
    crewDialogueContinue();
    expect(S.credits).toBe(150); // 300 - 150 advocate retainer
    expect(S.flags.juno_manumission_filed).toBe(true);
    expect(S.flags.juno_want_resolved).toBeFalsy(); // not free yet — she has to get there
    expect(S.jobs.some((j) => j.tag === "juno_manumission" && j.dest === "foundry")).toBe(true);
    // fly the mission: arrival at foundry completes the job (travel.ts sets job_<tag>)
    clearModal();
    S.flags.job_juno_manumission = true;
    S.loc = "foundry";
    checkCrewDialogueArcs();
    expect(modalHTML()).toContain("Manumitted"); // the stamp beat owns the payoff
    crewDialogueChoose("juno", "stamp", 0);
    crewDialogueContinue();
    expect(juno().perk).toBe(true);
    expect(S.flags.juno_want_resolved).toBe(true);
    expect(S.rep.frontier).toBe(1);
    expect(S.rep.union).toBe(-1); // the filing went through Union systems
  });
});

describe("Juno dialogue — patrol beats", () => {
  it("keeps the secret out of the pre-confession patrol scene", () => {
    seatJuno({ days: 10, bond: 5 }); // trusted, not bonded
    expect(trustTier(juno())).toBe("trusted");
    S.loc = "meridian";
    checkCrewDialogueArcs();
    const html = modalHTML() || "";
    expect(html).toContain("not be on this deck"); // opaque pre-confession ask
    expect(html).not.toContain("I’m the thing they find"); // the confession stays hers
  });

  it("plays the open version only after the confession, and only in Union space", () => {
    seatJuno({ days: 40, bond: 10 });
    S.flags.juno_secret_confessed = true;
    S.loc = "solace"; // not Union-leaning → no patrol beat here
    checkCrewDialogueArcs();
    expect(modalHTML() || "").not.toContain("cutter");
    clearModal();
    S.flags.juno_beat_cooldown = 0;
    S.flags.juno_beat_grief = true; // quiet the ambient beats for this check
    S.flags.juno_beat_foundry = true;
    S.loc = "meridian";
    checkCrewDialogueArcs();
    expect(modalHTML() || "").toContain("I’m the thing they find");
  });

  it("hiding from the patrol plants the follow-up inspection", () => {
    seatJuno({ days: 40, bond: 10 });
    S.flags.juno_secret_confessed = true;
    S.loc = "meridian";
    S.flags.juno_beat_grief = true;
    S.flags.juno_beat_foundry = true;
    checkCrewDialogueArcs();
    crewDialogueChoose("juno", "beat_patrol_post", idxOf("beat_patrol_post", "Get below"));
    crewDialogueContinue();
    expect(S.flags.juno_patrol_hidden).toBe(true);
    expect(S.scheduled.some((e) => e.eventKey === "juno_patrol_followup")).toBe(true);
  });
});

describe("Juno dialogue — beat pacing", () => {
  it("spaces ambient beats by cooldown, but mission payoffs bypass it", () => {
    seatJuno({ days: 10, bond: 5 }); // trusted
    S.loc = "solace"; // out of patrol space
    checkCrewDialogueArcs(); // grief fires, arms the cooldown
    expect(modalHTML()).toContain("Osei");
    clearModal();
    checkCrewDialogueArcs(); // foundry beat is eligible but the cooldown holds it
    expect(hasModal()).toBe(false);
    S.flags.juno_patrol_flagged = true; // planted payoff arrives → priority beat
    checkCrewDialogueArcs();
    expect(modalHTML() || "").toContain("re-verification");
    clearModal();
    S.day = 20; // cooldown expired → ambient beats resume
    checkCrewDialogueArcs();
    expect(modalHTML() || "").toContain("smelter-glow");
  });
});

describe("Juno dialogue — choice exclusivity", () => {
  it("renders exactly one 'Which week is this?' even with both dispositions loud", () => {
    seatJuno({ days: 40, bond: 10 });
    S.disposition.law = 7;
    S.disposition.daring = 7;
    openCrewDialogue(1);
    crewDialogueChoose("juno", "hub", CREW_TREES.juno.nodes.hub.choices.findIndex((c) => c.label.includes("regrets")));
    const html = modalHTML() || "";
    expect((html.match(/Which week is this\?/g) || []).length).toBe(1);
  });
});

describe("Juno dialogue — docking beats", () => {
  it("fires exactly one eligible, un-fired beat per dock, behind its gate", () => {
    seatJuno({ days: 3, bond: 2 }); // shipmate: only the grief beat qualifies
    expect(trustTier(juno())).toBe("shipmate");

    checkCrewDialogueArcs();
    expect(hasModal()).toBe(true);
    expect(modalHTML()).toContain("Osei"); // beat_grief
    expect(S.flags.juno_beat_grief).toBe(true);

    // resolve it, then a second dock: no other beat qualifies at shipmate → quiet
    clearModal();
    checkCrewDialogueArcs();
    expect(hasModal()).toBe(false);
  });

  it("does not re-fire a beat whose flag is already set", () => {
    seatJuno({ days: 3, bond: 2 });
    S.flags.juno_beat_grief = true; // pretend grief already happened
    checkCrewDialogueArcs();
    expect(hasModal()).toBe(false);
  });
});
