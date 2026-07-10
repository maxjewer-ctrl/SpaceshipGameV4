import { S } from "../state";
import { MODS, PLANETS, ROLES, MOTIVES, FACS } from "../content";
import { stats, modInst, cargoUsed, scargoUsed, paxJobs, vipJobs, salaries, foodPerDay, daysTo } from "../derive";
import { fmt } from "../util";
import { requestRender } from "../bus";
import { reputation } from "../systems/disposition";
import { storyCards } from "../systems/silence";

export function selSlot(i: number) { S.sel = S.sel === i ? null : i; requestRender(); }

// Module bays get a category accent colour on the schematic — combat/logistics/
// life-support/bio/power read at a glance instead of a wall of identical boxes.
export function modCategory(t: string): string {
  if (["weapons", "shields", "armory"].includes(t)) return "cat-combat";
  if (["cargohold", "fueltank", "smuggler"].includes(t)) return "cat-flow";
  if (["cabin", "quarters", "luxcabin"].includes(t)) return "cat-life";
  if (["hydro", "medbay"].includes(t)) return "cat-bio";
  if (["reactor", "workshop"].includes(t)) return "cat-power";
  return "";
}

// The player never sees the raw playstyle meters — only how they're talked about.
function repStreetHtml(): string {
  const rep = reputation();
  if (!rep) return `<div class="dim">You're still a nobody out here. Fly enough runs, make enough choices, and the lanes will start telling stories about you.</div>`;
  const loud = rep.strength >= 20 ? "Your name carries all the way to the core worlds."
    : rep.strength >= 12 ? "It's a reputation now, not a rumor." : "The talk is starting to follow you.";
  return `<div class="card" style="border-color:var(--amber)">
    <div class="title" style="color:var(--amber)">They call you ${rep.title}.</div>
    <div class="dim" style="font-style:italic; margin-top:4px">${rep.street}</div>
    <div class="dim" style="margin-top:6px">${loud}</div>
  </div>`;
}

export function shipHTML(): string {
  const st = stats();
  const inst = modInst();
  const hullPct = Math.max(0, S.hull / S.hullMax);
  const hullState = hullPct < 0.35 ? "hull-crit" : hullPct < 0.7 ? "hull-warn" : "";
  const reg = "KR-" + (((S.seed >>> 0) % 8999) + 1000); // stable registry number
  let slotsHtml = "";
  for (let i = 0; i < 10; i++) {
    if (i < inst.length) {
      const m = inst[i], md = MODS[m.t];
      const led = m.dmg ? "r" : (md.pw ? (m.on ? "g" : "o") : "g");
      const cls = (m.dmg ? " dmgd" : "") + (!m.dmg && md.pw && !m.on ? " offline" : "") + (S.sel === i ? " selected" : "");
      slotsHtml += `<div class="slot filled ${modCategory(m.t)}${cls}" onclick="selSlot(${i})" title="${md.n}${m.dmg ? " — DAMAGED" : (md.pw && !m.on && !m.dmg ? " — powered down" : "")}">
        <span class="led ${led}"></span>
        ${md.pw ? `<span class="pips">${"⚡".repeat(md.pw)}</span>` : ""}${md.gen ? `<span class="pips">+${md.gen}⚡</span>` : ""}
        <span class="ic">${md.icon}</span><span class="nm">${md.n}</span></div>`;
    } else if (i < S.slotsMax) {
      slotsHtml += `<div class="slot" onclick="selSlot(-1)"><span class="ic">＋</span><span class="dim">empty bay</span></div>`;
    } else {
      slotsHtml += `<div class="slot locked"><span class="ic">🔒</span><span class="dim">hull expansion</span></div>`;
    }
  }
  let selHtml = "";
  if (S.sel != null && S.sel >= 0 && inst[S.sel]) {
    const m = inst[S.sel], md = MODS[m.t];
    const status = m.dmg ? '<b class="low">⛔ DAMAGED — offline</b>' :
      md.pw ? (m.on ? `<b style="color:var(--green)">● ONLINE</b> <span class="dim">· drawing ${md.pw}⚡</span>`
                    : `<b class="dim">○ POWERED DOWN</b> <span class="dim">· would draw ${md.pw}⚡</span>`) :
      (md.gen ? `<b style="color:var(--green)">● GENERATING</b> <span class="dim">· +${md.gen}⚡</span>`
              : '<b style="color:var(--green)">● OPERATIONAL</b> <span class="dim">· passive, no power draw</span>');
    selHtml = `<div class="panel"><h3>${md.icon} ${md.n}</h3>
      <p style="margin-bottom:6px">${status}</p>
      <p class="dim" style="margin-bottom:8px">${md.d}</p>
      ${m.dmg ? '<p class="dim" style="margin-bottom:8px">Repair at any shipyard dry dock (80cr), or a mechanic may jury-rig it in flight.</p>' : ""}
      <div style="display:flex; gap:6px; flex-wrap:wrap">
        ${md.pw && !m.dmg ? `<button onclick="toggleMod(${S.sel})">${m.on ? "⏻ Power down" : "⏻ Power up (+" + md.pw + "⚡)"}</button>` : ""}
        <button ${S.docked ? "" : "disabled"} onclick="sellMod(${S.sel})">Sell for ${Math.round(md.price * (m.dmg ? 0.4 : 0.6))}cr${S.docked ? "" : " (dock first)"}</button>
      </div></div>`;
  } else if (S.sel === -1) {
    selHtml = `<div class="panel"><h3>Empty Slot</h3><p class="dim">Buy modules at any planet's Shipyard. Foundry runs 15% off.</p></div>`;
  }
  const crewHtml = S.crew.length ? S.crew.map((c, i) =>
    `<div class="card"><div class="title">${c.name} <span class="dim">— ${ROLES[c.role].n}, ${c.salary}cr/day</span></div>
     <div class="dim">${ROLES[c.role].d}</div>
     ${S.docked ? `<button style="margin-top:6px" onclick="fireCrew(${i})">Dismiss</button>` : ""}</div>`).join("")
    : `<div class="dim">No crew. It's just you, the hum of the recyclers, and every job on the ship. Hire hands in planet cantinas (needs Crew Quarters).</div>`;
  const paxAll = S.jobs.filter((j) => j.pax);
  const paxHtml = paxAll.length ? paxAll.map((j) =>
    `<div class="card"><div class="title">${j.pax!.name} ${j.pax!.sick ? '<span class="low">(sick)</span>' : ""} <span class="dim">→ ${PLANETS[j.dest].n}</span></div>
     <div class="dim">${j.pax!.motive === "vip" ? "VIP — expects the good towels." : MOTIVES[j.pax!.motive] ? MOTIVES[j.pax!.motive].d : ""}</div></div>`).join("")
    : `<div class="dim">No passengers aboard.</div>`;
  const jobsHtml = S.jobs.length ? S.jobs.map((j) =>
    `<div class="card"><div class="title">${j.title}</div>
     <div class="dim">→ ${PLANETS[j.dest].n} · <span class="pay">${fmt(j.pay)}cr</span>${j.deadline ? ` · <span class="${S.day + daysTo(S.loc, j.dest) > j.deadline ? "low" : ""}">by day ${j.deadline}</span>` : ""}${j.units ? ` · ${j.units}u${j.hidden ? " hidden" : ""}` : ""}</div></div>`).join("")
    : `<div class="dim">No active contracts. The bank account won't fill itself — hit a cantina.</div>`;
  const repHtml = Object.keys(FACS).filter((f) => f !== "none").map((f) => {
    const v = S.rep[f];
    const pct = ((v + 20) / 40) * 100;
    return `<div style="font-size:12px">${FACS[f].n} <span class="dim">(${v > 0 ? "+" : ""}${v})</span></div>
      <div class="repbar"><div class="f" style="left:0;width:${pct}%;background:${FACS[f].c}"></div></div>`;
  }).join("");
  return `<div class="row">
    <div class="col" style="max-width:340px">
      <div class="panel"><h3>${S.shipName} — deck schematic</h3>
        <div class="shipframe ${hullState}">
          <div class="frame-head"><span class="fh-l">◄ DECK PLAN ▬ LIVE FEED ►</span><span class="fh-r">REG ${reg}</span></div>
          <div class="scansweep"></div>
          <div class="shipvis">
            <div class="nose"><div class="canopy"></div><span class="lbl">COCKPIT</span></div>
            <div class="hullbody">
              <span class="rivets"></span>
              <span class="hardpoint hp-l ${st.active("weapons") > 0 ? "on-red" : ""}" title="port hardpoint"></span>
              <span class="hardpoint hp-r ${st.active("shields") > 0 ? "on-blue" : ""}" title="starboard hardpoint"></span>
              <div class="slotgrid">${slotsHtml}</div>
            </div>
            <div class="tail"><span class="lbl">DRIVE CORE MK-${["", "I", "II", "III"][S.engineLvl]}</span></div>
            <div class="thrustglow"></div>
            <div class="flames">${'<div class="flame"></div>'.repeat(1 + S.engineLvl)}</div>
          </div>
          <div class="frame-foot">
            <span>HULL <b class="${S.hull < 40 ? "low" : ""}">${Math.round(hullPct * 100)}%</b></span>
            <span class="ff-bar"><i style="width:${Math.round(hullPct * 100)}%"></i></span>
            <span><b>${inst.length}</b>/${S.slotsMax} BAYS</span>
          </div>
        </div>
        <div class="powerbar">⚡ Reactor load <b class="${st.powerUse > st.powerOut ? "low" : ""}">${st.powerUse}/${st.powerOut}</b>
          <span class="dim">(drive core ${4 + 2 * S.engineLvl}${st.intact("reactor") ? " + aux " + st.intact("reactor") * 3 : ""})</span>
          <div class="cells">${Array.from({ length: st.powerOut }, (_, i) => `<div class="cell ${i < st.powerUse ? "used" : ""}"></div>`).join("")}</div>
        </div>
        <p class="dim" style="margin-top:8px">● green = running · ○ grey = powered down · ⛔ red = damaged. Click a bay to inspect, toggle power, or sell.</p>
      </div>
      ${selHtml}
      <div class="panel"><h3>Ship Systems</h3>
        <div class="statgrid">
          <span>Cargo</span><b>${cargoUsed()}/${st.cargoCap}</b>
          <span>Hidden cargo</span><b>${scargoUsed()}/${st.scargoCap}</b>
          <span>Passenger berths</span><b>${paxJobs().length}/${st.paxCap}</b>
          <span>Staterooms</span><b>${vipJobs().length}/${st.vipCap}</b>
          <span>Crew bunks</span><b>${S.crew.length}/${st.crewCap}</b>
          <span>Combat damage</span><b>~${st.dmg}</b>
          <span>Shields</span><b>−${st.shield}/hit</b>
          <span>Speed</span><b>${st.speed} u/day</b>
          <span>Fuel burn</span><b>${st.fuelDay}/day</b>
          <span>Food: eat/grow</span><b>${foodPerDay()}/${st.foodGen}</b>
          <span>Trade goods</span><b>${S.cargo.ore} ore · ${S.cargo.med} med · ${S.cargo.lux} lux</b>
          <span>Payroll</span><b>${salaries()}cr/day</b>
          <span>Reactor</span><b>${st.powerUse}/${st.powerOut}⚡</b>
          <span>Systems down</span><b class="${S.modules.some((m) => m.dmg) ? "low" : ""}">${S.modules.filter((m) => m.dmg).length}</b>
        </div>
      </div>
      <div class="panel"><h3>Faction Standing</h3>${repHtml}</div>
      <div class="panel"><h3>Word on the Street</h3>${repStreetHtml()}</div>
    </div>
    <div class="col">
      ${storyCards()}
      <div class="panel"><h3>Active Contracts (${S.jobs.length})</h3>${jobsHtml}</div>
      <div class="panel"><h3>Crew (${S.crew.length}/${st.crewCap})</h3>${crewHtml}</div>
      <div class="panel"><h3>Passengers</h3>${paxHtml}</div>
    </div>
  </div>`;
}
