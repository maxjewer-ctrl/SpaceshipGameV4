// The Bridge — the story-first home screen. The management screens still
// exist one tab over, but this is where the game faces the player: a board of
// big physical action items (what the story wants, what the ship needs, what
// happens next), the launch sequence, and the ship's story as a feed.
import { S, log } from "../state";
import { PLANETS } from "../content";
import { daysTo, fuelTo, stats } from "../derive";
import { requestRender } from "../bus";
import { cautions, nav } from "./render";
import { viewportHTML, bayIsOpen, bayBusy, cycleBay } from "./cockpit";
import { storyCards } from "../systems/silence";

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
};

export function launchCleared() { return LAUNCH.cleared; }
export function resetLaunch() {
  LAUNCH.open = false; LAUNCH.done = []; LAUNCH.busy = null;
  LAUNCH.guard = false; LAUNCH.cleared = false;
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
  requestRender();
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
  return `<div class="panel launchpanel">
    <h3>Launch Sequence ${LAUNCH.cleared ? '<span class="v2-tag on">CLEARED</span>' : '<span class="v2-tag off">CLAMPED</span>'}</h3>
    <div class="launchseq">${steps}</div>
    <p class="dim" style="margin-top:9px">${LAUNCH.cleared
      ? "Board is green. The chart is unlocked — pick a heading and punch it."
      : "Run the board left to right. The clamps are under a guard cover. Ignition unlocks the star map."}</p>
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
    if (bayIsOpen()) items.push(act("amber", "📦", "CARGO BAY OPEN", "freight loads now — must be sealed before liftoff", "bayToggle()", true));
    if (LAUNCH.cleared) items.push(act("green", "🚀", "CLEARED FOR DEPARTURE", "the chart is unlocked — pick a heading", "nav('map')", true));
    else items.push(act("green", "🚀", "PREFLIGHT & LAUNCH", LAUNCH.open ? "checklist on the board below" : "run the launch board, then take the chart", "launchOpen()", !LAUNCH.open));
    items.push(act("dim", "⏳", "HOLD STATION", "wait a day in port — the meter runs", "waitDay()"));
  } else {
    items.push(act("dim", "⏳", "HOLD POSITION", "adrift — wait a day", "waitDay()"));
  }
  return `<div class="board">${items.join("")}</div>`;
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
    ${showSeq ? launchSeqHTML() : ""}
    <div class="row">
      <div class="col">
        <div class="panel"><h3>◆ The Thread</h3>${threads || '<div class="dim">Nothing is pulling at you yet. Threads start in cantinas — rumors, faces, work you maybe should not take.</div>'}</div>
        ${storyCards()}
        ${deadlinesHTML()}
      </div>
      <div class="col">
        <div class="panel"><h3>Ship's Story</h3><div class="feed">${feedHTML()}</div></div>
      </div>
    </div>
  </div>`;
}
