import "./style.css";
import { setRender, requestRender } from "./bus";
import { render, nav, masterCaution } from "./ui/render";
import { loadSaved, setState, log } from "./state";
import * as State from "./state";
import { closeModal } from "./modal";
import { selSlot, shipView } from "./ui/ship";
import {
  setThrottle, throttleLive, bayToggle, jettisonGood, ventGuard, ventFuel,
  commsTune, engageBurn,
} from "./ui/cockpit";
import { selPlanet } from "./ui/map";
import { ptab } from "./ui/planet";
import { showHelp, confirmNewGame, newGame, intro, startGame } from "./ui/help";
import { introStart, introAct } from "./systems/intro";
import {
  openCreator, avName, avRandomName, avFace, avHead, avGarb, avSkin, avSuit, avTrim, avStart,
} from "./ui/avatar";
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
  runPicketAround, runPicketThread, runNetDecoy, runNetSilent, runNetPush,
} from "./systems/arc";
import { riderFight } from "./systems/scheduler";
import { sceneChoose, sceneContinue } from "./systems/scene";
import {
  silDescend, silBearing, silAnswer, silStill, silSell,
  silBoardReturned, silScanReturned, silLearnNumbers, silLearnReturned,
} from "./systems/silence";
import { pressStart, pressEnd, interact, debugStep, debugPos, debugGoto, debugActors } from "./ui/walk";
import { crewTalk, crewHighlight, wkInspect, walkDeck, sitChair } from "./ui/shipwalk";
import { wkPay, wkTalk, wkFight } from "./systems/walkEncounters";
import { ctVibe, ctAbout, ctShip, ctQuest, ctWorld, ctClose, ctQuestHelp, ctQuestSkip } from "./systems/crewtalk";
import { dcValve, dcVector, dcCare } from "./systems/damagecontrol";
import { refitShip } from "./systems/wear";
import {
  abVexPay, abVexRefuse, abVexReport,
  abCorbinConfront, abCorbinCut, abCorbinIgnore,
  abRookTalk, abRookDark, abRookConfront,
  abNylaConfront, abNylaAsk, abNylaIgnore,
  abMiriEnd, abMiriKeep,
} from "./systems/agendabeats";
import { loadScenario } from "./debug/scenarios";
import { evPirates, evPatrol, evBreakdown, evMeteor, evSalvage, evDistress, evTrader, evPax } from "./systems/events";
import { loadRemoteContent } from "./supabase/content";

setRender(render);

// The UI is string-templated with inline onclick handlers (transitional from
// the single-file prototype), so every handler reachable from HTML must be a
// global. This is the single registry of that surface.
Object.assign(window as any, {
  // navigation & screens
  nav, ptab, selSlot, selPlanet, closeModal, log, shipView, masterCaution,
  // cockpit pedestal — physical controls
  setThrottle, throttleLive, bayToggle, jettisonGood, ventGuard, ventFuel,
  commsTune, engageBurn,
  // meta
  showHelp, confirmNewGame, newGame, intro, startGame,
  // character creator
  openCreator, avName, avRandomName, avFace, avHead, avGarb, avSkin, avSuit, avTrim, avStart,
  // prologue campaign (DEAD RECKONING)
  introStart, introAct,
  // planet actions
  acceptMission, hire, fireCrew, buyGood, sellGood, buyFuel, buyFood,
  repairShip, repairSystems, buyMod, sellMod, toggleMod, upgradeEngine, buySlots, refitShip,
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
  runPicketAround, runPicketThread, runNetDecoy, runNetSilent, runNetPush,
  // consequence scheduler
  riderFight,
  // station scenes (dialogue-tree modal choices)
  sceneChoose, sceneContinue,
  // the Long Silence
  silDescend, silBearing, silAnswer, silStill, silSell,
  silBoardReturned, silScanReturned, silLearnNumbers, silLearnReturned,
  // free-roam walking: D-pad/keyboard fallback buttons, crew chat, foot encounters
  walkPressStart: pressStart, walkPressEnd: pressEnd, walkInteract: interact,
  crewTalk, crewHighlight, wkInspect, walkDeck, sitChair, wkPay, wkTalk, wkFight,
  // crew dialogue — trust-gated topics, personal quests
  ctVibe, ctAbout, ctShip, ctQuest, ctWorld, ctClose, ctQuestHelp, ctQuestSkip,
  // damage control — crew-gap minigames (no mechanic/pilot/med bay aboard)
  dcValve, dcVector, dcCare,
  // agenda beats — the named twelve's honest/dishonest objectives billing due
  abVexPay, abVexRefuse, abVexReport,
  abCorbinConfront, abCorbinCut, abCorbinIgnore,
  abRookTalk, abRookDark, abRookConfront,
  abNylaConfront, abNylaAsk, abNylaIgnore,
  abMiriEnd, abMiriKeep,
  // dev/debug: live state accessor + manual walk-frame stepper (harmless — behind underscores)
  __S: () => State.S,
  __walkStep: debugStep,
  __walkPos: debugPos,
  __walkActors: debugActors,
  __walkGoto: debugGoto,
  __scenario: loadScenario,
  // dev/debug: force a specific travel event (playtesting encounters on demand)
  __event: (k: string) => {
    const evs: Record<string, () => void> = {
      pirates: evPirates, patrol: evPatrol, breakdown: evBreakdown, meteor: evMeteor,
      salvage: evSalvage, distress: evDistress, trader: evTrader, pax: evPax,
    };
    if (evs[k]) evs[k](); else console.log("events: " + Object.keys(evs).join(", "));
  },
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
