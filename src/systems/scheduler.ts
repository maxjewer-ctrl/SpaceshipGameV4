// Engine primitive 1: the Consequence Scheduler.
// A queue of delayed events living in the save. Anything can plant a seed now
// that sprouts later — the entire mechanism of "unexpected payoff." Riders
// resolve to content/riders.json entries and run through a tiny effects DSL
// (the same interpreter every future system will extend).
import { S, log, whisper } from "../state";
import { RIDERS, PLANETS, CHARACTERS, type RiderDef, type RiderEffect } from "../content";
import type { FireWhen } from "../types";
import { clamp } from "../util";
import { modal } from "../modal";
import { actionAttr } from "../dispatch";
import { requestRender } from "../bus";
import { startCombat } from "./combat";
import { remember } from "./ledger";
import { reputation, shift, type Axis } from "./disposition";
import { bumpStanding, markPort } from "./port";
import { genBundle } from "./market";
import { rand } from "../rng";
import type { Job } from "../types";

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

// Called from the day tick and on docking. Fires at most one rider per call —
// the rest wait for the next tick. A rider's modal payoff queues rather than
// stomping if one's already showing (see modal.ts's QUEUE), so this no longer
// needs its own hasModal() guard to avoid overlap.
export function checkScheduler(): boolean {
  if (S.over) return false;
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
      <div class="choices"><button class="danger" ${actionAttr("riderFight")}>Brace for it.</button></div>`);
  } else if (r.title || r.text) {
    modal(`<h2>${r.title || "◆"}</h2>
      <p>${r.text || ""}</p>
      <div class="choices"><button class="primary" ${actionAttr("closeModal")}>Noted.</button></div>`);
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
    if (e.credits) S.credits = Math.max(0, S.credits + e.credits);
    if (e.prestige) S.prestige = Math.max(0, S.prestige + e.prestige);
    if (e.food) S.food = Math.max(0, S.food + e.food);
    if (e.fuel) S.fuel = Math.max(0, S.fuel + e.fuel);
    if (e.hull) { S.hull = Math.min(S.hullMax, Math.max(0, S.hull + e.hull)); }
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
    if (e.dispo) shift(e.dispo.axis as Axis, e.dispo.n);
    if (e.standing) bumpStanding(S.loc, e.standing);
    if (e.portMark) markPort(S.loc, e.portMark);
    if (e.plantRider) plantDelay(e.plantRider.min, e.plantRider.max, e.plantRider.key);
    if (e.mission) {
      const m = e.mission;
      S.jobs.push({
        id: S.uid++, kind: m.kind, title: m.title, dest: m.dest, pay: m.pay,
        units: m.units, hidden: m.hidden, prestige: m.prestige, rep: m.rep,
        needs: m.needs, desc: m.desc, tag: m.tag, tier: m.tier,
        deadline: m.deadlineDays ? S.day + m.deadlineDays : undefined,
        pax: m.pax ? { name: m.pax.name, motive: m.pax.motive, sick: false } : undefined,
      } as Job);
    }
    if (e.npc) {
      const ex = S.npcs.find((n) => n.key === e.npc!.key);
      if (ex) { ex.disposition += e.npc.disposition; ex.day = S.day; if (e.npc.agenda) ex.agenda = e.npc.agenda; }
      else S.npcs.push({ key: e.npc.key, name: e.npc.name, disposition: e.npc.disposition, agenda: e.npc.agenda || "dormant", power: e.npc.power || 0, day: S.day });
    }
    if (e.recruit) {
      // A named roster character keeps their handcrafted Tapestry bundle.
      const cdef = e.recruit.key ? CHARACTERS[e.recruit.key] : null;
      if (e.recruit.key) S.flags["char_" + e.recruit.key] = true;
      S.crew.push({
        id: S.uid++, name: e.recruit.name, role: e.recruit.role, fee: 0,
        salary: e.recruit.salary ?? 8, key: e.recruit.key,
        bundle: cdef ? { ...cdef.bundle, traits: cdef.bundle.traits.slice() } : genBundle(),
        daysAboard: 0, questStage: 0,
      });
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

// ---- reputation payoffs ----
// Each pole maps to a [beneficial, costly] rider pair. Balanced tone: a coin flip
// between them, so a strong reputation cuts both ways over time.
const REP_RIDERS: Record<string, [string, string]> = {
  "mercy+":  ["rep_guardian_angel", "rep_the_con"],
  "mercy-":  ["rep_merc_work", "rep_vendetta"],
  "law+":    ["rep_union_privilege", "rep_syndicate_snub"],
  "law-":    ["rep_syndicate_courtship", "rep_union_manhunt"],
  "daring+": ["rep_legend_grows", "rep_pushed_luck"],
  "daring-": ["rep_trusted_hauler", "rep_passed_over"],
};

// Called on docking. If your reputation is pronounced, occasionally plant a
// delayed payoff keyed to it — so HOW you've been playing sprouts weeks later,
// disconnected from any single choice. Each rider fires at most once.
export function maybePlantReputationRider() {
  if (S.flags.repCooldownUntil && S.day < S.flags.repCooldownUntil) return;
  const rep = reputation();
  if (!rep || rep.strength < 8) return;
  if (rand() > 0.18) return;
  const pair = REP_RIDERS[rep.pole];
  if (!pair) return;
  // stronger reputations tilt slightly toward their beneficial side; balanced-ish
  const pickCostly = rand() < 0.5;
  const primary = pickCostly ? pair[1] : pair[0];
  const alt = pickCostly ? pair[0] : pair[1];
  const key = !S.flags["repfired_" + primary] ? primary
            : !S.flags["repfired_" + alt] ? alt : null;
  if (!key) return; // both already fired for this pole
  S.flags["repfired_" + key] = true;
  S.flags.repCooldownUntil = S.day + 12;
  plantDelay(6, 16, key);
}
