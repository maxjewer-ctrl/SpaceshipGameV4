import { S } from "../state";
import { PLANETS, FACS, GOODS, MODS, ROLES } from "../content";
import { stats, modInst, cargoUsed, daysTo, foodPerDay } from "../derive";
import { fmt } from "../util";
import { requestRender } from "../bus";
import { refreshMarket, canAccept, needBadges, yardPrice } from "../systems/market";
import { arcCantinaCard } from "../systems/arc";
import { reputation } from "../systems/disposition";

export function ptab(t: string) { S.ptab = t; requestRender(); }

export function planetHTML(): string {
  refreshMarket();
  const p = PLANETS[S.loc];
  const tab = (id: string, label: string) => `<button class="${S.ptab === id ? "tab-on" : ""}" onclick="ptab('${id}')">${label}</button>`;
  let body = "";
  if (S.ptab === "cantina") body = cantinaHTML();
  else if (S.ptab === "market") body = marketHTML();
  else body = yardHTML();
  return `<div class="panel">
    <h3>${p.n} — ${p.tag} <span class="badge fac">${FACS[p.fac].n}</span></h3>
    <p class="dim" style="margin-bottom:10px">${p.d}</p>
    <div style="display:flex; gap:6px; flex-wrap:wrap">
      ${tab("cantina", "🍺 Cantina")} ${tab("market", "⚖ Market")} ${tab("yard", "🔧 Shipyard")}
      <button onclick="waitDay()" title="Pass a day: refreshes jobs & prices, consumes food & payroll">⏳ Wait a day</button>
    </div>
  </div>` + body;
}

function cantinaHTML(): string {
  const M = S.market!;
  const arcCard = arcCantinaCard();
  const missions = M.missions.length ? M.missions.map((m, i) => {
    const [ok] = canAccept(m);
    return `<div class="card">
      <div class="title">${m.title} <span class="dim">→ ${PLANETS[m.dest].n} (${daysTo(S.loc, m.dest)}d)</span></div>
      <div class="dim">${m.desc}</div>
      <div>${needBadges(m)} <span class="badge fac">${FACS[m.rep![0]].n} +${m.rep![1]}</span>${m.prestige ? `<span class="badge">+${m.prestige}★</span>` : ""}</div>
      <div style="margin-top:6px; display:flex; justify-content:space-between; align-items:center">
        <span class="pay">${fmt(m.pay)}cr${m.deadline ? ` <span class="dim">· by day ${m.deadline}</span>` : ""}</span>
        <button ${ok ? "" : "disabled"} onclick="acceptMission(${i})">${ok ? "Accept" : "Can't take"}</button>
      </div></div>`;
  }).join("") : `<div class="dim">The job board is picked clean. Wait a day or fly on.</div>`;
  const recruits = M.recruits.length ? M.recruits.map((r, i) =>
    `<div class="card"><div class="title">${r.name} <span class="dim">— ${ROLES[r.role].n}</span></div>
     <div class="dim">${ROLES[r.role].d}</div>
     <div style="margin-top:6px; display:flex; justify-content:space-between; align-items:center">
       <span class="dim">Fee ${r.fee}cr · salary ${r.salary}cr/day</span>
       <button onclick="hire(${i})">Hire</button>
     </div></div>`).join("") : `<div class="dim">Nobody worth hiring tonight — just regulars and bad decisions.</div>`;
  const rep = reputation();
  const repCard = rep && rep.strength >= 12
    ? `<div class="card" style="border-color:var(--amber)"><div class="dim" style="font-style:italic">${rep.street} <span style="color:var(--amber)">— they mean you.</span></div></div>`
    : "";
  const rumors = repCard + M.rumors.map((r) => `<div class="card"><div class="dim" style="font-style:italic">${r}</div></div>`).join("");
  return `<div class="row">
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
    return `<tr><td>${GOODS[g].n}</td><td>${buy}cr</td><td>${sell}cr</td><td>${S.cargo[g]}</td>
      <td>
        <button onclick="buyGood('${g}',1)">+1</button> <button onclick="buyGood('${g}',10)">+10</button>
        <button onclick="sellGood('${g}',1)">−1</button> <button onclick="sellGood('${g}',10)">−10</button>
      </td></tr>`;
  }).join("");
  return `<div class="row"><div class="col">
    <div class="panel"><h3>Commodities <span class="dim">(cargo ${cargoUsed()}/${stats().cargoCap})</span></h3>
      <table><tr><th>Good</th><th>Buy</th><th>Sell</th><th>Held</th><th></th></tr>${rows}</table>
      <p class="dim" style="margin-top:8px">Prices vary by world and drift daily. Buy where they make it, sell where they can't.</p>
    </div></div>
    <div class="col"><div class="panel"><h3>Provisions</h3>
      <div class="card"><div class="title">⛽ Fuel — ${p.fuelP}cr/unit <span class="dim">(${Math.floor(S.fuel)}/${stats().fuelCap})</span></div>
        <div style="margin-top:6px"><button onclick="buyFuel(10)">+10</button> <button onclick="buyFuel(999)">Fill tanks (${Math.ceil(stats().fuelCap - S.fuel) * p.fuelP}cr)</button></div></div>
      <div class="card"><div class="title">🍞 Food — ${p.foodP}cr/unit <span class="dim">(${Math.floor(S.food)} held, eating ${foodPerDay()}/day)</span></div>
        <div style="margin-top:6px"><button onclick="buyFood(10)">+10</button> <button onclick="buyFood(30)">+30</button></div></div>
    </div></div></div>`;
}

function yardHTML(): string {
  const st = stats();
  const p = PLANETS[S.loc];
  const nonCore = modInst().length;
  const dmgd = S.modules.filter((m) => m.dmg);
  const modsHtml = Object.keys(MODS).filter((t) => !MODS[t].core).map((t) => {
    const m = MODS[t];
    const price = yardPrice(t);
    const owned = st.inst(t);
    const pwr = m.pw ? ` <span class="badge">⚡ draws ${m.pw}</span>` : m.gen ? ` <span class="badge ok">⚡ +${m.gen}</span>` : ` <span class="badge">passive</span>`;
    return `<div class="card"><div class="title">${m.icon} ${m.n} ${owned ? `<span class="dim">(own ${owned})</span>` : ""}</div>
      <div class="dim">${m.d}</div>
      <div>${pwr}</div>
      <div style="margin-top:6px; display:flex; justify-content:space-between; align-items:center">
        <span class="pay">${price}cr</span>
        <button ${S.credits >= price && nonCore < S.slotsMax ? "" : "disabled"} onclick="buyMod('${t}')">Install</button>
      </div></div>`;
  }).join("");
  const engCost = S.engineLvl === 1 ? 500 : 1100;
  const slotCost = S.slotsMax === 6 ? 600 : 1200;
  return `<div class="row">
    <div class="col"><div class="panel"><h3>Module Shop ${p.yard ? '<span class="badge ok">15% off</span>' : ""} <span class="dim">(slots ${nonCore}/${S.slotsMax})</span></h3>
      ${nonCore >= S.slotsMax ? '<p class="low" style="margin-bottom:8px">Ship is full — sell a module (Ship screen) or buy a hull expansion.</p>' : ""}
      ${modsHtml}</div></div>
    <div class="col">
      <div class="panel"><h3>Dry Dock</h3>
        <div class="card"><div class="title">🛠 Hull repair — 4cr/point <span class="dim">(${Math.round(S.hull)}/${S.hullMax})</span></div>
          <div style="margin-top:6px"><button ${S.hull < S.hullMax ? "" : "disabled"} onclick="repairShip()">Repair all (${(S.hullMax - Math.round(S.hull)) * 4}cr)</button></div></div>
        <div class="card"><div class="title">⚡ System repairs — 80cr/module ${dmgd.length ? `<span class="low">(${dmgd.length} damaged)</span>` : '<span class="dim">(all systems nominal)</span>'}</div>
          ${dmgd.length ? `<div class="dim">${dmgd.map((m) => MODS[m.t].n).join(", ")}</div>` : ""}
          <div style="margin-top:6px"><button ${dmgd.length ? "" : "disabled"} onclick="repairSystems()">Restore all systems (${dmgd.length * 80}cr)</button></div></div>
        <div class="card"><div class="title">🔥 Drive Core — Mk-${["", "I", "II", "III"][S.engineLvl]}</div>
          <div class="dim">Faster travel: fewer days means less fuel, less food, fewer chances for trouble. Helps you flee, and each mark adds +2 reactor power.</div>
          <div style="margin-top:6px"><button ${S.engineLvl < 3 && S.credits >= engCost ? "" : "disabled"} onclick="upgradeEngine()">${S.engineLvl < 3 ? `Upgrade to Mk-${["", "", "II", "III"][S.engineLvl + 1]} (${engCost}cr)` : "Maxed out"}</button></div></div>
        <div class="card"><div class="title">🧱 Hull expansion — +2 module slots <span class="dim">(${S.slotsMax}/10)</span></div>
          <div style="margin-top:6px"><button ${S.slotsMax < 10 && S.credits >= slotCost ? "" : "disabled"} onclick="buySlots()">${S.slotsMax < 10 ? `Expand (${slotCost}cr)` : "Fully expanded"}</button></div></div>
        <p class="dim">Sell installed modules from the Ship screen (60% of list).</p>
      </div>
    </div></div>`;
}
