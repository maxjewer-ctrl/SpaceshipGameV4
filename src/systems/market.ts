import { S, log } from "../state";
import { PLANETS, MODS, GOODS, NAMES, MOTIVES, FLAVOR, ROLES, CREWGEN } from "../content";
import { stats, daysTo, cargoUsed, scargoUsed, paxJobs, vipJobs } from "../derive";
import { rand, ri, pick } from "../rng";
import { requestRender } from "../bus";
import { bark } from "./barks";
import type { Job, CrewMember, CrewBundle } from "../types";

export function yardPrice(t: string): number {
  const disc = PLANETS[S.loc].yard || 1;
  return Math.round(MODS[t].price * disc);
}

export function refreshMarket() {
  if (S.market && S.market.loc === S.loc && S.market.day === S.day) return;
  const p = PLANETS[S.loc];
  if (S.loc === "gate") {
    S.market = { loc: S.loc, day: S.day, missions: [], recruits: [], prices: {}, rumors: [] };
    return;
  }
  const prices: Record<string, number> = {};
  for (const g in GOODS) {
    prices[g] = Math.round(GOODS[g].base * p.goods[g] * (0.9 + rand() * 0.25));
  }
  const missions: Job[] = [];
  const n = ri(3, 5);
  for (let i = 0; i < n; i++) { const m = genMission(); if (m) missions.push(m); }
  const recruits: CrewMember[] = [];
  const rn = ri(0, 2);
  for (let i = 0; i < rn; i++) recruits.push(genRecruit());
  const rumors: string[] = [];
  // Rider-planted rumors (leads, consequences of your own choices) surface first.
  const planted: string[] = S.flags.riderRumors || [];
  while (planted.length && rumors.length < 1) rumors.push(planted.shift()!);
  const pool = FLAVOR.rumors.slice();
  while (rumors.length < 2 && pool.length) rumors.push(pool.splice(Math.floor(rand() * pool.length), 1)[0]);
  S.market = { loc: S.loc, day: S.day, missions, recruits, prices, rumors };
}

function otherPlanet(): string {
  const opts = Object.keys(PLANETS).filter((k) => k !== S.loc && !PLANETS[k].hidden);
  return pick(opts);
}

export function genMission(): Job | null {
  const p = PLANETS[S.loc];
  const roll = rand();
  const dest = otherPlanet();
  const dd = daysTo(S.loc, dest);
  const id = S.uid++;
  if (roll < 0.3) { // cargo
    const units = ri(6, 16);
    return { id, kind: "cargo", title: "Freight: " + pick(NAMES.freight), dest, units,
      pay: units * ri(6, 10) + dd * 30, prestige: 1, rep: [p.fac, 1],
      needs: ["cargo:" + units],
      desc: `Haul ${units} units to ${PLANETS[dest].n}. ${dd} day run.` };
  } else if (roll < 0.55) { // passenger
    const motive = pick(Object.keys(MOTIVES));
    const name = pick(NAMES.first) + " " + pick(NAMES.last);
    return { id, kind: "passenger", title: "Passenger: " + name, dest,
      pay: 100 + dd * 45 + (motive === "fugitive" ? 80 : 0), prestige: 1, rep: [p.fac, 1],
      needs: ["pax:1"], pax: { name, motive, sick: false },
      desc: `${name} needs passage to ${PLANETS[dest].n}. They ${MOTIVES[motive].hint}.` };
  } else if (roll < 0.67) { // medical
    const units = ri(3, 6);
    const deadline = S.day + dd + ri(1, 2);
    return { id, kind: "medical", title: "URGENT: Serum run", dest, units, deadline,
      pay: 200 + dd * 60, prestige: 3, rep: [PLANETS[dest].fac, 3],
      needs: ["cargo:" + units, "mod:medbay"],
      desc: `${PLANETS[dest].n} has an outbreak. Deliver ${units} units of cold-chain serum by day ${deadline} or it spoils.` };
  } else if (roll < 0.79) { // bounty
    const tier = S.day > 25 ? 1 : 0;
    return { id, kind: "bounty", title: "Bounty: " + pick(NAMES.bounties), dest,
      pay: 350 + dd * 50 + tier * 150, prestige: 3, rep: [p.fac, 2], tier,
      needs: ["mod:weapons", "mod:armory"],
      desc: `A raider operating near ${PLANETS[dest].n}. Fly out, put them down, collect. Expect a real fight.` };
  } else if (roll < 0.89 && (p.fac === "syndicate" || S.rep.syndicate >= 5)) { // smuggle
    const units = ri(4, 8);
    return { id, kind: "smuggle", title: "No-questions freight", dest, units, hidden: true,
      pay: 250 + dd * 70, prestige: 0, rep: ["syndicate", 3],
      needs: ["scargo:" + units, "mod:smuggler"],
      desc: `${units} units. Sealed. Hidden hold only. If a patrol scans you, that's your problem. Pays very well.` };
  } else if (roll < 0.89) { // fallback cargo
    const units = ri(6, 12);
    return { id, kind: "cargo", title: "Freight: sealed containers", dest, units,
      pay: units * 8 + dd * 32, prestige: 1, rep: [p.fac, 1], needs: ["cargo:" + units],
      desc: `Haul ${units} units to ${PLANETS[dest].n}. ${dd} day run.` };
  } else { // VIP
    const name = pick(NAMES.vips);
    const minP = 8;
    return { id, kind: "vip", title: "VIP Charter: " + name, dest,
      pay: 300 + dd * 80, prestige: 4, rep: [p.fac, 2], minPrestige: minP,
      needs: ["vip:1", "prestige:" + minP], pax: { name, motive: "vip", sick: false }, vip: true,
      desc: `${name} requires discreet, comfortable passage to ${PLANETS[dest].n}. Stateroom mandatory. Reputation required.` };
  }
}

// Roll a hidden Tapestry bundle: origin, want, wound, secret, tell, and two
// distinct personality traits. The game never shows this — it leaks via barks.
export function genBundle(): CrewBundle {
  const traits: string[] = [];
  while (traits.length < 2) {
    const t = pick(CREWGEN.traits);
    if (!traits.includes(t)) traits.push(t);
  }
  const wound = pick(CREWGEN.wounds);
  const secret = pick(CREWGEN.secrets);
  const tell = pick(CREWGEN.tells);
  return {
    origin: pick(CREWGEN.origins),
    want: pick(CREWGEN.wants),
    wound: wound.text, woundTag: wound.tag,
    secret: secret.text, secretTag: secret.tag,
    tell: tell.text, tellSituation: tell.situation,
    traits,
  };
}

export function genRecruit(): CrewMember {
  const role = pick(Object.keys(ROLES));
  return {
    id: S.uid++, name: pick(NAMES.first) + " " + pick(NAMES.last),
    role, fee: ri(60, 140), salary: ri(7, 14),
    bundle: genBundle(), daysAboard: 0, questStage: 0,
  };
}

export function canAccept(m: Job): [boolean, string] {
  const st = stats();
  for (const need of m.needs || []) {
    const [k, v] = need.split(":");
    if (k === "cargo" && cargoUsed() + +v > st.cargoCap) return [false, "Not enough cargo space"];
    if (k === "scargo" && scargoUsed() + +v > st.scargoCap) return [false, "Not enough hidden cargo space"];
    if (k === "pax" && paxJobs().length + +v > st.paxCap) return [false, "No free passenger berth"];
    if (k === "vip" && vipJobs().length + +v > st.vipCap) return [false, "No free stateroom"];
    if (k === "mod" && st.active(v) === 0) return [false, "Requires a functional, powered " + MODS[v].n];
    if (k === "prestige" && S.prestige < +v) return [false, "Requires " + v + " prestige"];
  }
  return [true, ""];
}

export function needBadges(m: Job): string {
  const st = stats();
  return (m.needs || []).map((need) => {
    const [k, v] = need.split(":");
    let label = "", ok = true;
    if (k === "cargo") { label = v + " cargo"; ok = cargoUsed() + +v <= st.cargoCap; }
    if (k === "scargo") { label = v + " hidden cargo"; ok = scargoUsed() + +v <= st.scargoCap; }
    if (k === "pax") { label = "1 berth"; ok = paxJobs().length < st.paxCap; }
    if (k === "vip") { label = "stateroom"; ok = vipJobs().length < st.vipCap; }
    if (k === "mod") { ok = st.active(v) > 0; label = MODS[v].n + (!ok && st.inst(v) > 0 ? " (offline)" : ""); }
    if (k === "prestige") { label = v + "★"; ok = S.prestige >= +v; }
    return `<span class="badge ${ok ? "ok" : "no"}">${label}</span>`;
  }).join("");
}

export function acceptMission(i: number) {
  if (!S.market) return;
  const m = S.market.missions[i];
  if (!m) return;
  const [ok, why] = canAccept(m);
  if (!ok) { log("Can't take that job: " + why + "."); requestRender(); return; }
  S.market.missions.splice(i, 1);
  S.jobs.push(m);
  log(`Contract accepted: ${m.title} → ${PLANETS[m.dest].n}${m.deadline ? " (by day " + m.deadline + ")" : ""}.`);
  requestRender();
}

export function hire(i: number) {
  if (!S.market) return;
  const r = S.market.recruits[i];
  if (!r) return;
  if (S.crew.length >= stats().crewCap) { log("No bunks free — buy Crew Quarters first."); requestRender(); return; }
  if (S.credits < r.fee) { log("Can't afford the signing fee."); requestRender(); return; }
  S.credits -= r.fee;
  S.market.recruits.splice(i, 1);
  r.daysAboard = 0;
  S.crew.push(r);
  log(`Hired ${r.name}, ${ROLES[r.role].n}. Salary ${r.salary}cr/day.`);
  bark("hire", { crew: r });
  requestRender();
}
