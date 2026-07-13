// The walkable station: a real top-down deck you move a sprite through with
// WASD/arrows. The cantina hides behind the exchange, the dry dock opens off
// the docks, the undercity is down past the berths — this is the ONLY way
// onto planetside services; there is no shortcut nav button into the cantina.
import { S } from "../state";
import { PLANETS, NPCS, STATIONS } from "../content";
import { requestRender } from "../bus";
import { npcsInRoom, openNPC } from "../systems/scene";
import { introDebtDoor, introDebtScene } from "../systems/intro";
import { hasPortMark, standingWord, standingGreeting } from "../systems/port";
import { openCrewTalk } from "../systems/crewtalk";
import { isSilenced } from "../derive";

// Location-stamped consequence set-dressing: a permanent physical change to
// ONE station, keyed to something you did there. { mark: [room, appended prose] }
const PORT_MARKS: Record<string, [string, string]> = {
  bev_stall: ["market", "Off the main floor, a salvage stall you paid to exist: Bev works it now, and waves you over. Her fuel runs cheap for the ship that cleared her ledger."],
  tomas_chair: ["undercity", "The recycler line runs one chair short these days. The crew leave it empty on purpose — the seat of a man who got out."],
  tomas_bonded: ["undercity", "Tomas still works the line, head down, cheap as ever. He doesn't look up when you pass. The other hands do, and then they don't."],
  aldren_berth: ["docks", "The berth where a family slept one night is roped off now, unassigned. Nobody on this deck will say why. You could."],
  aldren_thanks: ["docks", "A dockhand nods at your ship every time you make port here — word got around who stopped, the night of the sweep."],
};
import { stationWalkTick } from "../systems/walkEncounters";
import * as sfx from "../audio";
import { teardown, forgetSpawn } from "./walk";
import type { WalkScene, WalkRoom, WalkRect, WalkDoor, WalkActor } from "./walk";

interface RoomDef { id: string; x: number; y: number; w: number; h: number; label: string; icon: string; tab?: string; }

// World 1000x700. A warren, not a wheel — see LINKS for who connects to whom.
// This is the COMMON room set; each port filters/relabels it and may add one
// signature room via stations.json (docs/STATION_IDENTITY.md).
const ROOMS: RoomDef[] = [
  { id: "harbor", x: 650, y: 40, w: 230, h: 150, label: "Harbormaster", icon: "🛃" },
  { id: "concourse", x: 560, y: 290, w: 260, h: 170, label: "Concourse", icon: "🏛️" },
  { id: "market", x: 280, y: 220, w: 210, h: 150, label: "Exchange", icon: "⚖️", tab: "market" },
  { id: "cantina", x: 40, y: 90, w: 220, h: 150, label: "Cantina", icon: "🍺", tab: "cantina" },
  { id: "docks", x: 430, y: 520, w: 240, h: 150, label: "Docks", icon: "🚀" },
  { id: "drydock", x: 760, y: 540, w: 220, h: 140, label: "Dry Dock", icon: "🔧", tab: "yard" },
  { id: "undercity", x: 90, y: 540, w: 230, h: 150, label: "The Undercity", icon: "🕯️" },
];
// Signature rooms all take the one free slot in the layout (top-center, clear
// of cantina/market/harbor) — only one exists per port, so they never collide.
const SIGNATURE_SLOT = { x: 330, y: 40, w: 210, h: 150 };
const LINKS: [string, string][] = [
  ["harbor", "concourse"], ["concourse", "market"], ["market", "cantina"],
  ["concourse", "docks"], ["docks", "drydock"], ["docks", "undercity"],
];

// The rooms and corridors this specific port actually has.
function portLayout(): { defs: RoomDef[]; links: [string, string][]; sig?: RoomDef } {
  const cfg = STATIONS[S.loc] || {};
  const drop = new Set(cfg.drop || []);
  const defs: RoomDef[] = ROOMS.filter((r) => !drop.has(r.id)).map((r) => ({
    ...r, label: cfg.labels?.[r.id] || r.label,
  }));
  const links = LINKS.filter(([a, b]) =>
    defs.some((r) => r.id === a) && defs.some((r) => r.id === b));
  let sig: RoomDef | undefined;
  if (cfg.signature) {
    const s = cfg.signature;
    sig = { id: s.id, ...SIGNATURE_SLOT, label: s.label, icon: s.icon };
    defs.push(sig);
    links.push([s.link, s.id]);
  }
  return { defs, links, sig };
}

function corridor(a: RoomDef, b: RoomDef, thick = 46): WalkRect[] {
  const acx = a.x + a.w / 2, acy = a.y + a.h / 2;
  const bcx = b.x + b.w / 2, bcy = b.y + b.h / 2;
  const half = thick / 2;
  return [
    { x: Math.min(acx, bcx) - half, y: acy - half, w: Math.abs(bcx - acx) + thick, h: thick },
    { x: bcx - half, y: Math.min(acy, bcy) - half, w: thick, h: Math.abs(bcy - acy) + thick },
  ];
}

const ROOM_DESC: Record<string, string> = {
  harbor: "Frosted glass and a queue that never moves. The harbormaster decides whose papers are in order today — and whose fees went up.",
  cantina: "Warmth, noise, and the smell of cheap protein and cheaper liquor. Work changes hands here, and so do secrets.",
  market: "The commodities floor. Numbers scroll, hands are shaken, and nobody asks where anything came from.",
  concourse: "The station's crossroads under a false-sky ceiling. Everyone passes through eventually.",
  undercity: "Below the plating, where the light gives out. Bonded labor, back rooms, and the people the concourse pretends not to see.",
  drydock: "Sparks, cranes, and the yard crew who'll weld anything onto anything for the right number.",
  docks: "Your berth. The ship ticks as she cools. Beyond the airlock, the station hums with other people's business.",
};
const DARK_DESC: Record<string, string> = {
  harbor: "The queue posts stand in perfect order. The fee schedule still cycles on the screen behind the empty desk, revising itself upward for no one.",
  cantina: "Every tap still works. Trays of food at empty tables, gone soft. The radio behind the bar plays the hiss between stations at careful, deliberate volume.",
  market: "The boards still scroll prices for a market with no traders. Somewhere in the racks a cooling fan finds a frequency that sounds almost like humming.",
  concourse: "The false-sky ceiling still runs its daylight cycle over an empty floor. Your bootsteps don't echo the way they should.",
  undercity: "The recycler lines run themselves. Neat rows of tools set down mid-task — not dropped. Set down, carefully, by people who knew they wouldn't need them again.",
  drydock: "A ship sits half-repaired in the cradle, welding rig still clamped to her spine. The work log's last entry reads, in full: 'done now.'",
  docks: "Your ship is the only thing on this deck with a heartbeat. The berth clamps took you in like the automation never stopped caring. It didn't.",
};

function verb(tab: string): string {
  return tab === "cantina" ? "Step into the Cantina" : tab === "market" ? "Walk the Exchange floor" : "Enter the Dry Dock";
}

// Every action that walks the player OFF the station deck tears down the walk
// engine first — otherwise its rAF loop and keydown listener keep running
// against a detached canvas after render() overwrites #main for the new screen.
export function stationEnter(tab: string) {
  teardown();
  S.ptab = tab;
  S.screen = "planet";
  requestRender();
}

export function boardShip() {
  teardown();
  S.screen = "shipwalk";
  requestRender();
}
export function departureBoard() {
  teardown();
  S.screen = "map";
  requestRender();
}

export function buildStationScene(): WalkScene {
  const dark = isSilenced(S.loc);
  const cfg = STATIONS[S.loc] || {};
  const { defs, links, sig } = portLayout();
  const floors: WalkRect[] = defs.map((r) => ({ x: r.x, y: r.y, w: r.w, h: r.h }));
  for (const [a, b] of links) {
    const A = defs.find((r) => r.id === a)!, B = defs.find((r) => r.id === b)!;
    floors.push(...corridor(A, B));
  }
  const serviceColor: Record<string,string> = { harbor:"#74a7d8", concourse:"#9aa6bd", market:"#e8b04b", cantina:"#d77c55", docks:"#5b8dd9", drydock:"#d96b6b", undercity:"#7b6a9f" };
  const rooms: WalkRoom[] = defs.map((r) => ({
    id: r.id, x: r.x, y: r.y, w: r.w, h: r.h, label: r.label, icon: r.icon,
    color: serviceColor[r.id] || cfg.signature?.color,
    // signature rooms borrow an existing room's soundscape
    kind: r.id === sig?.id ? cfg.signature!.sound : r.id,
  }));

  const doors: WalkDoor[] = [];
  const actors: WalkActor[] = [];

  for (const r of defs) {
    if (r.tab) {
      doors.push({
        x: r.x + r.w / 2 - 34, y: r.y + r.h - 30, w: 68, h: 22,
        label: verb(r.tab),
        locked: dark,
        lockedHint: dark ? "Locked down. Nothing answers." : undefined,
        action: () => stationEnter(r.tab!),
      });
    }
    // One off-duty crew member loiters by the ramp, rotating daily — the ship
    // follows you ashore, and shore is where the real talks happen. Top-right
    // of the docks keeps them clear of the doors' interact radius.
    if (r.id === "docks" && !dark && S.crew.length) {
      const c = S.crew[S.day % S.crew.length];
      actors.push({
        x: r.x + r.w - 62, y: r.y + 14, w: 28, h: 28, key: "crew:" + c.id,
        label: c.name + " (off duty)", icon: "🧑‍🚀", color: "#5b8dd9",
        onInteract: () => openCrewTalk(c.id),
      });
    }
    if (r.id === "harbor" && introDebtDoor()) {
      doors.push({
        x: r.x + r.w / 2 - 60, y: r.y + r.h - 30, w: 120, h: 22,
        label: "Settle Captain Osei's debt",
        action: introDebtScene,
      });
    }
    if (r.id === "docks") {
      doors.push({
        x: r.x + 18, y: r.y + r.h - 30, w: 90, h: 22,
        label: dark ? "Back aboard. Now." : "Board your ship",
        action: boardShip,
      });
      doors.push({
        x: r.x + r.w - 108, y: r.y + r.h - 30, w: 90, h: 22,
        label: "Departure board",
        locked: dark,
        lockedHint: dark ? "The board's dead. Nothing's coming or going here." : undefined,
        action: departureBoard,
      });
    }
    if (!dark) {
      const npcs = npcsInRoom(r.id);
      npcs.forEach((key, i) => {
        const n = NPCS[key];
        // Spread wider than the 40px interact radius so picking the NPC you
        // meant is a walk, not a lottery, when a room holds three of them.
        const cols = Math.min(npcs.length, 3);
        const spacing = cols > 1 ? Math.max(64, Math.floor((r.w - 70) / (cols - 1))) : 0;
        const gx = r.x + 30 + (i % cols) * spacing;
        const gy = r.y + 44 + Math.floor(i / cols) * 56;
        actors.push({
          x: gx, y: gy, w: 30, h: 30, key,
          // no colour: walk3d deals wardrobe/skin from the key hash, so the
          // concourse reads as a crowd of different people, not gold clones
          label: n.name, icon: n.icon || "◆",
          onInteract: () => openNPC(key),
        });
      });
    }
  }

  const roomDesc: Record<string, string> = {};
  for (const r of defs) {
    if (dark) {
      // Silenced port: generic dark prose; signature rooms get their own dark
      // line if authored, else a fallback that fits any abandoned room.
      roomDesc[r.id] = DARK_DESC[r.id]
        || (r.id === sig?.id && cfg.signature?.dark)
        || "Nothing moves in here. Whatever this room was for, it ended mid-task.";
    } else {
      roomDesc[r.id] = cfg.desc?.[r.id]
        || (r.id === sig?.id ? cfg.signature!.desc : ROOM_DESC[r.id])
        || "";
    }
  }
  if (!dark) {
    // Consequence set-dressing: mark prose is appended to its room.
    for (const key in PORT_MARKS) {
      if (!hasPortMark(S.loc, key)) continue;
      const [room, text] = PORT_MARKS[key];
      roomDesc[room] = ((roomDesc[room] || "") + " " + text).trim();
    }
    // Your standing colours the berth prose — the port greets you at the ramp.
    const greet = standingGreeting(S.loc);
    if (greet) roomDesc.docks = ((roomDesc.docks || "") + " " + greet).trim();
  }

  const p = PLANETS[S.loc];
  const swrd = dark ? "" : standingWord(S.loc);
  return {
    id: "station:" + S.loc,
    title: `${p.n} — Station Deck${dark ? " (dark)" : ""}`,
    status: dark ? "SIGNAL LOST · AUTOMATION ONLY" : `${p.n.toUpperCase()} STATION${swrd && swrd !== "NEUTRAL" ? " · " + swrd : ""}`,
    width: 1000, height: 700,
    floors, rooms, roomDesc, doors, actors,
    spawn: { x: 550, y: 590 }, // just inside the docks room
    dark,
    onTick: (moving, dt, roomId) => {
      sfx.walkRoom(roomId);
      stationWalkTick(moving, dt, roomId);
    },
  };
}

export function resetStation() {
  forgetSpawn("station:" + S.loc);
}
