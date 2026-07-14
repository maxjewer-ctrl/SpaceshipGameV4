import { S, save } from "../state";
import { PLANETS } from "../content";
import { stats, foodPerDay, isSilenced } from "../derive";
import { fmt, $ } from "../util";
import { requestRender } from "../bus";
import { modal } from "../modal";
import { refreshMarket } from "../systems/market";
import { shipHTML, captainsLogHTML } from "./ship";
import { mapHTML } from "./map";
import { planetHTML } from "./planet";
import { travelHTML } from "./travel";
import { buildStationScene } from "./stationwalk";
import { buildDesertTownScene } from "./planetwalk";
import { buildShipScene, crewRosterHTML } from "./shipwalk";
import { buildZoneScene, zoneActive } from "./zonewalk";
import * as walk from "./walk";
import * as sfx from "../audio";
import { actionAttr } from "../dispatch";

const WALK_SCREENS = ["stationwalk", "shipwalk", "zone"];

// Screen swaps used to be a hard cut (innerHTML replaced synchronously, same
// frame). Now the outgoing screen gets a brief exit fade/slide, THEN the
// state actually changes and the incoming screen fades/slides in — so
// switching consoles reads as a transition, not a jump. Safe to defer: nav()
// is only ever invoked from onclick handlers, never chained with code that
// expects S.screen to have changed by the time nav() returns.
const NAV_ANIM_MS = 110;
let navAnimTimer: number | null = null;

export function nav(scr: string) {
  sfx.uiClick();
  const main = document.getElementById("main");
  const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const finish = () => {
    if (WALK_SCREENS.includes(S.screen) && !WALK_SCREENS.includes(scr)) { walk.teardown(); sfx.walkExit(); }
    S.screen = scr;
    if (scr === "planet") refreshMarket();
    requestRender();
    const m = document.getElementById("main");
    if (m) { m.classList.remove("screen-enter"); void m.offsetWidth; m.classList.add("screen-enter"); }
  };
  if (main && !reduced) {
    if (navAnimTimer !== null) clearTimeout(navAnimTimer);
    main.classList.add("screen-exit");
    navAnimTimer = window.setTimeout(() => { main.classList.remove("screen-exit"); navAnimTimer = null; finish(); }, NAV_ANIM_MS);
  } else {
    finish();
  }
}

export function render() {
  if (!S) return;
  renderTop();
  renderNav();
  renderTicker();
  renderMain();
  renderSide();
  sfx.update({
    travel: !!S.travel,
    hullPct: S.hull / S.hullMax,
    cautionKey: cautions().map((c) => c.t).join('|'),
  });
  save();
}

// ---- master caution: every live warning on the boat, worst first ----
type Caution = { t: string; crit: boolean };
export function cautions(): Caution[] {
  const st = stats();
  const out: Caution[] = [];
  const dmg = S.modules.filter((m) => m.dmg).length;
  if (S.hull < 40) out.push({ t: `HULL INTEGRITY ${Math.round((S.hull / S.hullMax) * 100)}%`, crit: true });
  if (dmg) out.push({ t: `${dmg} SYSTEM${dmg > 1 ? "S" : ""} DAMAGED — REPAIR REQUIRED`, crit: true });
  if (st.powerUse > st.powerOut) out.push({ t: "REACTOR OVERDRAW — SHED LOAD", crit: true });
  if (S.fuel < st.fuelDay * 2) out.push({ t: `FUEL RESERVE LOW — ${Math.floor(S.fuel)} UNITS`, crit: S.fuel < st.fuelDay });
  if (S.food < foodPerDay() * 2) out.push({ t: `PROVISIONS LOW — ${Math.floor(S.food)} RATIONS`, crit: S.food < foodPerDay() });
  if (S.arc.stage === 5 && S.arc.deadline) out.push({ t: `RUN DEADLINE — DAY ${S.arc.deadline}`, crit: S.arc.deadline - S.day <= 2 });
  if ((S.flags.injuredUntil ?? 0) > S.day) out.push({ t: `CAPTAIN INJURED — REDUCED VITALITY TIL DAY ${S.flags.injuredUntil}`, crit: false });
  return out.sort((a, b) => +b.crit - +a.crit);
}

// Acknowledging silences the flasher until the caution set changes.
let cautionAck = "";
export function masterCaution() {
  const cs = cautions();
  cautionAck = cs.map((c) => c.t).join("|");
  sfx.uiClick();
  sfx.ackAlarm();
  modal(`<h2>⚠ Master Caution</h2>
    ${cs.length ? cs.map((c) => `<div class="logline" style="border-left-color:${c.crit ? "var(--red)" : "var(--amber)"};color:${c.crit ? "var(--red)" : "var(--amber)"}">${c.t}</div>`).join("")
      : '<p class="dim">All systems nominal. The board is dark, Captain.</p>'}
    <div class="choices"><button class="primary" ${actionAttr("closeModal")}>ACKNOWLEDGE</button></div>`);
  requestRender();
}

function pill(k: string, v: string | number, tone: string, title: string) {
  return `<span class="pill" title="${title || ""}"><span class="pk">${k}</span><span class="pv ${tone}">${v}</span></span>`;
}

function renderTop() {
  const st = stats();
  const loc = S.travel ? `→ ${PLANETS[S.travel.dest].n.toUpperCase()}` : PLANETS[S.loc].n.toUpperCase();
  const reg = "KR-" + (((S.seed >>> 0) % 8999) + 1000);
  const run = S.arc.stage === 5 && S.arc.deadline ? pill("RUN", "DAY " + S.arc.deadline, "low", "Deadline") : "";
  $("topbar").innerHTML =
    `<span class="brand"><span class="brand-diamond"><i></i></span>
      <span class="brand-text"><span class="bt-name">${S.shipName}</span><br><span class="bt-reg">CAPT. ${(S.captainName || "").toUpperCase()} · REG ${reg}</span></span>
    </span>
    <span class="pills">` +
    pill("CR", fmt(S.credits), S.credits < 100 ? "low" : "amber", "Credits") +
    pill("FUEL", Math.floor(S.fuel) + "/" + st.fuelCap, S.fuel < 10 ? "low" : "", "Fuel (burn " + st.fuelDay + "/day in flight)") +
    pill("FOOD", Math.floor(S.food), S.food < foodPerDay() * 2 ? "low" : "", "Food (" + foodPerDay() + "/day eaten, +" + st.foodGen + " grown)") +
    pill("HULL", Math.round(S.hull) + "/" + S.hullMax, S.hull < 40 ? "low" : "green", "Hull") +
    pill("PWR", st.powerUse + "/" + st.powerOut, S.modules.some((m) => m.dmg) ? "low" : "blue", "Reactor power: drawn/output — red means damaged systems aboard") +
    pill("PRTG", S.prestige, "", "Prestige — reputation as a captain") +
    pill("DAY", S.day, "", "") +
    pill("LOC", loc, "blue", "Current position") + run +
    `</span>`;
}

function renderNav() {
  const b = (id: string, label: string, on?: boolean, dis?: boolean) =>
    `<button class="${on ? "tab-on" : ""}" ${dis ? "disabled" : ""} ${actionAttr("nav", id)}><span class="navdot"></span>${label}</button>`;
  const cs = cautions();
  const lit = cs.length > 0 && cautionAck !== cs.map((c) => c.t).join("|");
  // No direct shortcut into the cantina/market/yard screen: the station deck
  // is the only door in. Walk to the room, then through it.
  $("nav").innerHTML =
    b("ship", "Ship", S.screen === "ship") +
    b("shipwalk", "Walk Ship", S.screen === "shipwalk") +
    b("map", "Star Map", S.screen === "map") +
    (S.docked && S.loc !== "gate" && S.loc !== "anechoic" ? b("stationwalk", isSilenced(S.loc) ? "Station (dark)" : "Station", S.screen === "stationwalk") : "") +
    (S.travel ? b("travel", "In Transit", S.screen === "travel") : "") +
    `<span class="right">
      <button class="mcaution${lit ? " lit" : ""}" ${actionAttr("masterCaution")}>⚠ MASTER CAUTION</button>
      <button ${actionAttr("openSaves")}>💾 Saves</button>
      <button ${actionAttr("showHelp")}>? Help</button>
      <button class="danger" ${actionAttr("confirmNewGame")}>New Game</button>
    </span>`;
}

// Alarm ticker: worst live caution, else the latest log line, else quiet band.
function renderTicker() {
  const cs = cautions();
  const el = $("ticker");
  if (cs.length) {
    el.className = cs[0].crit ? "crit" : "warn";
    el.innerHTML = `<span class="tdot"></span><span class="ttext">${cs[0].t}${cs.length > 1 ? ` · +${cs.length - 1} MORE` : ""}</span>`;
  } else {
    const last = S.logLines[0];
    el.className = "";
    el.innerHTML = `<span class="tdot"></span><span class="ttext">${last ? `D${last.d} · ${last.m}` : "ALL SYSTEMS NOMINAL — CHANNEL QUIET"}</span>`;
  }
}

function renderMain() {
  const m = $("main");
  if (S.screen === "ship") m.innerHTML = shipHTML();
  else if (S.screen === "map") m.innerHTML = mapHTML();
  else if (S.screen === "stationwalk") {
    const scene = S.loc === "dustwell" ? buildDesertTownScene() : buildStationScene();
    if (walk.needsMount(scene.id)) m.innerHTML = walk.mountHTML(scene);
    walk.ensureRunning(scene);
  } else if (S.screen === "shipwalk") {
    const scene = buildShipScene();
    if (walk.needsMount(scene.id)) m.innerHTML = walk.mountHTML(scene);
    walk.ensureRunning(scene);
  } else if (S.screen === "zone") {
    if (!zoneActive()) { S.screen = "ship"; m.innerHTML = shipHTML(); return; }
    const scene = buildZoneScene();
    if (walk.needsMount(scene.id)) m.innerHTML = walk.mountHTML(scene);
    walk.ensureRunning(scene);
  } else if (S.screen === "planet") m.innerHTML = planetHTML();
  else if (S.screen === "travel") m.innerHTML = travelHTML();
}

function renderSide() {
  // On the ship screen the log lives at the top of the cockpit's right
  // console instead — hide the standalone sidebar so it isn't shown twice.
  // On the walk-the-decks screen, the roster replaces the log — you're down
  // there to see your people, not to reread what already happened.
  const side = $("side");
  if (S.screen === "ship") {
    side.style.display = "none";
    side.innerHTML = "";
  } else if (S.screen === "shipwalk") {
    side.style.display = "";
    side.innerHTML = crewRosterHTML();
  } else {
    side.style.display = "";
    side.innerHTML = captainsLogHTML();
  }
}
