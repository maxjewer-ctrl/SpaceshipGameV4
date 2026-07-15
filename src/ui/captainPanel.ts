import { PLANETS } from "../content";
import { cargoUsed, foodPerDay, salaries, stats } from "../derive";
import { actionAttr } from "../dispatch";
import { currentObjectiveData, introActive, introStage } from "../systems/intro";
import { S } from "../state";
import { fmt } from "../util";

export interface CaptainAlert {
  t: string;
  crit: boolean;
}

interface CaptainAction {
  label: string;
  note: string;
  action: string;
  args?: unknown[];
  tone?: "primary" | "danger";
}

function fuelDays(): string {
  const burn = stats().fuelDay;
  if (!burn) return "steady";
  return `${Math.floor(S.fuel / burn)}d`;
}

function foodDays(): string {
  const eat = foodPerDay();
  if (!eat) return "steady";
  return `${Math.floor(S.food / eat)}d`;
}

function shipStatus(): string {
  if (S.travel) return `Inbound · ${PLANETS[S.travel.dest].n}`;
  if (S.docked) return `Docked · ${PLANETS[S.loc].n}`;
  return `Adrift · ${PLANETS[S.loc].n}`;
}

function modeLabel(): string {
  switch (S.screen) {
    case "ship": return "Command Station";
    case "shipwalk": return "Walk Deck";
    case "stationwalk": return "Port Deck";
    case "map": return "Sector Chart";
    case "planet": return "Dock Services";
    case "travel": return "Under Way";
    case "zone": return "Incursion";
    default: return "Bridge";
  }
}

function objectiveSummary(): { label: string; title: string; detail: string; progress?: string } {
  const intro = currentObjectiveData();
  if (intro) return intro;

  if (S.travel) {
    return {
      label: "CURRENT COURSE",
      title: `Hold for ${PLANETS[S.travel.dest].n}`,
      detail: `${S.travel.left} day${S.travel.left === 1 ? "" : "s"} to arrival from ${PLANETS[S.travel.from].n}.`,
      progress: `${Math.max(0, S.travel.total - S.travel.left)}/${S.travel.total} DAYS`,
    };
  }

  const nextJob = S.jobs[0];
  if (nextJob) {
    return {
      label: "NEXT CONTRACT",
      title: nextJob.title,
      detail: `Route: ${PLANETS[nextJob.dest].n}${nextJob.deadline ? ` · due day ${nextJob.deadline}` : ""}.`,
      progress: `${S.jobs.length} ACTIVE`,
    };
  }

  if (S.docked) {
    return {
      label: "OPEN HORIZON",
      title: "Take on work or refit",
      detail: "Walk the port, hire hands, or provision for the next lane.",
    };
  }

  return {
    label: "OPEN HORIZON",
    title: "Keep the ship together",
    detail: "No contract is steering you. Watch fuel, food, and whatever the black throws back.",
  };
}

function contextualAction(alerts: CaptainAlert[], cautionLit: boolean): CaptainAction {
  const objective = currentObjectiveData();
  const canVisitStation = S.docked && S.loc !== "gate" && S.loc !== "anechoic";

  if (cautionLit && alerts.length) {
    return {
      label: "Review master caution",
      note: `${alerts[0].crit ? "Critical" : "Watch item"} · ${alerts.length} live`,
      action: "masterCaution",
      tone: alerts[0].crit ? "danger" : "primary",
    };
  }

  if (S.travel) {
    return {
      label: "Advance one day",
      note: `Burn toward ${PLANETS[S.travel.dest].n}.`,
      action: "advanceDay",
      tone: "primary",
    };
  }

  if (introActive()) {
    const stage = introStage();
    if (stage <= 3 && S.screen !== "shipwalk") {
      return {
        label: "Resume deck objective",
        note: objective?.detail || "Get back aboard and follow the immediate objective.",
        action: "nav",
        args: ["shipwalk"],
        tone: "primary",
      };
    }
    if (stage === 4 && S.screen !== "travel") {
      return {
        label: "Return to the burn",
        note: objective?.detail || "Bring the ship the rest of the way to Solace.",
        action: "nav",
        args: ["travel"],
        tone: "primary",
      };
    }
    if (stage === 5 && S.screen !== "stationwalk") {
      return {
        label: "Report ashore",
        note: objective?.detail || "Settle Osei's debt and get the run properly started.",
        action: "nav",
        args: ["stationwalk"],
        tone: "primary",
      };
    }
  }

  if (S.screen === "ship") {
    return {
      label: "Stand up and walk the deck",
      note: "Use the ship's physical surfaces instead of the full console.",
      action: "walkDeck",
      tone: "primary",
    };
  }

  if (S.screen === "shipwalk") {
    return {
      label: "Return to command station",
      note: "Back to the ship systems console.",
      action: "nav",
      args: ["ship"],
    };
  }

  if (S.screen === "stationwalk") {
    return {
      label: "Board and walk aboard",
      note: `Return to ${S.shipName}.`,
      action: "nav",
      args: ["shipwalk"],
    };
  }

  if (canVisitStation && S.screen !== "stationwalk") {
    return {
      label: "Go to station deck",
      note: "Handle port business in the physical space.",
      action: "nav",
      args: ["stationwalk"],
      tone: "primary",
    };
  }

  return {
    label: "Return to ship systems",
    note: "Back to the operating console.",
    action: "nav",
    args: ["ship"],
  };
}

function metric(label: string, value: string, tone = ""): string {
  return `<div class="cp-metric${tone ? ` ${tone}` : ""}"><span>${label}</span><strong>${value}</strong></div>`;
}

export function captainPanelHTML(alerts: CaptainAlert[], cautionLit: boolean): string {
  const st = stats();
  const objective = objectiveSummary();
  const action = contextualAction(alerts, cautionLit);
  const alert = alerts[0];
  const last = S.logLines[0];
  const cargo = `${cargoUsed()}/${st.cargoCap}`;
  const crew = `${S.crew.length}/${st.crewCap}`;
  const alertLabel = alert
    ? `${alert.crit ? "CRITICAL" : "WATCH"}${alerts.length > 1 ? ` · +${alerts.length - 1}` : ""}`
    : "BOARD DARK";
  const alertCopy = alert
    ? alert.t
    : "No live cautions. The ship is giving you room to think.";

  return `<div class="panel captain-panel">
    <div class="cp-head">
      <div>
        <div class="cp-kicker">Captain's Panel</div>
        <div class="cp-caption">Capt. ${S.captainName || "Captain"}</div>
        <h3>${S.shipName}</h3>
      </div>
      <div class="cp-day">DAY ${S.day}</div>
    </div>
    <div class="cp-subhead">
      <span>${shipStatus()}</span>
      <span>${modeLabel()}</span>
    </div>
    <div class="cp-metrics">
      ${metric("Credits", `${fmt(S.credits)}cr`, S.credits < 100 ? "risk" : "")}
      ${metric("Hull", `${Math.round(S.hull)}/${S.hullMax}`, S.hull < 40 ? "risk" : "ok")}
      ${metric("Fuel", `${Math.floor(S.fuel)}u · ${fuelDays()}`, S.fuel < st.fuelDay * 2 ? "risk" : "")}
      ${metric("Food", `${Math.floor(S.food)}r · ${foodDays()}`, S.food < foodPerDay() * 2 ? "risk" : "")}
      ${metric("Power", `${st.powerUse}/${st.powerOut}⚡`, st.powerUse > st.powerOut ? "risk" : "")}
      ${metric("Cargo", cargo)}
      ${metric("Crew", crew)}
      ${metric("Payroll", `${salaries()}cr/d`, salaries() > S.credits ? "risk" : "")}
    </div>
    <div class="cp-block">
      <div class="cp-label">${objective.label}</div>
      <div class="cp-title">${objective.title}</div>
      <p>${objective.detail}</p>
      ${objective.progress ? `<div class="cp-progress">${objective.progress}</div>` : ""}
    </div>
    <div class="cp-block ${alert?.crit ? "crit" : alert ? "warn" : "calm"}">
      <div class="cp-label">${alertLabel}</div>
      <div class="cp-title">${alert ? "Immediate alert" : "Immediate read"}</div>
      <p>${alertCopy}</p>
    </div>
    <button class="${action.tone === "danger" ? "danger cp-action" : "primary cp-action"}" ${actionAttr(action.action, ...(action.args || []))}>${action.label}</button>
    <div class="cp-action-note">${action.note}</div>
    <div class="cp-last">
      <span>Last entry</span>
      <p>${last ? `D${last.d} · ${last.m}` : "Nothing in the log yet."}</p>
    </div>
  </div>`;
}
