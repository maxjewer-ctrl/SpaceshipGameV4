// DEAD RECKONING — the prologue campaign. A soft tutorial that plays like a
// cold open: the firefight is already over, the captain is dead, and the ship
// is a wounded animal drifting in the wreckage of her own convoy. Teaching
// happens by necessity — you fix the drive because it's broken, you siphon
// fuel because the tank is dry, you learn the station because you owe it money.
//
// Stage lives in S.flags.intro:
//   1 reach the cockpit → 2 jury-rig the drive → 3 salvage the wrecks
//   → 4 the limp to Solace (scripted travel beats via flags.intro_beat)
//   → 5 Port Solace: settle the debt + take a contract → done (intro_done).
// All of it writes to the real systems — ledger, disposition, riders — so the
// choices you make before you've learned the controls still follow you.
import { S, setState, newState, log } from "../state";
import { modal, closeModal, clearModal } from "../modal";
import { actionAttr } from "../dispatch";
import { requestRender } from "../bus";
import { clearSave } from "../state";
import { readCaptainRole } from "../ui/help";
import { getCaptainName, getAppearance } from "../ui/avatar";
import { remember, witnessAll, crewKey } from "./ledger";
import { shift } from "./disposition";
import { plantDelay } from "./scheduler";
import { clamp } from "../util";
import { dialogueHeadHTML, crewPortrait, crewPortraitKey } from "../ui/portraits";
import { minDepartureCost } from "../derive";
import type { CrewMember } from "../types";

const JUNO_ICON = "🧑‍🔧";

export const introStage = (): number => (typeof S?.flags?.intro === "number" ? S.flags.intro : 0);
export const introActive = (): boolean => introStage() >= 1 && !S.flags.intro_done;

function juno(): CrewMember | undefined {
  return S.crew.find((c) => c.name === "Juno Vale");
}

// ---------- start ----------
export function introStart() {
  const input = document.getElementById("shipnamein") as HTMLInputElement | null;
  const name = (input && input.value.trim()) || "Kestrel";
  const role = readCaptainRole();
  clearModal();
  clearSave();
  setState(newState(name));
  S.captainName = getCaptainName();
  S.appearance = getAppearance();
  S.captainRole = role;
  // The ship as the fight left her: drive down, bunkroom caved in, tanks holed.
  S.credits = 85;
  S.fuel = 3;
  S.food = 14;
  S.hull = 41;
  S.docked = false;
  S.loc = "kestrel";
  S.screen = "shipwalk";
  S.flags.intro = 1;
  const eng = S.modules.find((m) => m.t === "engine");
  if (eng) { eng.dmg = true; }
  S.modules.push({ t: "quarters", on: true, dmg: true });
  // Juno Vale — Osei's engineer, and now yours. Handcrafted Tapestry bundle:
  // the trust system, tells, and her deserter secret all run on the normal rails.
  const j: CrewMember = {
    id: S.uid++, name: "Juno Vale", role: "mechanic", fee: 0, salary: 6,
    key: "juno",
    daysAboard: 40, questStage: 0, questDest: null, perk: false,
    revealed: { origin: true },
    bundle: {
      origin: "the Foundry smelter decks",
      want: "to keep this ship flying — it's the last of Osei's luck still holding air",
      wound: "watched a ship they loved come apart in the black",
      woundTag: "lost_a_ship",
      secret: "is a Union deserter — a patrol scan is a death sentence",
      secretTag: "union_deserter",
      tell: "goes very quiet when patrols hail",
      tellSituation: "patrol",
      traits: ["loyal", "gruff"],
    },
  };
  S.crew.push(j);
  remember(crewKey(j), "survived_the_kestrel_lane", 2, "You and Juno pulled each other out of the same fight that killed Captain Osei.");
  log(`— DAY 1, KESTREL LANE. The shooting has stopped. The ${S.shipName} is still here. Captain Osei is not. —`);
  log("▸ NEXT: the deck is yours to walk — WASD / arrows, E to interact. Get forward to the cockpit.");
  modal(`<h2>◆ DEAD RECKONING</h2>
    <p>The klaxon dies mid-howl when Juno cuts power to it, and after that the loudest thing on the ship is your own blood.</p>
    <p>Eight hours ago you were the first mate of a grain convoy out of Kestrel's Rest — four freighters, one escort, a milk run. Then the raiders came out of the sun, and the escort <b>Vesper</b> broke her back buying you the minutes that mattered, and Captain Rhea Osei flew this ugly, beautiful ship like a knife until the shooting stopped.</p>
    <p>The convoy scattered clear. The raiders didn't. You're alive. The board says the drive is down, the tanks are holed, and the bunkroom is crushed. And the captain hasn't answered the comm since the last hit.</p>
    <p class="dim">You were second in command. You know what that means now. Go forward.</p>
    <div class="choices"><button class="primary" ${actionAttr("introAct", "wake")}>Get up.</button></div>`);
  requestRender();
}

// ---------- the walkable ship: stage-driven hooks (read by shipwalk.ts) ----------
// Extra doors for the current stage. Positions are computed by the caller from
// its own room rects, so this returns builders keyed by room.
export interface IntroDoorSpec { room: "cockpit" | "engine"; label: string; act: string; }
export function introShipDoors(): IntroDoorSpec[] {
  if (!introActive()) return [];
  const st = introStage();
  if (st === 1) return [{ room: "cockpit", label: "The captain's chair", act: "cockpit" }];
  if (st === 2) return [{ room: "engine", label: "Jury-rig the drive core", act: "rig" }];
  if (st === 3) return [{ room: "cockpit", label: "Suit up — salvage sweep (EVA)", act: "eva" }];
  return [];
}

export function introRoomDesc(): Record<string, string> {
  if (!introActive()) return {};
  const st = introStage();
  const out: Record<string, string> = {};
  if (st <= 2) {
    out.cockpit = "The forward glass is starred with impact frost. Captain Osei is still in her chair, and she is not going to tell you what to do about any of this.";
  } else {
    out.cockpit = "The chair is empty, wiped down, waiting. You haven't sat in it yet. It knows.";
  }
  if (st === 2) out.engine = "The drive core is dark and ticking as it cools. Burnt insulation, a smell like a lightning strike. It wants hands, not prayers.";
  if (st >= 3 && st <= 4) out.engine = "The drive core runs — wrong, but it runs. Juno's patch job hums a half-tone flat and holds.";
  return out;
}

export function introSpawnEngine(): boolean {
  return introStage() === 1;
}

export function introAirlockHint(): string | null {
  if (!introActive() || S.docked) return null;
  return "Hard vacuum and a debris field outside. The suit locker is your only door — and that comes later.";
}

// ---------- the single dispatcher (registered as a global in main.ts) ----------
export function introAct(key: string) {
  switch (key) {
    case "wake": closeModal(); break;
    case "cockpit": stgCockpit(); break;
    case "goodbye": stgGoodbye(true); break;
    case "cover": stgGoodbye(false); break;
    case "rig": stgRig(); break;
    case "rig_plate": stgRigDone("plate"); break;
    case "rig_parts": stgRigDone("parts"); break;
    case "rig_juno": stgRigDone("juno"); break;
    case "eva": stgEva(); break;
    case "vesper": stgVesperModal(); break;
    case "vesper_tags": introVesperChoice(true); break;
    case "vesper_strip": introVesperChoice(false); break;
    case "cutter_box": stgCutter(true); break;
    case "cutter_leave": stgCutter(false); break;
    case "skiff_cut": stgSkiff(true); break;
    case "skiff_leave": stgSkiff(false); break;
    case "burn": stgBurn(); break;
    case "patrol_straight": stgPatrol("straight"); break;
    case "patrol_short": stgPatrol("short"); break;
    case "patrol_handover": stgPatrol("handover"); break;
    case "galley_toast": stgGalley(true); break;
    case "galley_ship": stgGalley(false); break;
    case "dock_ok": closeModal(); break;
    case "debt_pay": stgDebt("pay"); break;
    case "debt_claim": stgDebt("claim"); break;
    case "debt_box": stgDebt("box"); break;
    case "debt_work": stgDebt("work"); break;
    case "done_ok": stgDoneClose(); break;
  }
}

// ---------- stage 1 → 2: the cockpit ----------
function stgCockpit() {
  modal(`<div class="scene"><div class="scene-loc">${S.shipName} · cockpit</div>
    <h2>🧭 The Chair</h2>
    <p>Rhea Osei looks like she's checking a gauge that's slightly out of reach. The last hit threw shrapnel through the port bulkhead, and she never made a sound about it, because she was busy saving everyone else on this ship.</p>
    <p>Her hand is still on the throttle. Second in command means there is no one to report this to. It's your throttle now.</p>
    <div class="choices">
      <button ${actionAttr("introAct", "goodbye")}>Take a minute. Say goodbye properly.</button>
      <button ${actionAttr("introAct", "cover")}>Cover her. Grieve later — the ship is dying too.</button>
    </div></div>`);
}

function stgGoodbye(properly: boolean) {
  S.flags.intro = 2;
  const j = juno();
  if (properly) {
    shift("mercy", 1, "took time for the dead");
    if (j) remember(crewKey(j), "honored_osei", 2, "You stopped the whole ship to say goodbye to Osei properly. Juno stood in the hatchway and let you.");
    log("You fold Osei's hands off the throttle and say the things you'd want said. Juno waits in the hatch. Neither of you hurries.");
  } else {
    log("You cover Osei with her own flight jacket and get to work. She'd have called anything else a waste of her dying.");
  }
  log("▸ NEXT: the drive core is down. Walk aft to the engine room and jury-rig it. (Your deck plan on the 🚀 Ship screen shows every system's status.)");
  modal(`<div class="scene"><div class="scene-loc">${S.shipName} · cockpit</div>
    <h2>🧭 Taking Stock</h2>
    <p>The board tells it plain: <b>drive core down. 3 fuel in the tanks. Hull at 41%.</b> The crew quarters took the worst of the last hit — Juno's bunk is somewhere under a caved-in spar.</p>
    <p>${j ? "Juno's voice on the intercom, rough: \"Drive first, Captain. Everything else is a luxury.\"" : "Drive first. Everything else is a luxury."} The word <i>Captain</i> lands strangely. She means you.</p>
    <p class="dim">Tutorial: the <b>🚀 Ship</b> screen is your deck schematic — damaged systems glow red. The <b>Breaker Panel</b> toggles power. For now: walk aft.</p>
    <div class="choices"><button class="primary" ${actionAttr("closeModal")}>Aft, then.</button></div></div>`);
}

// ---------- stage 2 → 3: DIY repairs ----------
function stgRig() {
  const can40 = S.credits >= 40;
  const j = juno();
  modal(`<div class="scene"><div class="scene-loc">${S.shipName} · engine room</div>
    ${dialogueHeadHTML(j ? crewPortraitKey(j) : null, JUNO_ICON, "Juno Vale", "your mechanic — head-deep in the drive core")}
    <p>Juno already has the casing open. "Feed line's cooked and the regulator's shrapnel. I can bring her up, but I need patch stock — and there's three ways to get it, Captain, none of them free."</p>
    <div class="choices">
      <button ${actionAttr("introAct", "rig_plate")}>Cannibalize hull plating for patch stock <span class="dim">— −6 hull</span></button>
      <button ${can40 ? "" : "disabled"} ${actionAttr("introAct", "rig_parts")}>Burn the spare-parts fund <span class="dim">— 40cr${can40 ? "" : " (you don't have it)"}</span></button>
      <button ${actionAttr("introAct", "rig_juno")}>Strip the galley heat-exchanger <span class="dim">— −3 food, Juno's call</span></button>
    </div></div>`);
}

function stgRigDone(how: string) {
  const eng = S.modules.find((m) => m.t === "engine");
  if (eng) eng.dmg = false;
  S.flags.intro = 3;
  const j = juno();
  let line = "";
  if (how === "plate") {
    S.hull = Math.max(1, S.hull - 6);
    line = "You cut patch stock off the inner hull with a torch while Juno swears at the regulator. The ship gets a little thinner so the drive can live (−6 hull).";
  } else if (how === "parts") {
    S.credits -= 40;
    line = "The spare-parts fund was Osei's rainy-day tin, taped under the nav console. It's raining. (−40cr)";
  } else {
    S.food = Math.max(0, S.food - 3);
    if (j) remember(crewKey(j), "trusted_her_hands", 2, "First order you ever gave Juno was 'do it your way.' She did. It worked.");
    line = "\"Galley heat-exchanger's the same fitting,\" Juno says, already moving. Hot meals become a memory (−3 food), and the drive gets a heart transplant from a soup warmer.";
  }
  log(`🔧 ${line}`);
  log("▸ NEXT: the tanks are nearly dry — 3 fuel won't reach anywhere. The wrecks outside are still holding fuel. Suit up in the cockpit for a salvage EVA.");
  modal(`<div class="scene"><div class="scene-loc">${S.shipName} · engine room</div>
    ${dialogueHeadHTML(j ? crewPortraitKey(j) : null, JUNO_ICON, "Juno Vale", "your mechanic")}
    <p>${line}</p>
    <p>The core catches on the third try — a half-tone flat, like a hymn sung by somebody angry — and every gauge on the ship blinks awake. Juno wipes her hands and looks at you for orders.</p>
    <p>"We've got <b>3 fuel</b>, Captain. Port Solace is three days' burn. You can't math that into working." She nods at the glass, at the slow-tumbling dead outside. "But <i>they're</i> still holding fuel."</p>
    <p class="dim">Tutorial: fuel burns per day in flight (see the Ship Systems panel). No fuel, no thrust, no future.</p>
    <div class="choices"><button class="primary" ${actionAttr("closeModal")}>Suit up.</button></div></div>`);
}

// ---------- stage 3 → 4: the salvage sweep ----------
function stgEva() {
  const j = juno();
  modal(`<div class="scene"><div class="scene-loc">Kestrel lane · debris field</div>
    ${dialogueHeadHTML(j ? crewPortraitKey(j) : null, JUNO_ICON, "Juno Vale", "your mechanic — suited up")}
    <p>Outside is very quiet and very full. The <b>Vesper</b> hangs in two pieces, her spine glowing faintly where it parted. Beyond her, the raider cutter that killed her — dark, holed, spinning slow. And further out, a drop-skiff, mostly intact, running lights stuttering.</p>
    <p>Juno takes the tether anchor. "Vesper first. She'd want it to be us and not some claim-jumper."</p>
    <div class="choices"><button class="primary" ${actionAttr("introAct", "vesper")}>Cross to the Vesper</button></div></div>`);
}

function stgVesperModal() {
  // First wreck: fuel, plus the first real moral fork — the dead escort's crew.
  modal(`<div class="scene"><div class="scene-loc">wreck of the Vesper</div>
    <h2>🛡 The Vesper</h2>
    <p>Her tanks survived her. You rig the siphon and watch <b>+8 fuel</b> crawl across your gauge while Juno floats through the broken crew deck with her torch down, out of respect.</p>
    <p>Twelve escort crew flew her. Their tags are still aboard — and so is her armory cache, sealed, unclaimed, worth real money to the right buyer. There's time to carry one load before the tether swings back.</p>
    <div class="choices">
      <button ${actionAttr("introAct", "vesper_tags")}>Recover the crew's tags for their families</button>
      <button ${actionAttr("introAct", "vesper_strip")}>Strip the armory cache <span class="dim">— +120cr</span></button>
    </div></div>`);
}

function introVesperChoice(tags: boolean) {
  S.fuel = Math.min(40, S.fuel + 8);
  const j = juno();
  if (tags) {
    S.flags.intro_tags = true;
    shift("mercy", 2, "carried the dead home");
    if (j) remember(crewKey(j), "carried_the_tags", 2, "You spent the Vesper salvage window carrying twelve dead strangers' tags instead of their guns. Juno rode the tether back in silence, the good kind.");
    log("＋8 fuel from the Vesper's tanks. You carry twelve tags back instead of the armory. Somebody's family will get a knock and a truth instead of a silence.");
  } else {
    S.credits += 120;
    shift("mercy", -2, "looted a protector's grave");
    if (j) remember(crewKey(j), "stripped_the_vesper", -2, "The Vesper died covering you, and you took her guns before her crew's tags. Juno logged the salvage without a word. The word was the point.");
    log("＋8 fuel and +120cr in armory salvage off the Vesper. The tags stay with the ship. Juno doesn't say anything about it, at length.");
  }
  stgCutterIntro();
}

function stgCutterIntro() {
  modal(`<div class="scene"><div class="scene-loc">raider cutter, dark</div>
    <h2>💀 The Cutter</h2>
    <p>The ship that killed Osei is ugly up close — a stripped-down lane-wolf, no flag, no registry plate. Her tanks give up <b>+6 fuel</b>, and her hold has <b>160cr in bearer salvage bonds</b>, which raiders carry because banks ask questions.</p>
    <p>Then Juno's light finds the flight recorder. Intact. A raider's black box says who they were, where they've hit — and sometimes, who was <i>paying</i>. Boxes like this have started wars on the frontier. Ended some, too.</p>
    <div class="choices">
      <button ${actionAttr("introAct", "cutter_box")}>Pull the black box</button>
      <button ${actionAttr("introAct", "cutter_leave")}>Leave it — dead men's business</button>
    </div></div>`);
}

function stgCutter(tookBox: boolean) {
  const j = juno();
  S.fuel = Math.min(40, S.fuel + 6);
  S.credits += 160;
  if (tookBox) {
    S.flags.intro_blackbox = true;
    log("＋6 fuel, +160cr in bearer bonds — and the raider's black box, heavy as a verdict, stowed under your bunk. Somebody paid for this convoy hit. The box knows who.");
  } else {
    log("＋6 fuel and +160cr in bearer bonds off the cutter. You leave the black box to spin with its dead. Some answers cost more than they pay.");
  }
  modal(`<div class="scene"><div class="scene-loc">drop-skiff, running lights stuttering</div>
    ${dialogueHeadHTML(j ? crewPortrait(j, "worried") : null, JUNO_ICON, "Juno Vale", "your mechanic — reading the panel")}
    <p>The last wreck isn't a wreck. The drop-skiff's cabin is holed, but her aft compartment is sealed — and something inside is <b>knocking</b>. Slow. Deliberate. The rhythm of someone who has been counting their own breaths for hours.</p>
    <p>Juno reads the panel. "One soul. Raider crew, has to be. Air's going amber in there, Captain — she has maybe an hour." A beat. "Your call. She shot at us this morning."</p>
    <div class="choices">
      <button ${actionAttr("introAct", "skiff_cut")}>Cut her out</button>
      <button ${actionAttr("introAct", "skiff_leave")}>Leave her for the Union sweepers <span class="dim">— they're days out</span></button>
    </div></div>`);
}

function stgSkiff(cut: boolean) {
  const j = juno();
  if (cut) {
    S.flags.intro_survivor = true;
    shift("mercy", 2, "cut an enemy out of a dying ship");
    if (j) remember(crewKey(j), "saved_the_raider", 1, "You cut a raider out of her own wreck the same day her crew killed Osei. Juno cut the other hinge.");
    log("The torch takes eleven minutes. Her name is Ilsa Renn, she's nineteen, and she stops being a raider somewhere around the eighth minute. She rides your cargo deck to Solace, very quiet.");
  } else {
    S.flags.intro_left_survivor = true;
    shift("mercy", -3, "left a survivor to the odds");
    if (j) remember(crewKey(j), "left_the_knocking", -2, "You left the skiff sealed with someone alive inside, banking on Union sweepers days out. Juno checked the sweep schedules twice that night and didn't tell you what they said.");
    log("You log the skiff's position for the Union sweepers and burn away. The knocking keeps time in your helmet radio long after it can't.");
  }
  // The limp begins.
  S.flags.intro = 4;
  S.flags.intro_beat = 0;
  S.travel = { from: "kestrel", dest: "solace", total: 3, left: 3 };
  S.screen = "travel";
  log(`▸ NEXT: course laid in for Port Solace — 3 days, burning ${4}/day. Hit ▸ ENGAGE BURN to advance each day. Watch fuel and food.`);
  modal(`<div class="scene"><div class="scene-loc">${S.shipName} · cockpit</div>
    ${dialogueHeadHTML(j ? crewPortrait(j, cut ? "neutral" : "angry") : null, JUNO_ICON, "Juno Vale", cut ? "your mechanic" : "your mechanic — saying nothing")}
    <h2>🧭 The Limp</h2>
    <p>You sit in the chair. It's warm from the sun through the glass and from nothing else, and it fits wrong, and you fly anyway, because that is the whole job.</p>
    <p><b>Port Solace, three days.</b> Fuel for maybe four. Food for maybe seven. A drive that sings flat and a crew of one, plus whatever you're carrying that knocks.</p>
    <p class="dim">Tutorial: each ▸ ENGAGE BURN advances one day — burning fuel, eating food, paying salaries, and rolling the dice on the lane. The pedestal throttle needs to be up for the drive to answer.</p>
    <div class="choices"><button class="primary" ${actionAttr("introAct", "burn")}>Take her out.</button></div></div>`);
}

function stgBurn() {
  closeModal();
  requestRender();
}

// ---------- stage 4: scripted travel beats ----------
// Called from advanceDay() after dayTick, before random events. Returns true
// if the prologue consumed this day's event slot.
export function introTravelBeat(): boolean {
  if (introStage() !== 4) return false;
  const beat = S.flags.intro_beat || 0;
  if (beat === 0) {
    S.flags.intro_beat = 1;
    stgPatrolHail();
    return true;
  }
  if (beat === 1) {
    S.flags.intro_beat = 2;
    stgGalleyScene();
    return true;
  }
  return true; // day 3: no random events either — the arrival owns the drama
}

function stgPatrolHail() {
  const survivorBtn = S.flags.intro_survivor && !S.flags.intro_survivor_union
    ? `<button ${actionAttr("introAct", "patrol_handover")}>Transfer your raider survivor to their brig</button>` : "";
  const boxLine = S.flags.intro_blackbox ? " You think about the black box under your bunk, and about who might be named in it." : "";
  modal(`<div class="scene"><div class="scene-loc">Kestrel lane · day 2</div>
    ${dialogueHeadHTML(null, "🛰", "TUV Lattice", "Union patrol corvette — hailing")}
    <p>The Union patrol corvette finds you before noon, the way they always do — polite, unhurried, guns politely and unhurriedly live. <i>"Freighter, this is Union vessel Lattice. We show you departing a weapons-discharge zone. Report status and souls aboard."</i></p>
    <p>Juno has gone very, very quiet at the engineering board.${boxLine}</p>
    <p class="dim">A dead captain is paperwork. Out here, paperwork is politics: the Union counts everything, and remembers what doesn't add up.</p>
    <div class="choices">
      <button ${actionAttr("introAct", "patrol_straight")}>Report it straight — the raid, Osei, all of it</button>
      <button ${actionAttr("introAct", "patrol_short")}>Give them the short version — "engine trouble, no assistance required"</button>
      ${survivorBtn}
    </div></div>`);
}

function stgPatrol(how: string) {
  const j = juno();
  if (how === "straight") {
    shift("law", 1, "reported clean to a patrol");
    S.rep.union = clamp(S.rep.union + 1, -20, 20);
    S.flags.intro_reported = true;
    let extra = "";
    if (S.flags.intro_blackbox && !S.flags.blackbox_gone) {
      extra = ` The comms officer's voice changes when you mention the black box. <i>"Retain it, Captain. Someone senior will want that."</i> Which is one way of saying it's valuable — and another way of saying you're now the person holding it.`;
    }
    log("You give the Lattice the whole truth. They log Osei's death, register the handover, and their condolences sound almost unrehearsed. The registry now says CAPTAIN next to your name. (+Union)");
    modal(`<div class="scene"><h2>🛰 Logged</h2>
      <p><i>"Handover recorded. The ship is yours pending probate, Captain."</i> The word again, official now, in a Union database forever.${extra}</p>
      <p>The Lattice burns off toward the debris field. Juno lets a long breath go at her board, and you make a note of that without knowing what it's a note about.</p>
      <div class="choices"><button class="primary" ${actionAttr("closeModal")}>Fly on.</button></div></div>`);
  } else if (how === "short") {
    shift("law", -1, "stonewalled a patrol");
    shift("daring", 1, "flew past the flag");
    log("\"Engine trouble. No assistance required.\" The Lattice holds the scan a beat longer than politeness, then lets you go. Some paperwork stays yours alone. So do some problems.");
    modal(`<div class="scene"><h2>🛰 The Short Version</h2>
      <p>The corvette drifts alongside for a slow minute — long enough to say <i>we both know that isn't all of it</i> — and then peels away. Juno's shoulders come down an inch. "Thank you," she says, to the board, not to you. Another note you file without a folder to put it in.</p>
      <div class="choices"><button class="primary" ${actionAttr("closeModal")}>Fly on.</button></div></div>`);
  } else {
    // hand the survivor over
    S.flags.intro_survivor_union = true;
    shift("law", 1, "handed a raider to the Union");
    shift("mercy", -1, "gave up a prisoner to Union justice");
    S.rep.union = clamp(S.rep.union + 1, -20, 20);
    if (j) remember(crewKey(j), "handed_over_renn", -1, "Ilsa Renn went to a Union brig off your cargo deck. Lawful. Juno watched the airlock cycle and went back to work.");
    log("Ilsa Renn crosses to the Lattice in borrowed cuffs. Nineteen, raider, alive — the Union will decide what order those words go in. (+Union)");
    modal(`<div class="scene"><h2>🛰 Transfer</h2>
      <p>She doesn't fight it and doesn't thank you, which between raiders counts as good manners. At the airlock she stops. "You cut me out anyway," she says. "I'll remember the ship." Whether that's gratitude or a targeting note, she takes it with her.</p>
      <div class="choices"><button class="primary" ${actionAttr("closeModal")}>Fly on.</button></div></div>`);
  }
}

function stgGalleyScene() {
  const j = juno();
  if (!j) { return; }
  modal(`<div class="scene"><div class="scene-loc">${S.shipName} · galley · day 3</div>
    ${dialogueHeadHTML(crewPortrait(j, "worried"), JUNO_ICON, "Juno Vale", "your mechanic")}
    <p>You find her in the galley at ship's midnight, running a diagnostic she's already run, drinking Osei's terrible coffee ration because somebody should. She doesn't look up. "Fourteen years I kept that woman's ship alive. Fourteen years, and the one hit I couldn't patch was the one that mattered."</p>
    <p class="dim">Tutorial: crew are people, not stat blocks. Walk the decks and talk to them — trust opens slowly, and what they carry shapes what they'll do for you. What you do in front of them is remembered. All of it.</p>
    <div class="choices">
      <button ${actionAttr("introAct", "galley_toast")}>Pour two of the terrible coffees. Toast her properly.</button>
      <button ${actionAttr("introAct", "galley_ship")}>"The patch is holding. She'd call that a win."</button>
    </div></div>`);
}

function stgGalley(toast: boolean) {
  const j = juno();
  if (j) {
    if (toast) {
      remember(crewKey(j), "toasted_osei_together", 3, "Ship's midnight, two terrible coffees, every good Osei story Juno had. The first night the ship felt like yours and hers instead of just what was left.");
      j.revealed = j.revealed || {};
      j.revealed.want = true;
      if (!j.questStage) j.questStage = 1;
      log("You and Juno drink terrible coffee until ship's dawn and tell Osei stories until the true ones run out and the good ones start. \"Keep her flying,\" Juno says finally. \"That's the whole eulogy.\"");
    } else {
      remember(crewKey(j), "kept_it_professional", 1, "You talked shop the night after Osei died. Juno seemed to prefer it that way. Seemed.");
      log("\"She'd call it a win,\" Juno agrees, and takes the diagnostic from the top again. Some grief only knows how to look like work.");
    }
  }
  closeModal();
  requestRender();
}

// ---------- stage 4 → 5: arrival at Port Solace ----------
// Called from arrive(). Returns true if the prologue owns this arrival.
export function introArrive(): boolean {
  if (introStage() !== 4 || S.loc !== "solace") return false;
  S.flags.intro = 5;
  let renn = "";
  if (S.flags.intro_survivor && !S.flags.intro_survivor_union) {
    plantDelay(15, 35, "distress_guild_echo");
    renn = `<p>Ilsa Renn is gone before the boarding ramp finishes extending — over the rail and into the crowd with a raider's economy of motion. On your console she's left a bearing, a frequency, and four words: <i>"The ship. I remember."</i></p>`;
  }
  log("Docked at Port Solace. The dockmaster's queue found you before your engines cooled.");
  log("▸ NEXT: Osei's debts are yours now — see the HARBORMASTER. Then the CANTINA for work, the EXCHANGE for fuel & food, the DRY DOCK for repairs. Walk the station (🛰).");
  modal(`<div class="scene"><div class="scene-loc">Port Solace · docks</div>
    <h2>🛰 Port Solace</h2>
    <p>The station takes you in like it's seen a thousand of you, because it has. Cranes, noise, the smell of coolant and fried protein — after three days of flat drive-hum it's practically music.</p>
    ${renn}
    <p>The music lasts until the dockmaster's runner finds you: a formal notice, Vance's seal. <b>Captain R. Osei: outstanding berth and bond, 220 credits.</b> Estates transfer. So do debts. The Harbormaster will see you at your earliest convenience, where <i>earliest</i> is underlined.</p>
    <p class="dim">Tutorial: stations are walked, not menued — the cantina hires, the exchange sells fuel and food, the dry dock repairs. Start with the Harbormaster's window. Everyone does, eventually.</p>
    <div class="choices"><button class="primary" ${actionAttr("introAct", "dock_ok")}>Step off the ramp.</button></div></div>`);
  requestRender();
  return true;
}

// ---------- stage 5: the debt (station door → this scene) ----------
export function introDebtDoor(): boolean {
  return introStage() === 5 && S.loc === "solace" && !S.flags.intro_debt;
}

export function introDebtScene() {
  const hasIt = S.credits >= 220;
  // Paying in full is a flat 220cr hit — don't let it leave a broke captain
  // unable to afford enough fuel to ever leave port again.
  const wouldStrand = hasIt && S.credits - 220 < minDepartureCost();
  const canPay = hasIt && !wouldStrand;
  const payNote = !hasIt ? " (you don't have it)" : wouldStrand ? " (would leave you stranded — no fuel money left)" : "";
  const boxBtn = S.flags.intro_blackbox && !S.flags.blackbox_gone
    ? `<button ${actionAttr("introAct", "debt_box")}>Trade her the raider black box <span class="dim">— debt cleared, +100cr</span></button>` : "";
  modal(`<div class="scene"><div class="scene-loc">Port Solace · harbormaster</div>
    ${dialogueHeadHTML(null, "🛃", "Harbormaster Vance", "Port Solace harbormaster")}
    <p>Sela Vance reads the transfer notice like it's a menu she's already bored of. "Osei. Good captain. Paid late, paid always." She looks up, and her eyes do the arithmetic on your jacket, your ship, your day. "Two hundred twenty, plus my sympathy, which is free."</p>
    <p>"How would you like to settle the estate, <i>Captain</i>?"</p>
    <div class="choices">
      <button ${canPay ? "" : "disabled"} ${actionAttr("introAct", "debt_pay")}>Pay it, in full <span class="dim">— 220cr${payNote}</span></button>
      <button ${actionAttr("introAct", "debt_claim")}>Sign over the wreck-field salvage claim <span class="dim">— the Vesper families get nothing</span></button>
      ${boxBtn}
      <button ${actionAttr("introAct", "debt_work")}>Work it off — one unmarked crate, no questions</button>
    </div></div>`);
}

function stgDebt(how: string) {
  const j = juno();
  S.flags.intro_debt = true;
  if (how === "pay") {
    S.credits -= 220;
    shift("law", 1, "paid a debt in full");
    log("You pay Osei's debt to the last credit. Vance stamps the transfer without ceremony. \"Clean books, clean berth,\" she says. \"You'll go far, or broke.\"");
  } else if (how === "claim") {
    shift("mercy", -2, "signed away the dead crew's salvage shares");
    if (j) remember(crewKey(j), "sold_the_vesper_claim", -2, "You settled Osei's debt with the wreck-field salvage claim — the Vesper crews' families' shares included. Vance's clerks were towing before nightfall. Juno heard.");
    log("You sign over the wreck field. Vance's tow crews are burning for the Kestrel lane within the hour — the Vesper, the cutter, the tags and shares and all of it, hers now. The debt dies. Something else does too.");
  } else if (how === "box") {
    S.flags.blackbox_gone = true;
    S.credits += 100;
    shift("law", -2, "sold evidence to bury it");
    log("Vance turns the black box over once, and for a half-second her boredom slips — she knows exactly whose name is in it. \"Debt's cleared. And this conversation never happened, which costs extra.\" (+100cr.) Somewhere, a paymaster sleeps easier. You helped.");
  } else {
    shift("law", -1, "took off-manifest work to clear a debt");
    S.jobs.push({
      id: S.uid++, kind: "haul", title: "Vance's unmarked crate (the Osei debt)",
      dest: "kestrel", pay: 60, units: 3,
      desc: "One crate, no manifest, no questions. Deliver it and the Osei estate is settled — Vance's word on it, for what that trades at.",
      tag: "vancedebt",
    });
    S.flags.intro_job = true;
    log("\"Sensible.\" A chit slides across. One unmarked crate to Kestrel's Rest and the estate is settled — plus gas money. You didn't ask what's in it, which was the correct number of questions.");
  }
  closeModal();
  introCheckDone();
  requestRender();
}

// ---------- completion ----------
// A contract on the books + the debt resolved = you're a working captain now.
export function introOnAccept() {
  if (!introActive()) return;
  S.flags.intro_job = true;
  introCheckDone();
}

export function introCheckDone() {
  if (introStage() !== 5 || !S.flags.intro_debt || !S.flags.intro_job) return;
  S.flags.intro = 6;
  S.flags.intro_done = true;
  S.prestige += 1;
  witnessAll("came_through_the_kestrel_lane", 2, "The raid, the limp, the debt — the new captain got the ship through all of it.");
  log("◆ DEAD RECKONING — complete. The ship is yours: registry, debts, luck and all. (+1 prestige)");
  modal(`<h2>◆ YOURS NOW</h2>
    <p>Contract on the books. Debts settled, or at least aimed. Fuel in the tank and a drive that sings flat and holds. Somewhere in the last four days you stopped being Osei's first mate and started being the captain — nobody can say exactly when, which is how it always happens.</p>
    <p>Out here the <b>Union</b> counts everything, the <b>Frontier Compact</b> grows everything, and the <b>Red Sky Syndicate</b> moves everything the other two won't touch. All three pay. All three remember. The lanes are already starting to tell stories about you — what kind of stories is the only thing you actually get to choose.</p>
    <p class="dim">Fly. Trade. Build the ship out. Talk to your crew. And when your name means something — <b>12★ prestige</b> — somebody with a very dangerous crate is going to come looking for a captain exactly like you.</p>
    <div class="choices"><button class="primary" ${actionAttr("introAct", "done_ok")}>Keep flying.</button></div>`);
}

function stgDoneClose() {
  closeModal();
  requestRender();
}

// ---------- objective card (ship screen, Transmissions panel) ----------
export function introCard(): string {
  if (!introActive()) return "";
  const st = introStage();
  let line = "";
  if (st === 1) line = "The captain is dead and the ship is drifting. Walk the deck (🧑‍🚀 Walk Ship) and get forward to <b>the cockpit</b>.";
  if (st === 2) line = "The drive core is down. Walk aft to the <b>engine room</b> and jury-rig it with Juno.";
  if (st === 3) line = "3 fuel won't reach anywhere. <b>Suit up in the cockpit</b> and salvage the wrecks outside.";
  if (st === 4) line = "Limp to <b>Port Solace</b> — ▸ ENGAGE BURN advances each day. Watch the fuel and food gauges.";
  if (st === 5) {
    const debt = S.flags.intro_debt ? "✓ debt settled" : "settle Osei's debt at the <b>Harbormaster</b>";
    const job = S.flags.intro_job ? "✓ contract taken" : "take a contract at the <b>Cantina</b>";
    line = `Walk the station (🛰): ${debt} · ${job}. The Exchange sells fuel & food; the Dry Dock fixes the crushed quarters.`;
  }
  return `<div class="panel"><h3>◆ Orders</h3><div class="card" style="border-color:var(--amber)">
    <div class="title" style="color:var(--amber)">◆ DEAD RECKONING</div>
    <div class="dim">${line}</div></div></div>`;
}
