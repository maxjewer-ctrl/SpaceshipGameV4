import { S } from "../state";
import { PLANETS, MODS } from "../content";
import { stats, foodPerDay, people } from "../derive";

export function travelHTML(): string {
  if (!S.travel) return `<div class="panel"><p class="dim">You're docked.</p></div>`;
  const t = S.travel;
  const pct = Math.round((1 - t.left / t.total) * 100);
  const st = stats();
  const run = S.arc.stage === 5 && S.arc.deadline;
  return `<div class="panel">
    <h3>In Transit: ${PLANETS[t.from].n} → ${PLANETS[t.dest].n}</h3>
    <p>Day ${t.total - t.left} of ${t.total} · ${t.left} day${t.left === 1 ? "" : "s"} remaining</p>
    <div class="starfield"><div class="l2"></div><div class="l1"></div><div class="tinyship">🚀</div></div>
    <div class="progress"><div class="fill" style="width:${pct}%"></div></div>
    <div class="statgrid" style="margin:10px 0">
      <span>Fuel</span><b class="${S.fuel < st.fuelDay * t.left ? "low" : ""}">${S.fuel.toFixed(1)} (burning ${st.fuelDay}/day)</b>
      <span>Food</span><b class="${S.food < foodPerDay() * t.left ? "low" : ""}">${Math.floor(S.food)} (eating ${foodPerDay()}/day)</b>
      <span>Hull</span><b class="${S.hull < 40 ? "low" : ""}">${Math.round(S.hull)}/${S.hullMax}</b>
      <span>Souls aboard</span><b>${people()}</b>
      <span>Reactor</span><b>${st.powerUse}/${st.powerOut}⚡</b>
      <span>Systems down</span><b class="${S.modules.some((m) => m.dmg) ? "low" : ""}">${S.modules.filter((m) => m.dmg).map((m) => MODS[m.t].n).join(", ") || "none"}</b>
    </div>
    ${run ? `<p class="low">◆ THE RUN — reach Elysium Gate by day ${S.arc.deadline}. It is day ${S.day}.</p>` : ""}
    <button class="primary" style="font-size:16px; padding:10px 24px" onclick="advanceDay()">▸ Advance one day</button>
    <p class="dim" style="margin-top:10px">Each day burns fuel and food, pays salaries, and rolls the dice on what the black throws at you.</p>
  </div>`;
}
