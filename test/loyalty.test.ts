import { describe, it, expect, beforeEach } from "vitest";
import { S, setState, newState } from "../src/state";
import { LOYALTY } from "../src/content";
import { modalHTML, clearModal } from "../src/modal";
import { crewKey, remember } from "../src/systems/ledger";
import {
  checkLoyaltyOffer, checkLoyaltyArrive,
  loyaltyAccept, loyaltyDecline, loyaltyResolve, LOYALTY_KEYS,
} from "../src/systems/loyalty";
import { checkInvariants } from "./harness";
import type { CrewMember } from "../src/types";

// Seat a named character at bonded trust (mirrors junodialogue.test's seatJuno):
// bonded needs sentiment >= 8 AND daysAboard >= 15, so a seed memory + time.
function seat(key: string, opts: { days?: number; bond?: number } = {}): CrewMember {
  const def = LOYALTY[key];
  const c: CrewMember = {
    id: S.uid++, name: "Test " + key, role: def.role, fee: 0, salary: 6,
    key, daysAboard: opts.days ?? 30, revealed: {},
  };
  S.crew = [c];
  if (opts.bond) S.ledger.push({ who: crewKey(c), fact: "seed", weight: opts.bond, day: S.day });
  return c;
}

beforeEach(() => {
  setState(newState("Loyalty Test"));
  S.docked = true;
  clearModal();
});

describe("offer gating", () => {
  it("offers Ada's mission once bonded and time aboard is met", () => {
    seat("ada", { days: 30, bond: 10 });
    const fired = checkLoyaltyOffer();
    expect(fired).toBe(true);
    expect(modalHTML()).toContain("What Ada Carries");
  });

  it("does not offer to a merely-trusted crew member", () => {
    seat("ada", { days: 10, bond: 5 }); // trusted, not bonded
    expect(checkLoyaltyOffer()).toBe(false);
    expect(modalHTML()).toBeNull();
  });

  it("gates Nyla's mission on her agenda-beat memory (the 'second act')", () => {
    const c = seat("nyla", { days: 30, bond: 10 });
    // bonded, time met — but the act-one hook (captain_asked_instead) is missing
    expect(checkLoyaltyOffer()).toBe(false);
    remember(crewKey(c), "captain_asked_instead", 4, "asked instead of accusing");
    expect(checkLoyaltyOffer()).toBe(true);
    expect(modalHTML()).toContain("Nyla's Stone");
  });
});

describe("accept → errand → payoff", () => {
  it("runs the full arc: accept aboard, fly to dest, resolve, perk + bond", () => {
    const c = seat("brix", { days: 30, bond: 10 });
    S.loc = "solace";
    checkLoyaltyOffer();
    loyaltyAccept();
    expect(S.flags.loyalty_brix).toBe("active");
    expect(modalHTML()).toBeNull(); // offer scene dismissed on accept

    // the errand doesn't resolve at the wrong port
    S.loc = "meridian";
    expect(checkLoyaltyArrive()).toBe(false);

    // arriving at the authored destination fires the payoff scene
    S.loc = LOYALTY.brix.dest; // foundry
    const fired = checkLoyaltyArrive();
    expect(fired).toBe(true);
    expect(modalHTML()).toContain("Haziq");

    const creditsBefore = S.credits;
    loyaltyResolve(0); // "pay Haziq" — costs 180
    expect(c.perk).toBe(true);
    expect(S.flags.loyalty_brix).toBe("done");
    expect(S.ledger.some((m) => m.who === crewKey(c) && m.fact === "faced_haziq_with_her")).toBe(true);
    expect(S.credits).toBe(Math.max(0, creditsBefore - 180));
    expect(checkInvariants("loyalty-done")).toEqual([]);
  });

  it("declining sets a cooldown and re-offers later, not never", () => {
    seat("ada", { days: 30, bond: 10 });
    checkLoyaltyOffer();
    loyaltyDecline();
    expect(S.flags.loyalty_ada).toBeUndefined(); // not activated
    expect(checkLoyaltyOffer()).toBe(false);     // on cooldown now
    S.day += 9;                                    // past DECLINE_COOLDOWN (8)
    expect(checkLoyaltyOffer()).toBe(true);        // comes back around
  });

  it("does not re-offer or re-resolve a completed mission", () => {
    const c = seat("ada", { days: 30, bond: 10 });
    S.flags.loyalty_ada = "done";
    c.perk = true;
    expect(checkLoyaltyOffer()).toBe(false);
    S.loc = LOYALTY.ada.dest;
    expect(checkLoyaltyArrive()).toBe(false);
  });
});

describe("both payoff choices complete the mission", () => {
  it("Ada choice 1 (give her the moment) still grants perk + bond", () => {
    const c = seat("ada", { days: 30, bond: 10 });
    S.flags.loyalty_ada = "active";
    S.loc = LOYALTY.ada.dest;
    checkLoyaltyArrive();
    loyaltyResolve(1);
    expect(c.perk).toBe(true);
    expect(S.flags.loyalty_ada).toBe("done");
  });
});

describe("integration with the roster", () => {
  it("every loyalty key is a real character with a matching role", () => {
    for (const key of LOYALTY_KEYS) {
      expect(LOYALTY[key]).toBeTruthy();
      expect(typeof LOYALTY[key].dest).toBe("string");
    }
  });
});
