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
import { combatVitality, teardown as walkTeardown, defaultMods } from "./walk";
import type { WalkScene, WalkDoor, WalkRoom, WalkRect, WalkCombatSpawn, WalkMods } from "./walk";
import { generateRun } from "../systems/zonegen";
import type { GenChamber } from "../systems/zonegen";

interface Chamber { enemies: WalkCombatSpawn[]; warden: boolean; }
type RewardRanges = { credits: [number, number]; heal: [number, number] };
type ExitKind = "credits" | "heal" | "extract" | "boon";
interface ZoneExit { id: string; kind: ExitKind; icon: string; label: string; amount: number; boonId?: string; }
export interface ZoneResult { won: boolean; chambersCleared: number; payout: number; }

// Boons — the run-only upgrade layer that makes each incursion a different gun.
// `once` boons (pierce/ricochet) can't stack; the rest do.
interface Boon { id: string; icon: string; name: string; desc: string; once?: boolean; apply: (m: WalkMods) => void; }
const BOONS: Boon[] = [
  { id: "spread", icon: "⋔", name: "Scattershot", desc: "+1 pellet, wider arc", apply: (m) => { m.count += 1; m.spreadArc = Math.max(m.spreadArc, .28) + .06; } },
  { id: "rapid", icon: "⚡", name: "Overclock", desc: "fire noticeably faster", apply: (m) => { m.fireRateMul *= .68; } },
  { id: "power", icon: "✷", name: "Heavy Rounds", desc: "+2 damage per hit", apply: (m) => { m.damage += 2; } },
  { id: "pierce", icon: "➹", name: "Railshot", desc: "shots punch through foes", once: true, apply: (m) => { m.pierce = true; m.color = "#ffd66b"; } },
  { id: "ricochet", icon: "⟲", name: "Ricochet", desc: "shots bounce off the walls", once: true, apply: (m) => { m.ricochet = true; m.color = "#8fe36b"; } },
  { id: "vamp", icon: "❤", name: "Leech Rounds", desc: "+3 vitality on every kill", apply: (m) => { m.lifesteal += 3; m.color = "#ff6bb0"; } },
  { id: "long", icon: "➸", name: "High-Velocity", desc: "faster, longer-range shots", apply: (m) => { m.projSpeed += 220; m.projLife += .5; } },
];

interface ZoneRun {
  biome: string;
  title: string;
  chambers: Chamber[];
  rewards: RewardRanges;
  index: number;          // current chamber (0-based)
  cleared: boolean;       // is the CURRENT chamber cleared?
  exits: ZoneExit[] | null;
  vitality: number;       // carried across chambers
  vitalityMax: number;
  payout: number;         // salvage banked so far this run
  mods: WalkMods;         // the player's gun, grown by boons across the run
  boons: string[];        // icons of boons taken, for the HUD readout
  returnScreen: string;
  onExit?: (r: ZoneResult) => void;
  ended: boolean;
}

let Z: ZoneRun | null = null;

const ARENA = { w: 900, h: 640 };
const SPAWN = { x: 450, y: 585 };  // bottom-centre entrance

export function zoneActive() { return !!Z && !Z.ended; }

// Assign arena positions to a generated chamber's enemies. The boss holds the
// centre-high ground; the rest fan out across the upper arena, away from the
// entrance. Placement is seeded (done once at startZone), never per-render.
function stage(gc: GenChamber): Chamber {
  const enemies: WalkCombatSpawn[] = gc.enemies.map((g, i) => {
    const boss = gc.boss && i === 0;
    const x = boss ? ARENA.w / 2 : 150 + ri(0, ARENA.w - 300);
    const y = boss ? 205 : 130 + ri(0, 250);
    return {
      x, y, kind: g.kind, hp: g.hp,
      speed: g.speed, fireGap: g.fireGap, shotDmg: g.shotDmg,
      touchDmg: g.touchDmg, range: g.range, size: g.size, color: g.color, behavior: g.behavior,
    };
  });
  return { enemies, warden: gc.boss };
}

// Assemble a seeded run from a biome's data (content/zones.json).
export function startZone(cfg: { biome?: string; chambers?: number; vitality?: number; returnScreen?: string; onExit?: (r: ZoneResult) => void } = {}) {
  const run = generateRun(cfg.biome ?? "derelict", cfg.chambers);
  const vitMax = cfg.vitality ?? 100;
  Z = {
    biome: run.biome, title: run.title, chambers: run.chambers.map(stage), rewards: run.rewards,
    index: 0, cleared: false, exits: null,
    vitality: vitMax, vitalityMax: vitMax, payout: 0,
    mods: defaultMods(), boons: [],
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
    mods: z.mods,
    onClear: onChamberClear,
    onDowned: onDowned,
  };

  const boonTag = z.boons.length ? ` · ${z.boons.join("")}` : "";
  return {
    id: `zone:${z.biome}:${z.index}`,   // stable per chamber; advancing remounts
    title: `Incursion — ${z.title}`,
    status: (z.cleared ? "CHAMBER CLEAR · CHOOSE A HATCH" : `HOSTILES INBOUND · CHAMBER ${z.index + 1}/${z.chambers.length}`) + boonTag,
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
    z.exits = rollExits(z);
    whisper("The last contact drops. Two hatches cycle open — you can only take one.");
  }
  requestRender();
}

// Each clear offers a real choice: a BOON (grow your gun) vs. a safe reward
// (salvage credits, or patch up). The boon door is what makes runs escalate.
function rollExits(z: ZoneRun): ZoneExit[] {
  const b = pickBoon(z);
  const boonExit: ZoneExit = b
    ? { id: "boon", kind: "boon", icon: b.icon, label: `${b.name} — ${b.desc}`, amount: 0, boonId: b.id }
    : { id: "heal", kind: "heal", icon: "✚", label: `field repair +${ri(z.rewards.heal[0], z.rewards.heal[1])}`, amount: ri(z.rewards.heal[0], z.rewards.heal[1]) };
  // The alternative: half the time cold cash, half the time a patch-up.
  const alt: ZoneExit = rand() < 0.5
    ? { id: "credits", kind: "credits", icon: "💰", label: `${pick(["salvage", "scrap", "a cracked cache", "a stripped panel"])} +${ri(z.rewards.credits[0], z.rewards.credits[1])}cr`, amount: ri(z.rewards.credits[0], z.rewards.credits[1]) }
    : { id: "heal", kind: "heal", icon: "✚", label: `field repair +${ri(z.rewards.heal[0], z.rewards.heal[1])}`, amount: ri(z.rewards.heal[0], z.rewards.heal[1]) };
  return [boonExit, alt];
}

// Pick an offered boon, excluding one-shot boons already taken.
function pickBoon(z: ZoneRun): Boon | null {
  const avail = BOONS.filter((b) => !(b.once && ((b.id === "pierce" && z.mods.pierce) || (b.id === "ricochet" && z.mods.ricochet))));
  return avail.length ? pick(avail) : null;
}

function pickExit(id: string) {
  const z = Z; if (!z || !z.exits) return;
  const ex = z.exits.find((e) => e.id === id);
  if (!ex) return;
  if (ex.kind === "extract") { endZone(true); return; }
  if (ex.kind === "boon") {
    const b = BOONS.find((x) => x.id === ex.boonId);
    if (b) { b.apply(z.mods); z.boons.push(b.icon); log(`Boon: ${b.name} — ${b.desc}.`); }
  }
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

// Debug/test: the current run's accumulated gun mods (null when no run is live).
export function zoneMods(): WalkMods | null { return Z ? Z.mods : null; }
