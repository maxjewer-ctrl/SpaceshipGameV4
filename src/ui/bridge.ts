// The Bridge — the story-first home screen. The management screens still
// exist one tab over, but this is where the game faces the player: what the
// story wants next (threads), what just happened (the feed), and one big
// handle to move time forward. Maintenance only shows up here when it's in
// the way of continuing — a caution strip pointing at the fix, not a wall of
// gauges.
import { S } from "../state";
import { PLANETS } from "../content";
import { daysTo, fuelTo, stats, foodPerDay } from "../derive";
import { cautions, nav } from "./render";
import { viewportHTML } from "./cockpit";
import { storyCards } from "../systems/silence";

// "Set course" from a thread card: preselect the destination and open the
// chart with the course already plotted, one Depart press from burning.
export function plotCourse(k: string) {
  S.selPlanet = k;
  nav("map");
}

const canWalk = () => S.docked && S.loc !== "gate" && S.loc !== "anechoic";

function threadCard(mark: string, title: string, body: string, cta = "", tone = "var(--amber)"): string {
  return `<div class="thread" style="border-left-color:${tone}">
    <div class="th-title" style="color:${tone}">${mark} ${title}</div>
    <div class="th-body">${body}</div>
    ${cta ? `<div class="th-cta">${cta}</div>` : ""}
  </div>`;
}

function courseBtn(dest: string, label = "Set course"): string {
  if (S.travel) {
    return S.travel.dest === dest
      ? `<span class="dim">En route — ${S.travel.left} day${S.travel.left === 1 ? "" : "s"} out.</span>`
      : `<span class="dim">Finish the current leg first.</span>`;
  }
  if (S.loc === dest && S.docked) return "";
  const d = daysTo(S.loc, dest), f = fuelTo(S.loc, dest);
  const ok = S.fuel >= f;
  return `<button class="primary" onclick="plotCourse('${dest}')">${label}: ${PLANETS[dest].n} · ${d}d · ${f}⛽${ok ? "" : " (short on fuel)"}</button>`;
}

function walkBtn(label: string): string {
  return canWalk() ? `<button class="primary" onclick="nav('stationwalk')">${label}</button>` : "";
}

// ---- the Voss / Elysium Gate thread, told as "what pulls at you now" ----
function vossThread(): string {
  const a = S.arc;
  if (a.betrayed || a.stage === 99) {
    return threadCard("◆", "The grey-coat job — closed", "You handed Dr. Voss to the Union. The thousand credits spent fine. The crew was watching, and the lanes have long memories.", "", "#6b7280");
  }
  if (a.done) {
    return threadCard("◆", "The Meridian truth — broadcast", `It went out from Elysium Gate on every band, signed by the dead and delivered by <b>${S.shipName}</b>. Union space hates you; everywhere else buys the drinks.`, "", "var(--green)");
  }
  switch (a.stage) {
    case 0:
      return S.prestige >= 12
        ? threadCard("◆", "A woman in a grey coat", "She's been asking cantina keepers about a captain with a reputation and no curiosity. Word is she already knows your name. Any cantina will do.",
            walkBtn("Walk to the cantina") || `<span class="dim">Dock somewhere and find a cantina.</span>`)
        : threadCard("◆", "A rumor with your name on it", `Cantina talk: a scientist wants a captain who doesn't ask questions — but only one whose name carries. <b>${S.prestige}/12★ prestige.</b> Fly contracts, take chances, build the name.`,
            walkBtn("Find work in the cantina"));
    case 1:
      return threadCard("◆", "The sealed crate", "It hums, faintly, if you press your ear to it. You've decided not to do that again. 600cr on delivery at <b>Verge Station</b> — no manifests, no questions.", courseBtn("verge"));
    case 2:
      return threadCard("◆", "Dr. Voss is waiting", "The crate held a Union data core — proof of what happened at Meridian. Voss needs quiet passage to Haven's Folly, and a ship nobody looks at twice. She's in the <b>Verge Station cantina</b>.",
        S.docked && S.loc === "verge" ? walkBtn("Meet her in the cantina") : courseBtn("verge"));
    case 3:
      return threadCard("◆", "Passage: Dr. Elara Voss", "She's aboard, the core in a duffel bag like it's laundry. Get her to <b>Haven's Folly</b>. The Union is looking — and something may be waiting on the lane.", courseBtn("havens"));
    case 4:
      return threadCard("◆", "The Run is on the table", "The core is decrypted and Elysium Gate is real. The moment you commit, the Union clock starts: <b>14 days</b>, hunters daily, no friendly ports. Provision hard — fuel, food, hull — then see Voss in the <b>Haven's Folly cantina</b>.",
        S.docked && S.loc === "havens" ? walkBtn("See Voss — begin the Run") : courseBtn("havens"));
    case 5: {
      if (!a.deadline) {
        return threadCard("◆", "THE RUN — the net has closed", "Out of days. One ship stands between you and the Gate — through them, then.", courseBtn("gate", "Burn for the Gate"), "var(--red)");
      }
      const left = a.deadline - S.day;
      return threadCard("◆", "THE RUN", `Reach <b>Elysium Gate</b> by day ${a.deadline} — <b class="${left <= 3 ? "low" : ""}">${left} day${left === 1 ? "" : "s"} left</b>. Hunter-killers are on the lanes and there's nowhere friendly to hide. Burn.`,
        courseBtn("gate", "Burn for the Gate"), left <= 3 ? "var(--red)" : "var(--amber)");
    }
  }
  return "";
}

// crew personal quests that have named a destination
function crewThreads(): string[] {
  return S.crew
    .filter((c) => c.questStage === 2 && c.questDest)
    .map((c) => threadCard("✚", `${c.name} — ${PLANETS[c.questDest!].n}`,
      `"That's where this ends, one way or another." Dock at <b>${PLANETS[c.questDest!].n}</b> and see it through with them.`,
      courseBtn(c.questDest!), "var(--blue)"));
}

// contract deadlines — the clocks you agreed to
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

// ---- the helm: one handle to move the story forward, and the maintenance
// interrupt when the ship won't let you ----
function fixHint(t: string): string {
  if (t.startsWith("HULL")) return canWalk() ? "shipyard dry dock, this station" : "make port — a shipyard can patch it";
  if (t.includes("DAMAGED")) return canWalk() ? "dry dock repairs (80cr), this station" : "a mechanic may jury-rig it in flight";
  if (t.startsWith("REACTOR")) return "power down a module (Ship → breakers)";
  if (t.startsWith("FUEL")) return canWalk() ? "buy fuel at the station market" : "make port before the tanks run dry";
  if (t.startsWith("PROVISIONS")) return canWalk() ? "buy food at the station market" : "make port before the pantry does";
  if (t.startsWith("RUN DEADLINE")) return "burn, Captain";
  return "";
}

function helmHTML(): string {
  const st = stats();
  const cs = cautions();
  const maint = cs.length ? `<div class="maint">
      <div class="maint-h">⚠ THE SHIP NEEDS YOU FIRST</div>
      ${cs.map((c) => `<div class="maint-row${c.crit ? " crit" : ""}">${c.t}<span class="maint-fix">${fixHint(c.t)}</span></div>`).join("")}
      ${canWalk() ? `<button onclick="nav('stationwalk')">Walk to station services</button>` : ""}
    </div>` : "";
  let go: string;
  if (S.travel) {
    const lowFuel = S.fuel < st.fuelDay;
    go = `<button class="burnbtn armed" ${lowFuel ? "disabled" : ""} onclick="advanceDay()">
        ENGAGE BURN — ${PLANETS[S.travel.dest].n.toUpperCase()}<small>${S.travel.left} day${S.travel.left === 1 ? "" : "s"} out · anything can happen on the lane</small>
      </button>`;
  } else {
    go = `${canWalk() ? `<button class="burnbtn armed" onclick="nav('stationwalk')">WALK THE STATION<small>cantina · market · shipyard · faces</small></button>` : ""}
      <button class="burnbtn" onclick="nav('map')">CHART A COURSE<small>open the sector map</small></button>
      <button class="burnbtn" onclick="waitDay()">HOLD STATION<small>wait a day in port</small></button>`;
  }
  return `${maint}<div class="helm">${go}</div>`;
}

// ---- the feed: what just happened, readable ----
function feedHTML(): string {
  const items = S.logLines.slice(0, 9).map((l) =>
    `<div class="feed-item${l.bark ? " bark" : ""}"><span class="fi-day">D${l.d}</span><div class="fi-txt">${l.m}</div></div>`).join("");
  return items || `<div class="dim">Nothing yet. It will not stay that way.</div>`;
}

export function bridgeHTML(): string {
  const threads = [vossThread(), ...crewThreads()].filter(Boolean).join("");
  return `<div class="cockpit bridge">
    ${viewportHTML()}
    ${helmHTML()}
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
