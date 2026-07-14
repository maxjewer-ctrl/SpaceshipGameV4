// Survey / charting contracts (CORE_LOOP.md Pillar 4 — "ranging as contract
// work"). You take a charting contract at a port; it names a deliverable port
// and a coordinate out in the black between worlds. Flying to that port, you
// pass the coordinate mid-journey and take your readings — a mineral seam
// (recurring royalties), a derelict (a salvage scene with choices), or a dead
// beacon (lore). Whatever you find, the coordinate becomes a permanent mark on
// YOUR chart: the map slowly turns into a diary of where you've been.
//
// Design note — this deliberately never leaves port-to-port travel. A survey is
// a scripted find-scene injected into an ordinary journey (the same machinery
// intro beats and planted riders already use), so S.loc stays a real port and
// nothing in the engine that assumes "you are always docked somewhere real"
// has to change. The coordinate is only ever a mark, never a destination.
import { S, log, whisper } from "../state";
import { PLANETS } from "../content";
import { rand, ri, pick } from "../rng";
import { modal, closeModal, replaceModal } from "../modal";
import { requestRender } from "../bus";
import { daysTo, planetVisible, isSilenced, cargoUsed } from "../derive";
import { stats } from "../derive";
import { shift } from "./disposition";
import { remember } from "./ledger";
import { actionAttr } from "../dispatch";
import type { Job, PoiMark } from "../types";

// A charting contract's flavor pool, keyed by find kind. The name sticks with
// the POI forever, so it reads on the map.
const DRIFT_NAMES = ["Dolor Drift", "the Weeping Reach", "Sattler's Fold", "the Cold Furrow", "Vane's Hollow", "the Ashen Verge", "Marrow Deep", "the Long Quiet", "Ptolomy's Gap", "the Sable Run"];

// Where the readings will resolve to. Picked at generation and frozen on the
// job so the map can plot the mark even before you fly there.
function surveyPoint(from: string, to: string): { x: number; y: number } {
  const A = PLANETS[from], B = PLANETS[to];
  // midpoint, nudged off the straight line so it reads as "out there" rather
  // than sitting exactly on the plotted course
  const mx = (A.x + B.x) / 2, my = (A.y + B.y) / 2;
  const nx = -(B.y - A.y), ny = B.x - A.x;
  const len = Math.hypot(nx, ny) || 1;
  const off = (rand() - 0.5) * 90;
  return { x: Math.round(mx + (nx / len) * off), y: Math.round(my + (ny / len) * off) };
}

// Build a survey contract offered at the current port. Returns null if there's
// no sensible far-enough deliverable to chart toward.
export function genSurveyMission(): Job | null {
  const dests = Object.keys(PLANETS).filter(
    (k) => k !== S.loc && !PLANETS[k].hidden && planetVisible(k) && !isSilenced(k) && daysTo(S.loc, k) >= 2);
  if (!dests.length) return null;
  const dest = pick(dests);
  const dd = daysTo(S.loc, dest);
  const p = surveyPoint(S.loc, dest);
  const name = pick(DRIFT_NAMES);
  return {
    id: S.uid++, kind: "survey", title: "Survey: " + name, dest,
    sx: p.x, sy: p.y,
    pay: 140 + dd * 45, prestige: 2, rep: [PLANETS[S.loc].fac, 1],
    desc: `The Cartographers' Circle wants readings from a coordinate out past the lanes, on your way to ${PLANETS[dest].n}. Take the survey en route; deliver the charts on arrival. Whatever's out there is yours to keep.`,
  };
}

// Record a discovered POI on the chart (the map reads S.poi). Deduped loosely by
// proximity so the same seam charted twice doesn't double-stack.
export function recordPoi(kind: PoiMark["kind"], x: number, y: number, name: string, note?: string): PoiMark {
  const existing = S.poi.find((p) => Math.hypot(p.x - x, p.y - y) < 14);
  if (existing) return existing;
  const mark: PoiMark = { id: S.uid++, x, y, kind, name, day: S.day, note };
  S.poi.push(mark);
  return mark;
}

// ---- the mid-journey hook ----
let pendingSurvey: { jobId: number; name: string; x: number; y: number } | null = null;

// Called from advanceDay(). If a survey contract is riding this exact journey
// (its deliverable is where we're headed) and we're at the midpoint, open its
// find-scene. Returns true if it fired (so the day's random event is skipped).
export function checkSurvey(): boolean {
  if (!S.travel) return false;
  const job = S.jobs.find((j) => j.kind === "survey" && j.dest === S.travel!.dest && !j.surveyed);
  if (!job) return false;
  const trigger = Math.max(1, Math.round(S.travel.total / 2));
  if (S.travel.left !== trigger) return false;
  // The charting fee is earned by taking the readings at all — flip it now, so
  // any of the scene's choices (even "log it and fly on") still pays out at the
  // deliverable. The *choice* only changes the bonus find, not the contract.
  job.surveyed = true;
  const name = job.title.replace(/^Survey:\s*/, "");
  pendingSurvey = { jobId: job.id, name, x: job.sx!, y: job.sy! };
  openSurveyScene(name);
  return true;
}

function openSurveyScene(name: string) {
  // The kind of thing the coordinate turns out to hold. Seams and beacons are
  // the common quiet finds; derelicts (the salvage choice) are rarer.
  const roll = rand();
  if (roll < 0.4) openDerelict(name);
  else if (roll < 0.72) openSeam(name);
  else openBeacon(name);
}

// ---- derelict: a salvage scene with a real risk/reward choice ----
function openDerelict(name: string) {
  modal(`<h2>◆ Survey: ${name}</h2>
    <p>The readings sharpen into a hull — a mid-tonnage freighter, dark and tumbling slow, no transponder, no answer to the hail. Old damage along her flank, the kind nobody walks away from in a hurry. She's been out here a while.</p>
    <p class="dim">Salvage law out past the lanes is whatever you can carry and defend.</p>
    <div class="choices">
      <button class="danger" ${actionAttr("surveyBoard")}>Suit up and board her</button>
      <button ${actionAttr("surveyScan")}>Strip what the scanners can reach — no boarding</button>
      <button class="primary" ${actionAttr("surveyLogGo")}>Log the wreck and keep the burn</button>
    </div>`);
  requestRender();
}
export function surveyBoard() {
  const s = pendingSurvey; if (!s) { closeModal(); return; }
  const hullHit = ri(4, 11);
  S.hull = Math.max(1, S.hull - hullHit);
  const cr = ri(220, 480);
  S.credits += cr;
  const space = stats().cargoCap - cargoUsed();
  let cargoLine = "";
  if (space >= 3) {
    const g = pick(["ore", "med", "lux"] as const);
    const n = Math.min(space, ri(3, 7));
    S.cargo[g] += n;
    cargoLine = ` and ${n} units of ${g} left in her hold`;
  }
  shift("daring", 2, "boarded a derelict on a survey run");
  recordPoi("derelict", s.x, s.y, s.name, `The wreck you boarded and stripped on a charting run.`);
  replaceModal(`<h2>◆ ${s.name} — Boarded</h2>
    <p>She's a tomb, and tombs pay. You crack her strongroom for ${cr}cr${cargoLine}, and clip your suit on a jagged edge doing it (−${hullHit} hull). Whatever happened to her crew, the logs are wiped and you don't linger to wonder.</p>
    <p class="dim">Charted: ${s.name}. It's on your map now.</p>
    <div class="choices"><button class="primary" ${actionAttr("closeModal")}>Back to the burn.</button></div>`);
  pendingSurvey = null;
  requestRender();
}
export function surveyScan() {
  const s = pendingSurvey; if (!s) { closeModal(); return; }
  const cr = ri(60, 160);
  S.credits += cr;
  recordPoi("derelict", s.x, s.y, s.name, `A wreck you scanned but never boarded.`);
  replaceModal(`<h2>◆ ${s.name} — Scanned</h2>
    <p>You hold at range and let the scanners do the reaching — enough loose salvage drifting off her hull to net ${cr}cr on the magnetic sweep, no boots on her deck. Cautious money, but money.</p>
    <p class="dim">Charted: ${s.name}. It's on your map now.</p>
    <div class="choices"><button class="primary" ${actionAttr("closeModal")}>Back to the burn.</button></div>`);
  pendingSurvey = null;
  requestRender();
}
export function surveyLogGo() {
  const s = pendingSurvey; if (!s) { closeModal(); return; }
  recordPoi("derelict", s.x, s.y, s.name, `A wreck you charted and left alone.`);
  whisper(`You log the ${s.name} wreck's position and let her tumble. Some salvage isn't worth the story that comes with it.`);
  closeModal();
  pendingSurvey = null;
  requestRender();
}

// ---- seam: a recurring-income node (royalties on future dockings) ----
function openSeam(name: string) {
  modal(`<h2>◆ Survey: ${name}</h2>
    <p>The coordinate isn't empty — it's a drifting field of fractured rock, and the assay comes back rich: a mineral seam nobody's registered, quietly leaking value into the black.</p>
    <p class="dim">Stake it under your registry and the Circle's brokers will route you a cut whenever you make port. It won't make you rich. It'll never stop, either.</p>
    <div class="choices">
      <button class="primary" ${actionAttr("surveyStake")}>Stake the claim</button>
      <button ${actionAttr("surveyLogSeam")}>Just log the find</button>
    </div>`);
  requestRender();
}
export function surveyStake() {
  const s = pendingSurvey; if (!s) { closeModal(); return; }
  recordPoi("seam", s.x, s.y, s.name, `A mineral seam staked under your registry — it pays a trickle, forever.`);
  shift("daring", 1, "staked a claim out in the deep lanes");
  replaceModal(`<h2>◆ ${s.name} — Claimed</h2>
    <p>You file the coordinates and the assay under your own name before anyone else can. It's not a fortune. It's a small, steady stream that follows you home to every port from here on.</p>
    <p class="dim">Charted: ${s.name}. Royalties will find you dockside.</p>
    <div class="choices"><button class="primary" ${actionAttr("closeModal")}>Back to the burn.</button></div>`);
  pendingSurvey = null;
  requestRender();
}
export function surveyLogSeam() {
  const s = pendingSurvey; if (!s) { closeModal(); return; }
  recordPoi("beacon", s.x, s.y, s.name, `A seam you charted but never staked. Someone else will.`);
  whisper(`You log the ${s.name} seam and fly on. A find on the chart is still a find — even the ones you leave for someone else.`);
  closeModal();
  pendingSurvey = null;
  requestRender();
}

// ---- beacon: lore, and occasionally a faint campaign whisper (never a summons) ----
function openBeacon(name: string) {
  const s = pendingSurvey!;
  const silenceLive = S.campaign.silence.stage >= 1 && S.campaign.silence.stage < 4;
  const strange = silenceLive
    ? `<p>Under the beacon's dead loop, for just a moment, something else — four seconds of a sound like a tide heard from inside a shell, then gone. You note the bearing and tell yourself you imagined it. You didn't.</p>`
    : `<p>It's a survey relay from an expedition the charts don't remember, still counting down toward a rendezvous that stopped mattering decades ago.</p>`;
  modal(`<h2>◆ Survey: ${name}</h2>
    <p>The reading is a dead beacon, running on the last of a reactor that should have died a generation back, broadcasting a repair manual to no one, page by patient page.</p>
    ${strange}
    <div class="choices">
      <button ${actionAttr("surveyDecode")}>Decode the loop before you go</button>
      <button class="primary" ${actionAttr("surveyLogBeacon")}>Log the beacon and fly on</button>
    </div>`);
  void s;
  requestRender();
}
export function surveyDecode() {
  const s = pendingSurvey; if (!s) { closeModal(); return; }
  S.prestige += 1;
  const pool: string[] = S.flags.riderRumors || (S.flags.riderRumors = []);
  pool.push(`"Somebody charted the old ${s.name} beacon — decoded the whole dead loop. Said there's a name in it that isn't on any registry. Wouldn't say whose."`);
  recordPoi("beacon", s.x, s.y, s.name, `A dead beacon you decoded. There was a name in it.`);
  remember(`world:${S.travel!.dest}`, "charted_a_dead_beacon", 1, `You decoded the ${s.name} beacon out in the deep lanes and brought the story back.`);
  replaceModal(`<h2>◆ ${s.name} — Decoded</h2>
    <p>You sit in the loop long enough to pull the header out from under the manual: a crew, a mission, a date that predates the sector's own charts. A little piece of who was out here before the lanes had names. (+1 prestige)</p>
    <p class="dim">Charted: ${s.name}. It's on your map now.</p>
    <div class="choices"><button class="primary" ${actionAttr("closeModal")}>Back to the burn.</button></div>`);
  pendingSurvey = null;
  requestRender();
}
export function surveyLogBeacon() {
  const s = pendingSurvey; if (!s) { closeModal(); return; }
  recordPoi("beacon", s.x, s.y, s.name, `A dead beacon you charted and left broadcasting to the dark.`);
  whisper(`You log the ${s.name} beacon's position and leave it to its manual. Let it finish. Somebody built it to.`);
  closeModal();
  pendingSurvey = null;
  requestRender();
}

// ---- recurring income ----
// Called on docking. Staked seams pay a small royalty each time you make port —
// the "recurring income node" that keeps the ranging loop worth flying.
export function seamRoyalties() {
  const seams = S.poi.filter((p) => p.kind === "seam");
  if (!seams.length) return;
  let total = 0;
  for (const _ of seams) total += ri(12, 34);
  if (total <= 0) return;
  S.credits += total;
  log(`◆ Royalties from your staked claim${seams.length > 1 ? "s" : ""}: +${total}cr, wired dockside.`);
}
