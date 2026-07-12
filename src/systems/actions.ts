import { S, log, mk } from "../state";
import { MODS, PLANETS, GOODS, FLAVOR } from "../content";
import { stats, modInst, cargoUsed, scargoUsed, paxJobs, vipJobs } from "../derive";
import { pick } from "../rng";
import { requestRender } from "../bus";
import { yardPrice } from "./market";
import { portPriceMult, hasPortMark } from "./port";
import { strongestMemory, sentiment, crewKey } from "./ledger";

// ---------- power grid ----------
export function powerRebalance() {
  let guard = 24;
  while (guard-- > 0) {
    const st = stats();
    if (st.powerUse <= st.powerOut) break;
    const cands = S.modules.filter((m) => MODS[m.t].pw && m.on && !m.dmg);
    if (!cands.length) break;
    const m = cands[cands.length - 1];
    m.on = false;
    log(`⚡ Brownout — not enough reactor output. ${MODS[m.t].n} powered down automatically.`);
  }
}

export function toggleMod(i: number) {
  const m = modInst()[i];
  if (!m || !MODS[m.t].pw) return;
  if (m.dmg) { log(MODS[m.t].n + " is damaged — it needs repairs, not a power switch."); requestRender(); return; }
  if (!m.on) {
    const st = stats();
    if (st.powerUse + MODS[m.t].pw! > st.powerOut) {
      log("⚡ Not enough reactor output. Power something down, upgrade the drive core, or fit an Auxiliary Reactor.");
      requestRender(); return;
    }
    m.on = true;
    log(MODS[m.t].n + " powered up. The deck plating hums a little louder.");
  } else {
    m.on = false;
    log(MODS[m.t].n + " powered down. One less light in the black.");
  }
  requestRender();
}

// ---------- module damage ----------
export function damageModule(cause?: string): boolean {
  const cands = S.modules.filter((m) => !MODS[m.t].core && !m.dmg);
  if (!cands.length) return false;
  // Trouble finds the worn parts first — wear is reliability, and neglect
  // chooses which system pays for the next bad day.
  const worn = cands.filter((m) => (m.wear || 0) >= 55);
  const m = pick(worn.length ? worn : cands);
  m.dmg = true;
  log(`🔧 ${cause || "Malfunction"}: ${MODS[m.t].n} OFFLINE — ${FLAVOR.dmgFlavor[m.t] || "Something important breaks."}`);
  // knock-on effects of losing the module
  const st = stats();
  if (S.fuel > st.fuelCap) {
    log(`Lost ${Math.round(S.fuel - st.fuelCap)} fuel with the tank.`);
    S.fuel = st.fuelCap;
  }
  let over = cargoUsed() - st.cargoCap;
  if (over > 0) {
    for (const g of ["ore", "med", "lux"]) {
      const d = Math.min(over, S.cargo[g]);
      if (d > 0) { S.cargo[g] -= d; over -= d; log(`Jettisoned ${d} ${GOODS[g].n} from the breached hold.`); }
      if (over <= 0) break;
    }
  }
  if (paxJobs().length > st.paxCap) {
    const j = paxJobs().find((x) => !x.pax!.sick);
    if (j) { j.pax!.sick = true; log(`${j.pax!.name} is now sleeping on crates and will absolutely not be paying full fare.`); }
  }
  powerRebalance();
  return true;
}

export function repairSystems() {
  const dmgd = S.modules.filter((m) => m.dmg);
  if (!dmgd.length) return;
  const cost = dmgd.length * 80;
  if (S.credits < cost) { log("Not enough credits for system repairs."); requestRender(); return; }
  S.credits -= cost;
  dmgd.forEach((m) => { m.dmg = false; m.on = true; });
  powerRebalance();
  log(`Yard techs bring ${dmgd.length} system${dmgd.length > 1 ? "s" : ""} back online (−${cost}cr).`);
  requestRender();
}

// ---------- crew ----------
export function fireCrew(i: number) {
  const c = S.crew[i];
  if (!c || !S.docked) return;
  S.crew.splice(i, 1);
  // The ledger makes farewells: quote the strongest thing they remember.
  const mem = strongestMemory(crewKey(c));
  const vet = (c.daysAboard || 0) >= 20 ? ` ${c.daysAboard} days aboard, and it shows in how quiet the deck gets.` : "";
  if (mem && mem.note) {
    const tone = sentiment(crewKey(c)) >= 0 ? "\"We had some good runs, Captain.\"" : `"${mem.note}"`;
    log(`${c.name} walks down the ramp. ${tone}${vet}`);
  } else {
    log(`${c.name} collected their pay and walked down the ramp. No hard feelings. Mostly.${vet}`);
  }
  requestRender();
}

// ---------- trade & provisions ----------
export function buyGood(g: string, n: number) {
  if (!S.market) return;
  const price = S.market.prices[g];
  n = Math.min(n, Math.floor(S.credits / price), stats().cargoCap - cargoUsed());
  if (n <= 0) { log("No room or no money."); requestRender(); return; }
  S.credits -= n * price; S.cargo[g] += n;
  log(`Bought ${n} ${GOODS[g].n} @ ${price}cr.`); requestRender();
}

export function sellGood(g: string, n: number) {
  if (!S.market) return;
  const price = Math.round(S.market.prices[g] * 0.92);
  n = Math.min(n, S.cargo[g]);
  if (n <= 0) return;
  S.credits += n * price; S.cargo[g] -= n;
  log(`Sold ${n} ${GOODS[g].n} @ ${price}cr.`); requestRender();
}

export function buyFuel(n: number) {
  // Three things move the pump price: the miners' guild echo (a season of
  // gratitude after a rescue), your standing at THIS port, and Bev's salvage
  // stall if you set her up here.
  const guild = typeof S.flags.guild_discount === "number" && S.flags.guild_discount > S.day;
  const bev = hasPortMark(S.loc, "bev_stall");
  const mult = portPriceMult(S.loc) * (guild ? 0.85 : 1) * (bev ? 0.9 : 1);
  const p = Math.max(1, Math.round(PLANETS[S.loc].fuelP * mult));
  n = Math.min(n, Math.floor(S.credits / p), Math.floor(stats().fuelCap - S.fuel));
  if (n <= 0) { log("Tanks full or pockets empty."); requestRender(); return; }
  S.credits -= n * p; S.fuel += n;
  const tags = [guild ? "guild" : "", bev ? "Bev's stall" : "", portPriceMult(S.loc) < 1 ? "regular's rate" : portPriceMult(S.loc) > 1 ? "revised fees" : ""].filter(Boolean).join(", ");
  log(`Refueled ${n} units @ ${p}cr${tags ? " (" + tags + ")" : ""}.`); requestRender();
}

export function buyFood(n: number) {
  const p = PLANETS[S.loc].foodP;
  n = Math.min(n, Math.floor(S.credits / p));
  if (n <= 0) { log("Can't afford it."); requestRender(); return; }
  S.credits -= n * p; S.food += n;
  log(`Bought ${n} food @ ${p}cr.`); requestRender();
}

// ---------- shipyard ----------
export function repairShip() {
  const need = S.hullMax - S.hull;
  const cost = Math.min(need * 4, S.credits);
  const pts = Math.floor(cost / 4);
  if (pts <= 0) { log("Nothing to repair, or no credits."); requestRender(); return; }
  S.credits -= pts * 4; S.hull += pts;
  log(`Yard crew patched ${pts} hull for ${pts * 4}cr.`); requestRender();
}

export function buyMod(t: string) {
  if (modInst().length >= S.slotsMax) { log("No free slot — buy a hull expansion."); requestRender(); return; }
  const price = yardPrice(t);
  if (S.credits < price) { log("Not enough credits."); requestRender(); return; }
  S.credits -= price;
  const m = mk(t);
  S.modules.push(m);
  const st = stats();
  if (MODS[t].pw && st.powerUse > st.powerOut) {
    m.on = false;
    log(`Installed ${MODS[t].n} (−${price}cr) — but the reactor can't feed it. It's OFFLINE until you free up power.`);
  } else {
    log(`Installed ${MODS[t].n} (−${price}cr). The yard crew welds it in before lunch.`);
  }
  requestRender();
}

export function sellMod(idx: number) {
  const m = modInst()[idx];
  if (!m || !S.docked) return;
  const t = m.t;
  const st = stats();
  const lose = m.dmg ? 0 : 1; // capacity this instance currently provides
  if (t === "cargohold" && cargoUsed() > st.cargoCap - lose * 20) { log("Cargo hold isn't empty enough to remove."); requestRender(); return; }
  if (t === "smuggler" && scargoUsed() > st.scargoCap - lose * 10) { log("Hidden hold isn't empty."); requestRender(); return; }
  if (t === "cabin" && paxJobs().length > st.paxCap - lose * 2) { log("Passengers are using that cabin."); requestRender(); return; }
  if (t === "luxcabin" && vipJobs().length > st.vipCap - lose) { log("Your VIP is in that stateroom."); requestRender(); return; }
  if (t === "quarters" && S.crew.length > st.crewCap - lose * 2) { log("Crew are bunked there — dismiss someone first."); requestRender(); return; }
  const gain = Math.round(MODS[t].price * (m.dmg ? 0.4 : 0.6));
  S.modules.splice(S.modules.indexOf(m), 1);
  if (t === "fueltank") S.fuel = Math.min(S.fuel, stats().fuelCap);
  S.credits += gain;
  S.sel = null;
  powerRebalance();
  log(`Sold ${m.dmg ? "the wreckage of the " : ""}${MODS[t].n} for ${gain}cr.`);
  requestRender();
}

export function upgradeEngine() {
  const cost = S.engineLvl === 1 ? 500 : 1100;
  if (S.engineLvl >= 3) return;
  if (S.credits < cost) { log("Not enough credits."); requestRender(); return; }
  S.credits -= cost; S.engineLvl++;
  log(`Drive Core upgraded to Mk-${["", "I", "II", "III"][S.engineLvl]}. She purrs now.`);
  requestRender();
}

export function buySlots() {
  const cost = S.slotsMax === 6 ? 600 : 1200;
  if (S.slotsMax >= 10) return;
  if (S.credits < cost) { log("Not enough credits."); requestRender(); return; }
  S.credits -= cost; S.slotsMax += 2;
  log(`Hull expansion welded on. +2 module slots (−${cost}cr).`);
  requestRender();
}
