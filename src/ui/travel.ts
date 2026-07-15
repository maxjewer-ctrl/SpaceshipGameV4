import { S } from "../state";
import { PLANETS, MODS } from "../content";
import { stats, people } from "../derive";
import { actionAttr } from "../dispatch";
import { nextDayProjection, outcomeRowsHTML } from "./projections";

export function travelHTML(): string {
  if (!S.travel) return `<div class="panel"><p class="dim">You're docked.</p></div>`;
  const t = S.travel;
  const pct = Math.round((1 - t.left / t.total) * 100);
  const st = stats();
  const run = S.arc.stage === 5 && S.arc.deadline;
  const next = nextDayProjection(true);
  return `<div class="panel transit-console">
    <div class="transit-heading"><div><div class="console-kicker">COURSE LOCKED · ${st.speed} U/D</div><h2>${PLANETS[t.from].n} -> ${PLANETS[t.dest].n}</h2></div><b>${t.left}D ETA</b></div>
    <div class="course-strip"><span>${PLANETS[t.from].n}<small>ORIGIN</small></span><div><i style="width:${pct}%"></i><b style="left:${pct}%">◆</b></div><span>${PLANETS[t.dest].n}<small>DESTINATION</small></span></div>
    <p class="course-progress">Day ${t.total - t.left} of ${t.total} · ${pct}% complete</p>
    <section class="burn-forecast"><div class="console-kicker">NEXT-DAY FORECAST</div>
      ${outcomeRowsHTML([
        { label: "Course", current: `${t.left}d remaining`, resulting: next.progressAfter ? `${next.progressAfter}d remaining` : "arrival", note: `${Math.min(100, Math.round((1 - (t.left - 1) / t.total) * 100))}% complete` },
        { label: "Fuel", current: S.fuel.toFixed(1), resulting: next.fuelAfter.toFixed(1), severity: next.fuelAfter <= 0 ? "danger" : "normal", note: `-${next.fuelCost} burn${S.flags.juno_reg_done ? " · true-tuned" : ""}` },
        { label: "Food", current: `${Math.floor(S.food)}`, resulting: `${Math.floor(next.foodAfter)}`, severity: next.foodAfter <= 0 ? "danger" : "normal", note: `-${next.foodUse} consumed${next.foodGenerated ? `, +${next.foodGenerated} generated` : ""}` },
        { label: "Credits", current: `${S.credits}cr`, resulting: `${next.creditsAfter}cr`, severity: S.credits < next.payroll ? "warning" : "normal", note: `${next.payroll}cr payroll` },
      ])}
      <p class="event-forecast">Lane event possible. Advancing commits all listed costs before any encounter resolves.</p>
      <button class="v2-ap-btn on primary" ${actionAttr("advanceDay")}>Engage burn · advance day</button>
    </section>
    <div class="transit-secondary"><span>Hull <b class="${S.hull < 40 ? "low" : ""}">${Math.round(S.hull)}/${S.hullMax}</b></span><span>Souls <b>${people()}</b></span><span>Reactor <b>${st.powerUse}/${st.powerOut}</b></span><span>Systems down <b class="${S.modules.some((m) => m.dmg) ? "low" : ""}">${S.modules.filter((m) => m.dmg).map((m) => MODS[m.t].n).join(", ") || "none"}</b></span></div>
    ${run ? `<p class="low">◆ THE RUN · reach Elysium Gate by day ${S.arc.deadline}. It is day ${S.day}.</p>` : ""}
  </div>`;
}
