// The single home for the UI's onclick-driven action surface (BETA_PLAN
// §3.4). Every handler reachable from a string-templated HTML button used to
// be a bare `window` global with its own inline `onclick="fn(args)"` string;
// now templates emit `data-action`/`data-args` attributes (via actionAttr /
// holdActionAttr below) and one delegated listener, attached once at boot,
// looks the action up in ACTIONS and calls it. main.ts stays a thin
// bootstrap; this module owns the registry.
//
// Dev/debug globals (`__S`, `__scenario`, `__walkStep`, etc.) were never
// onclick-driven — they're invoked from the console or headless test
// scripts — and stay as plain `window` globals in main.ts, untouched by
// this refactor.
import { nav, masterCaution } from "./ui/render";
import { log } from "./state";
import { closeModal } from "./modal";
import { selSlot, shipView } from "./ui/ship";
import {
  setThrottle, throttleLive, bayToggle, jettisonGood, ventGuard, ventFuel,
  commsTune, engageBurn,
} from "./ui/cockpit";
import { selPlanet } from "./ui/map";
import { ptab } from "./ui/planet";
import {
  showHelp, closeHelp, confirmNewGame, newGame, intro, startGame,
  openSaves, saveHere, loadSaveSlot, deleteSaveSlot, exportSaveFile, importSaveFile,
} from "./ui/help";
import { introStart, introAct } from "./systems/intro";
import {
  openCreator, avName, avRandomName, avFace, avLook, avHead, avGarb, avSkin, avSuit, avTrim, avStart,
} from "./ui/avatar";
import { acceptMission, hire } from "./systems/market";
import {
  toggleMod, repairSystems, fireCrew, buyGood, sellGood, buyFuel, buyFood,
  repairShip, buyMod, sellMod, upgradeMod, upgradeEngine, buySlots, moveModTo,
} from "./systems/actions";
import { depart, waitDay, advanceDay, abandonJob } from "./systems/travel";
import { startCombat, cAct, endCombat } from "./systems/combat";
import {
  pirateWin, pirateLoseFlee, pirateFlee, pirateBribe, pirateSurrender, pirateEngage,
  patrolBribe, patrolRun, patrolSubmit,
  distressHelp, distressIgnore, traderBuy, traderSell, paxMerchantSell, adriftTow,
  closeThenLog,
} from "./systems/events";
import {
  arcMeet, arcAcceptCrate, arcAcceptVoss, arcStartRun,
  arcCrateDecline, evHunterEngage, evPicketEngage, arcInterceptEngage, arcVictoryContinue,
  ambushHandOver, ambushFight, ambushRun,
  hunterWin, hunterFled, hunterRun, interceptWin, interceptFled,
  runPicketAround, runPicketThread, runNetDecoy, runNetSilent, runNetPush,
} from "./systems/arc";
import { riderFight } from "./systems/scheduler";
import { sceneChoose, sceneContinue } from "./systems/scene";
import {
  silDescend, silBearing, silAnswer, silStill, silSell,
  silBoardReturned, silScanReturned, silLearnNumbers, silLearnReturned,
  silCloseLog, silCloseLearnNumbers, silCloseLearnReturned,
} from "./systems/silence";
import { pressStart, pressEnd, interact } from "./ui/walk";
import { crewTalk, crewHighlight, wkInspect, walkDeck, sitChair, toggleModAndInspect } from "./ui/shipwalk";
import { wkPay, wkTalk, wkFight } from "./systems/walkEncounters";
import { ctVibe, ctAbout, ctShip, ctQuest, ctWorld, ctClose, ctQuestHelp, ctQuestSkip, ctDeepTalk } from "./systems/crewtalk";
import { crewDialogueChoose, crewDialogueContinue } from "./systems/crewdialogue";
import { dcValve, dcVector, dcCare } from "./systems/damagecontrol";
import { refitShip } from "./systems/wear";
import {
  abVexPay, abVexRefuse, abVexReport,
  abCorbinConfront, abCorbinCut, abCorbinIgnore,
  abRookTalk, abRookDark, abRookConfront,
  abNylaConfront, abNylaAsk, abNylaIgnore,
  abMiriEnd, abMiriKeep,
} from "./systems/agendabeats";
import { imogenTreatUnion, imogenTreatSyndicate, imogenDecline } from "./systems/imogenquest";
import {
  surveyBoard, surveyScan, surveyLogGo,
  surveyStake, surveyLogSeam, surveyDecode, surveyLogBeacon,
} from "./systems/survey";
import { loyaltyAccept, loyaltyDecline, loyaltyResolve } from "./systems/loyalty";

const ACTIONS: Record<string, (...args: any[]) => void> = {
  // navigation & screens
  nav, ptab, selSlot, selPlanet, closeModal, log, shipView, masterCaution,
  // cockpit pedestal — physical controls
  setThrottle, throttleLive, bayToggle, jettisonGood, ventGuard, ventFuel,
  commsTune, engageBurn,
  // meta
  showHelp, closeHelp, confirmNewGame, newGame, intro, startGame,
  // save slots + backup
  openSaves, saveHere, loadSaveSlot, deleteSaveSlot, exportSaveFile, importSaveFile,
  // character creator
  openCreator, avName, avRandomName, avFace, avLook, avHead, avGarb, avSkin, avSuit, avTrim, avStart,
  // prologue campaign (DEAD RECKONING)
  introStart, introAct,
  // planet actions
  acceptMission, hire, fireCrew, buyGood, sellGood, buyFuel, buyFood,
  repairShip, repairSystems, buyMod, sellMod, upgradeMod, toggleMod, upgradeEngine, buySlots, refitShip, moveModTo,
  // travel
  depart, waitDay, advanceDay, abandonJob,
  // combat
  startCombat, cAct, endCombat,
  // events
  pirateWin, pirateLoseFlee, pirateFlee, pirateBribe, pirateSurrender, pirateEngage,
  patrolBribe, patrolRun, patrolSubmit,
  distressHelp, distressIgnore, traderBuy, traderSell, paxMerchantSell, adriftTow,
  closeThenLog,
  // story arc
  arcMeet, arcAcceptCrate, arcAcceptVoss, arcStartRun,
  arcCrateDecline, evHunterEngage, evPicketEngage, arcInterceptEngage, arcVictoryContinue,
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
  silCloseLog, silCloseLearnNumbers, silCloseLearnReturned,
  // free-roam walking: D-pad/keyboard fallback buttons, crew chat, foot encounters
  walkPressStart: pressStart, walkPressEnd: pressEnd, walkInteract: interact,
  crewTalk, crewHighlight, wkInspect, walkDeck, sitChair, wkPay, wkTalk, wkFight,
  toggleModAndInspect,
  // crew dialogue — trust-gated topics, personal quests
  ctVibe, ctAbout, ctShip, ctQuest, ctWorld, ctClose, ctQuestHelp, ctQuestSkip,
  // named crew's deep conversation trees (trust + faction rep + events) — Juno, Bapu, ...
  ctDeepTalk, crewDialogueChoose, crewDialogueContinue,
  // damage control — crew-gap minigames (no mechanic/pilot/med bay aboard)
  dcValve, dcVector, dcCare,
  // agenda beats — the named twelve's honest/dishonest objectives billing due
  abVexPay, abVexRefuse, abVexReport,
  abCorbinConfront, abCorbinCut, abCorbinIgnore,
  abRookTalk, abRookDark, abRookConfront,
  abNylaConfront, abNylaAsk, abNylaIgnore,
  abMiriEnd, abMiriKeep,
  // Dr. Imogen Hale — bonded-trust quest (her illness, kept secret until earned)
  imogenTreatUnion, imogenTreatSyndicate, imogenDecline,
  // survey / charting contracts — the find-scene out at the coordinate
  surveyBoard, surveyScan, surveyLogGo,
  surveyStake, surveyLogSeam, surveyDecode, surveyLogBeacon,
  // loyalty missions — the named crew errands (offer aboard → fly → payoff)
  loyaltyAccept, loyaltyDecline, loyaltyResolve,
};

export function dispatch(action: string, args: unknown[] = []) {
  const fn = ACTIONS[action];
  if (!fn) { console.error(`dispatch: unknown action "${action}"`); return; }
  fn(...args);
}

// Only `&`, `'`, and `<` can break out of a single-quoted HTML attribute or
// open a tag; JSON.stringify's own double-quotes need no escaping here since
// the attribute itself is single-quoted.
function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/'/g, "&#39;").replace(/</g, "&lt;");
}

// Emits `data-action`/`data-args` for a click-driven button. Usage:
// `<button ${actionAttr("buyFuel", 5)}>Buy</button>`.
export function actionAttr(name: string, ...args: unknown[]): string {
  return `data-action="${name}" data-args='${escapeAttr(JSON.stringify(args))}'`;
}

// Emits the four pointer-event attributes a press-and-hold control (the walk
// D-pad) needs — pointerdown fires startAction, the other three (up/leave/
// cancel) all fire endAction, sharing one data-args. Kept distinct from
// actionAttr's plain `data-action` so the click handler and pointer handler
// never accidentally both fire for the same element.
export function holdActionAttr(startAction: string, endAction: string, ...args: unknown[]): string {
  const json = escapeAttr(JSON.stringify(args));
  return `data-action-pointerdown="${startAction}" data-action-pointerup="${endAction}" data-action-pointerleave="${endAction}" data-action-pointercancel="${endAction}" data-args='${json}'`;
}

function parseArgs(el: HTMLElement): unknown[] {
  try { return JSON.parse(el.getAttribute("data-args") || "[]"); }
  catch { console.error("dispatch: malformed data-args on", el); return []; }
}

function handleClick(e: Event) {
  const el = (e.target as HTMLElement).closest?.("[data-action]") as HTMLElement | null;
  if (!el) return;
  const action = el.getAttribute("data-action");
  if (action) dispatch(action, parseArgs(el));
}

function handlePointer(e: Event) {
  const attr = `data-action-${e.type}`;
  const el = (e.target as HTMLElement).closest?.(`[${attr}]`) as HTMLElement | null;
  if (!el) return;
  const action = el.getAttribute(attr);
  if (action) dispatch(action, parseArgs(el));
}

// Attached once at boot on `document` — render()'s targeted per-container
// innerHTML swaps (topbar/nav/ticker/main/side) mean a listener bound to any
// one of those containers would miss content re-rendered into a sibling, so
// this deliberately lives above all of them and is never re-attached.
export function installDispatch() {
  document.addEventListener("click", handleClick);
  for (const type of ["pointerdown", "pointerup", "pointerleave", "pointercancel"]) {
    document.addEventListener(type, handlePointer);
  }
}
