import { S, log } from "../state";
import { PLANETS, MODS, FLAVOR } from "../content";
import { stats, daysTo, fuelTo, foodPerDay, salaries, perkActive, captainDoubleHatting } from "../derive";
import { rand, pick } from "../rng";
import { clamp } from "../util";
import { requestRender } from "../bus";
import { rollEvent, evAdrift, evQuiet } from "./events";
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
import { introTravelBeat, introArrive } from "./intro";
import { checkCrewQuests, checkCrewDeparture } from "./crewtalk";
import { checkAgendaBeats } from "./agendabeats";
import { checkImogenQuest } from "./imogenquest";
import { checkCrewDialogueArcs } from "./crewdialogue";
import { bumpStanding } from "./port";
import { accrueWear } from "./wear";
import { rankBoost, markVeteranEvent } from "./veterancy";
import { checkSurvey, seamRoyalties } from "./survey";
import { checkLoyaltyArrive, checkLoyaltyOffer } from "./loyalty";
import { tickPortMoods, resolveOutbreakIfDue } from "./moods";
import type { Job } from "../types";

export function depart(destId: string) {
  if (!S.docked || S.travel) return;
  const d = daysTo(S.loc, destId);
  const f = fuelTo(S.loc, destId);
  if (S.fuel < f) { log(`Not enough fuel — need ${f}, have ${Math.floor(S.fuel)}.`); requestRender(); return; }
  S.travel = { from: S.loc, dest: destId, total: d, left: d };
  S.docked = false;
  S.screen = "ship";
  S.selPlanet = null;
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

export function fieldRepairLimit(): number {
  const st = stats();
  const workshop = st.active("workshop") > 0;
  const perk = perkActive("mechanic");
  const ratio = (workshop ? 0.6 : 0.5) + (perk ? 0.05 : 0);
  return Math.round(S.hullMax * ratio);
}

export function advanceDay() {
  if (!S.travel || S.over) return;
  dayTick(true);
  S.travel.left--;
  if (S.travel.left <= 0) { arrive(); requestRender(); return; }
  if (S.over) { requestRender(); return; }
  // The prologue scripts its own travel days — no random lane events on top.
  if (introTravelBeat()) { S.travel.evd = true; requestRender(); return; }
  // events
  if (S.arc.stage === 5 && rand() < 0.45) { S.travel.evd = true; evHunter(); requestRender(); return; }
  const arcJob = S.jobs.find((j) => j.arcVoss);
  if (arcJob && !S.arc.ambushed && S.travel.dest === "havens") {
    S.arc.ambushed = true;
    S.travel.evd = true;
    evAmbush();
    requestRender();
    return;
  }
  // A charting contract riding this journey takes its readings at the midpoint —
  // a planted payoff the player chose, so it outranks a random lane event.
  if (checkSurvey()) { S.travel.evd = true; requestRender(); return; }
  // Planted consequences take priority over fresh random noise.
  if (checkScheduler()) { S.travel.evd = true; requestRender(); return; }
  // No dead legs: if a hop has been pure silence, its last full day always
  // rolls something — even a quiet-flavor beat beats three clicks of nothing.
  if (rand() < 0.42 || (S.travel.left === 1 && !S.travel.evd)) {
    S.travel.evd = true;
    rollEvent();
  } else {
    // Every other day still owes the player a line — advancing the clock in
    // total silence reads as "did that click even register," not calm.
    evQuiet();
  }
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
    // A cook keeping the whole crew fed, week after week, is the job —
    // credit it periodically rather than every single clean day.
    if (st.has("cook") && S.day % 10 === 0) {
      const cook = S.crew.find((c) => c.role === "cook");
      if (cook) markVeteranEvent(cook);
    }
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
  // Mechanics can stabilize a wounded ship in flight, not rebuild it for free.
  // Full integrity still belongs to a dry dock; a workshop raises the field cap.
  if (traveling && st.has("mechanic")) {
    const mechPerk = perkActive("mechanic");
    const mech = S.crew.find((c) => c.role === "mechanic");
    const repairCap = fieldRepairLimit();
    if (S.hull < repairCap) {
      const amt = (2 + (mechPerk ? 1 : 0)) * (mech ? rankBoost(S.crew, "mechanic") : 1);
      S.hull = Math.min(repairCap, S.hull + amt);
    }
    const dmgd = S.modules.filter((m) => m.dmg);
    if (dmgd.length && rand() < (st.active("workshop") > 0 ? 0.6 : 0.3) + (mechPerk ? 0.15 : 0)) {
      const m = pick(dmgd);
      m.dmg = false;
      m.wear = Math.max(m.wear || 0, st.active("workshop") > 0 ? 45 : 65);
      powerRebalance();
      log(`🔧 Your mechanic jury-rigs the ${MODS[m.t].n} back online. It works, but the repair is temporary — a refit would make it right.`);
      if (mech) markVeteranEvent(mech);
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
  // the ship ages in flight — worn systems are tomorrow's breakdowns
  accrueWear(traveling);
  // the Long Silence advances on its own clock
  silenceTick();
}

export function failJob(j: Job, msg: string) {
  S.jobs = S.jobs.filter((x) => x.id !== j.id);
  S.prestige = Math.max(0, S.prestige - 3);
  if (j.rep) S.rep[j.rep[0]] = clamp(S.rep[j.rep[0]] - 2, -20, 20);
  log(msg);
}

// A contract you took on and can't or won't finish — cheaper than blowing the
// deadline (failJob), since backing out on purpose is a choice, not a screwup.
// Frees the cargo/berth/hidden-hold space it was holding immediately.
export function abandonJob(id: number) {
  const j = S.jobs.find((x) => x.id === id);
  if (!j) return;
  if (j.arcCrate || j.arcVoss) { log(`"${j.title}" isn't a contract you can just walk away from.`); requestRender(); return; }
  S.jobs = S.jobs.filter((x) => x.id !== id);
  S.prestige = Math.max(0, S.prestige - 1);
  if (j.rep) S.rep[j.rep[0]] = clamp(S.rep[j.rep[0]] - 1, -20, 20);
  log(`Abandoned contract: "${j.title}". Word gets around when a captain backs out (−1 prestige).`);
  requestRender();
}

export function arrive() {
  const dest = S.travel!.dest;
  S.loc = dest; S.docked = true; S.travel = null; S.screen = "shipwalk";
  resetStation();
  log(`Docked at ${PLANETS[dest].n}.`);
  tickPortMoods();
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
    // A charting contract only pays if you actually took the readings en route.
    // Arriving with an un-surveyed one (you routed around the coordinate) voids
    // the charting fee — the Circle pays for data, not for showing up.
    if (j.kind === "survey" && !j.surveyed) {
      S.jobs = S.jobs.filter((x) => x.id !== j.id);
      S.prestige = Math.max(0, S.prestige - 1);
      log(`Charting contract "${j.title}" voided — you never took the readings. The Circle doesn't pay for an empty logbook (−1 prestige).`);
      continue;
    }
    S.jobs = S.jobs.filter((x) => x.id !== j.id);
    completePay(j);
    if (j.arcCrate) arcVergeScene();
    if (j.arcVoss) arcHavensScene();
  }
  // Staked seams pay their trickle every time you make port.
  seamRoyalties();
  refreshMarket();
  // campaign beats own the arrival if one is due (the prologue's docking,
  // dark stations, the source)
  if (introArrive()) return;
  if (silenceArrive()) return;
  // your playstyle may quietly plant a future payoff, then dock-riders fire
  maybePlantReputationRider();
  checkScheduler();
  // a crew member's personal quest may resolve here, or a badly neglected one
  // may walk, or a named character's agenda may surface — at most one of
  // these opens a modal per docking
  // A loyalty errand resolving here takes precedence — you flew all this way
  // for it — and is checked before a new one can be offered.
  checkLoyaltyArrive();
  checkCrewQuests();
  checkCrewDeparture();
  checkAgendaBeats();
  checkImogenQuest();
  checkCrewDialogueArcs();
  checkLoyaltyOffer();
}

export function completePay(j: Job) {
  const st = stats();
  let pay = j.pay;
  const qm = S.crew.find((c) => c.role === "quartermaster");
  if (st.has("quartermaster")) {
    pay = Math.round(pay * (perkActive("quartermaster") ? 1.22 : 1.15) * (qm ? rankBoost(S.crew, "quartermaster") : 1));
    if (qm) markVeteranEvent(qm);
  }
  // A captain still moonlighting as their own pre-command specialty isn't
  // giving contracts full attention — a standing incentive to hire the role.
  if (captainDoubleHatting()) pay = Math.round(pay * 0.9);
  if (j.vip && j.pax && !j.pax.sick && st.active("luxcabin") === 0) {
    pay = Math.round(pay * 0.6);
    log(`${j.pax.name} spent the trip in an unpowered stateroom and deducts 40% of the fare, itemized, with footnotes.`);
  }
  if (j.pax && j.pax.sick && st.has("medic") && perkActive("medic")) {
    log(`${j.pax.name} disembarks fighting fit — your medic wouldn't let it go any other way. Full pay.`);
    const medic = S.crew.find((c) => c.role === "medic");
    if (medic) markVeteranEvent(medic);
  } else if (j.pax && j.pax.sick) {
    pay = Math.round(pay * 0.5);
    S.prestige = Math.max(0, S.prestige - 1);
    log(`${j.pax.name} disembarks pale and furious. Half pay.`);
  }
  S.credits += pay;
  S.prestige += j.prestige || 0;
  if (j.rep) S.rep[j.rep[0]] = clamp(S.rep[j.rep[0]] + (j.rep[1] || 1), -20, 20);
  // Delivering here earns goodwill at THIS port — the surest way to become a
  // regular somewhere is to keep showing up with the goods.
  bumpStanding(S.loc, (j.prestige || 0) >= 3 ? 2 : 1);
  // The named CORE_LOOP example: the serum you ran ends the outbreak.
  if (j.kind === "medical") resolveOutbreakIfDue(S.loc);
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
