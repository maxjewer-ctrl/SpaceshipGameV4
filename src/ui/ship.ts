import { S } from "../state";
import { MODS, PLANETS, ROLES, MOTIVES, FACS } from "../content";
import { stats, modInst, cargoUsed, scargoUsed, paxJobs, vipJobs, salaries, foodPerDay, daysTo } from "../derive";
import { fmt } from "../util";
import { requestRender } from "../bus";
import { reputation } from "../systems/disposition";
import { storyCards } from "../systems/silence";
import { introCard } from "../systems/intro";
import { standingWord } from "../systems/port";
import { wearTier } from "../systems/wear";
import { markOf, markLabel, markPrice } from "../systems/modtier";
import { viewportHTML, pedestalHTML, reactorPanelHTML, lifeSupportHTML, commsFullHTML } from "./cockpit";

export function selSlot(i: number) { S.sel = S.sel === i ? null : i; requestRender(); }

// Center-frame view: the deck schematic or the sensor live feed. Session-only
// preference — no reason to persist which page of the console you left open.
let shipViewMode: "plan" | "feed" = "plan";
export function shipView(v: "plan" | "feed") { shipViewMode = v; requestRender(); }

// Deterministic per (location, day) so blips hold still while you look at them.
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

export function radarBlips(): { l: number; t: number; c: string; title: string }[] {
  const out: { l: number; t: number; c: string; title: string }[] = [];
  const place = (ang: number, dist: number, c: string, title: string) => {
    const r = 8 + dist * 40; // % from center, kept inside the scope ring
    out.push({ l: 50 + r * Math.cos(ang), t: 50 + r * Math.sin(ang), c, title });
  };
  if (S.travel) {
    const prog = 1 - S.travel.left / S.travel.total;
    const a = (hash(S.travel.dest) % 360) * Math.PI / 180;
    place(a, 1 - prog * 0.85, "var(--blue)", PLANETS[S.travel.dest].n + " (destination)");
    if (prog < 0.5) place(a + Math.PI, 0.3 + prog, "#6b7280", PLANETS[S.travel.from].n + " (departure)");
  } else if (S.docked) {
    place((hash(S.loc) % 360) * Math.PI / 180, 0.18, "var(--blue)", PLANETS[S.loc].n + " (docked)");
  }
  // ambient traffic — quiet lanes some days, busy ones others
  const h = hash(S.loc + ":" + S.day);
  const n = h % 3;
  for (let i = 0; i < n; i++) {
    const a = ((h >> (4 + i * 7)) % 360) * Math.PI / 180;
    place(a, 0.45 + ((h >> (2 + i * 5)) % 50) / 100, "var(--green)", "Unresolved contact");
  }
  return out;
}

function liveFeedHTML(): string {
  const st = stats();
  const blips = radarBlips();
  const vel = S.travel ? st.speed : 0;
  const hdg = S.travel ? hash(S.travel.dest) % 360 : hash(S.loc) % 360;
  const silent = !S.travel && !S.docked;
  return `<div class="livefeed">
    <div class="radar">
      <div class="ring r1"></div><div class="ring r2"></div>
      <div class="ax-v"></div><div class="ax-h"></div>
      <div class="rsweep"></div>
      ${blips.map((b) => `<div class="blip" style="left:${b.l.toFixed(1)}%;top:${b.t.toFixed(1)}%;background:${b.c};box-shadow:0 0 6px ${b.c}" title="${b.title}"></div>`).join("")}
      <div class="self" title="${S.shipName}"></div>
      ${silent ? '<div class="nosig">NO SIGNAL</div>' : ""}
    </div>
    <div class="feedstats">
      <div class="fs"><div class="fk">VELOCITY</div><div class="fv">${vel}<small> u/d</small></div></div>
      <div class="fs"><div class="fk">HEADING</div><div class="fv">${String(hdg).padStart(3, "0")}°</div></div>
      <div class="fs"><div class="fk">CONTACTS</div><div class="fv plain">${silent ? "—" : blips.length}</div></div>
    </div>
  </div>`;
}

// Breaker panel — one physical switch per powered module, wired straight to
// the same toggle the schematic bays use.
function breakersHTML(): string {
  const inst = modInst();
  const rows = inst.map((m, i) => ({ m, md: MODS[m.t], i })).filter((r) => r.md.pw);
  if (!rows.length) return "";
  return `<div class="panel"><h3>Breaker Panel</h3><div class="breakers">
    ${rows.map(({ m, md, i }) => `<div class="breaker${m.on && !m.dmg ? " on" : ""}${m.dmg ? " dmgd" : ""}"
        onclick="toggleMod(${i})" title="${md.n}${m.dmg ? " — DAMAGED" : m.on ? " — online, drawing " + md.pw + "⚡" : " — powered down"}">
      <div class="bk-well"><div class="bk-handle"></div></div>
      <div class="bk-led"></div>
      <div class="bk-name">${md.n}</div>
    </div>`).join("")}
  </div></div>`;
}

export function captainsLogHTML(): string {
  const visible = S.logLines.slice(0, 20);
  return `<div class="panel"><h3>Captain's Log</h3>
    <div class="logscroll">${visible.map((l) => `<div class="logline${l.bark ? " bark" : ""}"><b>D${l.d}</b> ${l.m}</div>`).join("") || '<div class="dim">Nothing yet.</div>'}</div>
  </div>`;
}

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
  if (!rep) {
    // Prestige and the hidden disposition meters are different systems — but
    // "a nobody" next to a 12★ badge reads as a bug. Acknowledge the fame,
    // keep the character question open.
    if (S.prestige >= 10) return `<div class="dim">${S.prestige}★ and climbing — the lanes know your ship on sight now. What they're still deciding is what kind of captain flies her. You're writing that part every day.</div>`;
    if (S.prestige >= 5) return `<div class="dim">The name is starting to travel — ${S.prestige}★ worth of kept promises. Keep flying, and the lanes will decide what kind of story you are.</div>`;
    return `<div class="dim">You're still a nobody out here. Fly enough runs, make enough choices, and the lanes will start telling stories about you.</div>`;
  }
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
  // v2-style module bay cards: fill-level overlay, LED dot, category tag
  let slotsHtml = "";
  for (let i = 0; i < 10; i++) {
    if (i < inst.length) {
      const m = inst[i], md = MODS[m.t];
      const cat = modCategory(m.t);
      const led = m.dmg ? "var(--red)" : (md.pw ? (m.on ? "var(--green)" : "#3a3f48") : "var(--green)");
      const fill = m.dmg ? "30%" : (md.pw && m.on ? "60%" : "15%");
      const fillC = m.dmg ? "var(--red)" : (cat ? "var(--accent)" : "var(--amber)");
      const tagC = m.dmg ? "var(--red)" : "#7fb8dd";
      const nameC = m.dmg ? "var(--red)" : "#cfeaff";
      const tag = md.pw ? (m.on ? `ON ${md.pw}⚡` : `OFF`) : (md.gen ? `+${md.gen}⚡` : "PSV");
      const cls = (m.dmg ? " dmgd" : "") + (!m.dmg && md.pw && !m.on ? " offline" : "") + (S.sel === i ? " selected" : "");
      slotsHtml += `<div class="v2-bay ${cat}${cls}" onclick="selSlot(${i})" title="${md.n}${m.dmg ? " — DAMAGED" : (md.pw && !m.on ? " — powered down" : "")}">
        <div class="v2-bay-fill" style="height:${fill};background:${fillC}"></div>
        <div class="v2-bay-top"><span class="v2-bay-tag" style="color:${tagC}">${tag}</span><span class="v2-bay-led" style="background:${led};box-shadow:0 0 6px ${led}"></span></div>
        <div class="v2-bay-bot"><span class="v2-bay-icon">${md.icon}</span><span class="v2-bay-name" style="color:${nameC}">${md.n}${markOf(m) > 1 ? ` <b style="color:var(--accent)">${markLabel(markOf(m))}</b>` : ""}</span></div>
      </div>`;
    } else if (i < S.slotsMax) {
      slotsHtml += `<div class="v2-bay empty" onclick="selSlot(-1)"><div class="v2-bay-bot"><span class="v2-bay-icon">＋</span><span class="v2-bay-name dim">empty bay</span></div></div>`;
    } else {
      slotsHtml += `<div class="v2-bay locked"><div class="v2-bay-bot"><span class="v2-bay-icon">🔒</span><span class="v2-bay-name dim">hull expansion</span></div></div>`;
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
    const wt = wearTier(m);
    const wearLine = wt === "failing"
      ? `<p style="margin-bottom:6px"><b class="low">🔩 FAILING</b> <span class="dim">— worn past trusting; it can quit any day. Refit at a dry dock.</span></p>`
      : wt === "worn"
        ? `<p style="margin-bottom:6px"><b style="color:var(--amber)">🔩 WORN</b> <span class="dim">— running, but trouble picks on worn systems first.</span></p>`
        : "";
    selHtml = `<div class="panel"><h3>${md.icon} ${md.n} <span style="color:var(--accent)">Mk-${markLabel(markOf(m))}</span></h3>
      <p style="margin-bottom:6px">${status}</p>
      ${wearLine}
      <p class="dim" style="margin-bottom:8px">${md.d}</p>
      ${m.dmg ? '<p class="dim" style="margin-bottom:8px">Repair at any shipyard dry dock (80cr), or a mechanic may jury-rig it in flight.</p>' : ""}
      <div style="display:flex; gap:6px; flex-wrap:wrap">
        ${md.pw && !m.dmg ? `<button onclick="toggleMod(${S.sel})">${m.on ? "⏻ Power down" : "⏻ Power up (+" + md.pw + "⚡)"}</button>` : ""}
        <button ${S.docked ? "" : "disabled"} onclick="sellMod(${S.sel})">Sell for ${Math.round(markPrice(m.t, markOf(m)) * (m.dmg ? 0.4 : 0.6))}cr${S.docked ? "" : " (dock first)"}</button>
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
     <div class="dim">→ ${PLANETS[j.dest].n} · <span class="pay">${fmt(j.pay)}cr</span>${j.deadline ? ` · <span class="${S.day + daysTo(S.loc, j.dest) > j.deadline ? "low" : ""}">by day ${j.deadline}</span>` : ""}${j.units ? ` · ${j.units}u${j.hidden ? " hidden" : ""}` : ""}</div>
     ${j.arcCrate || j.arcVoss ? "" : `<div style="margin-top:6px"><button onclick="abandonJob(${j.id})" title="Drop this contract now — frees the cargo/berth it holds, costs 1 prestige and standing with the client">Abandon</button></div>`}</div>`).join("")
    : `<div class="dim">No active contracts. The bank account won't fill itself — hit a cantina.</div>`;
  const repHtml = Object.keys(FACS).filter((f) => f !== "none").map((f) => {
    const v = S.rep[f];
    const pct = ((v + 20) / 40) * 100;
    return `<div style="font-size:12px">${FACS[f].n} <span class="dim">(${v > 0 ? "+" : ""}${v})</span></div>
      <div class="repbar"><div class="f" style="left:0;width:${pct}%;background:${FACS[f].c};color:${FACS[f].c}"></div></div>`;
  }).join("");
  // Per-port standing — only ports you've actually made an impression at show.
  const knownPorts = Object.keys(PLANETS)
    .filter((k) => !PLANETS[k].hidden && Math.abs((S.portStanding && S.portStanding[k]) || 0) >= 1);
  const portHtml = knownPorts.length
    ? knownPorts.map((k) => `<div style="font-size:12px; display:flex; justify-content:space-between">
        <span>${PLANETS[k].n}</span><span class="dim">${standingWord(k)}</span></div>`).join("")
    : `<div class="dim">You haven't left a mark on any port yet. Deliver, help, or cross someone — the station remembers.</div>`;
  // Cockpit framing: viewport glass up top, consoles angled toward the
  // pilot's seat, physical controls on the pedestal below.
  return `<div class="cockpit">
    ${viewportHTML()}
    <div class="cockpit-walk-return"><button class="primary" onclick="walkDeck()">🧍 Stand up — walk the deck</button></div>
    <div class="dash">
    <div class="console con-left">
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
      ${reactorPanelHTML()}
      ${breakersHTML()}
      <div class="panel"><h3>Faction Standing</h3>${repHtml}</div>
      <div class="panel"><h3>Port Standing</h3>${portHtml}</div>
      <div class="panel"><h3>Word on the Street</h3>${repStreetHtml()}</div>
    </div>
    <div class="console con-center">
      <div class="panel"><h3>${S.shipName} — deck schematic</h3>
        <div class="shipframe ${hullState}">
          <div class="frame-head">
            <span class="fh-tabs">
              <button class="fh-tab${shipViewMode === "plan" ? " on" : ""}" onclick="shipView('plan')">◀ DECK PLAN</button>
              <button class="fh-tab${shipViewMode === "feed" ? " on" : ""}" onclick="shipView('feed')">LIVE FEED ▶</button>
            </span>
            <span class="fh-r">REG ${reg}</span>
          </div>
          <div class="scansweep"></div>
          ${shipViewMode === "feed" ? liveFeedHTML() : `<div class="v2-deck">
            <div class="v2-deck-nose" onclick="selSlot(-1)">
              <span class="v2-deck-nled" style="background:var(--green);box-shadow:0 0 6px var(--green)"></span>
              <span class="v2-deck-nlbl">COCKPIT</span>
            </div>
            <div class="v2-deck-spine"></div>
            <div class="v2-baygrid">${slotsHtml}</div>
            <div class="v2-deck-spine"></div>
            <div class="v2-deck-eng">
              <span class="v2-eng-lbl">DRIVE</span>
              ${Array.from({ length: 1 + S.engineLvl }, () => '<span class="v2-eng-glow"></span>').join("")}
            </div>
          </div>`}
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
    </div>
    <div class="console con-right">
      ${introCard()}
      ${lifeSupportHTML()}
      ${commsFullHTML()}
      ${captainsLogHTML()}
      ${storyCards()}
      <div class="panel"><h3>Active Contracts (${S.jobs.length})</h3>${jobsHtml}</div>
      <div class="panel"><h3>Crew (${S.crew.length}/${st.crewCap})</h3>${crewHtml}</div>
      <div class="panel"><h3>Passengers</h3>${paxHtml}</div>
    </div>
    </div>
    ${pedestalHTML()}
  </div>`;
}
