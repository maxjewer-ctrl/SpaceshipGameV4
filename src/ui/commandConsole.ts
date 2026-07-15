import { FACS, PLANETS, ROLES } from "../content";
import { daysTo, foodPerDay, salaries, stats } from "../derive";
import { actionAttr } from "../dispatch";
import { modal, closeModal } from "../modal";
import { requestRender } from "../bus";
import { S } from "../state";
import { reputation } from "../systems/disposition";
import { currentObjectiveData } from "../systems/intro";
import { standingWord } from "../systems/port";
import { storyCards } from "../systems/silence";
import { abandonJob } from "../systems/travel";
import { dispositionWord } from "../systems/trust";
import { rankOf, RANK_NAME } from "../systems/veterancy";
import { fmt } from "../util";
import { cautions } from "./cautions";
import { mapHTML } from "./map";
import { missionStripHTML } from "./missionStrip";
import { nextDayProjection, outcomeRowsHTML } from "./projections";
import { setShipReturnAnchor } from "./physicalNav";
import { captainsLogHTML, shipSystemsHTML } from "./ship";
import { setHighlight } from "./walk";
import { travelHTML } from "./travel";

type ConsoleTab = "command" | "systems" | "navigation" | "records";
type RecordsTab = "missions" | "people" | "standing" | "archive";

let consoleTab: ConsoleTab = "command";
let recordsTab: RecordsTab = "missions";

export function setConsoleTab(tab: ConsoleTab) { consoleTab = tab; requestRender(); }
export function setRecordsTab(tab: RecordsTab) { recordsTab = tab; requestRender(); }

export function standUp() {
  setShipReturnAnchor("chair");
  S.screen = "shipwalk";
  requestRender();
}

export function locateCrew(id: number) {
  setHighlight("crew:" + id);
  setShipReturnAnchor("chair");
  S.screen = "shipwalk";
  requestRender();
}

export function confirmAbandonJob(id: number) {
  const job = S.jobs.find((j) => j.id === id);
  if (!job) return;
  modal(`<div class="modal-context">CONTRACT ADMINISTRATION</div><h2>Abandon ${job.title}?</h2>
    <p>This releases its cargo or berth and costs prestige and standing with the client.</p>
    <div class="choices"><button ${actionAttr("closeModal")}>Keep contract</button><button class="danger" ${actionAttr("abandonConfirmed", id)}>Abandon contract</button></div>`);
}

export function abandonConfirmed(id: number) {
  closeModal();
  abandonJob(id);
}

function endurance(amount: number, perDay: number): string {
  return perDay > 0 ? `${Math.floor(amount / perDay)} days` : "steady";
}

function objective() {
  const intro = currentObjectiveData();
  if (intro) return intro;
  if (S.travel) return {
    label: "CURRENT COURSE",
    title: `Hold for ${PLANETS[S.travel.dest].n}`,
    detail: `${S.travel.left} day${S.travel.left === 1 ? "" : "s"} to arrival.`,
    progress: `${S.travel.total - S.travel.left}/${S.travel.total} DAYS`,
  };
  const job = S.jobs[0];
  if (job) return {
    label: "ACTIVE CONTRACT",
    title: job.title,
    detail: `${PLANETS[job.dest].n}${job.deadline ? ` · due day ${job.deadline}` : ""}`,
    progress: `${S.jobs.length} ACTIVE`,
  };
  return {
    label: "OPEN HORIZON",
    title: S.docked ? "Find work ashore" : "Keep the ship flying",
    detail: S.docked ? `Use the airlock and visit ${PLANETS[S.loc].n}.` : "No contract is steering the ship.",
  };
}

function commandHTML(): string {
  const st = stats();
  const obj = objective();
  const alerts = cautions();
  const alert = alerts[0];
  const action = alert
    ? `<button class="${alert.crit ? "danger" : "primary"}" ${actionAttr("setConsoleTab", "systems")}>Inspect ship systems</button>`
    : `<button class="primary" ${actionAttr("setConsoleTab", "navigation")}>${S.travel ? "Continue current burn" : "Plot a course"}</button>`;
  return `<div class="command-grid">
    <section class="command-objective"><div class="console-kicker">${obj.label}</div><h1>${obj.title}</h1><p>${obj.detail}</p>${obj.progress ? `<b class="objective-progress">${obj.progress}</b>` : ""}</section>
    ${alert ? `<section class="command-alert ${alert.crit ? "critical" : "warning"}"><div class="console-kicker">IMMEDIATE ALERT${alerts.length > 1 ? ` · +${alerts.length - 1}` : ""}</div><h2>${alert.t}</h2><button ${actionAttr("masterCaution")}>Review all cautions</button></section>` : ""}
    <section class="command-reserves"><div class="console-kicker">RESERVES</div><div class="reserve-table">
      <div><span>Credits</span><b>${fmt(S.credits)}cr</b></div>
      <div><span>Hull</span><b class="${S.hull < 40 ? "low" : ""}">${Math.round(S.hull)}/${S.hullMax}</b></div>
      <div><span>Fuel endurance</span><b>${endurance(S.fuel, st.fuelDay)}</b><small>${Math.floor(S.fuel)}/${st.fuelCap} units</small></div>
      <div><span>Food endurance</span><b>${endurance(S.food, foodPerDay())}</b><small>${Math.floor(S.food)} held</small></div>
      <div><span>Payroll</span><b>${salaries()}cr/day</b></div>
    </div></section>
    <section class="command-next"><div><div class="console-kicker">NEXT COMMAND</div><p>${alert ? "Resolve the live condition before committing the ship." : S.travel ? "The next burn advances the run by one day." : "Choose a destination and review the full cost before departure."}</p></div>${action}</section>
  </div>`;
}

function navigationHTML(): string {
  if (S.travel) return `<div class="navigation-workspace">${travelHTML()}</div>`;
  const next = nextDayProjection(false);
  return `<div class="navigation-workspace">${mapHTML()}
    <section class="wait-command"><div><div class="console-kicker">HOLD STATION</div><h2>Wait one day in port</h2><p>Markets refresh. The crew still eats and gets paid.</p></div>
      ${outcomeRowsHTML([
        { label: "Food", current: `${Math.floor(S.food)}`, resulting: `${Math.floor(next.foodAfter)}`, severity: next.foodAfter <= 0 ? "danger" : "normal", note: `-${next.foodUse} consumed${next.foodGenerated ? `, +${next.foodGenerated} generated` : ""}` },
        { label: "Credits", current: `${S.credits}cr`, resulting: `${next.creditsAfter}cr`, severity: S.credits < next.payroll ? "warning" : "normal", note: `${next.payroll}cr payroll` },
        { label: "Market", current: "current stock", resulting: "refreshed", note: "prices may change" },
      ])}
      <button ${actionAttr("waitDay")}>Wait one day</button>
    </section></div>`;
}

function missionsHTML(): string {
  if (!S.jobs.length) return `<div class="empty-state"><h2>No active contracts</h2><p>Job boards are found in station cantinas.</p></div>`;
  return `<div class="record-grid">${S.jobs.map((job) => {
    const eta = daysTo(S.loc, job.dest);
    const late = !!job.deadline && S.day + eta > job.deadline;
    return `<article class="record-card"><div class="console-kicker">${PLANETS[job.dest].n.toUpperCase()}</div><h2>${job.title}</h2><div class="record-facts"><span>${eta} days away</span><span class="${late ? "low" : ""}">${job.deadline ? `Due day ${job.deadline}` : "No deadline"}</span><span>${fmt(job.pay)}cr</span>${job.units ? `<span>${job.units} cargo units</span>` : ""}${job.pax ? `<span>Passenger: ${job.pax.name}</span>` : ""}</div>${job.arcCrate || job.arcVoss ? "" : `<button class="danger quiet" ${actionAttr("confirmAbandonJob", job.id)}>Abandon contract</button>`}</article>`;
  }).join("")}</div>`;
}

function peopleHTML(): string {
  const st = stats();
  const crew = S.crew.length ? S.crew.map((c) => {
    const disposition = dispositionWord(c);
    const rank = rankOf(c);
    return `<article class="record-card"><div class="console-kicker">${ROLES[c.role]?.n || c.role} · ${RANK_NAME[rank]}</div><h2>${c.name}</h2><div class="record-facts"><span class="${disposition.cls}">${disposition.word}</span><span>${c.salary}cr/day</span><span>${c.daysAboard || 0} days aboard</span></div><button ${actionAttr("locateCrew", c.id)}>Locate on deck</button></article>`;
  }).join("") : `<div class="empty-state">No crew aboard.</div>`;
  const passengers = S.jobs.filter((j) => j.pax).map((j) => `<article class="record-card"><div class="console-kicker">PASSENGER · ${PLANETS[j.dest].n.toUpperCase()}</div><h2>${j.pax!.name}</h2><p>${j.pax!.sick ? "Sick and needs care." : "Berth occupied."}</p></article>`).join("");
  return `<div class="people-capacity">Crew bunks <b>${S.crew.length}/${st.crewCap}</b> · Passenger berths <b>${S.jobs.filter((j) => j.pax).length}/${st.paxCap}</b></div><div class="record-grid">${crew}${passengers}</div>`;
}

function standingHTML(): string {
  const rep = reputation();
  const factions = Object.keys(FACS).filter((key) => key !== "none").map((key) => `<div class="standing-row"><span><i style="background:${FACS[key].c}"></i>${FACS[key].n}</span><b>${S.rep[key] > 0 ? "+" : ""}${S.rep[key]}</b></div>`).join("");
  const ports = Object.keys(PLANETS).filter((key) => Math.abs(S.portStanding[key] || 0) > 0).map((key) => `<div class="standing-row"><span>${PLANETS[key].n}</span><b>${standingWord(key)}</b></div>`).join("") || `<p class="dim">No port has formed an opinion yet.</p>`;
  return `<div class="standing-layout"><section><div class="console-kicker">FACTION STANDING</div>${factions}</section><section><div class="console-kicker">PORT STANDING</div>${ports}</section><section class="street-word"><div class="console-kicker">WORD ON THE STREET · ${S.prestige} PRESTIGE</div><h2>${rep?.title || "Still an unknown captain"}</h2><p>${rep?.street || "The lanes have not decided what kind of captain you are."}</p></section></div>`;
}

function recordsHTML(): string {
  const body = recordsTab === "missions" ? missionsHTML() : recordsTab === "people" ? peopleHTML() : recordsTab === "standing" ? standingHTML() : `<div class="archive-layout">${storyCards()}<section><div class="console-kicker">CAPTAIN'S LOG</div>${captainsLogHTML()}</section></div>`;
  return `<div class="records-workspace"><div class="records-tabs">${(["missions", "people", "standing", "archive"] as RecordsTab[]).map((tab) => `<button class="${recordsTab === tab ? "on" : ""}" ${actionAttr("setRecordsTab", tab)}>${tab}</button>`).join("")}</div>${body}</div>`;
}

export function commandConsoleHTML(): string {
  const tabs: Array<[ConsoleTab, string]> = [["command", "Command"], ["systems", "Systems"], ["navigation", "Navigation"], ["records", "Records"]];
  const body = consoleTab === "command" ? commandHTML() : consoleTab === "systems" ? shipSystemsHTML() : consoleTab === "navigation" ? navigationHTML() : recordsHTML();
  const status = S.travel ? `IN TRANSIT · ${PLANETS[S.travel.dest].n.toUpperCase()}` : `${S.docked ? "DOCKED" : "ADRIFT"} · ${PLANETS[S.loc].n.toUpperCase()}`;
  return `<div class="captain-console">
    <header class="console-header"><div><div class="console-kicker">CAPTAIN'S CHAIR · ${status}</div><h1>${S.shipName}</h1><span>CAPT. ${S.captainName.toUpperCase()} · DAY ${S.day}</span></div><button class="stand-button" ${actionAttr("standUp")}>Stand up</button></header>
    <nav class="console-tabs">${tabs.map(([tab, label]) => `<button class="${consoleTab === tab ? "on" : ""}" ${actionAttr("setConsoleTab", tab)}>${label}</button>`).join("")}</nav>
    ${missionStripHTML()}
    <div class="console-body">${body}</div>
  </div>`;
}
