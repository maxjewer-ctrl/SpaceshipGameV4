import { S, log } from "../state";
import { PLANETS, MODS, FLAVOR } from "../content";
import { stats, daysTo, fuelTo, foodPerDay, salaries, perkActive } from "../derive";
import { rand, pick } from "../rng";
import { clamp } from "../util";
import { requestRender } from "../bus";
import { hasModal } from "../modal";
import { rollEvent, evAdrift } from "./events";
import { startCombat } from "./combat";
import { powerRebalance } from "./actions";
import { refreshMarket } from "./market";
import { gameOver } from "./gameover";
import { evHunter, evAmbush, arcIntercept, arcVergeScene, arcHavensScene, arcVictory } from "./arc";
import { checkScheduler, plantDelay, maybePlantReputationRider } from "./scheduler";
import { bark, tellBark } from "./barks";
import { remember, crewKey } from "./ledger";
import { shift } from "./disposition";
import { resetStation } from "../ui/stationwalk";
import { silenceTick, silenceArrive } from "./silence";
import { launchCleared, resetLaunch } from "../ui/bridge";
import { bayIsOpen } from "../ui/cockpit";
import { checkCrewQuests, checkCrewDeparture } from "./crewtalk";
import type { Job } from "../types";

export function depart(destId: string) {
  if (!S.docked || S.travel) return;
  if (!launchCleared()) { log("⚓ The clamps are still on — run the launch sequence (Bridge)."); requestRender(); return; }
  if (bayIsOpen()) { log("📦 Bay doors are open to vacuum — seal the hold before liftoff."); requestRender(); return; }
  const d = daysTo(S.loc, destId);
  const f = fuelTo(S.loc, destId);
  if (S.fuel < f) { log(`Not enough fuel — need ${f}, have ${Math.floor(S.fuel)}.`); requestRender(); return; }
  S.travel = { from: S.loc, dest: destId, total: d, left: d };
  S.docked = false;
  S.screen = "bridge";
  S.selPlanet = null;
  resetLaunch(); // the board goes dark for the next port
  log(`Departed ${PLANETS[S.loc].n} for ${PLANETS[destId].n}. ${d} days out. ${pick(FLAVOR.depart)}`);
  if (!tellBark("depart")) bark("depart", { chance: 0.7 });
  requestRender();
}

export function waitDay() {
  dayTick(false);
  if (S.over) return;
  if (checkScheduler()) { requestRender(); return; }
  log("You wait a day in port. The dockworkers play cards. The meter runs.");
  bark("quiet", { chance: 0.4 });
  requestRender();
}

export function advanceDay() {
  if (!S.travel || S.over) return;
  dayTick(true);
  if (S.over || hasModal()) { requestRender(); return; }
  S.travel.left--;
  if (S.travel.left <= 0) { arrive(); requestRender(); return; }
  // events
  if (S.arc.stage === 5 && rand() < 0.45) { evHunter(); requestRender(); return; }
  const arcJob = S.jobs.find((j) => j.arcVoss);
  if (arcJob && !S.arc.ambushed && S.travel.dest === "havens") {
    S.arc.ambushed = true;
    evAmbush();
    requestRender();
    return;
  }
  // Planted consequences take priority over fresh random noise.
  if (checkScheduler()) { requestRender(); return; }
  if (rand() < 0.42) rollEvent();
  requestRender();
}

export function dayTick(traveling: boolean) {
  S.day++;
  const st = stats();
  // veterancy: every day aboard is a day they're harder to replace
  for (const c of S.crew) c.daysAboard = (c.daysAboard || 0) + 1;
  // fuel
  if (traveling) {
    S.fuel = +(S.fuel - st.fuelDay).toFixed(1);
    if (S.fuel <= 0) { S.fuel = 0; evAdrift(); }
  }
  // food
  const eat = perkActive("cook") ? Math.ceil(foodPerDay() * 0.9) : foodPerDay();
  S.food += st.foodGen;
  S.food -= eat;
  if (S.food < 0) {
    S.food = 0; S.starve++;
    S.prestige = Math.max(0, S.prestige - 1);
    if (S.starve === 2) log("The pantry is empty. Everyone's rationing air-paste and resentment.");
    if (S.starve === 2) { tellBark("starving"); bark("starving", { chance: 0.6 }); }
    if (S.starve === 4 && S.crew.length > 0) {
      const c = S.crew.pop()!;
      log(`${c.name} is too weak to work and jumps ship at the first chance. Starvation is bad for retention.`);
      remember(crewKey(c), "captain_starved_us", -4, `You let ${c.name} go hungry until they jumped ship.`);
    }
    if (S.starve >= 6) {
      gameOver("You starved in the black. The ship drifts on, a quiet tomb with your name on the registry.");
      return;
    }
    if (S.starve >= 2) log("⚠ STARVING — buy food, fast.");
  } else {
    S.starve = 0;
  }
  // salaries
  const pay = salaries();
  if (pay > 0) {
    if (S.credits >= pay) { S.credits -= pay; S.unpaid = 0; }
    else {
      S.unpaid++;
      log("⚠ You couldn't make payroll. The crew notices these things.");
      for (const c of S.crew) remember(crewKey(c), "captain_missed_payroll", -1, `Payroll came up short on day ${S.day}.`);
      bark("payroll_miss", { chance: 0.7 });
      if (S.unpaid >= 3 && S.crew.length > 0) {
        const c = S.crew.shift()!;
        log(`${c.name} quit over back pay. Word gets around (−2 prestige).`);
        remember(crewKey(c), "captain_stiffed_us", -3, `${c.name} walked over unpaid wages.`);
        S.prestige = Math.max(0, S.prestige - 2);
        S.unpaid = 1;
      }
    }
  }
  // mechanic works in flight: hull first, then jury-rigging broken modules
  if (traveling && st.has("mechanic")) {
    const mechPerk = perkActive("mechanic");
    if (S.hull < S.hullMax) {
      const amt = (st.active("workshop") > 0 ? 6 : 3) + (mechPerk ? 2 : 0);
      S.hull = Math.min(S.hullMax, S.hull + amt);
    }
    const dmgd = S.modules.filter((m) => m.dmg);
    if (dmgd.length && rand() < (st.active("workshop") > 0 ? 0.6 : 0.3) + (mechPerk ? 0.15 : 0)) {
      const m = pick(dmgd);
      m.dmg = false;
      powerRebalance();
      log(`🔧 Your mechanic jury-rigs the ${MODS[m.t].n} back online. It sounds wrong, but it works.`);
    }
  }
  // deadlines
  for (const j of S.jobs.slice()) {
    if (j.deadline && S.day > j.deadline) {
      failJob(j, `Deadline blown on "${j.title}". The cargo is worthless and your name is mud (−3 prestige).`);
    }
  }
  // arc run deadline
  if (S.arc.stage === 5 && S.arc.deadline && S.day > S.arc.deadline) {
    arcIntercept();
  }
  // the Long Silence advances on its own clock
  silenceTick();
}

export function failJob(j: Job, msg: string) {
  S.jobs = S.jobs.filter((x) => x.id !== j.id);
  S.prestige = Math.max(0, S.prestige - 3);
  if (j.rep) S.rep[j.rep[0]] = clamp(S.rep[j.rep[0]] - 2, -20, 20);
  log(msg);
}

export function arrive() {
  const dest = S.travel!.dest;
  // Land on the bridge: arrival is a story beat (deliveries, scenes, quests
  // all fire here), so the story screen should be what greets the captain.
  S.loc = dest; S.docked = true; S.travel = null; S.screen = "bridge";
  resetStation();
  log(`Docked at ${PLANETS[dest].n}.`);
  // victory check
  if (dest === "gate" && S.arc.stage === 5) { arcVictory(); return; }
  // a crew member from this world gets a moment
  const planetName = PLANETS[dest].n.split(/['\s]/)[0].toLowerCase();
  const homer = S.crew.find((c) => c.bundle && c.bundle.origin.toLowerCase().includes(planetName));
  if (homer && !S.flags[`home_${dest}_${homer.id}`]) {
    S.flags[`home_${dest}_${homer.id}`] = true;
    bark("dock_home", { crew: homer });
  } else if (!tellBark("arrive")) {
    bark("arrive", { chance: 0.5 });
  }
  // deliveries
  const arrivals = S.jobs.filter((j) => j.dest === dest);
  for (const j of arrivals) {
    if (j.kind === "bounty") {
      S.jobs = S.jobs.filter((x) => x.id !== j.id);
      const e = j.tier
        ? { name: "Corsair " + j.title.replace("Bounty: ", ""), hull: 60, dmg: 13, loot: 0 }
        : { name: j.title.replace("Bounty: ", ""), hull: 40, dmg: 10, loot: 0 };
      const jj = j;
      startCombat(e,
        () => { completePay(jj); log(`Bounty collected on ${e.name}.`); },
        () => { log("The bounty got away. The contract's void (−1 prestige)."); S.prestige = Math.max(0, S.prestige - 1); });
      break; // combat modal takes over; remaining deliveries handled below
    }
  }
  for (const j of arrivals) {
    if (j.kind === "bounty") continue;
    S.jobs = S.jobs.filter((x) => x.id !== j.id);
    completePay(j);
    if (j.arcCrate) arcVergeScene();
    if (j.arcVoss) arcHavensScene();
  }
  refreshMarket();
  // campaign beats own the arrival if one is due (dark stations, the source)
  if (silenceArrive()) return;
  // your playstyle may quietly plant a future payoff, then dock-riders fire
  maybePlantReputationRider();
  checkScheduler();
  // a crew member's personal quest may resolve here, or a badly neglected one
  // may walk — at most one of these opens a modal per docking
  checkCrewQuests();
  checkCrewDeparture();
}

export function completePay(j: Job) {
  const st = stats();
  let pay = j.pay;
  if (st.has("quartermaster")) pay = Math.round(pay * (perkActive("quartermaster") ? 1.22 : 1.15));
  if (j.vip && j.pax && !j.pax.sick && st.active("luxcabin") === 0) {
    pay = Math.round(pay * 0.6);
    log(`${j.pax.name} spent the trip in an unpowered stateroom and deducts 40% of the fare, itemized, with footnotes.`);
  }
  if (j.pax && j.pax.sick && st.has("medic") && perkActive("medic")) {
    log(`${j.pax.name} disembarks fighting fit — your medic wouldn't let it go any other way. Full pay.`);
  } else if (j.pax && j.pax.sick) {
    pay = Math.round(pay * 0.5);
    S.prestige = Math.max(0, S.prestige - 1);
    log(`${j.pax.name} disembarks pale and furious. Half pay.`);
  }
  S.credits += pay;
  S.prestige += j.prestige || 0;
  if (j.rep) S.rep[j.rep[0]] = clamp(S.rep[j.rep[0]] + (j.rep[1] || 1), -20, 20);
  // campaign missions report completion via flags (scenes gate on job_<tag>)
  if (j.tag) S.flags["job_" + j.tag] = true;
  log(`✓ ${j.title} — paid ${Math.round(pay).toLocaleString()}cr${j.prestige ? ", +" + j.prestige + " prestige" : ""}.`);
  if (j.pax && j.pax.motive === "spy") {
    const f = pick(["union", "frontier", "syndicate"]);
    const up = rand() < 0.5;
    S.rep[f] = clamp(S.rep[f] + (up ? 3 : -3), -20, 20);
    log(`Days later, news breaks that traces back to your passenger. ${f === "union" ? "The Terran Union" : f === "frontier" ? "The Frontier Compact" : "The Red Sky Syndicate"} ${up ? "approves" : "is displeased"}.`);
  }
  if (j.pax && j.pax.motive === "pilgrim") {
    S.prestige += 1;
    log("The pilgrim blesses your ship on the ramp. Passersby notice. (+1 prestige)");
    // Chekhov's passenger: the pilgrim was mapping something. A chart arrives later.
    if (!S.flags.pilgrim_chart) plantDelay(12, 30, "pilgrim_star_chart");
  }
  if (j.hidden) {
    shift("law", -1, "delivered contraband");
    // The Bill: ~40% of smuggling runs carry a hidden rider that comes due weeks on.
    if (rand() < 0.4) plantDelay(8, 25, "smuggle_the_bill");
  }
  if (j.pax && j.pax.motive === "fugitive") {
    S.rep.frontier = clamp(S.rep.frontier + 2, -20, 20);
    S.rep.syndicate = clamp(S.rep.syndicate + 1, -20, 20);
  }
}
