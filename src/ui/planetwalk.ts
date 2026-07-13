// Dustwell — a landed frontier town, NOT a docked station. Where stations are a
// warren of rooms joined by corridors (stationwalk.ts), a planet town is OPEN
// GROUND: one big walkable sand plaza ringed by a perimeter wall, with the
// services as freestanding buildings you cross the square to reach. walk3d.ts
// reads scene.openGround + scene.obstacles to raise the town wall and the
// buildings, and swaps in the desert set-dressing (sand, planks, Meshy props).
import { S } from "../state";
import { PLANETS, NPCS } from "../content";
import { npcsInRoom, openNPC } from "../systems/scene";
import { openCrewTalk } from "../systems/crewtalk";
import { isSilenced } from "../derive";
import { stationWalkTick } from "../systems/walkEncounters";
import * as sfx from "../audio";
import { boardShip, departureBoard, stationEnter } from "./stationwalk";
import type { WalkScene, WalkRoom, WalkRect, WalkDoor, WalkActor, WalkObstacle } from "./walk";

// World 1000×700. The plaza is the walkable ground; everything the player can
// stand on is inside it, and the perimeter wall is drawn at its edge.
const PLAZA: WalkRect = { x: 60, y: 60, w: 880, h: 580 };
const GATE = { x: 430, w: 140 }; // cosmetic opening in the top wall — the road out

// A building: a solid footprint on the plaza edge, a service tab (or none, for
// a landmark like the Sheriff's Post), and a door on its plaza-facing side.
interface BldDef {
  id: string; label: string; icon: string;
  x: number; y: number; w: number; h: number;
  tab?: string;                    // cantina | market | yard, else a landmark
  door: { x: number; y: number };  // door centre, on the plaza in front of it
  zone: WalkRect;                  // frontage the player stands in (desc/encounters)
}

const BUILDINGS: BldDef[] = [
  { id: "cantina", label: "The Saloon", icon: "🍺", x: 90, y: 80, w: 210, h: 120, tab: "cantina",
    door: { x: 195, y: 214 }, zone: { x: 90, y: 200, w: 210, h: 95 } },
  { id: "harbor", label: "Sheriff's Post", icon: "🤠", x: 700, y: 80, w: 210, h: 120,
    door: { x: 805, y: 214 }, zone: { x: 700, y: 200, w: 210, h: 95 } },
  { id: "market", label: "Trading Post", icon: "⚖️", x: 90, y: 315, w: 185, h: 135, tab: "market",
    door: { x: 289, y: 382 }, zone: { x: 285, y: 315, w: 120, h: 135 } },
  { id: "drydock", label: "Repair Yard", icon: "🔧", x: 725, y: 315, w: 185, h: 135, tab: "yard",
    door: { x: 711, y: 382 }, zone: { x: 595, y: 315, w: 120, h: 135 } },
  { id: "undercity", label: "The Outskirts", icon: "🏜️", x: 90, y: 500, w: 185, h: 110,
    door: { x: 289, y: 555 }, zone: { x: 285, y: 500, w: 120, h: 110 } },
];

// The ship on its pad — a solid you walk around, with the board/departure
// controls on the plaza in front of it.
const SHIP: WalkObstacle = { id: "ship", x: 410, y: 470, w: 180, h: 130, label: "your ship", tall: false };
const DOCKS_ZONE: WalkRect = { x: 360, y: 410, w: 280, h: 55 };

const ROOM_DESC: Record<string, string> = {
  harbor: "A tin-roofed shack with a landing register nobody fills out honestly. The Sheriff watches the square from a folding chair, boots up on the rail.",
  cantina: "Batwing doors and sand on the floor, a fan that's lost its fight with the heat. Deals get made over warm beer and no one asks your name twice.",
  market: "Crates and tarps under a corrugated awning. Prices are chalked on a board and rubbed out the second the wind picks a fight.",
  concourse: "The open square in the heart of Dustwell — packed sand, the water tower's shadow, the windmill's creak, and the whole town's business crossing it.",
  undercity: "The shady end of the square, past where the lamps reach. Scrap traders and quiet arrangements against a sky that's already too orange.",
  drydock: "Welding sparks and a hoist that groans on every lift. The yard crew will bolt anything onto anything if the price is right.",
  docks: "Your landing strip. The ship ticks as it cools on the pad, dust already settling on the hull.",
};
const DARK_DESC: Record<string, string> = {
  harbor: "The folding chair sits empty, tipped against the rail. The register's open to a name nobody finished writing.",
  cantina: "The batwing doors hang still. Every stool's pushed in but one, and the beer beside it has gone flat and warm.",
  market: "The chalk board still lists yesterday's prices. Tarps flap over crates nobody came back for.",
  concourse: "The windmill still turns, creaking over a square with no footprints but yours. The water tower drips into dust that swallows it.",
  undercity: "Whatever business happened out past the lamps finished without anyone. The scrap is stacked, neat, and waiting for a buyer who isn't coming.",
  drydock: "A half-welded chassis sits in the cradle, torch still clipped to the frame. The last line in the work log: 'good enough.'",
  docks: "Your ship is the only thing on the pad that isn't buried past its wheels. The wind did the rest.",
};

function verb(tab: string): string {
  return tab === "cantina" ? "Push into the Saloon" : tab === "market" ? "Browse the Trading Post" : "Walk into the Repair Yard";
}

export function buildDesertTownScene(): WalkScene {
  const dark = isSilenced(S.loc);

  // One walkable plaza. Buildings and the ship are solids carved out of it.
  const floors: WalkRect[] = [{ ...PLAZA }];
  const obstacles: WalkObstacle[] = [
    ...BUILDINGS.map((b) => ({ id: b.id, x: b.x, y: b.y, w: b.w, h: b.h, label: b.label, icon: b.icon, tall: true })),
    SHIP,
  ];

  const serviceColor: Record<string, string> = { harbor: "#c9a15a", concourse: "#b08968", market: "#e8b04b", cantina: "#d77c3a", docks: "#d99a52", drydock: "#a86b4a", undercity: "#8a6a4a" };
  // Zones (rooms) are label/desc/encounter areas over the plaza — the frontage
  // of each building, plus the whole square as the fallback. Specific zones
  // first, concourse LAST so roomAt() prefers a building's frontage.
  const rooms: WalkRoom[] = [
    ...BUILDINGS.map((b) => ({ id: b.id, ...b.zone, label: b.label, icon: b.icon, color: serviceColor[b.id], kind: b.id })),
    { id: "docks", ...DOCKS_ZONE, label: "Landing Pad", icon: "🚀", color: serviceColor.docks, kind: "docks" },
    { id: "concourse", ...PLAZA, label: "Town Square", icon: "🌵", color: serviceColor.concourse, kind: "concourse" },
  ];

  const doors: WalkDoor[] = [];
  const actors: WalkActor[] = [];

  for (const b of BUILDINGS) {
    if (b.tab) {
      doors.push({
        x: b.door.x - 34, y: b.door.y - 11, w: 68, h: 22,
        label: verb(b.tab),
        locked: dark,
        lockedHint: dark ? "Boarded up. Nobody's answering." : undefined,
        action: () => stationEnter(b.tab!),
      });
    }
    if (!dark) {
      const npcs = npcsInRoom(b.id);
      npcs.forEach((key, i) => {
        const n = NPCS[key];
        const cols = Math.min(npcs.length, 3);
        const spacing = cols > 1 ? Math.max(56, Math.floor((b.zone.w - 60) / (cols - 1))) : 0;
        const gx = b.zone.x + 20 + (i % cols) * spacing;
        const gy = b.zone.y + 22 + Math.floor(i / cols) * 48;
        actors.push({ x: gx, y: gy, w: 30, h: 30, key, label: n.name, icon: n.icon || "◆", onInteract: () => openNPC(key) });
      });
    }
  }

  // Off-duty crew loitering by the ramp, and the board/departure controls.
  if (!dark && S.crew.length) {
    const c = S.crew[S.day % S.crew.length];
    actors.push({
      x: SHIP.x + SHIP.w + 24, y: SHIP.y + 20, w: 28, h: 28, key: "crew:" + c.id,
      label: c.name + " (off duty)", icon: "🧑‍🚀", color: "#5b8dd9",
      onInteract: () => openCrewTalk(c.id),
    });
  }
  doors.push({
    x: SHIP.x + 14, y: SHIP.y - 26, w: 90, h: 22,
    label: dark ? "Back aboard. Now." : "Board your ship",
    action: boardShip,
  });
  doors.push({
    x: SHIP.x + SHIP.w - 104, y: SHIP.y - 26, w: 90, h: 22,
    label: "Departure board",
    locked: dark,
    lockedHint: dark ? "The board's dead. Nothing's coming or going here." : undefined,
    action: departureBoard,
  });

  const roomDesc: Record<string, string> = {};
  for (const r of rooms) roomDesc[r.id] = (dark ? DARK_DESC[r.id] : ROOM_DESC[r.id]) || "";

  const p = PLANETS[S.loc];
  return {
    id: "station:" + S.loc,
    title: `${p.n} — Town${dark ? " (dark)" : ""}`,
    status: dark ? "SIGNAL LOST · NOBODY HOME" : `${p.n.toUpperCase()} · FRONTIER TOWN`,
    width: 1000, height: 700,
    floors, rooms, roomDesc, doors, actors, obstacles,
    spawn: { x: 500, y: 400 }, // the middle of the square, just north of the ship
    dark,
    // Frontier ground is action mode; open-ground raises the town wall + buildings.
    action: true,
    openGround: true,
    onTick: (moving, dt, roomId) => {
      sfx.walkRoom(roomId);
      stationWalkTick(moving, dt, roomId);
    },
  };
}

// Expose the plaza + gate geometry so walk3d can raise the perimeter wall.
export const DUSTWELL_PLAZA = PLAZA;
export const DUSTWELL_GATE = GATE;
