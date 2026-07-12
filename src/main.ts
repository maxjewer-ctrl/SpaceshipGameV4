import "./style.css";
import { setRender, requestRender } from "./bus";
import { render, nav, masterCaution } from "./ui/render";
import { loadSaved, setState, log } from "./state";
import * as State from "./state";
import { closeModal } from "./modal";
import { selSlot, shipView, shipConsole, shipFlip } from "./ui/ship";
import { plotCourse, goModule, launchOpen, launchPress, launchGuard, launchGoto, launchAuto, dockPress, auxFlip, bigRed } from "./ui/bridge";
import { peelNote } from "./ui/notes";
import {
  setThrottle, throttleLive, bayToggle, jettisonGood, ventGuard, ventFuel,
  commsTune, engageBurn,
} from "./ui/cockpit";
import { selPlanet } from "./ui/map";
import { ptab } from "./ui/planet";
import { showHelp, confirmNewGame, newGame, intro, startGame } from "./ui/help";
import { acceptMission, hire, bayForJob } from "./systems/market";
import {
  toggleMod, repairSystems, fireCrew, buyGood, sellGood, buyFuel, buyFood,
  repairShip, buyMod, sellMod, upgradeEngine, buySlots, hoseStart, hoseStop,
} from "./systems/actions";
import { depart, waitDay, advanceDay } from "./systems/travel";
import { startCombat, cAct, cSwitch, cFire, endCombat } from "./systems/combat";
import {
  pirateWin, pirateLoseFlee, pirateFlee, pirateBribe, pirateSurrender,
  patrolBribe, patrolRun, patrolSubmit,
  distressHelp, distressIgnore, traderBuy, traderSell, paxMerchantSell, adriftTow,
} from "./systems/events";
import {
  arcMeet, arcAcceptCrate, arcAcceptVoss, arcStartRun, arcRunGuard, arcRunArm,
  ambushHandOver, ambushFight, ambushRun,
  hunterWin, hunterFled, hunterRun, interceptWin, interceptFled,
} from "./systems/arc";
import { riderFight } from "./systems/scheduler";
import { sceneChoose, sceneContinue } from "./systems/scene";
import {
  silDescend, silBearing, silAnswer, silStill, silSell,
  silBoardReturned, silScanReturned, silLearnNumbers, silLearnReturned,
} from "./systems/silence";
import { pressStart, pressEnd, interact, debugStep, debugPos, debugGoto } from "./ui/walk";
import { crewTalk, crewHighlight } from "./ui/shipwalk";
import { wkPay, wkTalk, wkFight } from "./systems/walkEncounters";
import { ctVibe, ctAbout, ctShip, ctQuest, ctClose, ctQuestHelp, ctQuestSkip } from "./systems/crewtalk";
import { loadRemoteContent } from "./supabase/content";

setRender(render);

// The UI is string-templated with inline onclick handlers (transitional from
// the single-file prototype), so every handler reachable from HTML must be a
// global. This is the single registry of that surface.
Object.assign(window as any, {
  // navigation & screens
  nav, ptab, selSlot, selPlanet, closeModal, log, shipView, shipConsole, shipFlip, masterCaution,
  // bridge action board + launch/docking sequences + the aux panel
  plotCourse, goModule, launchOpen, launchPress, launchGuard, launchGoto, launchAuto, dockPress, bayForJob,
  auxFlip, bigRed, peelNote,
  // fuel hose
  hoseStart, hoseStop,
  // cockpit pedestal — physical controls
  setThrottle, throttleLive, bayToggle, jettisonGood, ventGuard, ventFuel,
  commsTune, engageBurn,
  // meta
  showHelp, confirmNewGame, newGame, intro, startGame,
  // planet actions
  acceptMission, hire, fireCrew, buyGood, sellGood, buyFuel, buyFood,
  repairShip, repairSystems, buyMod, sellMod, toggleMod, upgradeEngine, buySlots,
  // travel
  depart, waitDay, advanceDay,
  // combat
  startCombat, cAct, cSwitch, cFire, endCombat,
  // events
  pirateWin, pirateLoseFlee, pirateFlee, pirateBribe, pirateSurrender,
  patrolBribe, patrolRun, patrolSubmit,
  distressHelp, distressIgnore, traderBuy, traderSell, paxMerchantSell, adriftTow,
  // story arc
  arcMeet, arcAcceptCrate, arcAcceptVoss, arcStartRun, arcRunGuard, arcRunArm,
  ambushHandOver, ambushFight, ambushRun,
  hunterWin, hunterFled, hunterRun, interceptWin, interceptFled,
  // consequence scheduler
  riderFight,
  // station scenes (dialogue-tree modal choices)
  sceneChoose, sceneContinue,
  // the Long Silence
  silDescend, silBearing, silAnswer, silStill, silSell,
  silBoardReturned, silScanReturned, silLearnNumbers, silLearnReturned,
  // free-roam walking: D-pad/keyboard fallback buttons, crew chat, foot encounters
  walkPressStart: pressStart, walkPressEnd: pressEnd, walkInteract: interact,
  crewTalk, crewHighlight, wkPay, wkTalk, wkFight,
  // crew dialogue — trust-gated topics, personal quests
  ctVibe, ctAbout, ctShip, ctQuest, ctClose, ctQuestHelp, ctQuestSkip,
  // dev/debug: live state accessor + manual walk-frame stepper (harmless — behind underscores)
  __S: () => State.S,
  __walkStep: debugStep,
  __walkPos: debugPos,
  __walkGoto: debugGoto,
});

// TAB flips the console wall between instruments and the service-side
// wiring while the Ship screen is up. Leave the key alone when a modal is
// open or the player is typing (ship-name field, etc.).
document.addEventListener("keydown", (e) => {
  if (e.key !== "Tab" || !State.S || State.S.screen !== "ship") return;
  const t = e.target as HTMLElement | null;
  if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
  if (document.getElementById("overlay")?.classList.contains("show")) return;
  e.preventDefault();
  shipFlip();
});

// ---- boot ----
// Hot-load content from Supabase if configured (offline-first: this is a no-op
// when there are no credentials, and falls back to bundled JSON on any error).
loadRemoteContent().then((changed) => { if (changed) requestRender(); });

const saved = loadSaved();
if (saved) {
  setState(saved);
  requestRender();
  log("— Session restored. Welcome back, Captain. —");
  requestRender();
} else {
  intro();
}
