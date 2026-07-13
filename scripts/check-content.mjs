// Content-integrity gate (BETA_PLAN §4 Phase A). Loads every content JSON and
// asserts referential integrity — every planet/faction/room/rider/character
// reference resolves to a real definition — so a typo'd `dest` or a
// signature room pointing at a dropped room fails the build instead of
// silently producing an undeliverable job or a broken station link.
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const CONTENT = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "content");
const load = (f) => JSON.parse(readFileSync(join(CONTENT, f), "utf8"));

const errors = [];
const err = (where, msg) => errors.push(`${where}: ${msg}`);

// ---- canonical sets ----
const planets = load("planets.json");
const planetKeys = new Set(Object.keys(planets));
const world = load("world.json");
const factions = new Set(Object.keys(world.factions));
const roles = new Set(Object.keys(world.roles));
const goods = new Set(Object.keys(world.goods));
const motives = new Set(Object.keys(world.motives));
const modules = new Set(Object.keys(load("modules.json")));
const characters = new Set(Object.keys(load("characters.json")));
const riders = load("riders.json");
const riderKeys = new Set(Object.keys(riders));

// The shared base rooms every station is built from (mirrors stationwalk.ts
// ROOMS). Custom per-station layouts only reposition these + drop some; they
// never invent a new base room. Signature rooms are declared in stations.json.
const BASE_ROOMS = new Set(["harbor", "concourse", "market", "cantina", "docks", "drydock", "undercity"]);
// Dustwell (planetwalk.ts) is hand-laid with its own zone ids; NPCs placed
// there use these instead of station rooms.
const DUSTWELL_ZONES = new Set(["harbor", "concourse", "market", "cantina", "docks", "drydock", "undercity"]);

// ---- 1. planets ----
for (const [k, p] of Object.entries(planets)) {
  for (const f of ["n", "x", "y", "fac", "goods"]) if (p[f] === undefined) err(`planets.${k}`, `missing field '${f}'`);
  if (p.fac && !factions.has(p.fac)) err(`planets.${k}`, `unknown faction '${p.fac}'`);
  for (const g of Object.keys(p.goods || {})) if (!goods.has(g)) err(`planets.${k}.goods`, `unknown good '${g}'`);
}

// ---- 2. stations: signature + drop + labels must resolve ----
const stations = load("stations.json");
const sigRoomIds = new Set(Object.values(stations).map((s) => s.signature?.id).filter(Boolean));
for (const [k, s] of Object.entries(stations)) {
  if (!planetKeys.has(k)) err(`stations.${k}`, `not a known planet`);
  const drop = new Set(s.drop || []);
  for (const d of drop) if (!BASE_ROOMS.has(d)) err(`stations.${k}.drop`, `'${d}' is not a base room`);
  const sig = s.signature;
  if (sig) {
    if (!BASE_ROOMS.has(sig.link)) err(`stations.${k}.signature.link`, `'${sig.link}' is not a base room`);
    else if (drop.has(sig.link)) err(`stations.${k}.signature.link`, `links to '${sig.link}', which this station drops`);
    if (sig.sound && !BASE_ROOMS.has(sig.sound)) err(`stations.${k}.signature.sound`, `'${sig.sound}' is not a base room`);
  }
  for (const room of Object.keys(s.labels || {})) {
    if (!BASE_ROOMS.has(room) && room !== sig?.id) err(`stations.${k}.labels`, `'${room}' is not a room of this station`);
    if (drop.has(room)) err(`stations.${k}.labels`, `labels dropped room '${room}'`);
  }
  for (const room of Object.keys(s.desc || {})) {
    if (!BASE_ROOMS.has(room) && room !== sig?.id) err(`stations.${k}.desc`, `'${room}' is not a room of this station`);
  }
}
const validRooms = new Set([...BASE_ROOMS, ...sigRoomIds, ...DUSTWELL_ZONES]);

// ---- 3. npcs: room + home planets + rep tuples ----
const npcs = load("npcs.json");
const factionRef = (where, t) => { if (Array.isArray(t) && t.length && !factions.has(t[0])) err(where, `unknown faction '${t[0]}'`); };
const scanEffects = (where, node) => {
  const walk = (o) => {
    if (Array.isArray(o)) return o.forEach(walk);
    if (o && typeof o === "object") {
      if (o.rep) factionRef(`${where}.rep`, o.rep);
      if (o.worldMemory?.planet && !planetKeys.has(o.worldMemory.planet)) err(`${where}.worldMemory`, `unknown planet '${o.worldMemory.planet}'`);
      if (typeof o.who === "string" && o.who.startsWith("world:")) {
        const pk = o.who.slice(6);
        if (!planetKeys.has(pk)) err(`${where}.remember`, `world memory for unknown planet '${pk}'`);
      }
      if (o.plantRider?.key && !riderKeys.has(o.plantRider.key)) err(`${where}.plantRider`, `unknown rider '${o.plantRider.key}'`);
      if (o.recruit?.key && !characters.has(o.recruit.key)) err(`${where}.recruit`, `unknown character '${o.recruit.key}'`);
      if (o.mission?.dest && !planetKeys.has(o.mission.dest)) err(`${where}.mission`, `unknown dest '${o.mission.dest}'`);
      if (o.mission?.rep) factionRef(`${where}.mission.rep`, o.mission.rep);
      Object.values(o).forEach(walk);
    }
  };
  walk(node);
};
for (const [k, n] of Object.entries(npcs)) {
  if (n.room && !validRooms.has(n.room)) err(`npcs.${k}`, `unknown room '${n.room}'`);
  const homes = Array.isArray(n.planets) ? n.planets : n.planets ? [n.planets] : [];
  for (const pk of homes) if (pk !== "any" && !planetKeys.has(pk)) err(`npcs.${k}.planets`, `unknown planet '${pk}'`);
  scanEffects(`npcs.${k}`, n.nodes);
}

// ---- 4. barks: loc + role ----
for (const [i, b] of load("barks.json").entries()) {
  const where = `barks[${i}]`;
  if (!b.when || !b.text) err(where, `missing 'when' or 'text'`);
  if (b.loc && !planetKeys.has(b.loc)) err(where, `unknown loc '${b.loc}'`);
  if (b.role && !roles.has(b.role)) err(where, `unknown role '${b.role}'`);
}

// ---- 5. riders: nested references ----
for (const [k, r] of Object.entries(riders)) scanEffects(`riders.${k}`, r);

// ---- 6. portjobs: keyed by planet; rep + motive ----
const portjobs = load("portjobs.json");
for (const [k, jobs] of Object.entries(portjobs)) {
  if (!planetKeys.has(k)) err(`portjobs.${k}`, `not a known planet`);
  for (const [i, j] of jobs.entries()) {
    const where = `portjobs.${k}[${i}]`;
    if (j.rep) factionRef(`${where}.rep`, j.rep);
    if (j.dest && !planetKeys.has(j.dest)) err(where, `unknown dest '${j.dest}'`);
    // "vip" is a code sentinel (special-cased in ship.ts / market.ts), not a
    // world.motives entry — accept it alongside the real motives.
    if (j.paxMotive && j.paxMotive !== "vip" && !motives.has(j.paxMotive)) err(where, `unknown paxMotive '${j.paxMotive}'`);
    if (j.needs) for (const n of j.needs) {
      // "role:n" / "module:n" / "vip:n" / "prestige:n" style gates — validate the role/module ones
      const [kind, id] = n.split(":");
      if (kind === "role" && id && !roles.has(id)) err(where, `needs unknown role '${id}'`);
      if (kind === "module" && id && !modules.has(id)) err(where, `needs unknown module '${id}'`);
    }
  }
}

// ---- 7. characters: room ----
for (const [k, c] of Object.entries(load("characters.json"))) {
  if (c.room && !validRooms.has(c.room)) err(`characters.${k}`, `unknown room '${c.room}'`);
  if (c.role && !roles.has(c.role)) err(`characters.${k}`, `unknown role '${c.role}'`);
}

// ---- report ----
if (errors.length) {
  console.error(`content check: ${errors.length} unresolved reference(s):`);
  for (const e of errors) console.error("  " + e);
  process.exit(1);
}
const files = readdirSync(CONTENT).filter((f) => f.endsWith(".json")).length;
console.log(`content check: clean (${files} files, all references resolve)`);
