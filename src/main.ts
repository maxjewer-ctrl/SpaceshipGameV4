import "./style.css";
import { setRender, requestRender } from "./bus";
import { render, nav, masterCaution } from "./ui/render";
import { loadSaved, setState, log } from "./state";
import * as State from "./state";
import { closeModal } from "./modal";
import { selSlot, shipView, shipConsole } from "./ui/ship";
import { plotCourse } from "./ui/bridge";
import {
  setThrottle, throttleLive, bayToggle, jettisonGood, ventGuard, ventFuel,
  commsTune, engageBurn,
} from "./ui/cockpit";
import { selPlanet } from "./ui/map";
import { ptab } from "./ui/planet";
import { showHelp, confirmNewGame, newGame, intro, startGame } from "./ui/help";
import { acceptMission, hire } from "./systems/market";
import {
  toggleMod, repairSystems, fireCrew, buyGood, sellGood, buyFuel, buyFood,
  repairShip, buyMod, sellMod, upgradeEngine, buySlots,
} from "./systems/actions";
import { depart, waitDay, advanceDay } from "./systems/travel";
import { startCombat, cAct, endCombat } from "./systems/combat";
import {
  pirateWin, pirateLoseFlee, pirateFlee, pirateBribe, pirateSurrender,
  patrolBribe, patrolRun, patrolSubmit,
  distressHelp, distressIgnore, traderBuy, traderSell, paxMerchantSell, adriftTow,
} from "./systems/events";
import {
  arcMeet, arcAcceptCrate, arcAcceptVoss, arcStartRun,
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
  nav, ptab, selSlot, selPlanet, closeModal, log, shipView, shipConsole, masterCaution, plotCourse,
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
  startCombat, cAct, endCombat,
  // events
  pirateWin, pirateLoseFlee, pirateFlee, pirateBribe, pirateSurrender,
  patrolBribe, patrolRun, patrolSubmit,
  distressHelp, distressIgnore, traderBuy, traderSell, paxMerchantSell, adriftTow,
  // story arc
  arcMeet, arcAcceptCrate, arcAcceptVoss, arcStartRun,
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
