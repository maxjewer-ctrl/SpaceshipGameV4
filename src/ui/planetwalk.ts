// The walkable desert town: same warren-of-rooms mechanism as stationwalk.ts
// (reused verbatim — corridors, doors, tabbed services, off-duty crew, NPCs),
// re-laid-out and re-flavored for Dustwell, a frontier world you land on
// rather than dock at. walk3d.ts recognizes this scene's id and swaps in the
// desert set-dressing (sandy floors, plank walls, the Meshy spaceport props)
// instead of station bulkhead panels — see the isDustwell branch in rebuild().
import { S } from "../state";
import { PLANETS, NPCS } from "../content";
import { npcsInRoom, openNPC } from "../systems/scene";
import { openCrewTalk } from "../systems/crewtalk";
import { isSilenced } from "../derive";
import { stationWalkTick } from "../systems/walkEncounters";
import * as sfx from "../audio";
import { boardShip, departureBoard, stationEnter } from "./stationwalk";
import type { WalkScene, WalkRoom, WalkRect, WalkDoor, WalkActor } from "./walk";

interface RoomDef { id: string; x: number; y: number; w: number; h: number; label: string; icon: string; tab?: string; }

// Same 1000x700 warren shape as the station (see stationwalk.ts ROOMS/LINKS)
// so the corridor math is identical — only the names and dressing differ.
const ROOMS: RoomDef[] = [
  { id: "harbor", x: 650, y: 40, w: 230, h: 150, label: "Sheriff's Post", icon: "🤠" },
  { id: "concourse", x: 560, y: 290, w: 260, h: 170, label: "Market Row", icon: "🌵" },
  { id: "market", x: 280, y: 220, w: 210, h: 150, label: "Trading Post", icon: "⚖️", tab: "market" },
  { id: "cantina", x: 40, y: 90, w: 220, h: 150, label: "The Saloon", icon: "🍺", tab: "cantina" },
  { id: "docks", x: 430, y: 520, w: 240, h: 150, label: "Landing Pad", icon: "🚀" },
  { id: "drydock", x: 760, y: 540, w: 220, h: 140, label: "Repair Yard", icon: "🔧", tab: "yard" },
  { id: "undercity", x: 90, y: 540, w: 230, h: 150, label: "The Outskirts", icon: "🏜️" },
];
const LINKS: [string, string][] = [
  ["harbor", "concourse"], ["concourse", "market"], ["market", "cantina"],
  ["concourse", "docks"], ["docks", "drydock"], ["docks", "undercity"],
];

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
  harbor: "A tin-roofed shack with a landing register nobody fills out honestly. The Sheriff watches the pad from a folding chair, boots up on the rail.",
  cantina: "Batwing doors, sand on the floor, a fan that's lost the fight with the heat. Deals get made over warm beer and no one asks your name twice.",
  market: "Crates and tarps under a corrugated awning. Prices are chalked on a board and rubbed out the second the wind picks a fight.",
  concourse: "The wide dirt row through the middle of town — water tower on one side, the windmill's creak on the other, everyone's business in between.",
  undercity: "Past the fence line where the streetlamps give out. Scrap traders, quiet arrangements, and a windmill turning against a sky that's already too orange.",
  drydock: "Welding sparks and a hoist that groans on every lift. The yard crew will bolt anything onto anything if the price is right.",
  docks: "Your landing strip. The shuttle ticks as it cools on the pad, dust already settling on the hull. Everything past the mooring posts is someone else's town.",
};
const DARK_DESC: Record<string, string> = {
  harbor: "The folding chair sits empty, tipped against the rail. The register page is still open to a name nobody finished writing.",
  cantina: "The batwing doors hang still. Every stool's pushed in but one, and the beer in the glass beside it has gone flat and warm.",
  market: "The chalk board still lists yesterday's prices. Tarps flap over crates nobody came back for.",
  concourse: "The windmill still turns, creaking into a street with no footprints but yours. The water tower drips into dust that swallows it instantly.",
  undercity: "Whatever business happened out past the fence line finished without anyone. The scrap is stacked, neat, and waiting for a buyer who isn't coming.",
  drydock: "A half-welded chassis sits in the cradle, torch still clipped to the frame. The last line in the work log: 'good enough.'",
  docks: "Your shuttle is the only thing on the pad that isn't buried past its wheels. The wind did the rest.",
};

function verb(tab: string): string {
  return tab === "cantina" ? "Push into the Saloon" : tab === "market" ? "Browse the Trading Post" : "Walk into the Repair Yard";
}

export function buildDesertTownScene(): WalkScene {
  const dark = isSilenced(S.loc);
  const floors: WalkRect[] = ROOMS.map((r) => ({ x: r.x, y: r.y, w: r.w, h: r.h }));
  for (const [a, b] of LINKS) {
    const A = ROOMS.find((r) => r.id === a)!, B = ROOMS.find((r) => r.id === b)!;
    floors.push(...corridor(A, B));
  }
  const serviceColor: Record<string, string> = { harbor: "#c9a15a", concourse: "#b08968", market: "#e8b04b", cantina: "#d77c3a", docks: "#d99a52", drydock: "#a86b4a", undercity: "#8a6a4a" };
  const rooms: WalkRoom[] = ROOMS.map((r) => ({ id: r.id, x: r.x, y: r.y, w: r.w, h: r.h, label: r.label, icon: r.icon, color: serviceColor[r.id], kind: r.id }));

  const doors: WalkDoor[] = [];
  const actors: WalkActor[] = [];

  for (const r of ROOMS) {
    if (r.tab) {
      doors.push({
        x: r.x + r.w / 2 - 34, y: r.y + r.h - 30, w: 68, h: 22,
        label: verb(r.tab),
        locked: dark,
        lockedHint: dark ? "Boarded up. Nobody's answering." : undefined,
        action: () => stationEnter(r.tab!),
      });
    }
    if (r.id === "docks" && !dark && S.crew.length) {
      const c = S.crew[S.day % S.crew.length];
      actors.push({
        x: r.x + r.w - 62, y: r.y + 14, w: 28, h: 28, key: "crew:" + c.id,
        label: c.name + " (off duty)", icon: "🧑‍🚀", color: "#5b8dd9",
        onInteract: () => openCrewTalk(c.id),
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
        const cols = Math.min(npcs.length, 3);
        const spacing = cols > 1 ? Math.max(64, Math.floor((r.w - 70) / (cols - 1))) : 0;
        const gx = r.x + 30 + (i % cols) * spacing;
        const gy = r.y + 44 + Math.floor(i / cols) * 56;
        actors.push({
          x: gx, y: gy, w: 30, h: 30, key,
          label: n.name, icon: n.icon || "◆",
          onInteract: () => openNPC(key),
        });
      });
    }
  }

  const roomDesc: Record<string, string> = {};
  for (const r of ROOMS) roomDesc[r.id] = (dark ? DARK_DESC[r.id] : ROOM_DESC[r.id]) || "";

  const p = PLANETS[S.loc];
  return {
    id: "station:" + S.loc,
    title: `${p.n} — Town${dark ? " (dark)" : ""}`,
    status: dark ? "SIGNAL LOST · NOBODY HOME" : `${p.n.toUpperCase()} · FRONTIER TOWN`,
    width: 1000, height: 700,
    floors, rooms, roomDesc, doors, actors,
    spawn: { x: 550, y: 590 }, // just inside the landing pad
    dark,
    // Frontier ground is action mode: past the mooring posts you keep a hand
    // near your sidearm — quicker stride, aim/fire/roll live.
    action: true,
    onTick: (moving, dt, roomId) => {
      sfx.walkRoom(roomId);
      stationWalkTick(moving, dt, roomId);
    },
  };
}
