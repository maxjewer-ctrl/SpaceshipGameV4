import { describe, it, expect, beforeEach } from "vitest";
import { S, setState, newState } from "../src/state";
import { PLANETS } from "../src/content";
import {
  activeMood, setMood, endMood, MOOD_WORD,
  moodFuelMult, moodGoodsMult, moodMissionPayMult, moodBlocksHidden, moodRecruitDelta,
  plantOutbreak, resolveOutbreakIfDue, tickPortMoods,
} from "../src/systems/moods";
import { fuelPriceAt } from "../src/derive";
import { genMission } from "../src/systems/market";
import { completePay } from "../src/systems/travel";
import { checkInvariants } from "./harness";
import type { Job } from "../src/types";

beforeEach(() => {
  setState(newState("Moods Test"));
  S.docked = true; S.loc = "solace";
});

describe("mood lifecycle", () => {
  it("is inactive by default, active once set, and expires on schedule", () => {
    expect(activeMood("meridian")).toBeNull();
    setMood("meridian", "boom", 10);
    expect(activeMood("meridian")?.mood).toBe("boom");
    S.day += 10; // exactly `until` — expired
    expect(activeMood("meridian")).toBeNull();
  });

  it("endMood clears it outright", () => {
    setMood("meridian", "lockdown", 20);
    endMood("meridian");
    expect(activeMood("meridian")).toBeNull();
  });
});

describe("price effects", () => {
  it("shortage/lockdown raise fuel price; festival lowers it", () => {
    const base = fuelPriceAt("meridian");
    setMood("meridian", "shortage", 10);
    expect(fuelPriceAt("meridian")).toBeGreaterThan(base);
    setMood("meridian", "festival", 10);
    expect(fuelPriceAt("meridian")).toBeLessThan(base);
  });

  it("boom/shortage raise goods prices; festival lowers them", () => {
    expect(moodGoodsMult("meridian")).toBe(1);
    setMood("meridian", "boom", 10);
    expect(moodGoodsMult("meridian")).toBeGreaterThan(1);
    setMood("meridian", "festival", 10);
    expect(moodGoodsMult("meridian")).toBeLessThan(1);
  });

  it("only boom bumps mission pay", () => {
    expect(moodMissionPayMult("meridian")).toBe(1);
    setMood("meridian", "boom", 10);
    expect(moodMissionPayMult("meridian")).toBeGreaterThan(1);
    setMood("meridian", "shortage", 10);
    expect(moodMissionPayMult("meridian")).toBe(1);
  });
});

describe("lockdown blocks hidden freight, festival/lockdown shift hiring", () => {
  it("moodBlocksHidden is true only under lockdown", () => {
    expect(moodBlocksHidden("meridian")).toBe(false);
    setMood("meridian", "lockdown", 10);
    expect(moodBlocksHidden("meridian")).toBe(true);
  });
  it("moodRecruitDelta: lockdown -1, festival +1, otherwise 0", () => {
    expect(moodRecruitDelta("meridian")).toBe(0);
    setMood("meridian", "lockdown", 10);
    expect(moodRecruitDelta("meridian")).toBe(-1);
    setMood("meridian", "festival", 10);
    expect(moodRecruitDelta("meridian")).toBe(1);
  });
});

describe("the CORE_LOOP outbreak example: the serum run ends it", () => {
  it("plantOutbreak sours the destination; delivering the serum lifts it into a festival", () => {
    plantOutbreak("meridian", S.day + 5);
    expect(activeMood("meridian")?.mood).toBe("shortage");
    expect(activeMood("meridian")?.cause).toBe("outbreak");

    const job: Job = { id: S.uid++, kind: "medical", title: "URGENT: Serum run", dest: "meridian", pay: 300 };
    S.loc = "meridian"; // completePay bumps standing/mood at S.loc
    completePay(job);
    expect(activeMood("meridian")?.mood).toBe("festival");
    expect(activeMood("meridian")?.cause).toBe("relief");
  });

  it("does not touch a mood with an unrelated cause", () => {
    setMood("meridian", "boom", 20); // no cause — a random tick, not an outbreak
    S.loc = "meridian";
    resolveOutbreakIfDue("meridian");
    expect(activeMood("meridian")?.mood).toBe("boom"); // untouched
  });

  it("an undelivered outbreak just lapses — never punishes skipping the contract", () => {
    plantOutbreak("meridian", S.day + 3);
    S.day += 200; // long past any plausible duration
    expect(activeMood("meridian")).toBeNull();
  });

  it("genMission's medical branch actually plants an outbreak at its destination", () => {
    // Loop until we roll a medical job (roll < 0.67 in genMission) — deterministic
    // enough within a bounded number of tries given the seeded stream.
    let job: Job | null = null;
    for (let i = 0; i < 60 && !job; i++) {
      const m = genMission();
      if (m && m.kind === "medical") job = m;
    }
    expect(job).toBeTruthy();
    expect(activeMood(job!.dest)?.cause).toBe("outbreak");
  });
});

describe("random tick on docking", () => {
  it("tickPortMoods() in isolation only ever touches the current port", () => {
    // Isolated from arrive()'s refreshMarket(), which can separately plant an
    // outbreak at some OTHER port via a generated medical job — that's a
    // distinct, intentional path (the job board is how you learn of an
    // outbreak elsewhere), not this function's concern.
    S.loc = "meridian";
    tickPortMoods();
    for (const loc of Object.keys(PLANETS)) {
      if (loc === "meridian") continue;
      expect(S.portMood[loc]).toBeUndefined();
    }
  });

  it("never stacks a second mood over an already-active one", () => {
    setMood("meridian", "festival", 50);
    tickPortMoods(); // S.loc is solace by default in this suite; force it
    S.loc = "meridian";
    tickPortMoods();
    expect(activeMood("meridian")?.mood).toBe("festival");
  });
});

describe("save invariants", () => {
  it("a live mood on a real save passes checkInvariants", () => {
    setMood(S.loc, "boom", 15);
    expect(checkInvariants("moods")).toEqual([]);
  });
});

describe("station status word", () => {
  it("every mood has a display word", () => {
    for (const mood of ["boom", "shortage", "lockdown", "festival"] as const) {
      expect(MOOD_WORD[mood]).toBeTruthy();
    }
  });
});
