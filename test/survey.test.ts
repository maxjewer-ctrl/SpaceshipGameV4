import { describe, it, expect, beforeEach } from "vitest";
import { S, setState, newState } from "../src/state";
import { PLANETS } from "../src/content";
import { modalHTML, clearModal } from "../src/modal";
import {
  genSurveyMission, recordPoi, checkSurvey, seamRoyalties,
  surveyStake, surveyBoard, surveyLogBeacon,
} from "../src/systems/survey";
import { advanceDay } from "../src/systems/travel";
import { checkInvariants } from "./harness";
import type { Job } from "../src/types";

beforeEach(() => {
  setState(newState("Survey Test"));
  S.loc = "solace"; S.docked = true;
  S.flags.intro_done = true;
  clearModal();
});

describe("survey contract generation", () => {
  it("targets a real, reachable port and carries a coordinate", () => {
    const j = genSurveyMission();
    expect(j).toBeTruthy();
    expect(j!.kind).toBe("survey");
    expect(PLANETS[j!.dest]).toBeTruthy();
    expect(j!.dest).not.toBe(S.loc);
    expect(typeof j!.sx).toBe("number");
    expect(typeof j!.sy).toBe("number");
    expect(j!.surveyed).toBeUndefined();
  });
});

describe("recordPoi", () => {
  it("adds a mark and dedupes nearby duplicates", () => {
    recordPoi("seam", 400, 250, "Test Seam");
    expect(S.poi).toHaveLength(1);
    recordPoi("seam", 405, 252, "Test Seam"); // within dedupe radius
    expect(S.poi).toHaveLength(1);
    recordPoi("derelict", 600, 100, "Far Wreck");
    expect(S.poi).toHaveLength(2);
  });
});

describe("checkSurvey fires mid-journey", () => {
  function planSurveyJourney(): Job {
    const dest = "meridian";
    const total = 6;
    const job: Job = { id: S.uid++, kind: "survey", title: "Survey: the Cold Furrow", dest, sx: 480, sy: 240, pay: 200 };
    S.jobs.push(job);
    S.docked = false;
    S.travel = { from: "solace", dest, total, left: total };
    return job;
  }

  it("opens the find-scene at the midpoint and marks the job surveyed", () => {
    const job = planSurveyJourney();
    const trigger = Math.max(1, Math.round(S.travel!.total / 2)); // 3
    S.travel!.left = trigger;
    const fired = checkSurvey();
    expect(fired).toBe(true);
    expect(job.surveyed).toBe(true);
    expect(modalHTML()).toContain("Survey:");
  });

  it("does not fire on the wrong day", () => {
    planSurveyJourney();
    S.travel!.left = 1; // not the midpoint of a 6-day run
    expect(checkSurvey()).toBe(false);
  });

  it("records a POI once the player resolves the scene", () => {
    const job = planSurveyJourney();
    S.travel!.left = Math.max(1, Math.round(S.travel!.total / 2));
    checkSurvey();
    // resolve whichever scene opened by driving one of its terminal choices;
    // every path calls recordPoi, so at least one mark must exist afterward.
    const html = modalHTML() || "";
    if (/Stake the claim|mineral seam/.test(html)) surveyStake();
    else if (/Suit up and board|tumbling slow/.test(html)) surveyBoard();
    else surveyLogBeacon();
    expect(S.poi.length).toBeGreaterThanOrEqual(1);
    expect(job.surveyed).toBe(true);
  });
});

describe("seam royalties", () => {
  it("pays a trickle per staked seam on docking, nothing without one", () => {
    const before = S.credits;
    seamRoyalties();
    expect(S.credits).toBe(before); // no seams yet
    recordPoi("seam", 400, 250, "Rich Seam");
    seamRoyalties();
    expect(S.credits).toBeGreaterThan(before);
  });
});

describe("delivery pays only a surveyed contract", () => {
  it("voids the charting fee if the readings were never taken", () => {
    const dest = "meridian";
    const job: Job = { id: S.uid++, kind: "survey", title: "Survey: the Long Quiet", dest, sx: 480, sy: 240, pay: 300, surveyed: false };
    S.jobs.push(job);
    S.docked = false;
    S.travel = { from: "solace", dest, total: 1, left: 1 };
    const before = S.credits;
    advanceDay(); // total 1 → arrives at meridian without the survey ever firing
    expect(S.jobs.find((j) => j.id === job.id)).toBeUndefined(); // resolved (voided)
    expect(S.credits).toBe(before); // no charting fee paid
    expect(checkInvariants("void-survey")).toEqual([]);
  });
});
