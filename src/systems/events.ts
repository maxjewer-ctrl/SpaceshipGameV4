import { S, log } from "../state";
import { PLANETS, GOODS, FLAVOR } from "../content";
import { stats, cargoUsed, scargoUsed, dist, bribeCost } from "../derive";
import { rand, ri, pick, pickFresh } from "../rng";
import { clamp } from "../util";
import { modal, closeModal } from "../modal";
import { startCombat } from "./combat";
import { checkDead } from "./gameover";
import { damageModule } from "./actions";
import { refreshMarket } from "./market";
import { bark, tellBark } from "./barks";
import { plantDelay, flagActive } from "./scheduler";
import { remember, crewKey, witnessAll } from "./ledger";
import { shift } from "./disposition";
import { addScar } from "./veterancy";
import { evNumbersStation, evReturnedShip } from "./silence";
import { dcBreakdown, dcMeteor, dcSickPassenger } from "./damagecontrol";
import { planetVisible, isSilenced } from "../derive";

// ---------- daily event roll ----------
export function rollEvent() {
  const pool: Array<() => void> = [];
  const add = (w: number, f: () => void) => { for (let i = 0; i < w; i++) pool.push(f); };
  add(3, evPirates);
  add(2, evPatrol);
  add(2, evBreakdown);
  add(2, evMeteor);
  add(2, evSalvage);
  add(2, evDistress);
  add(2, evTrader);
  if (S.jobs.some((j) => j.pax)) add(3, evPax);
  add(3, evQuiet);
  // the Long Silence leaks into the lanes once the Broadcast has happened
  if (S.campaign.silence.stage >= 1 && S.campaign.silence.stage < 4) {
    add(2, evNumbersStation);
    if (!S.flags.sil_returned_done) add(2, evReturnedShip);
  }
  pick(pool)();
}

export function evQuiet() {
  const st = stats();
  const lines = FLAVOR.quiet.slice();
  if (st.active("hydro")) lines.push("The hydroponics bay smells like rain today. Closest thing to weather in a hundred million klicks.");
  if (st.inst("hydro") && !st.active("hydro")) lines.push("The dark hydroponics bay stares back at you accusingly. The beans are not growing themselves.");
  if (st.inst("medbay")) lines.push("The auto-doc runs its self-test and declares everyone aboard \"adequately alive.\"");
  if (st.inst("weapons")) lines.push("Someone left a wrench balanced on the weapons console. You leave it there. It's tradition now.");
  if (st.inst("luxcabin")) lines.push("Soft music drifts from the stateroom. Whatever they're paying, it isn't quite enough.");
  if (st.inst("smuggler")) lines.push("You check the false floor in the hold. Still false. Still a floor. Good.");
  if (st.inst("reactor")) lines.push("The auxiliary reactor's hum changes pitch for three seconds and every head on the ship comes up. Then it settles. Everyone pretends they weren't scared.");
  if (S.crew.length === 0) lines.push("You eat dinner alone in the galley with one boot up on the table, like a captain of industry.");
  if (S.modules.some((m) => m.dmg)) lines.push("Something broken rattles behind a panel in time with the drive. You name it Steve.");
  const line = pickFresh(lines, S.flags._lastQuiet ?? null);
  S.flags._lastQuiet = line;
  log(line);
  if (!tellBark("quiet")) bark("quiet", { chance: 0.5 });
}

// ---------- pirates ----------
// The hostile roster scales with the calendar — scav drones any fresh captain
// can actually beat, skiffs as the working threat, corsairs as the wall, and
// the rare lane-wolf gunship as the "not today" encounter. Variety in what's
// shooting at you is variety in what the right answer is.
export function evPirates() {
  const roll = rand();
  let e: { name: string; hull: number; dmg: number; bribe: number; loot: number };
  let hail: string;
  if (S.day <= 12 && roll < 0.45) {
    e = { name: "Scav Drone", hull: 16, dmg: 4, bribe: 40, loot: 60 };
    hail = `An automated scavenger drone locks on, thrusters stuttering — somebody's harvest bot gone feral. Its threat library is older than your registry: <i>"SURRENDER SALVAGE. COMPLY."</i>`;
  } else if (S.day > 15 && roll > 0.88) {
    e = { name: "Lane-Wolf Gunship", hull: 62, dmg: 14, bribe: 380, loot: 340 };
    hail = `A lane-wolf gunship rises off the ecliptic where it's been lying cold — a professional's ambush. The hail is almost courteous: <i>"Nothing personal, Captain. Cargo and credits, or we open you like a tin."</i>`;
  } else if (S.day > 22 ? roll < 0.55 : roll < 0.3) {
    e = { name: "Pirate Corsair", hull: 55, dmg: 12, bribe: 280, loot: 250 };
    hail = `A pirate corsair burns hard on an intercept course, weapons hot. The comm crackles: <i>"Cut engines and prepare to be boarded, or be scrap."</i>`;
  } else {
    e = { name: "Pirate Skiff", hull: 32, dmg: 8, bribe: 150, loot: 130 };
    hail = `A pirate skiff burns hard on an intercept course, weapons hot. The comm crackles: <i>"Cut engines and prepare to be boarded, or be scrap."</i>`;
  }
  // An honest tactical read before the player commits: four good salvos that
  // can't crack the lead ship means this fight is a funeral, and the UI says so.
  const outgunned = stats().dmg * 4 < e.hull;
  modal(`<h2>⚠ Contact — ${e.name}</h2>
    <p>${hail}</p>
    <div class="choices">
      <button onclick="closeModal(); startCombat(${JSON.stringify(e).replace(/"/g, "&quot;")}, pirateWin, pirateLoseFlee)">Battle stations${outgunned ? ' <span class="dim">— tactical readout: OUTGUNNED. This is how ships die.</span>' : ""}</button>
      <button onclick="pirateFlee(${e.dmg})">Punch it and run ${stats().has("pilot") ? "(pilot aboard — good odds)" : ""}</button>
      <button onclick="pirateBribe(${e.bribe})">Pay them off (${bribeCost(e.bribe)}cr)</button>
      <button onclick="pirateSurrender()">Surrender the cargo</button>
    </div>`);
}
export function pirateWin() {
  const loot = ri(100, 300);
  S.credits += loot; S.prestige += 2;
  log(`Pirates destroyed. Salvaged ${loot}cr from the wreck. (+2 prestige)`);
}
export function pirateLoseFlee() { log("You broke off and ran. The hull remembers."); }
export function pirateFlee(dmg: number) {
  const st = stats();
  const chance = 0.35 + (st.has("pilot") ? 0.25 : 0) + S.engineLvl * 0.08;
  if (rand() < chance) {
    closeModal();
    log("You redline the drive and lose them in a debris field. Hearts pounding, hull intact.");
  } else {
    const hit = ri(Math.round(dmg * 0.8), Math.round(dmg * 1.5));
    S.hull -= Math.max(1, hit - st.shield);
    closeModal();
    log(`They clipped you as you ran (−${Math.max(1, hit - st.shield)} hull), but you got away.`);
    checkDead("Shot apart while running from pirates.");
  }
}
export function pirateBribe(base: number) {
  const cost = bribeCost(base);
  if (S.credits < cost) {
    log("You can't cover the toll. They're not in a bartering mood.");
    closeModal(); evPiratesForce(base); return;
  }
  S.credits -= cost; closeModal();
  shift("daring", -1, "paid off pirates");
  log(`Paid ${cost}cr in "docking fees." The pirates wave politely and burn away.`);
}
function evPiratesForce(base: number) {
  const e = base > 200 ? { name: "Pirate Corsair", hull: 55, dmg: 12 } : { name: "Pirate Skiff", hull: 32, dmg: 8 };
  startCombat(e, pirateWin, pirateLoseFlee);
}
export function pirateSurrender() {
  const lost = S.cargo.ore + S.cargo.med + S.cargo.lux;
  S.cargo = { ore: 0, med: 0, lux: 0 };
  const cr = Math.round(S.credits * 0.3);
  S.credits -= cr;
  S.prestige = Math.max(0, S.prestige - 2);
  shift("daring", -2, "surrendered to pirates");
  closeModal();
  log(`They stripped ${lost} units of goods and ${cr}cr, and left you your life. (−2 prestige)`);
}

// ---------- patrol ----------
export function evPatrol() {
  const contraband = scargoUsed() > 0;
  const fugitive = S.jobs.some((j) => j.pax && j.pax.motive === "fugitive" && !j.arcVoss);
  const deserter = S.crew.find((c) => c.bundle && c.bundle.secretTag === "union_deserter");
  if (deserter) tellBark("patrol"); else bark("patrol", { chance: 0.5 });
  // A preferred Union registry means routine scans wave you straight through.
  if (flagActive("union_favored") && !contraband && !fugitive) {
    log("A Union patrol pings your registry, sees the preferred-operator flag, and waves you on with something close to courtesy.");
    return;
  }
  if (!contraband && !fugitive) {
    // A crew member's secret is a landmine: a routine scan can go very wrong.
    if (deserter && rand() < 0.45) {
      const c = deserter;
      S.crew = S.crew.filter((x) => x.id !== c.id);
      S.prestige = Math.max(0, S.prestige - 2);
      witnessAll("captain_couldnt_save_deserter", -1, `${c.name}'s desertion warrant flagged on a Union scan and they were taken.`);
      log(`⚠ The scan flags ${c.name}: an old Union desertion warrant. They're taken off your ship in cuffs before you can say a word. The crew is very quiet after (−2 prestige).`);
      return;
    }
    log("A Union patrol pings your transponder, runs your registry, and moves on. You breathe again.");
    return;
  }
  const problem = contraband
    ? "there's a sealed hold full of no-questions freight aboard"
    : "your passenger's face is on a warrant somewhere";
  modal(`<h2>🛰 Union Patrol — Compliance Scan</h2>
    <p>A Union cutter orders you to hold for inspection. Standard sweep — except ${problem}.</p>
    <div class="choices">
      <button onclick="patrolBribe()">Slip the inspector a gratuity (${bribeCost(180)}cr)</button>
      <button onclick="patrolRun()">Run for it</button>
      <button onclick="patrolSubmit()">Submit to the scan</button>
    </div>`);
}
export function patrolBribe() {
  const cost = bribeCost(180);
  if (S.credits < cost) { closeModal(); log("Pockets too light to bribe. The scan proceeds..."); patrolSubmit(true); return; }
  S.credits -= cost; closeModal();
  shift("law", -2, "bribed a Union inspector");
  if (rand() < 0.85) { log(`The inspector finds a ${cost}cr "clerical fee" and suddenly your paperwork is immaculate.`); }
  else { log("The inspector takes your money AND reports you. Bureaucrats."); patrolSubmit(true); }
}
export function patrolRun() {
  closeModal();
  shift("law", -3, "ran from a Union patrol");
  shift("daring", 1, "ran a patrol checkpoint");
  const st = stats();
  const chance = 0.3 + (st.has("pilot") ? 0.25 : 0) + S.engineLvl * 0.08;
  if (rand() < chance) {
    S.rep.union = clamp(S.rep.union - 2, -20, 20);
    log("You spool the drive and vanish into the shipping lanes. The Union files a very angry report (−2 Union rep).");
  } else {
    startCombat({ name: "Union Cutter", hull: 50, dmg: 11 },
      () => { S.rep.union = clamp(S.rep.union - 8, -20, 20); shift("law", -3, "shot down a Union cutter"); log("You shot down a Union cutter. That... will be remembered (−8 Union rep)."); },
      () => { log("You broke away trailing smoke."); });
  }
}
export function patrolSubmit(noModal?: boolean) {
  if (!noModal) { closeModal(); shift("law", 2, "complied with a Union scan"); }
  const contraJobs = S.jobs.filter((j) => j.hidden);
  const fugJobs = S.jobs.filter((j) => j.pax && j.pax.motive === "fugitive" && !j.arcVoss);
  const msg: string[] = [];
  if (contraJobs.length) {
    for (const j of contraJobs) S.jobs = S.jobs.filter((x) => x.id !== j.id);
    const fine = Math.min(S.credits, 250);
    S.credits -= fine;
    S.rep.union = clamp(S.rep.union - 3, -20, 20);
    S.rep.syndicate = clamp(S.rep.syndicate - 3, -20, 20);
    msg.push(`Contraband confiscated, ${fine}cr fine, and the Syndicate is unhappy about their lost freight.`);
  }
  if (fugJobs.length) {
    for (const j of fugJobs) { S.jobs = S.jobs.filter((x) => x.id !== j.id); msg.push(`${j.pax!.name} is dragged off in cuffs. No pay. (−3 prestige)`); }
    S.prestige = Math.max(0, S.prestige - 3);
  }
  if (!msg.length) msg.push("The scan comes up clean. The inspector looks disappointed.");
  log(msg.join(" "));
}

// ---------- hazards & finds ----------
export function evBreakdown() {
  const st = stats();
  // half the time it's a specific system that lets go
  if (rand() < 0.5 && damageModule("Breakdown")) return;
  if (st.has("mechanic")) {
    const dmg = Math.ceil(ri(8, 15) / 2);
    S.hull -= dmg;
    log(`A coolant line ruptures in the engine room. Your mechanic contains it fast (−${dmg} hull).`);
    bark("breakdown", { chance: 0.7 });
    checkDead("The drive core cascade-failed somewhere dark and empty.");
    return;
  }
  // No mechanic: the problem is yours, hands-on and unfair.
  bark("breakdown", { chance: 0.7 });
  dcBreakdown();
}
export function evMeteor() {
  const st = stats();
  if (st.has("pilot")) { log("Micro-meteor swarm ahead — your pilot threads the ship through it like a needle. Not a scratch."); return; }
  // No pilot: gamble the hull on a hunch at the manual helm.
  bark("meteor", { chance: 0.6 });
  dcMeteor();
}
export function evSalvage() {
  const space = stats().cargoCap - cargoUsed();
  if (space >= 3) {
    const g = pick(["ore", "med", "lux"]);
    const n = Math.min(space, ri(3, 8));
    S.cargo[g] += n;
    log(`You spot a drifting cargo pod, cracked open like an egg. Salvaged ${n} ${GOODS[g].n}. Finders keepers.`);
  } else {
    const cr = ri(40, 110);
    S.credits += cr;
    log(`A drifting wreck yields ${cr}cr in scrap components. No room for anything bigger.`);
  }
  bark("salvage", { chance: 0.6 });
}
export function evDistress() {
  modal(`<h2>📡 Distress Signal</h2>
    <p>A weak beacon: a mining shuttle, life support failing, three souls aboard. Helping costs time and supplies. Space is full of stories about fake beacons, too.</p>
    <div class="choices">
      <button onclick="distressHelp()">Alter course and help (−3 food)</button>
      <button onclick="distressIgnore()">Keep flying. Not your problem.</button>
    </div>`);
}
export function distressHelp() {
  closeModal();
  S.food = Math.max(0, S.food - 3);
  bark("rescue", { chance: 0.8 });
  if (rand() < 0.75) {
    const cr = ri(100, 260);
    S.credits += cr; S.prestige += 2;
    log(`You pull three grateful miners out of a dying shuttle. Their guild wires ${cr}cr and your name travels well (+2 prestige).`);
  } else {
    S.prestige += 2;
    log("You save three miners who have nothing to give but thanks. Word still gets around (+2 prestige).");
  }
  witnessAll("captain_saved_the_miners", 2, "You altered course to pull strangers out of a dying shuttle.");
  shift("mercy", 2, "rescued the shuttle");
  // The Echo: a good deed the universe remembers, weeks from now.
  plantDelay(18, 34, "distress_guild_echo");
}
export function distressIgnore() {
  closeModal();
  S.prestige = Math.max(0, S.prestige - 1);
  log("You mute the beacon and fly on. The silence in the cockpit lasts a while (−1 prestige).");
  shift("mercy", -2, "ignored a distress call");
  bark("distress_ignore", { chance: 0.7 });
  // Gentle/loyal crew log this against you, quietly.
  for (const c of S.crew) {
    if (c.bundle && (c.bundle.traits.includes("gentle") || c.bundle.woundTag === "left_behind"))
      remember(crewKey(c), "captain_ignored_a_distress_call", -2, `You flew past a distress beacon on day ${S.day}.`);
  }
}
export function evTrader() {
  modal(`<h2>🛒 Tinker Barge "Bargain"</h2>
    <p>A patchwork trader hails you, grinning through static: <i>"Fuel, food, fair-ish prices! Also buying goods at a premium — I know a guy."</i></p>
    <div class="choices">
      <button onclick="traderBuy('fuel')">Buy 10 fuel — 70cr</button>
      <button onclick="traderBuy('food')">Buy 10 food — 30cr</button>
      <button onclick="traderSell()">Sell all trade goods at 115% market</button>
      <button onclick="closeModal(); log('You wave the tinker off. He sells you nothing but a bad feeling.')">Not today</button>
    </div>`);
}
export function traderBuy(what: string) {
  if (what === "fuel") {
    if (S.credits < 70) { log("Can't afford it."); closeModal(); return; }
    S.credits -= 70; S.fuel = Math.min(stats().fuelCap, S.fuel + 10);
    log("Bought 10 fuel off the tinker barge.");
  } else {
    if (S.credits < 30) { log("Can't afford it."); closeModal(); return; }
    S.credits -= 30; S.food += 10;
    log("Bought 10 food off the tinker barge. Don't ask what's in the cans.");
  }
  closeModal();
}
export function traderSell() {
  let total = 0;
  for (const g in GOODS) {
    if (S.cargo[g] > 0) { total += Math.round(S.cargo[g] * GOODS[g].base * 1.15); S.cargo[g] = 0; }
  }
  closeModal();
  if (total > 0) { S.credits += total; log(`The tinker pays ${total}cr for the lot and asks zero questions.`); }
  else log("You have nothing to sell. The tinker looks personally offended.");
}

// ---------- passenger drama ----------
export function evPax() {
  const jobs = S.jobs.filter((j) => j.pax);
  if (!jobs.length) { evQuiet(); return; }
  const j = pick(jobs);
  const p = j.pax!;
  const st = stats();
  if (p.motive === "merchant" && rand() < 0.6) {
    const g = pick(["med", "lux"]);
    if (S.cargo[g] > 0) {
      const price = Math.round(GOODS[g].base * 1.4);
      const n = S.cargo[g];
      modal(`<h2>💼 A Private Offer</h2>
        <p>${p.name} taps your cargo manifest. <i>"That ${GOODS[g].n.toLowerCase()} — I'll take all ${n} units at ${price} a head, right now, cash."</i></p>
        <div class="choices">
          <button onclick="paxMerchantSell('${g}',${price})">Sell (${n * price}cr)</button>
          <button onclick="closeModal(); log('You decline. ${p.name.replace(/'/g, "")} shrugs and goes back to their bunk.')">Decline</button>
        </div>`);
      return;
    }
  }
  if (rand() < 0.35 && !p.sick) {
    p.sick = true;
    if (st.active("medbay") > 0 && st.has("medic")) {
      p.sick = false;
      log(`${p.name} spikes a fever. Your medic has them stabilized in the med bay within hours. Crisis averted.`);
    } else if (st.active("medbay") > 0) {
      if (rand() < 0.6) { p.sick = false; log(`${p.name} falls ill. The med bay's auto-doc patches them up, mostly.`); }
      else log(`${p.name} falls ill. The auto-doc helps but they're in rough shape. They won't pay full fare like this.`);
    } else {
      // No med bay at all: playing nurse is on you, and it costs.
      dcSickPassenger(j);
    }
    return;
  }
  if (p.motive === "fugitive") log(`${p.name} spends the night watching the airlock and doesn't sleep. Neither do you, quite.`);
  else if (p.motive === "spy") log(`You catch ${p.name} near the comms panel, "just admiring the equipment." Sure.`);
  else log(`${p.name} joins the crew for dinner. Turns out they're decent company out here.`);
}
export function paxMerchantSell(g: string, price: number) {
  const n = S.cargo[g];
  S.cargo[g] = 0; S.credits += n * price;
  closeModal();
  log(`Sold ${n} ${GOODS[g].n} to your passenger for ${n * price}cr. Best kind of cargo — the kind that pays twice.`);
}

// ---------- adrift ----------
export function evAdrift() {
  modal(`<h2>⛽ Tanks Dry</h2>
    <p>The drive coughs, stutters, dies. You are adrift in the deep black. The silence is total and the options are few.</p>
    <div class="choices">
      <button onclick="adriftTow()">Send an SOS — commercial tow (expensive, humiliating)</button>
    </div>`);
}
export function adriftTow() {
  closeModal();
  const cost = Math.max(200, Math.round(S.credits * 0.4));
  let nearest: string | null = null, best = 1e9;
  for (const k in PLANETS) {
    if (!planetVisible(k) || isSilenced(k) || k === "anechoic") continue;
    if (k === S.loc) continue;
    const from = S.travel ? S.travel.from : S.loc;
    const d = dist(from, k);
    if (d < best) { best = d; nearest = k; }
  }
  if (S.credits >= cost) {
    S.credits -= cost;
    log(`A tow barge hauls you to ${PLANETS[nearest!].n} for ${cost}cr. The crew laughs the whole way (−3 prestige).`);
  } else {
    const seized = S.cargo.ore + S.cargo.med + S.cargo.lux;
    S.cargo = { ore: 0, med: 0, lux: 0 };
    S.credits = 0;
    log(`You can't pay the tow. They seize your credits and ${seized} units of cargo as "salvage compensation" (−3 prestige).`);
  }
  S.prestige = Math.max(0, S.prestige - 3);
  S.fuel = 8;
  // A dead drive in the deep black marks whoever tends it — the mechanic (or
  // the captain-mechanic's crewmates) never fully trusts the drive again.
  for (const c of S.crew) if (c.role === "mechanic") addScar(c, "lane_scarred");
  S.travel = null; S.docked = true; S.loc = nearest!; S.screen = "ship";
  refreshMarket();
}
