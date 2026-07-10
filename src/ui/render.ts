import { S, save } from "../state";
import { PLANETS } from "../content";
import { stats, foodPerDay, isSilenced } from "../derive";
import { fmt, $ } from "../util";
import { requestRender } from "../bus";
import { refreshMarket } from "../systems/market";
import { shipHTML } from "./ship";
import { mapHTML } from "./map";
import { planetHTML } from "./planet";
import { travelHTML } from "./travel";
import { buildStationScene } from "./stationwalk";
import { buildShipScene } from "./shipwalk";
import * as walk from "./walk";

const WALK_SCREENS = ["stationwalk", "shipwalk"];

export function nav(scr: string) {
  if (WALK_SCREENS.includes(S.screen) && !WALK_SCREENS.includes(scr)) walk.teardown();
  S.screen = scr;
  if (scr === "planet") refreshMarket();
  requestRender();
}

export function render() {
  if (!S) return;
  renderTop();
  renderNav();
  renderMain();
  renderSide();
  save();
}

function stat(icon: string, val: string | number, isLow: boolean, title: string) {
  return `<span class="stat" title="${title || ""}">${icon} <b class="${isLow ? "low" : ""}">${val}</b></span>`;
}

function renderTop() {
  const st = stats();
  const loc = S.travel ? `→ ${PLANETS[S.travel.dest].n}` : PLANETS[S.loc].n;
  const run = S.arc.stage === 5 && S.arc.deadline ? ` <span class="low">◆ RUN: day ${S.arc.deadline} deadline</span>` : "";
  $("topbar").innerHTML =
    `<span class="ship-name">☄ ${S.shipName}</span>` +
    stat("💰", fmt(S.credits) + "cr", S.credits < 100, "Credits") +
    stat("⛽", Math.floor(S.fuel) + "/" + st.fuelCap, S.fuel < 10, "Fuel (burn " + st.fuelDay + "/day in flight)") +
    stat("🍞", Math.floor(S.food), S.food < foodPerDay() * 2, "Food (" + foodPerDay() + "/day eaten, +" + st.foodGen + " grown)") +
    stat("🛠", Math.round(S.hull) + "/" + S.hullMax, S.hull < 40, "Hull") +
    stat("⚡", st.powerUse + "/" + st.powerOut, S.modules.some((m) => m.dmg), "Reactor power: drawn/output — red means damaged systems aboard") +
    stat("⭐", S.prestige, false, "Prestige — reputation as a captain") +
    stat("📅", "Day " + S.day, false, "") +
    `<span class="stat dim">📍 ${loc}</span>` + run;
}

function renderNav() {
  const b = (id: string, label: string, on?: boolean, dis?: boolean) =>
    `<button class="${on ? "tab-on" : ""}" ${dis ? "disabled" : ""} onclick="nav('${id}')">${label}</button>`;
  // No direct shortcut into the cantina/market/yard screen: the station deck
  // is the only door in. Walk to the room, then through it.
  $("nav").innerHTML =
    b("ship", "🚀 Ship", S.screen === "ship") +
    b("shipwalk", "🧑‍🚀 Walk Ship", S.screen === "shipwalk") +
    b("map", "🗺 Star Map", S.screen === "map") +
    (S.docked && S.loc !== "gate" && S.loc !== "anechoic" ? b("stationwalk", isSilenced(S.loc) ? "🛰 Station (dark)" : "🛰 Station", S.screen === "stationwalk") : "") +
    (S.travel ? b("travel", "🌌 In Transit", S.screen === "travel") : "") +
    `<span class="right">
      <button onclick="showHelp()">? Help</button>
      <button class="danger" onclick="confirmNewGame()">New Game</button>
    </span>`;
}

function renderMain() {
  const m = $("main");
  if (S.screen === "ship") m.innerHTML = shipHTML();
  else if (S.screen === "map") m.innerHTML = mapHTML();
  else if (S.screen === "stationwalk") {
    const scene = buildStationScene();
    if (walk.needsMount(scene.id)) m.innerHTML = walk.mountHTML(scene);
    walk.ensureRunning(scene);
  } else if (S.screen === "shipwalk") {
    const scene = buildShipScene();
    if (walk.needsMount(scene.id)) m.innerHTML = walk.mountHTML(scene);
    walk.ensureRunning(scene);
  } else if (S.screen === "planet") m.innerHTML = planetHTML();
  else if (S.screen === "travel") m.innerHTML = travelHTML();
}

function renderSide() {
  $("side").innerHTML = `<div class="panel"><h3>Captain's Log</h3>
    ${S.logLines.map((l) => `<div class="logline${l.bark ? " bark" : ""}"><b>D${l.d}</b> ${l.m}</div>`).join("") || '<div class="dim">Nothing yet.</div>'}
  </div>`;
}
