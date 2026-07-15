// The walkable station: a real top-down deck you move a sprite through with
// WASD/arrows. The cantina hides behind the exchange, the dry dock opens off
// the docks, the undercity is down past the berths — this is the ONLY way
// onto planetside services. Once a captain has physically visited a service at
// a port, its local comm channel is retained as a fast path for repeat business.
import { S } from "../state";
import { PLANETS, NPCS, STATIONS } from "../content";
import { requestRender } from "../bus";
import { closeModal, modal } from "../modal";
import { npcsInRoom, openNPC } from "../systems/scene";
import { introDebtDoor, introDebtScene } from "../systems/intro";
import { hasPortMark, standingWord, standingGreeting } from "../systems/port";
import { moodLine, moodTag } from "../systems/moods";
import { openCrewTalk } from "../systems/crewtalk";
import { daysTo, isSilenced } from "../derive";
import { actionAttr } from "../dispatch";
import { getStationReturnAnchor, setShipReturnAnchor, setStationReturnAnchor } from "./physicalNav";

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
import { teardown, forgetSpawn, shipHatch } from "./walk";
import type { WalkScene, WalkRoom, WalkRect, WalkDoor, WalkActor, ShipBerth } from "./walk";

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
// Base label/icon/tab per room id, keyed off the shared ROOMS array so custom
// per-port layouts (below) don't have to repeat this — they only redefine
// geometry (position + who connects to whom), never room semantics.
const ROOM_META: Record<string, { label: string; icon: string; tab?: string }> =
  Object.fromEntries(ROOMS.map((r) => [r.id, { label: r.label, icon: r.icon, tab: r.tab }]));

// ---- Per-station custom layouts ----
// Every port beyond this point renders the SAME room ids through the SAME
// mechanics (doors, NPCs, ship berth, descriptions) — only the geometry and
// link graph differ, so each station has its own shape to walk and its own
// traversal logic, instead of being seven reskins of one warren. Port Solace
// (the tutorial port) and any station without an entry here keep the
// original shared warren (ROOMS/LINKS/SIGNATURE_SLOT) untouched.
interface LayoutDef {
  rects: Record<string, WalkRect>;   // base room ids -> geometry (signature room excluded)
  links: [string, string][];         // base room links (signature edges excluded)
  sigSlot: WalkRect;                 // where this port's signature room sits
  sigLinks?: [string, string][];     // override edge(s) into the signature room;
                                      // default is the single [stations.json signature.link, sig.id] edge
  // Links joining two rooms that share neither x nor y (a true diagonal L):
  // in the gap between the rooms the corridor is the ONLY floor, so a path
  // drifting off the centreline has less margin before it clips the edge and
  // wedges. List those pairs here (either order) for an extra-wide corridor,
  // beyond the default's already-generous width.
  wideLinks?: [string, string][];
}
function isWideLink(wide: [string, string][] | undefined, a: string, b: string): boolean {
  return !!wide?.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
}
const LAYOUTS: Record<string, LayoutDef> = {
  // MERIDIAN PRIME — the wheel. Union order: a true 4-way hub (concourse) so
  // every service is at most one hop from the centre — nothing hidden, nothing
  // out of the way, exactly the surveilled efficiency the vibe calls for.
  // The one exception is the Lighthouse, tucked in a quiet spur off the
  // harbormaster's office — official, but nobody official ever visits.
  meridian: {
    rects: {
      harbor:    { x: 390, y: 40,  w: 220, h: 140 },
      concourse: { x: 390, y: 270, w: 220, h: 160 },
      market:    { x: 680, y: 270, w: 220, h: 160 },
      cantina:   { x: 90,  y: 270, w: 220, h: 160 },
      docks:     { x: 390, y: 500, w: 220, h: 140 },
      drydock:   { x: 680, y: 500, w: 220, h: 140 },
    },
    links: [["harbor", "concourse"], ["concourse", "market"], ["concourse", "cantina"], ["concourse", "docks"], ["docks", "drydock"]],
    sigSlot: { x: 680, y: 40, w: 200, h: 140 },
  },
  // FOUNDRY — the spine. A straight industrial column (harbor-concourse-docks-
  // drydock) with an east wing off the gantry: cantina, and the Union Hall
  // stacked above it (organize after your shift, not before). Undercity hangs
  // off the yard, not the docks — "one deck below" Ferro, exactly as billed.
  foundry: {
    rects: {
      harbor:    { x: 390, y: 30,  w: 220, h: 130 },
      concourse: { x: 390, y: 190, w: 220, h: 140 },
      market:    { x: 130, y: 190, w: 210, h: 140 },
      cantina:   { x: 680, y: 190, w: 220, h: 140 },
      docks:     { x: 390, y: 370, w: 220, h: 140 },
      drydock:   { x: 390, y: 540, w: 220, h: 130 },
      undercity: { x: 680, y: 540, w: 210, h: 130 },
    },
    links: [["harbor", "concourse"], ["concourse", "market"], ["concourse", "cantina"], ["concourse", "docks"], ["docks", "drydock"], ["drydock", "undercity"]],
    sigSlot: { x: 680, y: 30, w: 220, h: 130 },
  },
  // KESTREL'S REST — the square. Concourse IS the town square (deliberately
  // bigger than any other port's), four services facing onto it like a real
  // agri-town green. The Grange sits off the Exchange, same as the co-op's
  // grain business always has.
  kestrel: {
    rects: {
      harbor:    { x: 380, y: 60,  w: 220, h: 130 },
      concourse: { x: 380, y: 270, w: 240, h: 170 },
      cantina:   { x: 100, y: 270, w: 220, h: 160 },
      market:    { x: 700, y: 270, w: 210, h: 160 },
      docks:     { x: 380, y: 500, w: 220, h: 140 },
      drydock:   { x: 100, y: 500, w: 210, h: 130 },
    },
    links: [["harbor", "concourse"], ["cantina", "concourse"], ["market", "concourse"], ["docks", "concourse"], ["docks", "drydock"]],
    sigSlot: { x: 700, y: 60, w: 210, h: 140 },
  },
  // HAVEN'S FOLLY — the ring. No hub, no centre — every room connects to its
  // two neighbours around a loop, so there are always two ways to anywhere and
  // getting turned around is part of the free port's charm. The Auction Floor
  // sits between the Exchange and the Undercity, exactly where you'd expect
  // "unclaimed cargo" to change hands.
  havens: {
    rects: {
      harbor:    { x: 400, y: 30,  w: 220, h: 120 },
      market:    { x: 700, y: 120, w: 220, h: 140 },
      undercity: { x: 700, y: 500, w: 210, h: 130 },
      // Bottom edge kept at 650 (unchanged) but height matched to the other
      // stations' docks rooms: a short room leaves too little clearance
      // between its centre and the ship berth's fixed vertical offset, and a
      // corridor's approach can clip the ship's obstacle footprint.
      docks:     { x: 400, y: 500, w: 220, h: 150 },
      drydock:   { x: 100, y: 500, w: 210, h: 130 },
      cantina:   { x: 40,  y: 320, w: 220, h: 140 },
      concourse: { x: 100, y: 120, w: 220, h: 140 },
    },
    links: [["harbor", "market"], ["undercity", "docks"], ["docks", "drydock"], ["drydock", "cantina"], ["cantina", "concourse"], ["concourse", "harbor"]],
    sigSlot: { x: 760, y: 320, w: 210, h: 140 },
    sigLinks: [["market", "auction"], ["undercity", "auction"]],
    // harbor-market: the two rooms share neither x nor y, and the gap between
    // them (620-700) has no room-rect backup — found unreachable at the
    // default thickness (see corridor()'s comment).
    wideLinks: [["harbor", "market"]],
  },
  // VERGE STATION — the empty reach. Everything anyone still uses huddles
  // close around the concourse; the Listening Room sits at the end of a long,
  // deliberately bare corridor — the walk itself is the loneliness.
  verge: {
    rects: {
      concourse: { x: 350, y: 260, w: 220, h: 160 },
      harbor:    { x: 350, y: 50,  w: 220, h: 140 },
      docks:     { x: 350, y: 470, w: 220, h: 140 },
      cantina:   { x: 100, y: 260, w: 220, h: 160 },
      market:    { x: 100, y: 470, w: 220, h: 140 },
      drydock:   { x: 100, y: 50,  w: 220, h: 140 },
    },
    links: [["harbor", "concourse"], ["cantina", "concourse"], ["docks", "concourse"], ["cantina", "market"], ["cantina", "drydock"]],
    sigSlot: { x: 780, y: 260, w: 210, h: 160 },
  },
};

// The rooms and corridors this specific port actually has.
function portLayout(): { defs: RoomDef[]; links: [string, string][]; sig?: RoomDef; wideLinks?: [string, string][] } {
  const cfg = STATIONS[S.loc] || {};
  const drop = new Set(cfg.drop || []);
  const custom = LAYOUTS[S.loc];
  if (custom) {
    const ids = Object.keys(custom.rects).filter((id) => !drop.has(id));
    const defs: RoomDef[] = ids.map((id) => {
      const meta = ROOM_META[id];
      return { id, ...custom.rects[id], label: cfg.labels?.[id] || meta.label, icon: meta.icon, tab: meta.tab };
    });
    let links = custom.links.filter(([a, b]) => defs.some((r) => r.id === a) && defs.some((r) => r.id === b));
    let sig: RoomDef | undefined;
    if (cfg.signature) {
      const s = cfg.signature;
      sig = { id: s.id, ...custom.sigSlot, label: s.label, icon: s.icon };
      defs.push(sig);
      links = links.concat(custom.sigLinks || [[s.link, s.id]]);
    }
    return { defs, links, sig, wideLinks: custom.wideLinks };
  }
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

// A diagonal link (rooms sharing neither x nor y) only has room-rect backup
// at its two ends — in the gap BETWEEN the rooms, the corridor is the sole
// source of floor, and the player's ~9px collision margin eats into both
// edges, shrinking the safe band. A particularly tight diagonal gap (the
// Havens ring's harbor-market link) can still want more than the default —
// see wideLinks.
function corridor(a: RoomDef, b: RoomDef, thick = 76): WalkRect[] {
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

const SERVICES = [
  { tab: "market", label: "Exchange", code: "CH 03" },
  { tab: "cantina", label: "Cantina", code: "CH 07" },
  { tab: "yard", label: "Dry Dock", code: "CH 11" },
] as const;

function serviceFlag(loc: string, tab: string): string { return `service:${loc}:${tab}`; }

export function serviceKnown(tab: string, loc = S.loc): boolean {
  return !!S.flags[serviceFlag(loc, tab)];
}

export function discoverService(tab: string, loc = S.loc): boolean {
  const key = serviceFlag(loc, tab);
  if (S.flags[key]) return false;
  S.flags[key] = true;
  return true;
}

export function stationServicesHTML(): string {
  if (isSilenced(S.loc)) {
    return `<div class="panel station-directory"><h3>Port Directory</h3>
      <div class="directory-offline">NO CARRIER<br><span>LOCAL SERVICES DARK</span></div></div>`;
  }
  const known = SERVICES.filter((service) => serviceKnown(service.tab));
  const channels = known.length
    ? known.map((service) => `<button class="service-fast" ${actionAttr("stationEnter", service.tab)}>
        <span>${service.code}</span><b>${service.label}</b><small>OPEN</small></button>`).join("")
    : `<div class="directory-offline">DIRECTORY EMPTY<br><span>VISIT A SERVICE TO STORE ITS CHANNEL</span></div>`;
  return `<div class="panel station-directory"><h3>Port Directory</h3>
    <p class="dim">Visited counters stay on the local comm net.</p>
    <div class="service-channels">${channels}</div></div>`;
}

// Every action that walks the player OFF the station deck tears down the walk
// engine first — otherwise its rAF loop and keydown listener keep running
// against a detached canvas after render() overwrites #main for the new screen.
export function stationEnter(tab: string) {
  discoverService(tab);
  setStationReturnAnchor(tab as "market" | "cantina" | "yard");
  teardown();
  S.ptab = tab;
  S.screen = "planet";
  requestRender();
}

export function exitService() {
  S.screen = "stationwalk";
  requestRender();
}

export function directoryEnter(tab: string) {
  closeModal();
  stationEnter(tab);
}

export function boardShip() {
  setShipReturnAnchor("airlock");
  teardown();
  S.screen = "shipwalk";
  requestRender();
}
export function departureBoard() {
  const destinations = Object.keys(PLANETS).filter((key) => !PLANETS[key].hidden && key !== S.loc);
  modal(`<div class="modal-context">${PLANETS[S.loc].n.toUpperCase()} · DEPARTURE BOARD</div><h2>Filed routes</h2>
    <p class="dim">Public estimates only. Plot and commit the course from your captain's chair.</p>
    <div class="departure-list">${destinations.map((key) => `<div><b>${PLANETS[key].n}</b><span>${daysTo(S.loc, key)} days</span></div>`).join("")}</div>
    <div class="choices"><button class="primary" ${actionAttr("closeModal")}>Back to the docks</button></div>`);
}

function stationDirectory() {
  const known = SERVICES.filter((service) => serviceKnown(service.tab));
  modal(`<div class="modal-context">LOCAL PORT DIRECTORY</div><h2>${PLANETS[S.loc].n} services</h2>
    <p class="dim">Only counters you have visited are stored on the local channel.</p>
      <div class="directory-modal">${known.length ? known.map((service) => `<button ${actionAttr("directoryEnter", service.tab)}><span>${service.code}</span><b>${service.label}</b></button>`).join("") : '<p>No service channels stored. Explore the station deck first.</p>'}</div>
    <div class="choices"><button ${actionAttr("closeModal")}>Close directory</button></div>`);
}

export function buildStationScene(): WalkScene {
  const dark = isSilenced(S.loc);
  const cfg = STATIONS[S.loc] || {};
  const { defs, links, sig, wideLinks } = portLayout();
  const floors: WalkRect[] = defs.map((r) => ({ x: r.x, y: r.y, w: r.w, h: r.h }));
  for (const [a, b] of links) {
    const A = defs.find((r) => r.id === a)!, B = defs.find((r) => r.id === b)!;
    floors.push(...corridor(A, B, isWideLink(wideLinks, a, b) ? 110 : undefined));
  }
  // THE RULE: the ship is on display wherever it's berthed. Stations park it in
  // a berth apron off the bottom of the docks — nose to the wall, rear hatch
  // opening onto the deck — clear of the corridor cross that hubs through docks.
  let ship: ShipBerth | undefined;
  const dk = defs.find((r) => r.id === "docks");
  if (dk) {
    floors.push({ x: dk.x + 20, y: dk.y + dk.h - 12, w: dk.w - 40, h: 42 });
    ship = { x: dk.x + 45, y: dk.y + dk.h - 42, w: dk.w - 90, h: 60, facing: "down" };
  }
  const hatch = ship ? shipHatch(ship) : null;
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
        onInteract: () => stationEnter(r.tab!),
      });
    }
    // One off-duty crew member loiters by the ramp, rotating daily — the ship
    // follows you ashore, and shore is where the real talks happen. Top-right
    // of the docks keeps them clear of the doors' interact radius.
    if (r.id === "docks" && !dark && S.crew.length && hatch) {
      const c = S.crew[S.day % S.crew.length];
      actors.push({
        x: hatch.x - 78, y: hatch.y + 4, w: 28, h: 28, key: "crew:" + c.id,
        label: c.name + " (off duty)", icon: "🧑‍🚀", color: "#5b8dd9",
        onInteract: () => openCrewTalk(c.id),
      });
    }
    if (r.id === "harbor" && introDebtDoor()) {
      doors.push({
        x: r.x + r.w / 2 - 60, y: r.y + r.h - 30, w: 120, h: 22,
        label: "Settle Captain Osei's debt",
        onInteract: introDebtScene,
      });
    }
    if (r.id === "docks" && hatch) {
      doors.push({
        x: hatch.x - 45, y: hatch.y - 11, w: 90, h: 22,
        label: dark ? "Back aboard. Now." : "Board — rear hatch",
        // The hatch is the authoritative ship transition. Keep adjacent
        // reference terminals from stealing the interaction at zone edges.
        priority: 20,
        onInteract: boardShip,
      });
      doors.push({
        x: hatch.x - 45, y: hatch.y - 62, w: 90, h: 22,
        label: "Departure board",
        locked: dark,
        lockedHint: dark ? "The board's dead. Nothing's coming or going here." : undefined,
        onInteract: departureBoard,
      });
      doors.push({
        x: hatch.x + 58, y: hatch.y - 62, w: 96, h: 22,
        label: "Port directory terminal",
        onInteract: stationDirectory,
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
    // The port's current condition — independent of standing — colours the
    // concourse, where the general mood of a place is most visible.
    const mood = moodLine(S.loc);
    if (mood) roomDesc.concourse = ((roomDesc.concourse || "") + " " + mood).trim();
  }

  const p = PLANETS[S.loc];
  const swrd = dark ? "" : standingWord(S.loc);
  const mtag = dark ? "" : moodTag(S.loc);
  const stationAnchor = getStationReturnAnchor();
  const anchorRoom = defs.find((room) => room.tab === stationAnchor);
  const spawn = anchorRoom
    ? { x: anchorRoom.x + anchorRoom.w / 2, y: anchorRoom.y + anchorRoom.h - 48 }
    : { x: 550, y: 585 };
  return {
    id: "station:" + S.loc,
    title: `${p.n} — Station Deck${dark ? " (dark)" : ""}`,
    status: dark ? "SIGNAL LOST · AUTOMATION ONLY" : `${p.n.toUpperCase()} STATION${mtag ? " · " + mtag : ""}${swrd && swrd !== "NEUTRAL" ? " · " + swrd : ""}`,
    width: 1000, height: 700,
    floors, rooms, roomDesc, doors, actors, ship,
    spawn,
    dark,
    // A silenced station is hostile ground — action mode on. A living port
    // deck is civil space: no combat verbs between you and the cantina.
    action: dark,
    onTick: (moving, dt, roomId) => {
      sfx.walkRoom(roomId);
      stationWalkTick(moving, dt, roomId);
      const service = defs.find((r) => r.id === roomId)?.tab;
      if (service && discoverService(service)) requestRender();
    },
  };
}

export function resetStation() {
  forgetSpawn("station:" + S.loc);
}
