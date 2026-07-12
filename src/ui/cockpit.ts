import { S, log } from "../state";
import { PLANETS } from "../content";
import { stats } from "../derive";
import { requestRender } from "../bus";
import { advanceDay, waitDay } from "../systems/travel";
import { cautions } from "./render";
import { radarBlips } from "./ship";
import * as sfx from "../audio";
import engineCoreUrl from "../assets/ship/engine-core.png";

// Physical control positions — switch/lever state, session-only. Losing your
// throttle setting on reload is realistic enough; none of this is save data.
const CTL = {
  throttle: 0,                       // 0–100
  bay: "closed" as "closed" | "open",
  bayMoving: false,                  // doors mid-cycle
  guard: false,                      // fuel-vent guard cover raised
  chan: 0,                           // comms channel index
};

const CHANNELS = ["GUARD 121.5", "PORT CONTROL", "TRAFFIC SCOPE", "OPEN BAND"];

// ---- handlers (registered as globals in main.ts) ----

export function setThrottle(v: number | string) {
  CTL.throttle = Math.max(0, Math.min(100, Math.round(+v || 0)));
  sfx.uiClick();
  requestRender();
}

// Live feedback while dragging — touches the DOM directly so the input isn't
// re-rendered out from under the pointer mid-drag. onchange commits.
export function throttleLive(el: HTMLInputElement) {
  const box = el.closest(".ped-throttle");
  if (!box) return;
  const fill = box.querySelector<HTMLElement>(".thr-fill");
  const val = box.querySelector<HTMLElement>(".thr-val");
  if (fill) fill.style.height = el.value + "%";
  if (val) val.textContent = el.value + "%";
}

export function bayToggle() {
  if (CTL.bayMoving) return;
  sfx.bayDoors(CTL.bay === 'closed');
  CTL.bayMoving = true;
  requestRender();
  setTimeout(() => {
    CTL.bayMoving = false;
    CTL.bay = CTL.bay === "open" ? "closed" : "open";
    log(CTL.bay === "open"
      ? "📦 Cargo bay doors open. Hard vacuum where the floor used to be."
      : "📦 Cargo bay doors sealed and pressurized.");
    requestRender();
  }, 1250);
}

export function jettisonGood(g: string) {
  if (CTL.bay !== "open" || CTL.bayMoving) return;
  const n = S.cargo[g] || 0;
  if (!n) return;
  S.cargo[g] = 0;
  sfx.jettison();
  log(`📦 Jettisoned ${n} ${g} — a small fortune tumbling away in your wake.`);
  requestRender();
}

export function ventGuard() {
  CTL.guard = !CTL.guard;
  sfx.guardFlip();
  requestRender();
}

export function ventFuel() {
  if (!CTL.guard) return;
  CTL.guard = false;
  sfx.fuelVent();
  const v = Math.min(5, Math.floor(S.fuel));
  if (v <= 0) { log("⛽ Vent valve cycles dry. The tanks have nothing left to give."); requestRender(); return; }
  S.fuel -= v;
  log(`⛽ Emergency vent — ${v} fuel dumped to space. Hope you had a reason.`);
  requestRender();
}

export function commsTune() {
  CTL.chan = (CTL.chan + 1) % CHANNELS.length;
  sfx.commsTune();
  requestRender();
}

export function engageBurn() {
  if (S.travel) {
    if (CTL.throttle <= 0) {
      log("Main drive won't answer at idle — push the throttle up first.");
      requestRender();
      return;
    }
    sfx.engageBurn();
    advanceDay();
  } else {
    waitDay();
  }
}

// ---- viewport: the glass, and what's outside it ----

export function viewportHTML(): string {
  const status = S.travel
    ? `◇ IN TRANSIT — ${PLANETS[S.travel.dest].n.toUpperCase()} · ${S.travel.left}D OUT`
    : S.docked ? `● DOCKED — ${PLANETS[S.loc].n.toUpperCase()}` : "◇ ADRIFT — NO WAY ON";
  const station = S.docked && !S.travel
    ? `<div class="vp-station"><i class="g1"></i><i class="g2"></i><i class="g3"></i>
        <span class="beacon-l"></span><span class="beacon-l b2"></span><span class="beacon-l b3"></span></div>`
    : "";
  return `<div class="viewport${S.travel ? " moving" : ""}">
    <div class="vp-stars s1"></div><div class="vp-stars s2"></div><div class="vp-stars s3"></div>
    ${S.travel ? '<div class="vp-streaks"></div>' : ""}${station}
    <div class="vp-glass"></div>
    <div class="vp-strut vs-l"></div><div class="vp-strut vs-r"></div>
    <div class="vp-cowl"></div>
    <div class="vp-status">${status}</div>
  </div>`;
}

// ---- comms: what each channel actually carries ----

function chanHash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

function channelReadout(): { txt: string; sig: number } {
  const ch = CTL.chan;
  if (ch === 0) { // GUARD — the emergency band carries your own alarms
    const cs = cautions();
    return cs.length
      ? { txt: cs[0].t + (cs.length > 1 ? ` (+${cs.length - 1})` : ""), sig: 0.9 }
      : { txt: "121.5 QUIET — NO DISTRESS TRAFFIC", sig: 0.55 };
  }
  if (ch === 1) { // PORT CONTROL / nav beacon
    if (S.travel) return { txt: `${PLANETS[S.travel.dest].n.toUpperCase()} BEACON — ETA ${S.travel.left}D`, sig: 0.6 };
    if (S.docked) return { txt: `${PLANETS[S.loc].n.toUpperCase()} CTRL — BERTH SECURE, NO DEPARTURES FILED`, sig: 0.85 };
    return { txt: "NO CARRIER", sig: 0.1 };
  }
  if (ch === 2) { // TRAFFIC — same contacts the scope sees
    if (!S.travel && !S.docked) return { txt: "SCOPE DARK — NO RETURNS", sig: 0.15 };
    const n = radarBlips().length;
    return { txt: `${n} CONTACT${n === 1 ? "" : "S"} ON SCOPE — LANES ${n > 2 ? "BUSY" : "QUIET"}`, sig: 0.5 + Math.min(0.4, n * 0.12) };
  }
  // OPEN BAND — whatever's drifting on the common frequency
  const bark = S.logLines.find((l) => l.bark);
  return bark
    ? { txt: '"' + bark.m.replace(/<[^>]*>/g, "").slice(0, 64) + '"', sig: 0.4 }
    : { txt: "▒▒▒ CARRIER HISS ▒▒▒", sig: 0.12 };
}

// ---- pedestal: the physical controls between the seats ----

export function pedestalHTML(): string {
  // Throttle snaps to idle when there's no way on.
  if (!S.travel && CTL.throttle) CTL.throttle = 0;
  const st = stats();

  // throttle quadrant
  const locked = !S.travel;
  const throttle = `<div class="ped-mod ped-throttle">
    <span class="ped-lbl">THROTTLE</span>
    <div class="thr-track${locked ? " locked" : ""}">
      <div class="thr-slot"></div>
      <div class="thr-fill" style="height:${CTL.throttle}%"></div>
      <input type="range" min="0" max="100" value="${CTL.throttle}" ${locked ? "disabled" : ""}
        oninput="throttleLive(this)" onchange="setThrottle(this.value)" aria-label="Throttle">
    </div>
    <span class="thr-val">${locked ? "LOCKED" : CTL.throttle + "%"}</span>
  </div>`;

  // burn / hold — the day advances through this handle
  const armed = S.travel && CTL.throttle > 0;
  const burn = `<div class="ped-mod ped-burn">
    <span class="ped-lbl">MAIN DRIVE</span>
    <button class="burnbtn${armed ? " armed" : ""}" onclick="engageBurn()">
      ${S.travel ? "ENGAGE BURN<small>advance one day</small>" : "HOLD STATION<small>wait one day in port</small>"}
    </button>
    <span class="ped-foot">${S.travel ? `${st.speed} u/day · ${S.travel.left}d remaining` : "moored · meter running"}</span>
  </div>`;

  // cargo bay doors + jettison
  const bayState = CTL.bayMoving ? (CTL.bay === "open" ? "closing" : "opening") : CTL.bay;
  const goods = ["ore", "med", "lux"] as const;
  const bay = `<div class="ped-mod ped-bay">
    <span class="ped-lbl">CARGO BAY ${CTL.bayMoving ? "· CYCLING" : CTL.bay === "open" ? "· OPEN TO VACUUM" : "· SEALED"}</span>
    <div class="bay-row">
      <div class="bayswitch${CTL.bay === "open" && !CTL.bayMoving ? " on" : ""}${CTL.bayMoving ? " busy" : ""}" onclick="bayToggle()"
        title="${CTL.bayMoving ? "Doors cycling…" : CTL.bay === "open" ? "Close bay doors" : "Open bay doors"}">
        <div class="bk-well"><div class="bk-handle"></div></div>
      </div>
      <div class="bay-gauge">
        <div class="baybar ${bayState}"><i></i></div>
        <span class="bay-led ${CTL.bayMoving ? "amber" : CTL.bay === "open" ? "red" : "green"}"></span>
      </div>
    </div>
    <div class="jet-row">
      ${goods.map((g) => `<button class="jet" ${CTL.bay === "open" && !CTL.bayMoving && (S.cargo[g] || 0) > 0 ? "" : "disabled"}
        onclick="jettisonGood('${g}')" title="${CTL.bay !== "open" ? "Open the bay doors first" : "Dump all " + g + " overboard"}">DUMP ${g.toUpperCase()} <b>${S.cargo[g] || 0}</b></button>`).join("")}
    </div>
  </div>`;

  // guarded fuel vent
  const vent = `<div class="ped-mod ped-vent">
    <span class="ped-lbl">FUEL VENT</span>
    <div class="ventwell">
      <button class="ventbtn" ${CTL.guard ? "" : "disabled"} onclick="ventFuel()">VENT<small>−5 FUEL</small></button>
      <div class="guard${CTL.guard ? " up" : ""}" onclick="ventGuard()">GUARD</div>
    </div>
    <span class="ped-foot">${CTL.guard ? '<b class="low">ARMED</b> — cover open' : "cover closed · " + Math.floor(S.fuel) + " aboard"}</span>
  </div>`;

  // comms tuner
  const cr = channelReadout();
  const bars = Array.from({ length: 9 }, (_, i) => {
    const h = 15 + (chanHash(CTL.chan + ":" + S.day + ":" + i) % 86);
    const on = i / 9 < cr.sig;
    return `<i style="height:${on ? h : 8}%;background:${on ? "var(--green)" : "#23272f"}"></i>`;
  }).join("");
  const comms = `<div class="ped-mod ped-comms">
    <span class="ped-lbl">COMMS — TRANSCEIVER</span>
    <div class="comms-row">
      <div class="knob" onclick="commsTune()" title="Tune to next channel" style="--deg:${CTL.chan * 64 - 96}deg">
        <div class="ptr"><i></i></div><div class="cap"></div>
      </div>
      <div class="comms-read">
        <div class="cr-ch">CH ${CTL.chan + 1} · ${CHANNELS[CTL.chan]}</div>
        <div class="cr-txt">${cr.txt}</div>
        <div class="sigbars">${bars}</div>
      </div>
    </div>
  </div>`;

  return `<div class="pedestal">${throttle}${burn}${bay}${vent}${comms}</div>`;
}

// ---- v2 harvested panels: reactor knobs, life support, comms transceiver ----

export function reactorPanelHTML(): string {
  const st = stats();
  const online = st.powerOut > 0;
  const drawPct = st.powerOut ? Math.min(100, Math.round((st.powerUse / st.powerOut) * 100)) : 0;
  const heatPct = Math.min(100, Math.round(drawPct * 0.6));
  const drawClr = drawPct > 90 ? "var(--red)" : drawPct > 70 ? "var(--amber)" : "var(--green)";
  const heatClr = heatPct > 70 ? "var(--red)" : heatPct > 50 ? "var(--amber)" : "#5aa7ff";
  const outPct = online ? Math.round((st.powerOut / (st.powerOut + 4)) * 100) : 0;
  // Decorative knob positions derived from actual state
  const engDeg = Math.round((st.speed / 12) * 240 - 120);
  const shdDeg = Math.round((st.shield / 4) * 240 - 120);
  const wpnDeg = Math.round((st.dmg / 8) * 240 - 120);
  const knobs = [
    { name: "ENG", deg: engDeg, clr: "var(--amber)", val: st.speed + " u/d" },
    { name: "SHD", deg: shdDeg, clr: "var(--blue)", val: "−" + st.shield + "/hit" },
    { name: "WPN", deg: wpnDeg, clr: "var(--red)", val: "~" + st.dmg + " dmg" },
  ];
  return `<div class="panel v2-reactor" style="--engine-core:url('${engineCoreUrl}')">
    <div class="v2-head"><span>REACTOR &amp; POWER</span><span class="v2-tag ${online ? "on" : "off"}">${online ? "ONLINE" : "OFFLINE"}</span></div>
    <div class="v2-slider-row">
      <span class="v2-slbl">OUTPUT</span><span class="v2-sval">${st.powerOut}⚡</span>
    </div>
    <div class="v2-slider">
      <div class="v2-sfill" style="width:${outPct}%"></div>
      <div class="v2-sthumb" style="left:${outPct}%"></div>
    </div>
    <div class="v2-bars">
      <div class="v2-bar"><div class="v2-blbl"><span>DRAW</span><span>${st.powerUse}/${st.powerOut}</span></div><div class="v2-btrack"><div class="v2-bfill" style="width:${drawPct}%;background:${drawClr}"></div></div></div>
      <div class="v2-bar"><div class="v2-blbl"><span>HEAT</span><span>${heatPct}%</span></div><div class="v2-btrack"><div class="v2-bfill" style="width:${heatPct}%;background:${heatClr}"></div></div></div>
    </div>
    <div class="v2-knobs">
      ${knobs.map((k) => `<div class="v2-knob-group">
        <div class="v2-knob" style="--deg:${k.deg}deg">
          <div class="v2-knurl"></div>
          <div class="v2-kptr"><i style="background:${k.clr};box-shadow:0 0 6px ${k.clr}"></i></div>
          <div class="v2-kcap"></div>
        </div>
        <span class="v2-kname">${k.name}</span>
        <span class="v2-kval" style="color:${k.clr}">${k.val}</span>
      </div>`).join("")}
    </div>
  </div>`;
}

export function lifeSupportHTML(): string {
  const st = stats();
  const o2 = Math.min(100, Math.max(0, Math.round(80 + st.foodGen * 4)));
  const co2 = Math.max(200, Math.min(2000, Math.round(800 - st.foodGen * 120)));
  const co2Pct = Math.min(100, Math.round((co2 / 2000) * 100));
  const co2Clr = co2 > 1200 ? "var(--red)" : co2 > 800 ? "var(--amber)" : "var(--green)";
  const scrubOn = st.intact("hydro") > 0;
  const tempDeg = 42; // decorative — ~21°C position
  return `<div class="panel v2-lifesup">
    <div class="v2-head"><span>LIFE SUPPORT</span></div>
    <div class="v2-lsbars">
      <div class="v2-lsbar">
        <div class="v2-blbl"><span>O2 RESERVE</span><span style="color:var(--blue)">${o2}%</span></div>
        <div class="v2-lstrack"><div class="v2-lsfill o2" style="width:${o2}%"></div></div>
      </div>
      <div class="v2-lsbar">
        <div class="v2-blbl"><span>CO2 PPM</span><span style="color:${co2Clr}">${co2}</span></div>
        <div class="v2-lstrack"><div class="v2-lsfill" style="width:${co2Pct}%;background:${co2Clr}"></div></div>
      </div>
    </div>
    <div class="v2-ls-row">
      <div class="v2-knob-group">
        <div class="v2-knob lg" style="--deg:${tempDeg}deg">
          <div class="v2-knurl"></div>
          <div class="v2-kptr"><i style="background:var(--amber);box-shadow:0 0 6px var(--amber)"></i></div>
          <div class="v2-kcap"></div>
        </div>
        <span class="v2-kname">CABIN TEMP</span>
        <span class="v2-kval" style="color:var(--amber)">21°C</span>
      </div>
      <div class="v2-ls-readouts">
        <div class="v2-ls-boxes">
          <div class="v2-lsbox"><span class="v2-lsbox-k">PRESS</span><span class="v2-lsbox-v">1.02 atm</span></div>
          <div class="v2-lsbox"><span class="v2-lsbox-k">HUMID</span><span class="v2-lsbox-v">41%</span></div>
        </div>
        <button class="v2-scrub ${scrubOn ? "on" : ""}" disabled>${scrubOn ? "● CO2 SCRUBBER ACTIVE" : "○ SCRUBBER OFFLINE"}</button>
        <div class="v2-scrub-led"><span class="v2-led ${scrubOn ? "green" : "dim"}"></span><span>${scrubOn ? "NOMINAL — CYCLING" : "NO HYDROPONICS MODULE"}</span></div>
      </div>
    </div>
  </div>`;
}

export function commsFullHTML(): string {
  const cr = channelReadout();
  const bars = Array.from({ length: 9 }, (_, i) => {
    const h = 20 + (chanHash(CTL.chan + ":" + S.day + ":" + i) % 80);
    const on = i / 9 < cr.sig;
    return `<div class="v2-sigbar" style="height:${on ? h : 10}%;background:${on ? "var(--blue)" : "#23272f"}"></div>`;
  }).join("");
  return `<div class="panel v2-comms">
    <div class="v2-head"><span>COMMS — TRANSCEIVER</span></div>
    <div class="v2-comms-row">
      <div class="v2-knob-group">
        <div class="v2-knob xl" onclick="commsTune()" title="Tune to next channel" style="--deg:${CTL.chan * 64 - 96}deg">
          <div class="v2-knurl"></div>
          <div class="v2-kptr blue"><i></i></div>
          <div class="v2-kcap"></div>
        </div>
        <span class="v2-kname">CHANNEL</span>
      </div>
      <div class="v2-comms-read">
        <div class="v2-readbox"><span class="v2-readbox-k">CH ${CTL.chan + 1}</span><span class="v2-readbox-v">${CHANNELS[CTL.chan]}</span></div>
        <div class="v2-sigbars">${bars}</div>
        <div class="v2-comms-btns">
          <button class="v2-combtn">MON</button>
          <button class="v2-combtn ptt">PTT · XMIT</button>
        </div>
      </div>
    </div>
  </div>`;
}
