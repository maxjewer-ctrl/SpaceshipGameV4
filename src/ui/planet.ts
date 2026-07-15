import { S } from "../state";
import { PLANETS, FACS, GOODS, MODS, ROLES } from "../content";
import { stats, modInst, cargoUsed, daysTo, foodPerDay, fuelShortfallCost } from "../derive";
import { fmt } from "../util";
import { requestRender } from "../bus";
import { refreshMarket, canAccept, needBadges, yardPrice } from "../systems/market";
import { marksAt, yardMaxMark, markLabel, markOf, markPrice } from "../systems/modtier";
import { arcCantinaCard } from "../systems/arc";
import { reputation } from "../systems/disposition";
import { refitCost, wearTier, anyWorn } from "../systems/wear";
import { usedStockHere, usedRackLabel, condLabel } from "../systems/usedmarket";
import { crewPortrait, portraitFigure, storeOwnerPortrait } from "./portraits";
import { actionAttr } from "../dispatch";
import { buyGood, fuelPriceHere, sellGood } from "../systems/actions";
import { missionStripHTML } from "./missionStrip";

// Names of modules currently worn or failing — the refit card's honest pitch.
function wornList(): string[] {
  return S.modules
    .filter((m) => !MODS[m.t].core && wearTier(m) !== "sound")
    .map((m) => MODS[m.t].n + (wearTier(m) === "failing" ? " (FAILING)" : ""));
}

export function ptab(t: string) { S.ptab = t; requestRender(); }

const tradeQty: Record<string, number> = { ore: 1, med: 1, lux: 1 };
export function setTradeQty(g: string, delta: number) {
  tradeQty[g] = Math.max(1, Math.min(99, (tradeQty[g] || 1) + delta));
  requestRender();
}
export function buyTradeQty(g: string) { buyGood(g, tradeQty[g] || 1); }
export function sellTradeQty(g: string) { sellGood(g, tradeQty[g] || 1); }

export function planetHTML(): string {
  refreshMarket();
  const p = PLANETS[S.loc];
  let body = "";
  if (S.ptab === "cantina") body = cantinaHTML();
  else if (S.ptab === "market") body = marketHTML();
  else body = yardHTML();
  const serviceName = S.ptab === "cantina" ? "Cantina" : S.ptab === "market" ? "Exchange" : "Dry Dock";
  return `<div class="service-shell"><header class="service-header">
    <div><div class="console-kicker">${p.n.toUpperCase()} · ${FACS[p.fac].n.toUpperCase()}</div><h1>${serviceName}</h1><p>${p.tag} · ${p.d}</p></div>
    <button ${actionAttr("exitService")}>Exit to station</button>
  </header>${missionStripHTML()}<div class="service-body">${body}</div></div>`;
}

function cantinaHTML(): string {
  const M = S.market!;
  const arcCard = arcCantinaCard();
  const p = PLANETS[S.loc];
  const missions = M.missions.length ? M.missions.map((m, i) => {
    const [ok, why] = canAccept(m);
    const short = fuelShortfallCost(m.dest);
    const fuelWarn = short > 0
      ? `<span class="badge no" title="You'd need ${short}cr more in fuel money to reach ${PLANETS[m.dest].n} right now">⚠ need ${short}cr fuel to reach it</span>` : "";
    return `<div class="card">
      <div class="title">${m.title} <span class="dim">→ ${PLANETS[m.dest].n} (${daysTo(S.loc, m.dest)}d)</span></div>
      <div class="dim">${m.desc}</div>
      <div>${needBadges(m)} <span class="badge fac">${FACS[m.rep![0]].n} +${m.rep![1]}</span>${m.prestige ? `<span class="badge">+${m.prestige}★</span>` : ""} ${fuelWarn}</div>
      <div style="margin-top:6px; display:flex; justify-content:space-between; align-items:center">
        <span class="pay">${fmt(m.pay)}cr${m.deadline ? ` <span class="dim">· by day ${m.deadline}</span>` : ""}</span>
        <button ${ok ? "" : "disabled"} title="${ok ? "" : why}" ${actionAttr("acceptMission", i)}>${ok ? "Accept" : "Can't take"}</button>
      </div></div>`;
  }).join("") : `<div class="dim">The job board is picked clean. Wait a day or fly on.</div>`;
  const recruits = M.recruits.length ? M.recruits.map((r, i) =>
    `<div class="card recruit-card">
      ${portraitFigure(crewPortrait(r), r.name, "portrait-recruit")}
      <div class="recruit-copy">
        <div class="title">${r.name} <span class="dim">— ${ROLES[r.role].n}</span></div>
        <div class="dim">${ROLES[r.role].d}</div>
        <div style="margin-top:6px; display:flex; justify-content:space-between; align-items:center; gap:8px">
          <span class="dim">Fee ${r.fee}cr · salary ${r.salary}cr/day</span>
          <button ${actionAttr("hire", i)}>Hire</button>
        </div>
      </div>
    </div>`).join("") : `<div class="dim">Nobody worth hiring tonight — just regulars and bad decisions.</div>`;
  const rep = reputation();
  const repCard = rep && rep.strength >= 12
    ? `<div class="card" style="border-color:var(--amber)"><div class="dim" style="font-style:italic">${rep.street} <span style="color:var(--amber)">— they mean you.</span></div></div>`
    : "";
  const rumors = repCard + M.rumors.map((r) => `<div class="card"><div class="dim" style="font-style:italic">${r}</div></div>`).join("");
  return `<div class="cantina-hero">
    <img class="cantina-owner" src="${storeOwnerPortrait()}" alt="Cantina owner">
    <div class="cantina-glass">
      <div class="cantina-sign">
        <span>${p.n}</span>
        <b>CANTINA</b>
      </div>
      <div class="cantina-bar-lights"><i></i><i></i><i></i></div>
      <div class="cantina-crowd"><i></i><i></i><i></i><i></i><i></i></div>
    </div>
  </div>
  <div class="row cantina-row">
    <div class="col">
      ${arcCard ? `<div class="panel"><h3>◆ The Grey Coat</h3>${arcCard}</div>` : ""}
      <div class="panel"><h3>Job Board</h3>${missions}</div>
    </div>
    <div class="col">
      <div class="panel"><h3>Hands for Hire <span class="dim">(bunks: ${S.crew.length}/${stats().crewCap})</span></h3>${recruits}</div>
      <div class="panel"><h3>Overheard at the Bar</h3>${rumors}</div>
    </div>
  </div>`;
}

function marketHTML(): string {
  const M = S.market!, p = PLANETS[S.loc];
  const rows = Object.keys(GOODS).map((g) => {
    const buy = M.prices[g], sell = Math.round(buy * 0.92);
    const qty = tradeQty[g] || 1;
    const free = stats().cargoCap - cargoUsed();
    const canBuy = free >= qty && S.credits >= qty * buy;
    const canSell = S.cargo[g] >= qty;
    return `<article class="trade-row"><div><div class="console-kicker">COMMODITY</div><h2>${GOODS[g].n}</h2><p>Held ${S.cargo[g]} · ${free} cargo space free</p></div>
      <div class="trade-prices"><span>Buy <b>${buy}cr</b></span><span>Sell <b>${sell}cr</b></span></div>
      <div class="quantity-stepper"><button ${actionAttr("setTradeQty", g, -1)}>−</button><b>${qty}</b><button ${actionAttr("setTradeQty", g, 1)}>+</button></div>
      <div class="trade-actions"><button class="primary" ${canBuy ? "" : "disabled"} ${actionAttr("buyTradeQty", g)}>Buy ${qty} · ${qty * buy}cr</button><button ${canSell ? "" : "disabled"} ${actionAttr("sellTradeQty", g)}>Sell ${qty} · ${qty * sell}cr</button></div></article>`;
  }).join("");
  const st = stats();
  const fuelFill = Math.floor(st.fuelCap - S.fuel);
  const fuelPrice = fuelPriceHere();
  const foodBurn = foodPerDay();
  return `<div class="exchange-layout"><section><div class="service-section-head"><div><div class="console-kicker">TRADE FLOOR</div><h2>Commodities</h2></div><b>Cargo ${cargoUsed()}/${st.cargoCap}</b></div>${rows}</section>
    <aside class="provision-stack"><div class="console-kicker">PROVISIONS</div>
      <article class="provision-card"><h2>Fuel</h2><p>${Math.floor(S.fuel)}/${st.fuelCap} units · ${st.fuelDay}/day underway${S.flags.juno_reg_done ? " · true-tuned regulator" : ""}</p><div class="outcome-table compact"><div><span>Buy 10</span><b>${Math.floor(S.fuel)} -> ${Math.floor(S.fuel) + 10} · ${10 * fuelPrice}cr</b></div><div><span>Fill tanks</span><b>${Math.floor(S.fuel)} -> ${st.fuelCap} · ${fuelFill * fuelPrice}cr</b></div></div><div class="button-row"><button ${st.fuelCap - S.fuel >= 10 && S.credits >= 10 * fuelPrice ? "" : "disabled"} ${actionAttr("buyFuel", 10)}>Buy 10</button><button class="primary" ${fuelFill > 0 && S.credits >= fuelFill * fuelPrice ? "" : "disabled"} ${actionAttr("buyFuel", 999)}>Fill tanks</button></div></article>
      <article class="provision-card"><h2>Food</h2><p>${Math.floor(S.food)} held · ${foodBurn}/day · ${foodBurn ? Math.floor(S.food / foodBurn) : "steady"} days</p><div class="outcome-table compact"><div><span>Buy 10</span><b>${Math.floor(S.food)} -> ${Math.floor(S.food + 10)} · ${10 * p.foodP}cr</b></div><div><span>Buy 30</span><b>${Math.floor(S.food)} -> ${Math.floor(S.food + 30)} · ${30 * p.foodP}cr</b></div></div><div class="button-row"><button ${S.credits >= 10 * p.foodP ? "" : "disabled"} ${actionAttr("buyFood", 10)}>Buy 10</button><button class="primary" ${S.credits >= 30 * p.foodP ? "" : "disabled"} ${actionAttr("buyFood", 30)}>Buy 30</button></div></article>
    </aside></div>`;
}

function yardHTML(): string {
  const st = stats();
  const p = PLANETS[S.loc];
  const nonCore = modInst().length;
  const dmgd = S.modules.filter((m) => m.dmg);
  const marks = marksAt(S.loc);
  const maxMark = yardMaxMark(S.loc);
  const full = nonCore >= S.slotsMax;
  const modsHtml = Object.keys(MODS).filter((t) => !MODS[t].core).map((t) => {
    const m = MODS[t];
    const pwr = m.pw ? ` <span class="badge">⚡ draws ${m.pw}</span>` : m.gen ? ` <span class="badge ok">⚡ +${m.gen}</span>` : ` <span class="badge">passive</span>`;
    // Owned-marks summary, e.g. "own I×2 · II×1"
    const owns = S.modules.filter((mm) => mm.t === t);
    const byMark = [1, 2, 3].map((mk) => ({ mk, n: owns.filter((mm) => markOf(mm) === mk).length })).filter((x) => x.n);
    const ownedBadge = byMark.length ? `<span class="dim">(own ${byMark.map((x) => `Mk-${markLabel(x.mk)}×${x.n}`).join(" · ")})</span>` : "";
    // One buy button per mark this yard stocks.
    const buys = marks.map((mk) => {
      const price = yardPrice(t, mk);
      const ok = S.credits >= price && !full;
      return `<button class="mk-buy" ${ok ? "" : "disabled"} ${actionAttr("buyMod", t, mk)}>Mk-${markLabel(mk)} · ${price}cr</button>`;
    }).join("");
    // Upgrade path: if you own a sound instance below this yard's max mark.
    const upCand = owns.filter((mm) => !mm.dmg && markOf(mm) < maxMark).sort((a, b) => markOf(a) - markOf(b))[0];
    let upBtn = "";
    if (upCand) {
      const to = markOf(upCand) + 1;
      const cost = yardPrice(t, to) - yardPrice(t, markOf(upCand));
      upBtn = `<button class="mk-up" ${S.credits >= cost ? "" : "disabled"} ${actionAttr("upgradeMod", t)}>⤴ Upgrade a unit → Mk-${markLabel(to)} (${cost}cr)</button>`;
    }
    return `<div class="card"><div class="title">${m.icon} ${m.n} ${ownedBadge}</div>
      <div class="dim">${m.d}</div>
      <div>${pwr} <span class="badge">bays ${nonCore}/${S.slotsMax} -> ${nonCore + 1}/${S.slotsMax}</span></div>
      <div class="mk-buys" style="margin-top:6px; display:flex; gap:6px; flex-wrap:wrap; align-items:center">
        ${buys}${upBtn}
      </div></div>`;
  }).join("");
  const engCost = S.engineLvl === 1 ? 500 : 1100;
  const slotCost = S.slotsMax === 6 ? 600 : 1200;
  // The second-hand rack — dead captains' modules, salvage, auction lots.
  // Cheaper than new, but each already carries wear and a story (usedmarket.ts).
  const used = usedStockHere();
  const installedHtml = `<div class="panel installed-systems"><h3>Installed Systems <span class="dim">— resale and removal</span></h3>
    <p class="dim">Operational controls stay at the captain's chair. The yard handles physical removal and resale.</p>
    ${modInst().map((m, index) => `<div class="installed-row"><div><b>${MODS[m.t].icon} ${MODS[m.t].n} Mk-${markLabel(markOf(m))}</b><span>${m.dmg ? "Damaged" : wearTier(m)} · resale ${Math.round(markPrice(m.t, markOf(m)) * (m.dmg ? .4 : .6))}cr</span></div><button class="danger quiet" ${actionAttr("sellMod", index)}>Sell installed system</button></div>`).join("")}
  </div>`;
  const usedHtml = used.length ? `<div class="panel">
    <h3>${usedRackLabel()} <span class="dim">— salvage, sold as-is</span></h3>
    <p class="dim" style="margin-bottom:8px">Second-hand modules: cheaper than yard-new, but each comes with wear already on it and a history. Cheap now, refit sooner.</p>
    ${used.map((u) => {
      const m = MODS[u.t];
      const tier = wearTier({ t: u.t, on: true, dmg: false, wear: u.wear });
      const badge = tier === "failing" ? '<span class="badge no">well-worn</span>' : tier === "worn" ? '<span class="badge">worn</span>' : '<span class="badge ok">sound</span>';
      const pwr = m.pw ? `<span class="badge">⚡ draws ${m.pw}</span>` : m.gen ? `<span class="badge ok">⚡ +${m.gen}</span>` : `<span class="badge">passive</span>`;
      return `<div class="card"><div class="title">${m.icon} ${m.n} ${badge}</div>
        <div class="dim">${u.story}</div>
        <div style="margin-top:4px">${pwr} <span class="dim">list ${m.price}cr</span></div>
        <div style="margin-top:6px; display:flex; justify-content:space-between; align-items:center">
          <span class="pay">${u.price}cr</span>
          <button ${S.credits >= u.price && nonCore < S.slotsMax ? "" : "disabled"} ${actionAttr("buyUsed", u.id)}>Take it on</button>
        </div></div>`;
    }).join("")}</div>` : "";
  return `<div class="yard-sections"><div class="console-kicker">DRY DOCK SERVICES</div>${installedHtml}${usedHtml}</div><div class="row">
    <div class="col"><div class="panel"><h3>Module Shop ${p.yard ? '<span class="badge ok">15% off</span>' : ""} <span class="badge${maxMark >= 3 ? " ok" : ""}">up to Mk-${markLabel(maxMark)}</span> <span class="dim">(slots ${nonCore}/${S.slotsMax})</span></h3>
      ${maxMark < 3 ? '<p class="dim" style="margin-bottom:8px">This yard fits up to Mk-II. The best gear — Mk-III — is only fitted at Foundry\'s shipyard.</p>' : ""}
      ${full ? '<p class="low" style="margin-bottom:8px">Ship is full — sell a module (Ship screen) or buy a hull expansion.</p>' : ""}
      ${modsHtml}</div></div>
    <div class="col">
      <div class="panel"><h3>Dry Dock</h3>
        <div class="card"><div class="title">🛠 Hull repair — 4cr/point <span class="dim">(${Math.round(S.hull)}/${S.hullMax})</span></div>
          <div style="margin-top:6px"><button ${S.hull < S.hullMax ? "" : "disabled"} ${actionAttr("repairShip")}>Repair all (${(S.hullMax - Math.round(S.hull)) * 4}cr)</button></div></div>
        <div class="card"><div class="title">⚡ System repairs — 80cr/module ${dmgd.length ? `<span class="low">(${dmgd.length} damaged)</span>` : '<span class="dim">(all systems nominal)</span>'}</div>
          ${dmgd.length ? `<div class="dim">${dmgd.map((m) => MODS[m.t].n).join(", ")}</div>` : ""}
          <div style="margin-top:6px"><button ${dmgd.length ? "" : "disabled"} ${actionAttr("repairSystems")}>Restore all systems (${dmgd.length * 80}cr)</button></div></div>
        <div class="card"><div class="title">🔩 Full refit ${wornList().length ? `<span class="low">(${wornList().join(", ")})</span>` : '<span class="dim">(nothing worn)</span>'}</div>
          <div class="dim">Flying wears the ship: worn systems break first, failing ones quit on their own. A refit strips and trues everything back to spec.</div>
          <div style="margin-top:6px"><button ${anyWorn() && S.credits >= refitCost() ? "" : "disabled"} ${actionAttr("refitShip")}>Refit all worn systems (${refitCost()}cr)</button></div></div>
        <div class="card"><div class="title">🔥 Drive Core — Mk-${["", "I", "II", "III"][S.engineLvl]}</div>
          <div class="dim">Faster travel: fewer days means less fuel, less food, fewer chances for trouble. Helps you flee, and each mark adds +2 reactor power.</div>
          <div style="margin-top:6px"><button ${S.engineLvl < 3 && S.credits >= engCost ? "" : "disabled"} ${actionAttr("upgradeEngine")}>${S.engineLvl < 3 ? `Upgrade to Mk-${["", "", "II", "III"][S.engineLvl + 1]} (${engCost}cr)` : "Maxed out"}</button></div></div>
        <div class="card"><div class="title">🧱 Hull expansion — +2 module slots <span class="dim">(${S.slotsMax}/10)</span></div>
          <div style="margin-top:6px"><button ${S.slotsMax < 10 && S.credits >= slotCost ? "" : "disabled"} ${actionAttr("buySlots")}>${S.slotsMax < 10 ? `Expand (${slotCost}cr)` : "Fully expanded"}</button></div></div>
      </div>
    </div></div>`;
}
