import { S } from "../state";
import { PLANETS, FACS } from "../content";
import { daysTo, fuelTo, foodPerDay } from "../derive";
import { requestRender } from "../bus";

export function selPlanet(k: string) { S.selPlanet = k; requestRender(); }

export function mapHTML(): string {
  let svg = `<svg id="mapsvg" viewBox="0 0 860 480" xmlns="http://www.w3.org/2000/svg">`;
  // deterministic decorative starfield
  for (let i = 0; i < 70; i++) {
    const x = (i * 137) % 860, y = (i * 211) % 480;
    svg += `<circle cx="${x}" cy="${y}" r="${i % 7 === 0 ? 1.3 : 0.7}" fill="#ffffff${i % 3 === 0 ? "66" : "33"}"/>`;
  }
  const from = S.travel ? S.travel.from : S.loc;
  if (S.selPlanet && S.selPlanet !== from) {
    const A = PLANETS[from], B = PLANETS[S.selPlanet];
    svg += `<line x1="${A.x}" y1="${A.y}" x2="${B.x}" y2="${B.y}" stroke="#e8b04b88" stroke-dasharray="6 5" stroke-width="1.5"/>`;
  }
  for (const k in PLANETS) {
    const p = PLANETS[k];
    if (p.hidden && S.arc.stage < 5) continue;
    const cur = k === S.loc && S.docked;
    const c = FACS[p.fac].c;
    svg += `<g class="planet-dot" onclick="selPlanet('${k}')">
      <circle cx="${p.x}" cy="${p.y}" r="11" fill="${c}" stroke="${k === S.selPlanet ? "#e8b04b" : "#000"}" stroke-width="${k === S.selPlanet ? 3 : 1}"/>
      ${cur ? `<circle cx="${p.x}" cy="${p.y}" r="17" fill="none" stroke="#e8b04b" stroke-width="1.5" stroke-dasharray="3 3"/>` : ""}
      <text x="${p.x}" y="${p.y + 28}" fill="#c9cdd8" font-size="12" text-anchor="middle">${p.n}</text>
      ${k === "gate" ? `<text x="${p.x}" y="${p.y - 18}" fill="#e8b04b" font-size="11" text-anchor="middle">◆ THE RUN</text>` : ""}
    </g>`;
  }
  if (S.travel) {
    const A = PLANETS[S.travel.from], B = PLANETS[S.travel.dest];
    const t = 1 - S.travel.left / S.travel.total;
    const x = A.x + (B.x - A.x) * t, y = A.y + (B.y - A.y) * t;
    svg += `<line x1="${A.x}" y1="${A.y}" x2="${B.x}" y2="${B.y}" stroke="#e8b04b55" stroke-width="1"/>
      <text x="${x}" y="${y}" font-size="16" text-anchor="middle" fill="#e8b04b">☄</text>`;
  }
  svg += `</svg>`;
  let info = "";
  if (S.selPlanet) {
    const p = PLANETS[S.selPlanet];
    if (S.selPlanet === from) {
      info = `<div class="panel"><h3>${p.n}</h3><p class="dim">${p.d}</p><p class="dim">You're here.</p></div>`;
    } else {
      const d = daysTo(from, S.selPlanet), f = fuelTo(from, S.selPlanet);
      const foodNeed = foodPerDay() * d;
      const ok = S.fuel >= f;
      info = `<div class="panel"><h3>${p.n} <span class="badge fac">${FACS[p.fac].n}</span></h3>
        <p class="dim">${p.d}</p>
        <div class="statgrid" style="margin:8px 0">
          <span>Distance</span><b>${d} days</b>
          <span>Fuel needed</span><b class="${ok ? "" : "low"}">${f} (have ${Math.floor(S.fuel)})</b>
          <span>Food needed (est.)</span><b class="${S.food >= foodNeed ? "" : "low"}">~${foodNeed} (have ${Math.floor(S.food)})</b>
          <span>Fuel price there</span><b>${p.fuelP || "—"}cr</b>
        </div>
        ${S.docked ? `<button class="primary" ${ok ? "" : "disabled"} onclick="depart('${S.selPlanet}')">${ok ? "⛽ Depart (" + f + " fuel, " + d + " days)" : "Not enough fuel"}</button>` : `<span class="dim">Already in transit.</span>`}
      </div>`;
    }
  } else {
    info = `<div class="panel"><p class="dim">Select a destination. Planet colors show controlling faction: <span style="color:#5b8dd9">Union</span> · <span style="color:#d9a55b">Frontier</span> · <span style="color:#d96b6b">Syndicate</span>.</p></div>`;
  }
  return `<div class="panel"><h3>Sector Chart</h3>${svg}</div>` + info;
}
