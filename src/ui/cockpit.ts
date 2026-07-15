import { S, log } from "../state";
import { requestRender } from "../bus";
import { modal } from "../modal";
import { cautions } from "./cautions";
import { radarBlips } from "./ship";
import * as sfx from "../audio";
import { actionAttr } from "../dispatch";

const CTL = {
  bay: "closed" as "closed" | "open",
  bayMoving: false,
  guard: false,
  chan: 0,
};

const CHANNELS = ["GUARD 121.5", "PORT CONTROL", "TRAFFIC SCOPE", "OPEN BAND"];

export function bayToggle() {
  if (CTL.bayMoving) return;
  sfx.bayDoors(CTL.bay === "closed");
  CTL.bayMoving = true;
  requestRender();
  setTimeout(() => {
    CTL.bayMoving = false;
    CTL.bay = CTL.bay === "open" ? "closed" : "open";
    log(CTL.bay === "open"
      ? "Cargo bay doors open. Hard vacuum where the floor used to be."
      : "Cargo bay doors sealed and pressurized.");
    requestRender();
  }, 1250);
}

export function jettisonGood(g: string) {
  if (CTL.bay !== "open" || CTL.bayMoving) return;
  const amount = S.cargo[g] || 0;
  if (!amount) return;
  S.cargo[g] = 0;
  sfx.jettison();
  log(`Jettisoned ${amount} ${g}.`);
  requestRender();
}

export function ventGuard() {
  CTL.guard = !CTL.guard;
  sfx.guardFlip();
  requestRender();
}

export function ventFuel() {
  if (!CTL.guard) return;
  CTL.guard = false;
  sfx.fuelVent();
  const amount = Math.min(5, Math.floor(S.fuel));
  if (amount <= 0) {
    log("Vent valve cycles dry. The tanks have nothing left to give.");
    requestRender();
    return;
  }
  S.fuel -= amount;
  log(`Emergency vent: ${amount} fuel dumped to space.`);
  requestRender();
}

export function commsTune() {
  CTL.chan = (CTL.chan + 1) % CHANNELS.length;
  sfx.commsTune();
  requestRender();
}

function channelReadout(): { text: string; signal: number } {
  if (CTL.chan === 0) {
    const alerts = cautions();
    return alerts.length
      ? { text: alerts[0].t + (alerts.length > 1 ? ` (+${alerts.length - 1})` : ""), signal: 0.9 }
      : { text: "121.5 QUIET - NO DISTRESS TRAFFIC", signal: 0.55 };
  }
  if (CTL.chan === 1) {
    if (S.travel) return { text: `COURSE BEACON - ETA ${S.travel.left}D`, signal: 0.6 };
    if (S.docked) return { text: "PORT CONTROL - BERTH SECURE", signal: 0.85 };
    return { text: "NO CARRIER", signal: 0.1 };
  }
  if (CTL.chan === 2) {
    const contacts = radarBlips().length;
    return { text: `${contacts} CONTACT${contacts === 1 ? "" : "S"} ON SCOPE`, signal: 0.5 + Math.min(0.4, contacts * 0.12) };
  }
  const bark = S.logLines.find((line) => line.bark);
  return bark
    ? { text: `"${bark.m.replace(/<[^>]*>/g, "").slice(0, 64)}"`, signal: 0.4 }
    : { text: "CARRIER HISS", signal: 0.12 };
}

export function commsReadout(): { channel: string; text: string; signal: number } {
  const readout = channelReadout();
  return { channel: CHANNELS[CTL.chan], ...readout };
}

export function cockpitControlState() {
  return { bay: CTL.bay, bayMoving: CTL.bayMoving, guard: CTL.guard } as const;
}

export function confirmJettisonGood(g: string) {
  const amount = S.cargo[g] || 0;
  modal(`<div class="modal-context">MANUAL / EMERGENCY</div><h2>Jettison ${g.toUpperCase()}?</h2>
    <p>This vents all <b>${amount}</b> units of ${g}. It cannot be recovered.</p>
    <div class="choices"><button ${actionAttr("closeModal")}>Cancel</button><button class="danger" ${actionAttr("jettisonGood", g)}>Jettison cargo</button></div>`);
}

export function confirmVentFuel() {
  modal(`<div class="modal-context">MANUAL / EMERGENCY</div><h2>Vent fuel?</h2>
    <p>This dumps up to <b>5 fuel</b> overboard. Raise the physical guard before confirming.</p>
    <div class="choices"><button ${actionAttr("closeModal")}>Cancel</button><button class="danger" ${actionAttr("ventFuel")}>Vent fuel</button></div>`);
}
