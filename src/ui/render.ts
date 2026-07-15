import { PLANETS } from "../content";
import { actionAttr } from "../dispatch";
import { modal } from "../modal";
import { S, save } from "../state";
import { currentObjectiveData } from "../systems/intro";
import { refreshMarket } from "../systems/market";
import { requestRender } from "../bus";
import * as sfx from "../audio";
import * as walk from "./walk";
import { commandConsoleHTML } from "./commandConsole";
import { cautions } from "./cautions";
import { mapHTML } from "./map";
import { planetHTML } from "./planet";
import { buildDesertTownScene } from "./planetwalk";
import { buildShipScene } from "./shipwalk";
import { buildStationScene } from "./stationwalk";
import { travelHTML } from "./travel";
import { buildZoneScene, zoneActive } from "./zonewalk";

const WALK_SCREENS = ["stationwalk", "shipwalk", "zone"];
const NAV_ANIM_MS = 110;
let navAnimTimer: number | null = null;
let cautionAck = "";

export function nav(screen: string) {
  sfx.uiClick();
  const main = document.getElementById("main");
  const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const finish = () => {
    if (WALK_SCREENS.includes(S.screen) && !WALK_SCREENS.includes(screen)) { walk.teardown(); sfx.walkExit(); }
    S.screen = screen;
    if (screen === "planet") refreshMarket();
    requestRender();
    document.getElementById("main")?.classList.add("screen-enter");
  };
  if (main && !reduced) {
    if (navAnimTimer !== null) clearTimeout(navAnimTimer);
    main.classList.add("screen-exit");
    navAnimTimer = window.setTimeout(() => {
      main.classList.remove("screen-exit");
      navAnimTimer = null;
      finish();
    }, NAV_ANIM_MS);
  } else finish();
}

export function masterCaution() {
  const alerts = cautions();
  cautionAck = alerts.map((alert) => alert.t).join("|");
  sfx.uiClick();
  sfx.ackAlarm();
  modal(`<div class="modal-context">CAPTAIN'S CHAIR · DIAGNOSTICS</div><h2>Master Caution</h2>
    ${alerts.length ? alerts.map((alert) => `<div class="logline" style="border-left-color:${alert.crit ? "var(--red)" : "var(--amber)"};color:${alert.crit ? "var(--red)" : "var(--amber)"}">${alert.t}</div>`).join("") : '<p class="dim">All systems nominal.</p>'}
    <div class="choices"><button class="primary" ${actionAttr("closeModal")}>Acknowledge</button></div>`);
  requestRender();
}

export function showHudCaution() {
  modal(`<div class="modal-context">SHIPBOARD WARNING</div><h2>Master caution active</h2>
    <p>The warning board has a live condition. Sit in the captain's chair to review diagnostics and acknowledge it.</p>
    <div class="choices"><button class="primary" ${actionAttr("closeModal")}>Understood</button></div>`);
}

function objectiveLine(): string {
  const objective = currentObjectiveData();
  if (objective) return `${objective.title} · ${objective.detail}`;
  if (S.travel) return `Hold course for ${PLANETS[S.travel.dest].n} · ${S.travel.left}d remaining`;
  if (S.jobs[0]) return `${S.jobs[0].title} · ${PLANETS[S.jobs[0].dest].n}`;
  return S.docked ? `Find work or provision at ${PLANETS[S.loc].n}` : "Return to the captain's chair";
}

function renderHud() {
  const hud = document.getElementById("hud")!;
  if (!WALK_SCREENS.includes(S.screen)) {
    hud.className = "";
    hud.innerHTML = "";
    return;
  }
  const alerts = cautions();
  const lit = alerts.length > 0 && cautionAck !== alerts.map((alert) => alert.t).join("|");
  const location = S.screen === "shipwalk" ? S.shipName : PLANETS[S.loc].n;
  hud.className = "walk-hud";
  hud.innerHTML = `<div class="hud-objective"><span>OBJECTIVE</span><b>${objectiveLine()}</b></div>
    <div class="hud-status"><span>DAY ${S.day}</span><b>${location}</b>${alerts.length ? `<button class="hud-caution${lit ? " lit" : ""}" ${actionAttr("showHudCaution")}>CAUTION</button>` : ""}<button class="hud-pause" ${actionAttr("showPauseMenu")}>Pause</button></div>`;
}

function renderMain() {
  const main = document.getElementById("main")!;
  if (S.screen === "ship") main.innerHTML = commandConsoleHTML();
  else if (S.screen === "map") main.innerHTML = mapHTML();
  else if (S.screen === "travel") main.innerHTML = travelHTML();
  else if (S.screen === "planet") main.innerHTML = planetHTML();
  else if (S.screen === "stationwalk") {
    const scene = S.loc === "dustwell" ? buildDesertTownScene() : buildStationScene();
    if (walk.needsMount(scene.id)) main.innerHTML = walk.mountHTML(scene);
    walk.ensureRunning(scene);
  } else if (S.screen === "shipwalk") {
    const scene = buildShipScene();
    if (walk.needsMount(scene.id)) main.innerHTML = walk.mountHTML(scene);
    walk.ensureRunning(scene);
  } else if (S.screen === "zone") {
    if (!zoneActive()) { S.screen = "shipwalk"; main.innerHTML = walk.mountHTML(buildShipScene()); return; }
    const scene = buildZoneScene();
    if (walk.needsMount(scene.id)) main.innerHTML = walk.mountHTML(scene);
    walk.ensureRunning(scene);
  }
}

export function render() {
  if (!S) return;
  renderHud();
  renderMain();
  sfx.update({
    travel: !!S.travel,
    hullPct: S.hull / S.hullMax,
    cautionKey: cautions().map((alert) => alert.t).join("|"),
  });
  save();
}
