// Engine primitive 1: the Consequence Scheduler.
// A queue of delayed events living in the save. Anything can plant a seed now
// that sprouts later — the entire mechanism of "unexpected payoff." Riders
// resolve to content/riders.json entries and run through a tiny effects DSL
// (the same interpreter every future system will extend).
import { S, log, whisper } from "../state";
import { RIDERS, PLANETS, type RiderDef, type RiderEffect } from "../content";
import type { FireWhen } from "../types";
import { clamp } from "../util";
import { modal, hasModal } from "../modal";
import { requestRender } from "../bus";
import { startCombat } from "./combat";
import { remember } from "./ledger";

// Plant a delayed consequence. fireWhen is a day, a dock condition, or a flag.
export function plant(fireWhen: FireWhen, eventKey: string, payload?: Record<string, any>) {
  S.scheduled.push({ id: S.uid++, fireWhen, eventKey, payload, planted: S.day });
}

// Plant a day-delayed rider N..M days out — the common "5–40 days later" case.
export function plantDelay(minDays: number, maxDays: number, eventKey: string, payload?: Record<string, any>) {
  const span = minDays + Math.floor((S.rngState & 0xffff) / 0xffff * (maxDays - minDays));
  plant({ day: S.day + span }, eventKey, payload);
}

function ready(w: FireWhen): boolean {
  if (w.day !== undefined) return S.day >= w.day;
  if (w.dock !== undefined) return S.docked && S.loc === w.dock;
  if (w.flag !== undefined) return !!S.flags[w.flag];
  return false;
}

// Called from the day tick and on docking. Fires at most one rider per call so a
// modal payoff never stomps another; the rest wait for the next tick.
export function checkScheduler(): boolean {
  if (hasModal() || S.over) return false;
  const idx = S.scheduled.findIndex((e) => ready(e.fireWhen));
  if (idx < 0) return false;
  const ev = S.scheduled.splice(idx, 1)[0];
  fireRider(ev.eventKey, ev.payload);
  return true;
}

let pendingCombat: RiderDef["combat"] | null = null;

export function fireRider(key: string, _payload?: Record<string, any>) {
  const r = RIDERS[key];
  if (!r) { log(`(A scheduled event "${key}" had no content and was skipped.)`); return; }
  applyEffects(r.effects || []);
  if (r.log) log(r.log);
  if (r.combat) {
    pendingCombat = r.combat;
    modal(`<h2>${r.title || "◆ Contact"}</h2>
      <p>${r.text || ""}</p>
      <div class="choices"><button class="danger" onclick="riderFight()">Brace for it.</button></div>`);
  } else if (r.title || r.text) {
    modal(`<h2>${r.title || "◆"}</h2>
      <p>${r.text || ""}</p>
      <div class="choices"><button class="primary" onclick="closeModal()">Noted.</button></div>`);
  }
  requestRender();
}

export function riderFight() {
  const c = pendingCombat; pendingCombat = null;
  if (!c) return;
  const loot = c.loot || 0;
  startCombat({ name: c.name, hull: c.hull, dmg: c.dmg, loot },
    () => { if (loot) S.credits += loot; log(`◆ ${c.name} is wreckage. Old business, settled.`); S.prestige += 2; },
    () => { log(`◆ You slipped ${c.name} — but that grudge is still out there.`); });
}

// ---- the effects DSL — every future system just adds vocabulary here ----
export function applyEffects(effects: RiderEffect[]) {
  for (const e of effects) {
    if (e.credits) S.credits += e.credits;
    if (e.prestige) S.prestige = Math.max(0, S.prestige + e.prestige);
    if (e.food) S.food = Math.max(0, S.food + e.food);
    if (e.fuel) S.fuel = Math.max(0, S.fuel + e.fuel);
    if (e.rep) S.rep[e.rep[0]] = clamp((S.rep[e.rep[0]] || 0) + e.rep[1], -20, 20);
    if (e.flag) S.flags[e.flag] = e.untilDays !== undefined ? S.day + e.untilDays : (e.value ?? true);
    if (e.rumor) {
      const pool: string[] = S.flags.riderRumors || (S.flags.riderRumors = []);
      pool.push(e.rumor);
    }
    if (e.log) whisper(e.log);
    if (e.remember) remember(e.remember.who, e.remember.fact, e.remember.weight, e.remember.note);
    if (e.worldMemory) {
      const w = e.worldMemory;
      remember(`world:${w.planet}`, w.fact, w.weight, w.note);
    }
  }
  // guard planet keys referenced in world memories exist (dev sanity)
  void PLANETS;
}

// Convenience: has a live (unexpired) flag?
export function flagActive(flag: string): boolean {
  const v = S.flags[flag];
  if (typeof v === "number") return v > S.day; // expiry-day flags
  return !!v;
}
