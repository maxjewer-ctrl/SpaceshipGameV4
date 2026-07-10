// Occasional random events while free-roaming — distinct from the star-travel
// event roll (rollEvent, ~42%/day). Station encounters are personal, on-foot
// trouble (no ship hull involved); ship-interior encounters only fire in
// transit and can reuse the full travel pool, including real combat.
import { S, log, whisper } from "../state";
import { rand, ri, pick } from "../rng";
import { modal, closeModal, hasModal } from "../modal";
import { requestRender } from "../bus";
import { isSilenced } from "../derive";
import { rollEvent } from "./events";
import { shift } from "./disposition";
import { bark } from "./barks";

const ROOM_DANGER: Record<string, number> = {
  harbor: 0.03, concourse: 0.08, market: 0.10, cantina: 0.10,
  drydock: 0.05, docks: 0.05, undercity: 0.28,
};
const CORRIDOR_DANGER = 0.06;

let stationAcc = 0;
const STATION_THRESHOLD = 8; // seconds of continuous walking between roll opportunities

export function stationWalkTick(moving: boolean, dt: number, roomId: string | null) {
  if (!moving || hasModal() || isSilenced(S.loc)) return;
  stationAcc += dt;
  if (stationAcc < STATION_THRESHOLD) return;
  stationAcc = 0;
  const chance = roomId ? (ROOM_DANGER[roomId] ?? CORRIDOR_DANGER) : CORRIDOR_DANGER;
  if (rand() < chance) fireStationEncounter(roomId || "corridor");
}

const RUMOR_LINES = [
  "A dockhand mutters something you weren't meant to hear. You file it away.",
  "Two crew off another ship argue about a captain who never pays on time. Not you. Probably not you.",
  "Someone's selling something out of a coat lining near the corridor junction. You keep walking.",
  "A kid runs past chasing a maintenance drone. Somewhere, someone yells the kid's name.",
];

function fireStationEncounter(roomId: string) {
  const dangerous = roomId === "undercity";
  const roll = rand();
  if (dangerous && roll < 0.4) {
    shakedown();
    return;
  }
  if (roll < 0.5) {
    const cr = ri(15, 60);
    S.credits += cr;
    log(`You spot a dropped credit chit wedged behind a vent. +${cr}cr, finders keepers.`);
  } else if (dangerous && roll < 0.72) {
    const loss = Math.min(S.credits, ri(10, 40));
    if (loss > 0) { S.credits -= loss; log(`A hand finds your pocket in the crowd and is gone before you turn around (−${loss}cr).`); }
    else whisper("A hand brushes your pocket and finds nothing. Better luck to them next captain.");
  } else if (roll < 0.85) {
    whisper(pick(RUMOR_LINES));
  } else {
    bark("quiet", { chance: 1 });
  }
  requestRender();
}

function shakedown() {
  modal(`<h2>⚠ The Undercity</h2>
    <p>Two figures peel off the wall ahead, unhurried, blocking the corridor the way people do when they've done this before. "Toll for walking through," one says. "Standard rate. Nobody needs to know you paid it."</p>
    <div class="choices">
      <button onclick="wkPay()">Pay the toll (60cr)</button>
      <button onclick="wkTalk()">Talk your way past</button>
      <button onclick="wkFight()">Push through</button>
    </div>`);
}
export function wkPay() {
  closeModal();
  const cost = Math.min(S.credits, 60);
  S.credits -= cost;
  shift("law", -1, "paid an undercity toll");
  log(`You pay ${cost}cr and they let you by without another word.`);
  requestRender();
}
export function wkTalk() {
  closeModal();
  if (rand() < 0.5) {
    shift("mercy", 1, "talked down an undercity shakedown");
    log("You talk calm and slow, name-drop nobody in particular, and they get bored and let you through.");
  } else {
    const loss = Math.min(S.credits, ri(30, 80));
    S.credits -= loss;
    log(`They don't buy it. "Talk's cheap, Captain." (−${loss}cr, taken anyway)`);
  }
  requestRender();
}
export function wkFight() {
  closeModal();
  shift("daring", 1, "fought past an undercity shakedown");
  if (rand() < 0.55) {
    log("You shoulder past before they set themselves. Somewhere behind you, someone swears creatively.");
  } else {
    const loss = Math.min(S.credits, ri(20, 50));
    S.credits -= loss;
    log(`It goes badly. You get clear, bruised and lighter (−${loss}cr) — they get the message that it wasn't easy.`);
  }
  requestRender();
}

// ---- ship interior, transit only ----
let shipAcc = 0;
const SHIP_THRESHOLD = 13;

export function shipWalkTick(moving: boolean, dt: number) {
  if (!moving || hasModal() || !S.travel) return;
  shipAcc += dt;
  if (shipAcc < SHIP_THRESHOLD) return;
  shipAcc = 0;
  const roll = rand();
  if (roll < 0.16) {
    whisper("An alarm chirps somewhere forward. You break into a jog toward the cockpit.");
    rollEvent();
  } else if (roll < 0.32) {
    bark("quiet", { chance: 1 });
  } else if (roll < 0.4) {
    whisper("The hull groans, settling into the burn. Old ships talk in their sleep.");
  }
}
