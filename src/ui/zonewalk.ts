// Combat zones — the Hades-style run structure (Phase B of docs/COMBAT_ZONES.md).
// An INCURSION is a short chain of self-contained CHAMBERS. Enter a chamber and
// its exit seals; clear the hostiles and the seal opens into a choice of
// reward-previewed doors (Hades' boon doors); pick one, carry your remaining
// vitality forward, and drop into the next chamber. The final chamber holds a
// warden and an extract door that pays out the run.
//
// The live run lives in the module singleton `Z` (like combat.ts's `C`), not on
// the scene object — buildZoneScene() is a pure view over it, rebuilt every
// render. walk.ts owns the moment-to-moment fight (enemies, projectiles, the
// vitality pool); this file owns the run around it.
import { S, log, whisper } from "../state";
import { modal, closeModal } from "../modal";
import { requestRender } from "../bus";
import { rand, ri, pick } from "../rng";
import { combatVitality, teardown as walkTeardown } from "./walk";
import type { WalkScene, WalkDoor, WalkRoom, WalkRect, WalkCombatSpawn } from "./walk";

interface Chamber { enemies: WalkCombatSpawn[]; warden: boolean; }
type ExitKind = "credits" | "heal" | "extract";
interface ZoneExit { id: string; kind: ExitKind; icon: string; label: string; amount: number; }
export interface ZoneResult { won: boolean; chambersCleared: number; payout: number; }

interface ZoneRun {
  biome: string;
  chambers: Chamber[];
  index: number;          // current chamber (0-based)
  cleared: boolean;       // is the CURRENT chamber cleared?
  exits: ZoneExit[] | null;
  vitality: number;       // carried across chambers
  vitalityMax: number;
  payout: number;         // salvage banked so far this run
  returnScreen: string;
  onExit?: (r: ZoneResult) => void;
  ended: boolean;
}

let Z: ZoneRun | null = null;

const ARENA = { w: 900, h: 640 };
const SPAWN = { x: 450, y: 585 };  // bottom-centre entrance
const BIOME_TITLE: Record<string, string> = {
  derelict: "DERELICT — BOARDING", silence: "SILENCED DECK", raid: "SURFACE SITE",
};

export function zoneActive() { return !!Z && !Z.ended; }

// Assemble a run. Enemy counts ramp per chamber; the last is a warden fight.
export function startZone(cfg: { biome?: string; chambers?: number; vitality?: number; returnScreen?: string; onExit?: (r: ZoneResult) => void } = {}) {
  const n = cfg.chambers ?? (3 + Math.floor(rand() * 2)); // 3–4 chambers
  const chambers: Chamber[] = [];
  for (let i = 0; i < n; i++) {
    const last = i === n - 1;
    const enemies: WalkCombatSpawn[] = [];
    if (last) {
      enemies.push({ x: ARENA.w / 2, y: 210, kind: "warden", hp: 14 });
      enemies.push({ x: ARENA.w / 2 - 150, y: 270, kind: "drone", hp: 5 });
      enemies.push({ x: ARENA.w / 2 + 150, y: 270, kind: "drone", hp: 5 });
    } else {
      const count = 2 + Math.min(2, i); // 2, 3, 3…
      for (let k = 0; k < count; k++) {
        enemies.push({ x: 170 + ri(0, ARENA.w - 340), y: 130 + ri(0, 250), kind: "drone", hp: 5 });
      }
    }
    chambers.push({ enemies, warden: last });
  }
  const vitMax = cfg.vitality ?? 100;
  Z = {
    biome: cfg.biome ?? "derelict", chambers, index: 0, cleared: false, exits: null,
    vitality: vitMax, vitalityMax: vitMax, payout: 0,
    returnScreen: cfg.returnScreen ?? "map", onExit: cfg.onExit, ended: false,
  };
  S.screen = "zone";
  requestRender();
}

export function buildZoneScene(): WalkScene {
  const z = Z!;
  const chamber = z.chambers[z.index];
  const floors: WalkRect[] = [{ x: 0, y: 0, w: ARENA.w, h: ARENA.h }];
  const rooms: WalkRoom[] = [{
    id: "chamber", x: 0, y: 0, w: ARENA.w, h: ARENA.h,
    label: `Chamber ${z.index + 1}/${z.chambers.length}`, color: "#7a3b46", kind: "combat",
  }];

  const doors: WalkDoor[] = [];
  if (z.cleared && z.exits) {
    // Boon doors: an evenly-spaced row of reward-previewed exits along the top.
    const gap = ARENA.w / (z.exits.length + 1);
    z.exits.forEach((ex, i) => doors.push({
      x: gap * (i + 1) - 62, y: 34, w: 124, h: 30,
      label: `${ex.icon} ${ex.label}`, action: () => pickExit(ex.id),
    }));
  } else {
    // Sealed: a single locked hatch telegraphs "clear to proceed".
    doors.push({ x: ARENA.w / 2 - 62, y: 34, w: 124, h: 30, label: "Sealed hatch", locked: true, lockedHint: "Sealed — clear the chamber.", action: () => {} });
  }

  // combat is only READ by walk.start() (on scene-id change), so a cleared
  // chamber returns undefined and the dead enemies + carried vitality persist.
  const combat = z.cleared ? undefined : {
    vitality: z.vitality,
    enemies: chamber.enemies,
    onClear: onChamberClear,
    onDowned: onDowned,
  };

  return {
    id: `zone:${z.biome}:${z.index}`,   // stable per chamber; advancing remounts
    title: `Incursion — ${BIOME_TITLE[z.biome] || z.biome.toUpperCase()}`,
    status: z.cleared ? "CHAMBER CLEAR · CHOOSE A HATCH" : `HOSTILES INBOUND · CHAMBER ${z.index + 1}/${z.chambers.length}`,
    width: ARENA.w, height: ARENA.h,
    floors, rooms, doors, actors: [],
    roomDesc: { chamber: z.cleared ? "The chamber is still. Ahead, hatches cycle — each one gives up something different." : "Contacts on the scope. Nowhere to be but through them." },
    spawn: { ...SPAWN },
    dark: true,
    action: true,
    combat,
  };
}

function onChamberClear() {
  const z = Z; if (!z || z.cleared) return;
  z.vitality = combatVitality();   // carry remaining health into the next chamber
  z.cleared = true;
  const last = z.index === z.chambers.length - 1;
  if (last) {
    z.exits = [{ id: "extract", kind: "extract", icon: "⏏", label: "Extract", amount: 0 }];
    whisper("The warden goes dark. The extraction hatch blows its bolts ahead of you.");
  } else {
    z.exits = rollExits();
    whisper("The last contact drops. Two hatches cycle open — you can only take one.");
  }
  requestRender();
}

// Two boon doors: bank salvage, or patch up. You only get one.
function rollExits(): ZoneExit[] {
  const credits = ri(60, 140);
  const heal = ri(20, 40);
  const salvageWord = pick(["salvage", "scrap", "a cracked cache", "a stripped panel"]);
  return [
    { id: "credits", kind: "credits", icon: "💰", label: `${salvageWord} +${credits}cr`, amount: credits },
    { id: "heal", kind: "heal", icon: "✚", label: `field repair +${heal}`, amount: heal },
  ];
}

function pickExit(id: string) {
  const z = Z; if (!z || !z.exits) return;
  const ex = z.exits.find((e) => e.id === id);
  if (!ex) return;
  if (ex.kind === "extract") { endZone(true); return; }
  if (ex.kind === "credits") { z.payout += ex.amount; log(`You strip the chamber for salvage (+${ex.amount}cr banked).`); }
  if (ex.kind === "heal") { z.vitality = Math.min(z.vitalityMax, z.vitality + ex.amount); log(`You patch up in the lull (+${ex.amount} vitality).`); }
  z.index++;
  z.cleared = false;
  z.exits = null;
  requestRender();   // new chamber id → walk remounts with fresh hostiles
}

function onDowned() {
  modal(`<h2>⚠ Downed in the Incursion</h2>
    <p>Your vitality's gone and the chamber's still hot. You claw back to the last cycled hatch and blow the emergency seals — out, but empty-handed but for whatever you'd already banked.</p>
    <div class="choices"><button class="primary" onclick="zoneBail()">Pull out</button></div>`);
}

function endZone(won: boolean) {
  const z = Z; if (!z || z.ended) return;
  z.ended = true;
  if (won) {
    const bonus = 100 + z.chambers.length * 40;
    z.payout += bonus;
    S.credits += z.payout;
    log(`Incursion complete — ${z.chambers.length} chambers cleared, extracted with ${z.payout}cr in salvage.`);
  } else {
    const kept = Math.floor(z.payout * 0.3);
    if (kept > 0) S.credits += kept;
    log(`You bail out of the incursion at chamber ${z.index + 1}. ${kept > 0 ? `Kept ${kept}cr of what you'd banked.` : "Nothing to show for it."}`);
  }
  const result: ZoneResult = { won, chambersCleared: won ? z.chambers.length : z.index, payout: won ? z.payout : Math.floor(z.payout * 0.3) };
  const cb = z.onExit;
  const back = z.returnScreen;
  Z = null;
  // Stop the walk sim before handing back to a non-walk screen (nav() does this
  // for the tab buttons, but a run ends by state change, not a nav click).
  walkTeardown();
  S.screen = back;
  requestRender();
  cb?.(result);
}

// Modal button for the downed bail-out.
export function zoneBail() { closeModal(); endZone(false); }
