// The walkable station: a top-down deck rendered in the nav-computer scope style.
// You click a room to walk your marker there; the room panel below shows what's
// inside — doors into the commerce screens, and the station's characters.
import { S } from "../state";
import { PLANETS } from "../content";
import { requestRender } from "../bus";
import { reputation } from "../systems/disposition";
import { npcsInRoom } from "../systems/scene";
import { NPCS } from "../content";
import { fmt } from "../util";
import { isSilenced } from "../derive";

interface Room { id: string; x: number; y: number; label: string; icon: string; kind: string; tab?: string; }

// One shared deck layout, flavoured per world. viewBox is 600 x 400.
// The deck is a warren, not a wheel: the cantina hides behind the exchange,
// the dry dock opens off the docks, and the undercity is down past the berths.
const ROOMS: Room[] = [
  { id: "harbor", x: 390, y: 60, label: "Harbormaster", icon: "🛃", kind: "npc" },
  { id: "cantina", x: 100, y: 105, label: "Cantina", icon: "🍺", kind: "tab", tab: "cantina" },
  { id: "market", x: 240, y: 140, label: "Exchange", icon: "⚖️", kind: "tab", tab: "market" },
  { id: "concourse", x: 390, y: 175, label: "Concourse", icon: "🏛️", kind: "hub" },
  { id: "undercity", x: 130, y: 300, label: "The Undercity", icon: "🕯️", kind: "npc" },
  { id: "drydock", x: 470, y: 320, label: "Dry Dock", icon: "🔧", kind: "tab", tab: "yard" },
  { id: "docks", x: 300, y: 320, label: "Docks", icon: "🚀", kind: "dock" },
];
const LINKS: [string, string][] = [
  ["harbor", "concourse"],
  ["concourse", "market"],
  ["market", "cantina"],
  ["concourse", "docks"],
  ["docks", "drydock"],
  ["docks", "undercity"],
];

function neighbors(id: string): string[] {
  const out: string[] = [];
  for (const [a, b] of LINKS) {
    if (a === id) out.push(b);
    if (b === id) out.push(a);
  }
  return out;
}

// Shortest corridor route between two rooms (BFS over LINKS).
function findPath(from: string, to: string): string[] {
  if (from === to) return [];
  const prev: Record<string, string> = {};
  const queue = [from];
  const seen = new Set([from]);
  while (queue.length) {
    const cur = queue.shift()!;
    for (const n of neighbors(cur)) {
      if (seen.has(n)) continue;
      seen.add(n);
      prev[n] = cur;
      if (n === to) {
        const path: string[] = [to];
        let p = to;
        while (prev[p] !== from) { p = prev[p]; path.unshift(p); }
        return path;
      }
      queue.push(n);
    }
  }
  return [];
}

// What the same rooms feel like after a station stops answering.
const DARK_DESC: Record<string, string> = {
  harbor: "The queue posts stand in perfect order. The fee schedule is still cycling on the screen behind the empty desk, revising itself upward for no one.",
  cantina: "Every tap still works. Trays of food at empty tables, gone soft. The radio behind the bar is playing the hiss between stations at careful, deliberate volume.",
  market: "The boards still scroll prices for a market with no traders. Somewhere in the racks, a cooling fan finds a frequency that sounds almost like humming.",
  concourse: "The false-sky ceiling still runs its daylight cycle over an empty floor. Your bootsteps don't echo the way they should. The air has been persuaded not to carry them.",
  undercity: "The recycler lines run themselves. Neat rows of tools set down mid-task — not dropped. Set down, carefully, by people who knew they wouldn't need them again.",
  drydock: "A ship sits half-repaired in the cradle, welding rig still clamped to her spine. The work log's last entry is timestamped mid-shift and reads, in full: 'done now.'",
  docks: "Your ship is the only thing on this deck with a heartbeat. The berth clamps took you in like the automation never stopped caring. It didn't.",
};

const ROOM_DESC: Record<string, string> = {
  harbor: "Frosted glass and a queue that never moves. The harbormaster's office decides whose papers are in order today — and whose fees went up.",
  cantina: "Warmth, noise, and the smell of cheap protein and cheaper liquor. Work changes hands here, and so do secrets.",
  market: "The commodities floor. Numbers scroll, hands are shaken, and nobody asks where anything came from.",
  concourse: "The station's crossroads under a false-sky ceiling. Everyone passes through eventually — organizers, officers, and the people they use.",
  undercity: "Below the plating, where the light gives out. Bonded labor, back rooms, and the people the concourse pretends not to see.",
  drydock: "Sparks, cranes, and the yard crew who'll weld anything onto anything for the right number.",
  docks: "Your berth. The ship ticks as she cools. Beyond the airlock, the station hums with other people's business.",
};

let currentRoom = "docks";
let walkTimer: ReturnType<typeof setTimeout> | null = null;
export function stationRoom() { return currentRoom; }

// Walk there, don't teleport: step the marker through each corridor room on the
// BFS route. Clicking mid-walk re-routes from wherever you currently are.
export function stationGo(room: string) {
  if (walkTimer) { clearTimeout(walkTimer); walkTimer = null; }
  const path = findPath(currentRoom, room);
  if (!path.length) { requestRender(); return; }
  const step = () => {
    currentRoom = path.shift()!;
    requestRender();
    if (path.length) walkTimer = setTimeout(step, 340);
    else walkTimer = null;
  };
  step();
}

export function resetStation() {
  if (walkTimer) { clearTimeout(walkTimer); walkTimer = null; }
  currentRoom = "docks";
}

function roomNode(r: Room, cur: boolean): string {
  const npcCount = npcsInRoom(r.id).length;
  const w = 96, h = 46;
  return `<g class="st-room ${cur ? "cur" : ""}" onclick="stationGo('${r.id}')" style="cursor:pointer">
    <rect x="${r.x - w / 2}" y="${r.y - h / 2}" width="${w}" height="${h}" rx="6"
      fill="${cur ? "#1c2131" : "#12151f"}" stroke="${cur ? "#e8b04b" : "#39405a"}" stroke-width="${cur ? 2 : 1}"/>
    <text x="${r.x}" y="${r.y - 4}" text-anchor="middle" font-size="17">${r.icon}</text>
    <text x="${r.x}" y="${r.y + 15}" text-anchor="middle" font-size="10" fill="${cur ? "#e8b04b" : "#c9cdd8"}" font-family="monospace">${r.label}</text>
    ${npcCount ? `<circle cx="${r.x + w / 2 - 9}" cy="${r.y - h / 2 + 9}" r="7" fill="#d9a55b"/><text x="${r.x + w / 2 - 9}" y="${r.y - h / 2 + 12}" text-anchor="middle" font-size="9" fill="#0a0c12" font-family="monospace">${npcCount}</text>` : ""}
  </g>`;
}

export function stationHTML(): string {
  const p = PLANETS[S.loc];
  const cur = ROOMS.find((r) => r.id === currentRoom) || ROOMS[6];
  let svg = `<svg viewBox="0 0 600 400" xmlns="http://www.w3.org/2000/svg" class="stationsvg">
    <defs><pattern id="stgrid" width="30" height="30" patternUnits="userSpaceOnUse"><path d="M30 0 H0 V30" fill="none" stroke="#e8b04b" stroke-opacity="0.06"/></pattern></defs>
    <rect width="600" height="400" fill="url(#stgrid)"/>`;
  for (const [a, b] of LINKS) {
    const A = ROOMS.find((r) => r.id === a)!, B = ROOMS.find((r) => r.id === b)!;
    svg += `<line x1="${A.x}" y1="${A.y}" x2="${B.x}" y2="${B.y}" stroke="#2a3048" stroke-width="7" stroke-linecap="round"/>
            <line x1="${A.x}" y1="${A.y}" x2="${B.x}" y2="${B.y}" stroke="#141824" stroke-width="3" stroke-dasharray="2 8" stroke-linecap="round"/>`;
  }
  for (const r of ROOMS) svg += roomNode(r, r.id === currentRoom);
  svg += `</svg>`;
  const marker = `<div class="you-marker" style="left:${cur.x / 6}%; top:${cur.y / 4}%"><span></span></div>`;

  const dark = isSilenced(S.loc);
  const rep = reputation();
  const scope = `<div class="scope station-scope${dark ? " station-dark" : ""}">
    <div class="scope-head"><span>◄ STATION DECK ▬ ${p.n.toUpperCase()} ►</span><span class="sh-r" ${dark ? 'style="color:var(--red)"' : ""}>${dark ? "◌ NO CARRIER" : "◉ " + cur.label.toUpperCase()}</span></div>
    <div class="scope-body">${marker}${svg}</div>
    <div class="scope-foot"><span>${dark ? "SIGNAL LOST · AUTOMATION ONLY" : rep ? "KNOWN AS " + rep.title.toUpperCase() : "AN UNKNOWN CAPTAIN"}</span><span>${fmt(S.credits)}CR</span></div>
  </div>`;

  return `<div class="panel"><h3>${p.n} — Station Deck${dark ? ' <span class="low">— dark</span>' : ""}</h3>${scope}
    <p class="dim" style="margin-top:8px">${dark ? "The deck is lit, warm, and empty. Walk it if you must." : "Click a section and your marker takes the corridors — the cantina hides behind the exchange, the yard opens off the docks. Numbered markers show who's around."}</p>
  </div>` + roomPanel(cur);
}

function roomPanel(r: Room): string {
  // dark station: atmosphere only — no commerce, no people
  if (isSilenced(S.loc)) {
    return `<div class="panel"><h3>${r.icon} ${r.label}</h3>
      <p class="dim" style="margin-bottom:10px">${DARK_DESC[r.id] || "Nothing answers here."}</p>
      ${r.kind === "dock" ? `<button class="primary" onclick="nav('ship')">Back aboard. Now.</button>` : ""}
    </div>`;
  }
  let body = `<p class="dim" style="margin-bottom:10px">${ROOM_DESC[r.id] || ""}</p>`;
  if (r.kind === "tab") {
    const verb = r.tab === "cantina" ? "Step into the Cantina" : r.tab === "market" ? "Walk the Exchange floor" : "Enter the Dry Dock";
    body += `<button class="primary" onclick="stationEnter('${r.tab}')">${verb}</button>`;
  } else if (r.kind === "dock") {
    body += `<div style="display:flex; gap:8px; flex-wrap:wrap">
      <button class="primary" onclick="nav('ship')">Board your ship</button>
      <button onclick="nav('map')">Departure board</button>
    </div>`;
  }
  // characters present — any room can host them
  const npcs = npcsInRoom(r.id);
  if (npcs.length) {
    body += `<div style="margin-top:10px">` + npcs.map((k) => {
      const n = NPCS[k];
      return `<div class="card"><div class="title">${n.icon || "◆"} ${n.name}</div>
        ${n.blurb ? `<div class="dim">${n.blurb}</div>` : ""}
        <button style="margin-top:6px" onclick="openNPC('${k}')">Approach</button></div>`;
    }).join("") + `</div>`;
  } else if (r.kind === "npc" || r.kind === "hub") {
    body += `<p class="dim">Nobody here worth your time right now. Reputations change; check back.</p>`;
  }
  return `<div class="panel"><h3>${r.icon} ${r.label}</h3>${body}</div>`;
}

// door into the existing commerce screens
export function stationEnter(tab: string) {
  S.ptab = tab;
  S.screen = "planet";
  requestRender();
}
