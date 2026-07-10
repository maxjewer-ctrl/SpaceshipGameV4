// The walkable ship interior: a corridor spine from cockpit to drive core,
// module bays branching off alternating sides — generated fresh from whatever
// is actually installed, so buying or losing a module changes the deck you walk.
import { S } from "../state";
import { MODS } from "../content";
import { requestRender } from "../bus";
import { modal, closeModal } from "../modal";
import { modCategory } from "./ship";
import { crewChatLine } from "../systems/barks";
import { shipWalkTick } from "../systems/walkEncounters";
import { teardown } from "./walk";
import type { WalkScene, WalkRoom, WalkRect, WalkDoor, WalkActor } from "./walk";

const CAT_COLOR: Record<string, string> = {
  "cat-combat": "#d96b6b", "cat-flow": "#e8b04b", "cat-life": "#57b6c9",
  "cat-bio": "#6fbf73", "cat-power": "#b98bd9", "": "#7d8294",
};

function moduleStatus(m: { t: string; on: boolean; dmg: boolean }): string {
  const md = MODS[m.t];
  if (m.dmg) return "DAMAGED";
  if (md.pw) return m.on ? "online" : "powered down";
  return "operational";
}

export function crewTalk(id: number) {
  const c = S.crew.find((x) => x.id === id);
  if (!c) return;
  modal(`<div class="scene"><div class="scene-loc">${S.shipName} · crew deck</div>
    <h2>🧑‍🚀 ${c.name}</h2>
    <p>${crewChatLine(c)}</p>
    <div class="choices"><button class="primary" onclick="closeModal()">Nod and move on</button></div></div>`);
}

// Leaving to the schematic tears down the walk loop (see stationwalk.ts for why);
// hopping to the station stays inside the walk system, so ensureRunning() there
// just remounts fresh via the differing scene id — no explicit teardown needed.
function openSchematic() { teardown(); S.screen = "ship"; requestRender(); }
function toStation() { S.screen = "stationwalk"; requestRender(); }

export function buildShipScene(): WalkScene {
  const bays = S.modules.filter((m) => !MODS[m.t].core);

  const spineY = 320, spineH = 90, roomW = 210, roomH = 150;
  const cockpit: WalkRect & { id: string } = { id: "cockpit", x: 30, y: spineY - spineH / 2 - (roomH - spineH) / 2, w: roomW, h: roomH };
  const gap = 230;
  const engineX = cockpit.x + cockpit.w + gap + bays.length * gap;
  const engine: WalkRect & { id: string } = { id: "engine", x: engineX, y: cockpit.y, w: roomW, h: roomH };
  const width = engineX + roomW + 60;
  const height = 640;

  const floors: WalkRect[] = [
    { x: cockpit.x, y: cockpit.y, w: cockpit.w, h: cockpit.h },
    { x: engine.x, y: engine.y, w: engine.w, h: engine.h },
    { x: cockpit.x, y: spineY - spineH / 2, w: engine.x + engine.w - cockpit.x, h: spineH },
  ];
  const rooms: WalkRoom[] = [
    { id: "cockpit", x: cockpit.x, y: cockpit.y, w: cockpit.w, h: cockpit.h, label: MODS.cockpit.n, icon: MODS.cockpit.icon },
    { id: "engine", x: engine.x, y: engine.y, w: engine.w, h: engine.h, label: MODS.engine.n, icon: MODS.engine.icon },
  ];
  const roomDesc: Record<string, string> = {
    cockpit: "The chair still smells like the last owner's coffee. Every gauge you own reports in from here.",
    engine: `The drive core roars, patient and enormous, three meters from your spine. Mk-${["", "I", "II", "III"][S.engineLvl]}.`,
  };

  const doors: WalkDoor[] = [
    { x: cockpit.x + 16, y: cockpit.y + cockpit.h - 30, w: 120, h: 22, label: "Ship's console (schematic)", action: openSchematic },
    {
      x: cockpit.x + 16, y: cockpit.y + 24, w: 90, h: 22,
      label: "Airlock", locked: !S.docked,
      lockedHint: "Sealed. You're in transit — nowhere to go but forward.",
      action: toStation,
    },
  ];

  const actors: WalkActor[] = [];
  let quartersRoom: (WalkRect & { id: string }) | null = null;

  bays.forEach((m, i) => {
    const up = i % 2 === 0;
    const rx = cockpit.x + cockpit.w + gap / 2 + i * gap;
    const ry = up ? spineY - spineH / 2 - roomH - 30 : spineY + spineH / 2 + 30;
    const id = "bay" + i;
    const rect = { id, x: rx, y: ry, w: roomW, h: roomH };
    floors.push({ x: rect.x, y: rect.y, w: rect.w, h: rect.h });
    // connector linking the bay to the spine
    const connX = rect.x + rect.w / 2 - 23;
    floors.push(up
      ? { x: connX, y: rect.y + rect.h, w: 46, h: (spineY - spineH / 2) - (rect.y + rect.h) }
      : { x: connX, y: spineY + spineH / 2, w: 46, h: rect.y - (spineY + spineH / 2) });
    const md = MODS[m.t];
    rooms.push({ id, x: rect.x, y: rect.y, w: rect.w, h: rect.h, label: md.n, icon: md.icon, color: CAT_COLOR[modCategory(m.t)] });
    roomDesc[id] = `${md.n} — ${moduleStatus(m)}. ${md.d}`;
    if (m.t === "quarters" && !quartersRoom) quartersRoom = rect;
  });

  const crewHome = quartersRoom || cockpit;
  S.crew.forEach((c, i) => {
    const cols = 3;
    const gx = crewHome.x + 26 + (i % cols) * 54;
    const gy = crewHome.y + crewHome.h - 40 - Math.floor(i / cols) * 46;
    actors.push({
      x: gx, y: gy, w: 28, h: 28, key: "crew:" + c.id,
      label: c.name, icon: "🧑‍🚀", color: "#5b8dd9",
      onInteract: () => crewTalk(c.id),
    });
  });

  return {
    id: "ship",
    title: `${S.shipName} — Walk the Decks`,
    status: S.travel ? "◇ IN TRANSIT" : S.docked ? "● DOCKED" : "◇ ADRIFT",
    width, height,
    floors, rooms, roomDesc, doors, actors,
    spawn: { x: cockpit.x + cockpit.w / 2, y: cockpit.y + cockpit.h / 2 },
    onTick: (moving, dt) => shipWalkTick(moving, dt),
  };
}
