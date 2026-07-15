// The walkable ship interior: a corridor spine from cockpit to drive core,
// module bays branching off alternating sides — one per hull slot, in the
// arrangement set on the ship schematic, so moving, buying, or losing a
// module changes the deck you walk. Unoccupied slots are empty rooms.
import { S } from "../state";
import { MODS, ROLES } from "../content";
import { requestRender } from "../bus";
import { modal } from "../modal";
import { modCategory } from "./ship";
import { toggleMod, ensureSlots, bayCount } from "../systems/actions";
import { wearTier, wearOf } from "../systems/wear";
import { BARKS } from "../content";
import { fork } from "../rng";
import { openCrewTalk } from "../systems/crewtalk";
import { trustTier, dispositionWord } from "../systems/trust";
import { rankOf, RANK_NAME } from "../systems/veterancy";
import { shipWalkTick } from "../systems/walkEncounters";
import { introAct, introShipDoors, introRoomDesc, introSpawnEngine, introAirlockHint } from "../systems/intro";
import { teardown, setHighlight, walkInsideFloors } from "./walk";
import * as sfx from "../audio";
import type { WalkScene, WalkRoom, WalkRect, WalkDoor, WalkActor } from "./walk";
import { steerAgent } from "../systems/walkRuntime";
import { actionAttr } from "../dispatch";

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

export function crewTalk(id: number) { openCrewTalk(id); }

export function crewHighlight(id: number) { setHighlight("crew:" + id); requestRender(); }

// Leaving to the schematic tears down the walk loop (see stationwalk.ts for why);
// hopping to the station stays inside the walk system, so ensureRunning() there
// just remounts fresh via the differing scene id — no explicit teardown needed.
function openSchematic() { teardown(); S.screen = "ship"; requestRender(); }
export function walkDeck() { S.screen = "shipwalk"; requestRender(); }
export function sitChair() { openSchematic(); }

export function wkInspect(i: number) {
  const m = S.modules[i], md = m && MODS[m.t];
  if (!m || !md) return;
  sfx.uiClick();
  const wt = wearTier(m);
  const status = m.dmg ? "DAMAGED" : md.pw ? (m.on ? `ONLINE · drawing ${md.pw}⚡` : "POWERED DOWN") : "OPERATIONAL";
  modal(`<h2>${md.icon} ${md.n}</h2><p><b>${status}</b></p>
    <p class="dim">${md.d}</p><p>Wear: <b>${wt.toUpperCase()}</b> · ${Math.round(wearOf(m))}%</p>
    <div class="choices">${md.pw && !m.dmg ? `<button ${actionAttr("toggleModAndInspect", i)}>${m.on ? "⏻ Power down" : "⏻ Power up"}</button>` : ""}<button class="primary" ${actionAttr("closeModal")}>Done</button></div>`);
}

// The inspect modal's power-toggle button used to chain two calls in one
// onclick string (`toggleMod(i);wkInspect(i)`) — the dispatcher's data-action
// only carries one action name, so this composite stands in for that pair.
export function toggleModAndInspect(i: number) { toggleMod(i); wkInspect(i); }
function toStation() { S.screen = "stationwalk"; requestRender(); }

const ROOM_KIND: Record<string, string> = {
  cockpit: "cockpit", engine: "engine", cargohold: "cargo", quarters: "quarters",
  medbay: "medbay", hydro: "hydro",
};

// Which module types a role gravitates to, checked in order — first one
// actually installed wins. Empty list means "always the cockpit" (the pilot).
export const ROLE_POSTS: Record<string, string[]> = {
  pilot: [],
  mechanic: ["workshop", "engine"],
  gunner: ["weapons", "armory"],
  medic: ["medbay"],
  cook: ["hydro"],
  quartermaster: ["cargohold"],
};

// Placeholder exterior wireframe: a hull silhouette wrapped around whatever
// rooms are installed — pointed nose forward of the cockpit, engine nozzle
// aft, shoulders flaring over the module bays. Purely a design aid so room
// placement can be locked down against the ship's outer shape before real
// hull art exists; it grows with the bay count like the deck itself does.
function hullOutline(
  cockpit: WalkRect, engine: WalkRect, rooms: WalkRoom[], width: number, spineY: number,
): Array<{ x: number; y: number }> {
  const top = Math.min(...rooms.map((r) => r.y)) - 26;
  const bottom = Math.max(...rooms.map((r) => r.y + r.h)) + 26;
  const shoulderFwd = cockpit.x + cockpit.w + 50;
  const shoulderAft = engine.x - 50;
  return [
    { x: 6, y: spineY },                                          // nose tip
    { x: cockpit.x - 6, y: cockpit.y - 14 },                      // canopy, top
    { x: shoulderFwd, y: top },                                   // forward shoulder
    { x: shoulderAft, y: top },                                   // aft shoulder
    { x: engine.x + 10, y: engine.y - 14 },                       // engine cowl
    { x: width - 44, y: engine.y - 14 },
    { x: width - 8, y: spineY - 34 },                             // nozzle, top lip
    { x: width - 8, y: spineY + 34 },                             // nozzle, bottom lip
    { x: width - 44, y: engine.y + engine.h + 14 },
    { x: engine.x + 10, y: engine.y + engine.h + 14 },            // mirrored belly run
    { x: shoulderAft, y: bottom },
    { x: shoulderFwd, y: bottom },
    { x: cockpit.x - 6, y: cockpit.y + cockpit.h + 14 },          // canopy, bottom
  ];
}

export function buildShipScene(): WalkScene {
  // One walkable bay per hull SLOT, in the arrangement the player set on the
  // ship schematic — unoccupied slots become empty rooms (bare plating you
  // can stand in), so the deck plan and the module selector are literally
  // the same map, and a hull expansion visibly lengthens the ship.
  ensureSlots();
  const inst = S.modules.map((m, index) => ({ m, index })).filter(({m}) => !MODS[m.t].core);
  const bays = Array.from({ length: bayCount() }, (_, slot) => inst.find(({m}) => m.slot === slot) || null);

  const spineY = 320, spineH = 140, roomW = 210, roomH = 150;
  const connW = 74; // bay-to-spine connector width — kept wide alongside the spine
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
    { id: "cockpit", x: cockpit.x, y: cockpit.y, w: cockpit.w, h: cockpit.h, label: MODS.cockpit.n, icon: MODS.cockpit.icon, kind: "cockpit" },
    { id: "engine", x: engine.x, y: engine.y, w: engine.w, h: engine.h, label: MODS.engine.n, icon: MODS.engine.icon, kind: "engine" },
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
      lockedHint: introAirlockHint() || "Sealed. You're in transit — nowhere to go but forward.",
      action: toStation,
    },
  ];
  // Prologue beats appear as doors in the rooms they live in — the campaign
  // decides which; this only knows where cockpit and engine walls are.
  for (const spec of introShipDoors()) {
    const r = spec.room === "cockpit" ? cockpit : engine;
    doors.push({
      x: r.x + r.w - 150, y: r.y + r.h - 60, w: 134, h: 22,
      label: spec.label,
      objective: true,
      action: () => introAct(spec.act),
    });
  }

  const actors: WalkActor[] = [];
  let quartersRoom: (WalkRect & { id: string }) | null = null;
  const bayRoomByType: Record<string, WalkRect & { id: string }> = {};

  bays.forEach((bay, i) => {
    const up = i % 2 === 0;
    const rx = cockpit.x + cockpit.w + gap / 2 + i * gap;
    const ry = up ? spineY - spineH / 2 - roomH - 30 : spineY + spineH / 2 + 30;
    const id = "bay" + i;
    const rect = { id, x: rx, y: ry, w: roomW, h: roomH };
    floors.push({ x: rect.x, y: rect.y, w: rect.w, h: rect.h });
    // connector linking the bay to the spine
    const connX = rect.x + rect.w / 2 - connW / 2;
    floors.push(up
      ? { x: connX, y: rect.y + rect.h, w: connW, h: (spineY - spineH / 2) - (rect.y + rect.h) }
      : { x: connX, y: spineY + spineH / 2, w: connW, h: rect.y - (spineY + spineH / 2) });
    if (!bay) {
      rooms.push({ id, x: rect.x, y: rect.y, w: rect.w, h: rect.h, label: "Empty Bay", icon: "▢", color: "#3a3f48" });
      roomDesc[id] = "Bare deck plating and capped conduit stubs — room for a module. Shipyards sell them planetside.";
      return;
    }
    const { m, index } = bay;
    const md = MODS[m.t];
    rooms.push({ id, x: rect.x, y: rect.y, w: rect.w, h: rect.h, label: md.n, icon: md.icon, color: CAT_COLOR[modCategory(m.t)], kind: ROOM_KIND[m.t], moduleIndex: index, moduleType: m.t });
    roomDesc[id] = `${md.n} — ${moduleStatus(m)}. ${md.d}`;
    if (m.t === "quarters" && !quartersRoom) quartersRoom = rect;
    if (!bayRoomByType[m.t]) bayRoomByType[m.t] = rect;
    actors.push({ x: rect.x + rect.w / 2 - 14, y: rect.y + rect.h / 2 - 14, w: 28, h: 28,
      key: `module:${index}`, label: md.n, icon: md.icon, color: CAT_COLOR[modCategory(m.t)], verb: "Inspect", onInteract: () => wkInspect(index) });
  });

  // Centred on the chair model itself (walk3d's spawnCockpitProps puts it .48
  // world-units aft of room centre = 24 game units), so the prompt appears when
  // you're standing at the chair you can see, not a stride behind it.
  actors.push({ x: cockpit.x + cockpit.w / 2 - 14, y: cockpit.y + cockpit.h - 65, w: 28, h: 28,
    key: "captains-chair", label: "captain's chair", icon: "🪑", color: "#e8b04b", verb: "Sit in", onInteract: sitChair });

  // Crew stand at a post that matches their job, falling back to quarters
  // then the cockpit — always somewhere legal to stand.
  function postFor(role: string): WalkRect & { id: string } {
    for (const t of ROLE_POSTS[role] || []) if (bayRoomByType[t]) return bayRoomByType[t];
    return quartersRoom || cockpit;
  }
  const roomOccupancy: Record<string, number> = {};
  S.crew.forEach((c) => {
    const post = postFor(c.role);
    const slot = roomOccupancy[post.id] || 0;
    roomOccupancy[post.id] = slot + 1;
    const cols = 3;
    // deterministic scatter so crew sharing a post aren't stacked, but stable
    // across renders (no per-frame jitter to fight the idle bob with)
    const gx = post.x + 26 + (slot % cols) * 54;
    const gy = post.y + post.h - 40 - Math.floor(slot / cols) * 46;
    const ag = crewAgents[c.id] || (crewAgents[c.id] = { x: gx, y: gy, tx: gx, ty: gy, mode: "post", timer: 12 + cosmetic(c.id) * 12, bubble: "", bubbleTime: 0 });
    actors.push({
      x: ag.x, y: ag.y, w: 28, h: 28, key: "crew:" + c.id,
      label: c.name, icon: "🧑‍🚀", color: "#5b8dd9",
      role: c.role, modelKey: c.key, bubble: ag.bubble || undefined,
      onInteract: () => crewTalk(c.id),
    });
  });

  // Prologue overrides: room prose follows the story beats, and the cold open
  // wakes you aft by the drive core instead of in the captain's seat.
  Object.assign(roomDesc, introRoomDesc());
  const spawn = introSpawnEngine()
    ? { x: engine.x + engine.w / 2, y: engine.y + engine.h / 2 }
    : { x: cockpit.x + cockpit.w / 2, y: cockpit.y + cockpit.h / 2 };
  return {
    id: "ship",
    title: `${S.shipName} — Walk the Decks`,
    status: S.travel ? "◇ IN TRANSIT" : S.docked ? "● DOCKED" : "◇ ADRIFT",
    width, height,
    floors, rooms, roomDesc, doors, actors,
    hull: hullOutline(cockpit, engine, rooms, width, spineY),
    spawn,
    onTick: (moving, dt, roomId) => {
      const room = rooms.find((r) => r.id === roomId);
      sfx.walkRoom(room?.kind ?? null);
      shipWalkTick(moving, dt);
      tickCrew(dt, actors, cockpit, quartersRoom, postFor);
    },
  };
}

type CrewAgent = { x:number; y:number; tx:number; ty:number; mode:"post"|"walking"|"break"; timer:number; bubble:string; bubbleTime:number };
const crewAgents: Record<number, CrewAgent> = {};
function cosmetic(id:number){ return fork(`walk-crew:${S.seed}:${S.day}:${id}`)(); }
function quietLine(name:string): string {
  const lines = BARKS.filter((b:any)=>b.when==="quiet").map((b:any)=>String(b.text).replace(/\{name\}/g,name).replace(/\{[^}]+\}/g,"the black"));
  return lines.length ? lines[Math.floor(cosmetic(name.length + S.day) * lines.length)] : "All quiet on my end.";
}
function tickCrew(dt:number, actors:WalkActor[], cockpit:WalkRect, quarters:WalkRect|null, postFor:(role:string)=>WalkRect){
  for(const c of S.crew){const a=crewAgents[c.id];if(!a)continue;a.timer-=dt;a.bubbleTime-=dt;if(a.bubbleTime<=0)a.bubble="";
    if(a.timer<=0){if(a.mode==="post"){const r=quarters||cockpit;a.tx=r.x+r.w/2-14;a.ty=r.y+r.h/2-14;a.mode="walking";}
      else if(a.mode==="break"){const r=postFor(c.role);a.tx=r.x+r.w/2-14;a.ty=r.y+r.h-54;a.mode="walking";}
      else {const p=postFor(c.role),atPost=Math.hypot(a.x-(p.x+p.w/2-14),a.y-(p.y+p.h-54))<60;a.mode=atPost?"post":"break";a.timer=20+cosmetic(c.id+S.day)*20;if(cosmetic(c.id+17)<.35){a.bubble=quietLine(c.name);a.bubbleTime=6;}}}
    if(a.mode==="walking"){const dx=a.tx-a.x,dy=a.ty-a.y,d=Math.hypot(dx,dy);if(d<5){a.mode=(quarters&&a.tx>quarters.x&&a.tx<quarters.x+quarters.w)?"break":"post";a.timer=20+cosmetic(c.id+31)*20;}else{const next=steerAgent(a,{x:a.tx,y:a.ty},75,dt);if(walkInsideFloors(next.x+14,a.y+14))a.x=next.x;if(walkInsideFloors(a.x+14,next.y+14))a.y=next.y;}}
    const actor=actors.find(x=>x.key==="crew:"+c.id);if(actor){actor.x=a.x;actor.y=a.y;actor.bubble=a.bubble||undefined;}
  }
}

const TIER_DOT: Record<string, string> = {
  stranger: "#5c636e", shipmate: "#5b8dd9", trusted: "#e8b04b", bonded: "#6fbf73",
};

// Replaces the captain's log sidebar while walking the decks — a live read on
// who's aboard, how long they've flown with you, and how they feel about it.
export function crewRosterHTML(): string {
  if (!S.crew.length) {
    return `<div class="panel"><h3>Crew Roster</h3><div class="dim">Nobody aboard but you. Hire hands in planet cantinas.</div></div>`;
  }
  const rows = S.crew.map((c) => {
    const tier = trustTier(c);
    const dw = dispositionWord(c);
    const rank = rankOf(c);
    const rankTag = rank > 1 ? ` · <span class="dim">${RANK_NAME[rank]}</span>` : "";
    const quest = c.questStage === 2 ? " · on a quiet errand" : c.questStage === 3 && c.perk ? " · settled, and grateful" : "";
    return `<div class="cr-row" ${actionAttr("crewHighlight", c.id)} title="Click to find them on deck">
      <span class="cr-dot" style="background:${TIER_DOT[tier]}"></span>
      <div class="cr-info">
        <div class="cr-name">${c.name}</div>
        <div class="cr-meta"><span class="ctword ${dw.cls}">${dw.word}</span> · ${ROLES[c.role]?.n || c.role}${rankTag} · ${c.daysAboard || 0}d aboard${quest}</div>
      </div>
    </div>`;
  }).join("");
  return `<div class="panel"><h3>Crew Roster (${S.crew.length})</h3>${rows}</div>`;
}
