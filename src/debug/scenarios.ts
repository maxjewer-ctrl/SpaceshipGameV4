// Dev/playtest scenario loader: jump the game to a known later state without
// grinding there. Exposed as window.__scenario(name) — same underscore surface
// as the other debug accessors in main.ts. Deterministic-ish on purpose: each
// build starts from newState() and mutates, so save-migration stays honest.
//
//   __scenario()            → list available scenarios
//   __scenario('fighter')   → armed mid-game ship, docked at Solace
import { S, setState, newState, save, log, mk } from "../state";
import { requestRender } from "../bus";
import { clearModal } from "../modal";
import { genBundle } from "../systems/market";
import { refreshMarket } from "../systems/market";
import type { CrewMember } from "../types";

function crew(role: string, name: string): CrewMember {
  return {
    id: S.uid++, name, role, fee: 0, salary: 8,
    bundle: genBundle(), daysAboard: 12, questStage: 0, revealed: {},
  };
}

// Every scenario starts past the prologue with a clean slate.
function base(name: string) {
  setState(newState(name));
  S.flags.intro_done = true;
  S.flags.intro = 6;
}

const SCENARIOS: Record<string, { desc: string; build: () => void }> = {
  fresh: {
    desc: "Clean start, docked at Port Solace, 500cr (prologue skipped)",
    build: () => { base("Kestrel"); },
  },
  trader: {
    desc: "Day 14 trade-loop ship: 2 cargo holds, pilot+mechanic, 1,800cr",
    build: () => {
      base("Marrow's Luck");
      S.day = 14; S.credits = 1800; S.prestige = 4; S.fuel = 36; S.food = 26;
      S.modules.push(mk("cargohold"), mk("quarters"));
      S.crew.push(crew("pilot", "Odile Vance"), crew("mechanic", "Kesh Barlow"));
      S.rep.union = 2; S.rep.frontier = 1;
    },
  },
  fighter: {
    desc: "Day 20 armed ship: 2 weapons + shields + armory, gunner, engine Mk-II",
    build: () => {
      base("Spite & Polish");
      S.day = 20; S.credits = 900; S.prestige = 6; S.fuel = 38; S.food = 22;
      S.engineLvl = 2; S.slotsMax = 8;
      S.modules.push(mk("weapons"), mk("weapons"), mk("shields"), mk("armory"), mk("quarters"));
      S.crew.push(crew("gunner", "Rex Calloway"), crew("mechanic", "Pia Osei"));
      S.disposition.daring = 6;
    },
  },
  silence: {
    desc: "Day 17 — the Broadcast fires on the next day tick; trader loadout",
    build: () => {
      base("Long Ear");
      S.day = 17; S.credits = 1400; S.prestige = 5; S.fuel = 40; S.food = 30;
      S.modules.push(mk("cargohold"), mk("quarters"));
      S.crew.push(crew("pilot", "Dane Okoro"), crew("cook", "Sef Adeyemi"));
    },
  },
  arc: {
    desc: "12★ prestige, day 30, kitted — the woman in the grey coat is waiting",
    build: () => {
      base("Twelve Stars");
      S.day = 30; S.credits = 2500; S.prestige = 12; S.fuel = 60; S.food = 35;
      S.engineLvl = 2; S.slotsMax = 8;
      S.modules.push(mk("weapons"), mk("shields"), mk("quarters"), mk("cabin"), mk("fueltank"));
      S.crew.push(crew("pilot", "Odile Vance"), crew("gunner", "Rex Calloway"), crew("mechanic", "Kesh Barlow"));
      S.rep.union = -2; S.rep.frontier = 4;
    },
  },
  run: {
    desc: "THE RUN in progress: arc stage 5, 14-day deadline, provisioned heavy",
    build: () => {
      base("Last Light");
      S.day = 44; S.credits = 800; S.prestige = 14; S.food = 44;
      S.engineLvl = 3; S.slotsMax = 8;
      S.modules.push(mk("fueltank"), mk("weapons"), mk("weapons"), mk("shields"), mk("quarters"));
      S.fuel = 80;
      S.crew.push(crew("pilot", "Odile Vance"), crew("gunner", "Rex Calloway"), crew("mechanic", "Kesh Barlow"));
      S.arc.stage = 5; S.arc.deadline = S.day + 14;
      S.flags.gate_visible = true;
    },
  },
  reckoning: {
    desc: "Voss arc resolved (broadcast made) — the Tribunal threads are live",
    build: () => {
      base("Verdict");
      S.day = 52; S.credits = 3200; S.prestige = 15; S.fuel = 70; S.food = 40;
      S.engineLvl = 3; S.slotsMax = 8;
      S.modules.push(mk("fueltank"), mk("weapons"), mk("shields"), mk("quarters"), mk("cabin"));
      S.crew.push(crew("pilot", "Odile Vance"), crew("medic", "Ansel Grey"), crew("mechanic", "Kesh Barlow"));
      S.arc.stage = 6; S.arc.done = true;
      S.flags.arc_resolved = true; S.flags.arc_broadcast = true;
      S.rep.union = -6; S.rep.frontier = 6;
    },
  },
};

export function loadScenario(name?: string): string {
  if (!name || !SCENARIOS[name]) {
    return "Scenarios: " + Object.keys(SCENARIOS).map((k) => `${k} — ${SCENARIOS[k].desc}`).join(" · ");
  }
  clearModal();
  SCENARIOS[name].build();
  refreshMarket();
  log(`— [dev] Scenario loaded: ${name}. ${SCENARIOS[name].desc} —`);
  save();
  requestRender();
  return `Loaded '${name}': ${SCENARIOS[name].desc}`;
}
