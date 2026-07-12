// The Bridge — the story-first home screen. The management screens still
// exist one tab over, but this is where the game faces the player: a board of
// big physical action items (what the story wants, what the ship needs, what
// happens next), the launch sequence, and the ship's story as a feed.
import { S, log } from "../state";
import { PLANETS } from "../content";
import { daysTo, fuelTo, stats, isSilenced } from "../derive";
import { rand } from "../rng";
import { requestRender } from "../bus";
import { cautions, nav } from "./render";
import { viewportHTML, bayIsOpen, bayBusy, cycleBay } from "./cockpit";
import { storyCards } from "../systems/silence";
import { arrive } from "../systems/travel";
import { note } from "./notes";
import { whisper } from "../state";

// "Set course" from a thread card: preselect the destination and open the
// chart with the course already plotted.
export function plotCourse(k: string) {
  S.selPlanet = k;
  nav("map");
}

// Board shortcut straight into a station module (cantina/market/yard).
export function goModule(t: string) {
  S.ptab = t;
  nav("planet");
}

const canWalk = () => S.docked && S.loc !== "gate" && S.loc !== "anechoic";

// ---------------------------------------------------------------------------
// Launch sequence — leaving port is a procedure, not a menu click.
// Five switches in a row; each one animates, some are covered. Only a full
// board unlocks the star map's DEPART handle. Session-only state: a reload
// mid-sequence just means running the checklist again.
// ---------------------------------------------------------------------------
type StepK = "bay" | "reactor" | "nav" | "clamps" | "ignite";
const ORDER: StepK[] = ["bay", "reactor", "nav", "clamps", "ignite"];
const STEP_META: Record<StepK, { ic: string; n: string; busyMs: number }> = {
  bay: { ic: "⣿", n: "SEAL BAY", busyMs: 400 },
  reactor: { ic: "☢", n: "REACTOR", busyMs: 950 },
  nav: { ic: "✦", n: "NAV ALIGN", busyMs: 750 },
  clamps: { ic: "⚓", n: "CLAMPS", busyMs: 650 },
  ignite: { ic: "🔥", n: "IGNITION", busyMs: 900 },
};
const LAUNCH = {
  open: false,                      // checklist strip expanded on the bridge
  done: [] as StepK[],
  busy: null as StepK | null,       // step currently animating
  guard: false,                     // clamps guard cover lifted
  cleared: false,                   // full board — DEPART unlocked
  auto: false,                      // the pilot has the board
};

export function launchCleared() { return LAUNCH.cleared; }
export function resetLaunch() {
  LAUNCH.open = false; LAUNCH.done = []; LAUNCH.busy = null;
  LAUNCH.guard = false; LAUNCH.cleared = false; LAUNCH.auto = false;
}
export function launchOpen() { LAUNCH.open = !LAUNCH.open; requestRender(); }
// From the star map's locked DEPART handle: jump to the checklist.
export function launchGoto() { LAUNCH.open = true; nav("bridge"); }
export function launchGuard() { LAUNCH.guard = true; requestRender(); }

const nextStep = (): StepK | null => ORDER.find((k) => !LAUNCH.done.includes(k)) ?? null;

function finishStep(k: StepK) {
  LAUNCH.busy = null;
  LAUNCH.done.push(k);
  if (k === "reactor") log("☢ Reactor answers — flight power on the bus.");
  if (k === "nav") log("✦ Nav computer aligned. Awaiting destination.");
  if (k === "clamps") log("⚓ Dock clamps away. She's floating free on thrusters.");
  if (k === "ignite") {
    LAUNCH.cleared = true;
    log("🔥 Main drive lit. You have the con, Captain — pick a destination.");
    nav("map");
    return;
  }
  // a pilot on the board runs the next switch without being asked
  if (LAUNCH.auto) {
    LAUNCH.guard = true;
    const n = nextStep();
    if (n) { setTimeout(() => launchPress(n), 320); requestRender(); return; }
  }
  requestRender();
}

// One press with a pilot aboard: the whole board cascades on its own.
export function launchAuto() {
  if (!S.docked || LAUNCH.cleared || LAUNCH.busy || !stats().has("pilot")) return;
  LAUNCH.open = true;
  LAUNCH.auto = true;
  LAUNCH.guard = true; // pilots flip covers without ceremony
  log('🧑‍🚀 Your pilot slides into the seat and takes the board. "Sit back, Captain."');
  const n = nextStep();
  if (n) launchPress(n);
  else requestRender();
}

export function launchPress(k: StepK) {
  if (!S.docked || LAUNCH.busy || LAUNCH.cleared || k !== nextStep()) return;
  const st = stats();
  if (k === "bay" && bayIsOpen()) {
    // real doors take real time — reuse the pedestal's cycle
    if (bayBusy()) return;
    LAUNCH.busy = "bay";
    requestRender();
    cycleBay("closed", () => finishStep("bay"));
    return;
  }
  if (k === "reactor" && st.powerUse > st.powerOut) {
    log("☢ Reactor overdraw — shed load before flight power (Ship → breakers).");
    requestRender();
    return;
  }
  if (k === "clamps" && !LAUNCH.guard) return; // cover's still down
  LAUNCH.busy = k;
  requestRender();
  setTimeout(() => finishStep(k), STEP_META[k].busyMs);
}

function launchSeqHTML(): string {
  const next = nextStep();
  const steps = ORDER.map((k) => {
    const m = STEP_META[k];
    const done = LAUNCH.done.includes(k);
    const busy = LAUNCH.busy === k;
    const active = !done && !busy && k === next && !LAUNCH.busy;
    const cls = done ? " ok" : busy ? " busy" : active ? " next" : " locked";
    // the clamps switch lives under a flip-up guard cover
    const guard = k === "clamps" && active && !LAUNCH.guard
      ? `<div class="lguard" onclick="launchGuard()">GUARD<small>flip cover</small></div>` : "";
    const sub = done ? "✓" : busy ? "···" : k === "bay" && bayIsOpen() ? "OPEN!" : active ? "PRESS" : "—";
    return `<button class="lstep${cls}${k === "ignite" ? " ignite" : ""}" ${active || busy ? "" : "disabled"} onclick="launchPress('${k}')">
      ${guard}
      <span class="ls-led"></span>
      <span class="ls-ic">${m.ic}</span>
      <span class="ls-n">${m.n}</span>
      <span class="ls-sub">${sub}</span>
    </button>`;
  }).join("<span class='ls-wire'></span>");
  const pilotBtn = !LAUNCH.cleared && !LAUNCH.auto && stats().has("pilot")
    ? `<button class="primary" style="margin-top:9px; width:100%" onclick="launchAuto()">🧑‍🚀 GIVE THE PILOT THE BOARD</button>` : "";
  const state = LAUNCH.cleared
    ? `<div class="boardstate ok">▮ BOARD GREEN — CHART UNLOCKED. PUNCH IT.</div>`
    : LAUNCH.auto ? `<div class="boardstate">▮ PILOT HAS THE BOARD — HANDS OFF</div>` : "";
  return `<div class="panel launchpanel">
    <h3>Launch Interlock ${LAUNCH.cleared ? '<span class="v2-tag on">CLEARED</span>' : '<span class="v2-tag off">CLAMPED</span>'}</h3>
    <div class="launchseq">${steps}</div>
    ${pilotBtn}${state}
    ${LAUNCH.cleared || LAUNCH.auto ? "" : note("launch",
      "left → right, EVERY time.<br>bay first. ask Deke why.<br>clamps hide under the red cover<br>— R.")}
  </div>`;
}

// ---------------------------------------------------------------------------
// Docking approach — the mirror of launch. When the last leg burns down the
// ship holds on the wire until the captain kills velocity, raises the port,
// and takes the clamps. The hail sometimes answers back.
// ---------------------------------------------------------------------------
type DockK = "retro" | "hail" | "lock";
const DOCK_ORDER: DockK[] = ["retro", "hail", "lock"];
const DOCK_META: Record<DockK, { ic: string; n: string; ms: number }> = {
  retro: { ic: "🔥", n: "RETRO BURN", ms: 950 },
  hail: { ic: "📡", n: "HAIL PORT", ms: 1150 },
  lock: { ic: "⚓", n: "TAKE CLAMPS", ms: 750 },
};
const DOCK = { done: [] as DockK[], busy: null as DockK | null };
// Derived from save state, so a reload mid-approach just re-runs the board.
export const dockingNow = () => !!S.travel && S.travel.left <= 0;
const dockNext = (): DockK | null => DOCK_ORDER.find((k) => !DOCK.done.includes(k)) ?? null;

function hailOutcome() {
  const dest = S.travel!.dest;
  if (dest === "gate" || dest === "anechoic") { log("📡 You hail. Nothing answers. Nothing was ever going to."); return; }
  if (isSilenced(dest)) { log("📡 The hail goes out. Carrier hiss comes back. The port is dark."); return; }
  const r = rand();
  if (r < 0.6) {
    log(`📡 "${PLANETS[dest].n} control — berth ${1 + Math.floor(rand() * 40)} is yours. Welcome back, ${S.shipName}."`);
  } else if (r < 0.85) {
    const fee = 5 + Math.floor(rand() * 4) * 5;
    const paid = Math.min(fee, Math.max(0, S.credits));
    S.credits -= paid;
    log(`📡 "${PLANETS[dest].n} control. Berth fee ${fee}cr, payable on approach." ${paid < fee ? "They dock the difference against your name." : "The meter starts before the clamps do."} (−${paid}cr)`);
  } else {
    log(`📡 Port control, off-script: "Word to the wise, captain — ask around the cantina when you're down. Something's moving."`);
  }
}

export function dockPress(k: DockK) {
  if (!dockingNow() || DOCK.busy || k !== dockNext()) return;
  DOCK.busy = k;
  requestRender();
  setTimeout(() => {
    DOCK.busy = null;
    DOCK.done.push(k);
    if (k === "retro") log("🔥 Retro burn. The stars stop sliding; the docks swell in the glass.");
    if (k === "hail") hailOutcome();
    if (k === "lock") {
      DOCK.done = [];
      arrive(); // deliveries, scenes, quests — the story owns the moment
      return;
    }
    requestRender();
  }, DOCK_META[k].ms);
}

function dockSeqHTML(): string {
  const next = dockNext();
  const steps = DOCK_ORDER.map((k) => {
    const m = DOCK_META[k];
    const done = DOCK.done.includes(k);
    const busy = DOCK.busy === k;
    const active = !done && !busy && k === next && !DOCK.busy;
    const cls = done ? " ok" : busy ? " busy" : active ? " next" : " locked";
    return `<button class="lstep${cls}" ${active ? "" : "disabled"} onclick="dockPress('${k}')">
      <span class="ls-led"></span>
      <span class="ls-ic">${m.ic}</span>
      <span class="ls-n">${m.n}</span>
      <span class="ls-sub">${done ? "✓" : busy ? "···" : active ? "PRESS" : "—"}</span>
    </button>`;
  }).join("<span class='ls-wire'></span>");
  return `<div class="panel launchpanel">
    <h3>Docking Approach <span class="v2-tag on">${PLANETS[S.travel!.dest].n.toUpperCase()}</span></h3>
    <div class="launchseq">${steps}</div>
    ${note("dock", "kill your speed BEFORE you hail.<br>ports remember hot approaches.<br>(so do insurance adjusters)", "blue")}
  </div>`;
}

// ---------------------------------------------------------------------------
// The action board — the main view: big bright handles, one per thing the
// captain can actually do right now. Quest actions first, ship needs second.
// ---------------------------------------------------------------------------
function act(tone: string, ic: string, title: string, sub: string, onclick: string, flash = false, dis = false): string {
  return `<button class="act tone-${tone}${flash ? " flash" : ""}" ${dis ? "disabled" : ""} onclick="${onclick}">
    <span class="a-ic">${ic}</span>
    <span class="a-tx"><span class="a-t">${title}</span><span class="a-s">${sub}</span></span>
    <span class="a-go">▸</span>
  </button>`;
}

// The story's current ask, as one pressable item (full prose lives in the thread card below).
function storyAct(): string {
  const a = S.arc;
  if (a.done || a.betrayed || a.stage === 99) return "";
  const cantina = (label: string) => canWalk() ? act("amber", "◆", label, "in the cantina, past the deck", "goModule('cantina')", true) : "";
  const course = (dest: string, label: string) => {
    if (S.travel) return "";
    if (S.loc === dest && S.docked) return "";
    return act("amber", "◆", label, `${PLANETS[dest].n} · ${daysTo(S.loc, dest)}d · ${fuelTo(S.loc, dest)}⛽`, `plotCourse('${dest}')`, true);
  };
  switch (a.stage) {
    case 0: return S.prestige >= 12 ? cantina("MEET THE GREY COAT") : "";
    case 1: return course("verge", "DELIVER THE CRATE");
    case 2: return S.loc === "verge" && S.docked ? cantina("DR. VOSS IS WAITING") : course("verge", "REACH DR. VOSS");
    case 3: return course("havens", "GET VOSS TO SAFETY");
    case 4: return S.loc === "havens" && S.docked ? cantina("BEGIN THE RUN — SEE VOSS") : course("havens", "THE RUN AWAITS");
    case 5: return act("red", "◆", "THE RUN — BURN FOR THE GATE",
      a.deadline ? `day ${a.deadline} deadline — ${a.deadline - S.day}d left` : "the net has closed",
      S.docked ? "plotCourse('gate')" : "nav('bridge')", true);
  }
  return "";
}

function boardHTML(): string {
  const st = stats();
  const items: string[] = [];
  if (S.over) return "";
  if (S.travel) {
    if (dockingNow()) return ""; // the docking board owns the moment
    const lowFuel = S.fuel < st.fuelDay;
    items.push(act("green", "🔥", "ENGAGE BURN", `${PLANETS[S.travel.dest].n} · ${S.travel.left}d out · anything can happen on the lane`, "advanceDay()", true, lowFuel));
    if (lowFuel) items.push(act("red", "⛽", "TANKS DRY", "the drive won't answer — you're drifting", "nav('ship')", true, true));
  } else if (S.docked) {
    // ship needs first — the maintenance that stands between you and the story
    for (const c of cautions()) {
      const tone = c.crit ? "red" : "amber";
      if (c.t.startsWith("FUEL")) items.push(act(tone, "⛽", "REFUEL NOW", c.t.toLowerCase() + " — station market", "goModule('market')", c.crit));
      else if (c.t.startsWith("PROVISIONS")) items.push(act(tone, "🍞", "BUY RATIONS", c.t.toLowerCase() + " — station market", "goModule('market')", c.crit));
      else if (c.t.startsWith("HULL")) items.push(act(tone, "🛠", "PATCH THE HULL", c.t.toLowerCase() + " — shipyard dry dock", "goModule('yard')", c.crit));
      else if (c.t.includes("DAMAGED")) items.push(act(tone, "⚡", "REPAIR SYSTEMS", c.t.toLowerCase() + " — shipyard, 80cr each", "goModule('yard')", c.crit));
      else if (c.t.startsWith("REACTOR")) items.push(act(tone, "☢", "SHED REACTOR LOAD", "too many systems drawing — throw some breakers", "nav('ship')", c.crit));
    }
    // the story's ask
    const sa = storyAct();
    if (sa) items.push(sa);
    // work + the loop
    if (canWalk()) {
      const n = S.market?.missions.length ?? 0;
      items.push(act("blue", "🍺", "FIND AN OPEN CONTRACT", `${n ? n + " job" + (n === 1 ? "" : "s") + " on the board" : "the board refreshes daily"} · cantina`, "goModule('cantina')"));
    }
    if (bayIsOpen()) items.push(act("amber", "📦", "CARGO BAY OPEN", "hard vacuum where the floor was — seal her before liftoff", "bayToggle()", true));
    if (LAUNCH.cleared) items.push(act("green", "🚀", "CLEARED FOR DEPARTURE", "she's floating free on thrusters — pick a heading", "nav('map')", true));
    else items.push(act("green", "🚀", "PREFLIGHT & LAUNCH", LAUNCH.open ? "interlock board is lit below" : "cold ship. wake her up.", "launchOpen()", !LAUNCH.open));
    items.push(act("dim", "⏳", "HOLD STATION", "burn a day in port. the meter doesn't care.", "waitDay()"));
  } else {
    items.push(act("dim", "⏳", "HOLD POSITION", "adrift. count rivets. wait.", "waitDay()"));
  }
  return `<div class="board">${items.join("")}</div>`;
}

// ---------------------------------------------------------------------------
// The aux panel — switches nobody labelled properly and one button under
// scratched-out warnings. None of it matters. All of it matters.
// ---------------------------------------------------------------------------
const AUX = { defrost: false, cabin: true, mystery: false, pressed: 0 };

export function auxFlip(k: "defrost" | "cabin" | "mystery") {
  AUX[k] = !AUX[k];
  if (k === "defrost") whisper(AUX.defrost ? "Defrost hums to life. The haze on the glass gives up slowly." : "Defrost off. The chill starts winning again.");
  if (k === "cabin") {
    document.body.classList.toggle("lights-low", !AUX.cabin);
    whisper(AUX.cabin ? "Cabin lights up. The ship looks honest again." : "Cabin lights down. Just the instrument glow now — easier on the eyes, harder on the soul.");
  }
  if (k === "mystery") whisper(AUX.mystery
    ? "The switch marked ??? clicks over. Somewhere aft, a pump changes its mind."
    : "??? again. The hum comes back. Four years and you still don't know what it does.");
  requestRender();
}

const RED_LINES = [
  "You pressed it. Nothing happened. Probably.",
  "A relay clunks somewhere below decks. The lights dip, think about it, recover.",
  "A fan spins up to a scream, holds it long enough to worry you, settles.",
  "The button is warm. It's always warm. Why is it warm?",
  "A speaker crackles: \"—told you not to—\" then static.",
  "Something in the galley beeps three times. Nothing in the galley has ever beeped.",
];
export function bigRed() {
  AUX.pressed++;
  if (AUX.pressed === 5) {
    whisper("You press it a fifth time. A slot you never noticed dispenses one (1) protein bar, then seals forever. Mystery deepened, not solved.");
  } else {
    const line = RED_LINES[Math.floor(rand() * RED_LINES.length)];
    whisper(line);
    if (line.includes("lights dip")) {
      document.body.classList.add("brownout");
      setTimeout(() => document.body.classList.remove("brownout"), 900);
    }
  }
  requestRender();
}

function auxHTML(): string {
  const sw = (k: "defrost" | "cabin" | "mystery", label: string) =>
    `<div class="auxsw${AUX[k] ? " on" : ""}" onclick="auxFlip('${k}')">
      <div class="bk-well"><div class="bk-handle"></div></div>
      <span class="aux-lbl">${label}</span>
    </div>`;
  return `<div class="auxrow">
    <span class="aux-plate">AUX</span>
    ${sw("defrost", "DEFROST")}
    ${sw("cabin", "CABIN LTS")}
    ${sw("mystery", "???")}
    <button class="bigred" onclick="bigRed()"><i></i><span>DO NOT<br>PRESS</span></button>
  </div>`;
}

// ---- story threads (full prose under the board) ----
function threadCard(mark: string, title: string, body: string, tone = "var(--amber)"): string {
  return `<div class="thread" style="border-left-color:${tone}">
    <div class="th-title" style="color:${tone}">${mark} ${title}</div>
    <div class="th-body">${body}</div>
  </div>`;
}

function vossThread(): string {
  const a = S.arc;
  if (a.betrayed || a.stage === 99) {
    return threadCard("◆", "The grey-coat job — closed", "You handed Dr. Voss to the Union. The thousand credits spent fine. The crew was watching, and the lanes have long memories.", "#6b7280");
  }
  if (a.done) {
    return threadCard("◆", "The Meridian truth — broadcast", `It went out from Elysium Gate on every band, signed by the dead and delivered by <b>${S.shipName}</b>. Union space hates you; everywhere else buys the drinks.`, "var(--green)");
  }
  switch (a.stage) {
    case 0:
      return S.prestige >= 12
        ? threadCard("◆", "A woman in a grey coat", "She's been asking cantina keepers about a captain with a reputation and no curiosity. Word is she already knows your name. Any cantina will do.")
        : threadCard("◆", "A rumor with your name on it", `Cantina talk: a scientist wants a captain who doesn't ask questions — but only one whose name carries. <b>${S.prestige}/12★ prestige.</b> Fly contracts, take chances, build the name.`);
    case 1:
      return threadCard("◆", "The sealed crate", "It hums, faintly, if you press your ear to it. You've decided not to do that again. 600cr on delivery at <b>Verge Station</b> — no manifests, no questions.");
    case 2:
      return threadCard("◆", "Dr. Voss is waiting", "The crate held a Union data core — proof of what happened at Meridian. Voss needs quiet passage to Haven's Folly, and a ship nobody looks at twice. She's in the <b>Verge Station cantina</b>.");
    case 3:
      return threadCard("◆", "Passage: Dr. Elara Voss", "She's aboard, the core in a duffel bag like it's laundry. Get her to <b>Haven's Folly</b>. The Union is looking — and something may be waiting on the lane.");
    case 4:
      return threadCard("◆", "The Run is on the table", "The core is decrypted and Elysium Gate is real. The moment you commit, the Union clock starts: <b>14 days</b>, hunters daily, no friendly ports. Provision hard — fuel, food, hull — then see Voss in the <b>Haven's Folly cantina</b>.");
    case 5: {
      if (!a.deadline) return threadCard("◆", "THE RUN — the net has closed", "Out of days. One ship stands between you and the Gate — through them, then.", "var(--red)");
      const left = a.deadline - S.day;
      return threadCard("◆", "THE RUN", `Reach <b>Elysium Gate</b> by day ${a.deadline} — <b class="${left <= 3 ? "low" : ""}">${left} day${left === 1 ? "" : "s"} left</b>. Hunter-killers are on the lanes and there's nowhere friendly to hide. Burn.`,
        left <= 3 ? "var(--red)" : "var(--amber)");
    }
  }
  return "";
}

function crewThreads(): string[] {
  return S.crew
    .filter((c) => c.questStage === 2 && c.questDest)
    .map((c) => threadCard("✚", `${c.name} — ${PLANETS[c.questDest!].n}`,
      `"That's where this ends, one way or another." Dock at <b>${PLANETS[c.questDest!].n}</b> and see it through with them.`,
      "var(--blue)"));
}

function deadlinesHTML(): string {
  const rows = S.jobs.filter((j) => j.deadline).map((j) => {
    const left = j.deadline! - S.day;
    const eta = S.travel ? (S.travel.dest === j.dest ? S.travel.left : null) : daysTo(S.loc, j.dest);
    const tight = left <= 1 || (eta !== null && S.day + eta > j.deadline!);
    return `<div class="dl${tight ? " low" : ""}">${j.title} <span class="dim">→ ${PLANETS[j.dest].n}</span><span class="dl-d">${left}d</span></div>`;
  });
  if (!rows.length) return "";
  return `<div class="panel"><h3>Clocks Running</h3>${rows.join("")}</div>`;
}

function feedHTML(): string {
  const items = S.logLines.slice(0, 9).map((l) =>
    `<div class="feed-item${l.bark ? " bark" : ""}"><span class="fi-day">D${l.d}</span><div class="fi-txt">${l.m}</div></div>`).join("");
  return items || `<div class="dim">Nothing yet. It will not stay that way.</div>`;
}

export function bridgeHTML(): string {
  const threads = [vossThread(), ...crewThreads()].filter(Boolean).join("");
  const showSeq = S.docked && (LAUNCH.open || LAUNCH.cleared || LAUNCH.done.length > 0);
  return `<div class="cockpit bridge">
    ${viewportHTML()}
    ${boardHTML()}
    ${dockingNow() ? dockSeqHTML() : ""}
    ${showSeq ? launchSeqHTML() : ""}
    <div class="row">
      <div class="col">
        <div class="panel"><h3>◆ The Thread</h3>${threads || '<div class="dim">Nothing\'s pulling at you. Threads start in cantinas — rumors, faces, work you shouldn\'t take. Go be somebody.</div>'}</div>
        ${storyCards()}
        ${deadlinesHTML()}
      </div>
      <div class="col">
        <div class="panel"><h3>Ship's Story</h3><div class="feed">${feedHTML()}</div></div>
        ${auxHTML()}
      </div>
    </div>
  </div>`;
}
