import { S } from "../state";
import { PLANETS, FACS } from "../content";
import { daysTo, fuelTo, foodPerDay, planetVisible, isSilenced, crewGapWarnings } from "../derive";
import { activeMood, MOOD_WORD, MOOD_ICON } from "../systems/moods";
import { requestRender } from "../bus";
import { actionAttr } from "../dispatch";

export function selPlanet(k: string) { S.selPlanet = k; requestRender(); }

export function departureCrewWarnings(): { shown: string[]; hidden: number } {
  if (!S.flags.intro_done) return { shown: [], hidden: 0 };
  const all = crewGapWarnings();
  return { shown: all.slice(0, 2), hidden: Math.max(0, all.length - 2) };
}

export function mapHTML(): string {
  const from = S.travel ? S.travel.from : S.loc;
  let svg = `<svg id="mapsvg" viewBox="0 0 860 480" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <pattern id="navgrid" width="43" height="40" patternUnits="userSpaceOnUse">
        <path d="M43 0 H0 V40" fill="none" stroke="#e8b04b" stroke-opacity="0.08" stroke-width="1"/>
      </pattern>
      <radialGradient id="scopeVig" cx="50%" cy="50%" r="70%">
        <stop offset="55%" stop-color="#000000" stop-opacity="0"/>
        <stop offset="100%" stop-color="#000000" stop-opacity="0.55"/>
      </radialGradient>
      <filter id="nodeGlow" x="-80%" y="-80%" width="260%" height="260%">
        <feGaussianBlur stdDeviation="4" result="b"/>
        <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>
      <marker id="course" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto">
        <path d="M0 0 L10 5 L0 10 z" fill="#e8b04b"/>
      </marker>
    </defs>
    <rect x="0" y="0" width="860" height="480" fill="url(#navgrid)"/>`;
  // deterministic decorative starfield
  for (let i = 0; i < 70; i++) {
    const x = (i * 137) % 860, y = (i * 211) % 480;
    svg += `<circle cx="${x}" cy="${y}" r="${i % 7 === 0 ? 1.3 : 0.7}" fill="#ffffff${i % 3 === 0 ? "66" : "33"}"/>`;
  }
  // edge coordinate ticks (chart feel)
  for (let gx = 100; gx < 860; gx += 100) svg += `<text x="${gx}" y="14" fill="#e8b04b55" font-size="8" text-anchor="middle" font-family="monospace">${(gx).toString().padStart(3, "0")}</text>`;
  // plotted course to the selected destination
  if (S.selPlanet && S.selPlanet !== from) {
    const A = PLANETS[from], B = PLANETS[S.selPlanet];
    const mx = (A.x + B.x) / 2, my = (A.y + B.y) / 2;
    const d = daysTo(from, S.selPlanet), f = fuelTo(from, S.selPlanet);
    const ok = S.fuel >= f;
    svg += `<line x1="${A.x}" y1="${A.y}" x2="${B.x}" y2="${B.y}" stroke="${ok ? "#e8b04b" : "#d96b6b"}" stroke-opacity="0.8" stroke-dasharray="7 5" stroke-width="1.5" marker-end="url(#course)"/>
      <g transform="translate(${mx},${my})">
        <rect x="-38" y="-11" width="76" height="22" rx="3" fill="#0d1019" stroke="${ok ? "#3a4256" : "#d96b6b"}"/>
        <text x="0" y="4" text-anchor="middle" font-family="monospace" font-size="10" fill="${ok ? "#e8b04b" : "#d96b6b"}">${d}d · ${f}⛽</text>
      </g>`;
  }
  for (const k in PLANETS) {
    const p = PLANETS[k];
    if (!planetVisible(k)) continue;
    const cur = k === S.loc && S.docked;
    const sel = k === S.selPlanet;
    const dark = isSilenced(k);
    const c = dark ? "#2c3140" : FACS[p.fac].c;
    const isGate = k === "gate";
    const isSource = k === "anechoic";
    svg += `<g class="planet-dot" ${actionAttr("selPlanet", k)}>
      ${isSource ? `<circle cx="${p.x}" cy="${p.y}" r="20" fill="none" stroke="#a86bd9" stroke-width="1" stroke-dasharray="3 6" opacity="0.7"/>` : ""}
      <circle cx="${p.x}" cy="${p.y}" r="${isGate || isSource ? 13 : 11}" fill="${isSource ? "#0a0710" : c}" ${dark || isSource ? "" : 'filter="url(#nodeGlow)"'} opacity="0.9" ${isSource ? 'stroke="#a86bd9" stroke-width="1.5"' : ""}/>
      <circle cx="${p.x}" cy="${p.y}" r="${isGate || isSource ? 13 : 11}" fill="none" stroke="#05070d" stroke-width="1.5"/>
      ${isSource ? "" : `<circle cx="${p.x}" cy="${p.y}" r="${isGate ? 6 : 4.5}" fill="${dark ? "#3a4050" : "#ffffffcc"}"/>`}
      ${cur ? `<circle class="beacon" cx="${p.x}" cy="${p.y}" r="16" fill="none" stroke="#e8b04b" stroke-width="1.5"/>
              <circle cx="${p.x}" cy="${p.y}" r="20" fill="none" stroke="#e8b04b" stroke-width="1" stroke-dasharray="2 4"/>` : ""}
      ${sel ? `<rect x="${p.x - 18}" y="${p.y - 18}" width="36" height="36" fill="none" stroke="#e8b04b" stroke-width="1.5" stroke-dasharray="9 8"/>
              <line x1="${p.x - 24}" y1="${p.y}" x2="${p.x - 19}" y2="${p.y}" stroke="#e8b04b" stroke-width="1.5"/>
              <line x1="${p.x + 19}" y1="${p.y}" x2="${p.x + 24}" y2="${p.y}" stroke="#e8b04b" stroke-width="1.5"/>` : ""}
      <text x="${p.x}" y="${p.y + 30}" fill="${sel ? "#e8b04b" : dark ? "#5f6479" : "#c9cdd8"}" font-size="12" text-anchor="middle" font-family="monospace" letter-spacing="0.5">${p.n}</text>
      ${dark ? `<text x="${p.x}" y="${p.y + 43}" fill="#5f6479" font-size="9" text-anchor="middle" font-family="monospace">· NO SIGNAL ·</text>` : ""}
      ${isGate ? `<text x="${p.x}" y="${p.y - 20}" fill="#e8b04b" font-size="11" text-anchor="middle" font-family="monospace">◆ THE RUN</text>` : ""}
      ${isSource ? `<text x="${p.x}" y="${p.y - 24}" fill="#a86bd9" font-size="11" text-anchor="middle" font-family="monospace">◇ THE SILENCE</text>` : ""}
    </g>`;
  }
  // Charted points of interest — the player's own marks, the map-as-diary.
  // Rendered under the ship/course so a live transit never hides behind them.
  for (const poi of S.poi) {
    const glyph = poi.kind === "seam" ? "◆" : poi.kind === "derelict" ? "✶" : "◇";
    const col = poi.kind === "seam" ? "#6fbf73" : poi.kind === "derelict" ? "#d9a55b" : "#8fa0c4";
    svg += `<g class="poi-mark">
      <text x="${poi.x}" y="${poi.y + 4}" text-anchor="middle" font-size="12" fill="${col}" opacity="0.85">${glyph}</text>
      <text x="${poi.x}" y="${poi.y - 8}" text-anchor="middle" font-family="monospace" font-size="7" fill="${col}" opacity="0.6" letter-spacing="0.3">${poi.name.toUpperCase()}</text>
    </g>`;
  }
  if (S.travel) {
    const A = PLANETS[S.travel.from], B = PLANETS[S.travel.dest];
    const t = 1 - S.travel.left / S.travel.total;
    const x = A.x + (B.x - A.x) * t, y = A.y + (B.y - A.y) * t;
    const ang = Math.atan2(B.y - A.y, B.x - A.x) * 180 / Math.PI;
    svg += `<line x1="${A.x}" y1="${A.y}" x2="${B.x}" y2="${B.y}" stroke="#e8b04b55" stroke-width="1"/>
      <g transform="translate(${x},${y}) rotate(${ang})"><text x="0" y="5" font-size="17" text-anchor="middle" fill="#e8b04b" filter="url(#nodeGlow)">▸</text></g>`;
  }
  svg += `<rect x="0" y="0" width="860" height="480" fill="url(#scopeVig)" pointer-events="none"/>`;
  svg += `</svg>`;
  const locName = PLANETS[from].n;
  const frameSvg = `<div class="scope">
    <div class="scope-head"><span>◄ NAV COMPUTER ▬ SECTOR 07 ►</span><span class="sh-r">${S.travel ? "◇ IN TRANSIT" : "● DOCKED · " + locName.toUpperCase()}</span></div>
    <div class="scope-body"><div class="radar-sweep"></div>${svg}</div>
    <div class="scope-foot">
      <span><i class="fdot" style="background:#5b8dd9"></i>UNION <i class="fdot" style="background:#d9a55b"></i>FRONTIER <i class="fdot" style="background:#d96b6b"></i>SYNDICATE</span>
      <span>${Object.keys(PLANETS).filter((k) => planetVisible(k) && !isSilenced(k)).length} CONTACTS${S.campaign.silence.silenced.length ? ` · ${S.campaign.silence.silenced.length} DARK` : ""}</span>
    </div>
  </div>`;
  let info = "";
  if (S.selPlanet) {
    const p = PLANETS[S.selPlanet];
    const mood = activeMood(S.selPlanet);
    const moodBadge = mood ? ` <span class="badge" title="${mood.mood}">${MOOD_ICON[mood.mood]} ${MOOD_WORD[mood.mood]}</span>` : "";
    if (S.selPlanet === from) {
      info = `<div class="panel"><h3>${p.n}${moodBadge}</h3><p class="dim">${p.d}</p><p class="dim">You're here.</p></div>`;
    } else {
      const d = daysTo(from, S.selPlanet), f = fuelTo(from, S.selPlanet);
      const foodNeed = foodPerDay() * d;
      const ok = S.fuel >= f;
      const darkWarn = isSilenced(S.selPlanet)
        ? `<p class="low" style="margin:6px 0">◇ NO SIGNAL — nothing has answered from ${p.n} since it went dark. No port services. No fuel. Whatever you fly in with is what you fly out on.</p>` : "";
      const gaps = departureCrewWarnings();
      const gapWarn = gaps.shown.length
        ? `<div class="card" style="border-color:var(--red); margin:8px 0"><div class="title" style="color:var(--red)">⚠ Before you cast off</div>
            ${gaps.shown.map((g) => `<div class="dim" style="margin-top:3px">· ${g}</div>`).join("")}
            ${gaps.hidden ? `<div class="route-more">+${gaps.hidden} lower-priority crew gaps · review the Crew Roster later</div>` : ""}</div>` : "";
      info = `<div class="panel"><h3>${p.n}${moodBadge} <span class="badge fac">${FACS[p.fac].n}</span></h3>
        <p class="dim">${p.d}</p>${darkWarn}${gapWarn}
        <div class="statgrid" style="margin:8px 0">
          <span>Distance</span><b>${d} days</b>
          <span>Fuel needed</span><b class="${ok ? "" : "low"}">${f} (have ${Math.floor(S.fuel)})</b>
          <span>Food needed (est.)</span><b class="${S.food >= foodNeed ? "" : "low"}">~${foodNeed} (have ${Math.floor(S.food)})</b>
          <span>Fuel price there</span><b>${p.fuelP || "—"}cr</b>
        </div>
        ${S.docked ? `<button class="primary" ${ok ? "" : "disabled"} ${actionAttr("depart", S.selPlanet)}>${ok ? "⛽ Depart (" + f + " fuel, " + d + " days)" : "Not enough fuel"}</button>` : `<span class="dim">Already in transit.</span>`}
      </div>`;
    }
  } else {
    info = `<div class="panel"><p class="dim">Select a destination. Planet colors show controlling faction: <span style="color:#5b8dd9">Union</span> · <span style="color:#d9a55b">Frontier</span> · <span style="color:#d96b6b">Syndicate</span>.</p></div>`;
  }
  // Cockpit framing: the chart is the big console angled toward the pilot's
  // left hand, the destination readout a narrower console to the right —
  // same physical language as the ship screen's con-left/con-right split.
  return `<div class="cockpit"><div class="dash">
    <div class="console con-left"><div class="panel"><h3>Sector Chart</h3>${frameSvg}</div></div>
    <div class="console con-right map-readout">${info}</div>
  </div></div>`;
}
