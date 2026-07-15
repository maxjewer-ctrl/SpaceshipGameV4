import { S } from "../state";
import { daysTo, foodPerDay, fuelTo, perkActive, salaries, stats } from "../derive";

export interface OutcomeRow {
  label: string;
  current: string;
  resulting: string;
  severity?: "normal" | "warning" | "danger";
  note?: string;
}

function dailyFoodUse(): number {
  const base = foodPerDay();
  return perkActive("cook") ? Math.ceil(base * 0.9) : base;
}

export function nextDayProjection(traveling: boolean) {
  const st = stats();
  const foodUse = dailyFoodUse();
  const payroll = salaries();
  return {
    fuelCost: traveling ? st.fuelDay : 0,
    foodUse,
    foodGenerated: st.foodGen,
    payroll,
    fuelAfter: Math.max(0, +(S.fuel - (traveling ? st.fuelDay : 0)).toFixed(1)),
    foodAfter: Math.max(0, S.food + st.foodGen - foodUse),
    creditsAfter: Math.max(0, S.credits - payroll),
    progressAfter: S.travel ? Math.max(0, S.travel.left - 1) : null,
  };
}

export function routeProjection(dest: string) {
  const days = daysTo(S.loc, dest);
  const fuelCost = fuelTo(S.loc, dest);
  const st = stats();
  const foodUse = dailyFoodUse();
  const payroll = salaries() * days;
  return {
    days,
    fuelCost,
    foodUse: foodUse * days,
    foodGenerated: st.foodGen * days,
    payroll,
    fuelAfter: +(S.fuel - fuelCost).toFixed(1),
    foodAfter: Math.max(0, S.food + (st.foodGen - foodUse) * days),
    creditsAfter: Math.max(0, S.credits - payroll),
  };
}

export function outcomeRowsHTML(rows: OutcomeRow[]): string {
  return `<div class="outcome-table">${rows.map((row) => `<div class="outcome-row ${row.severity || "normal"}"><span>${row.label}</span><b>${row.current} <i>-></i> ${row.resulting}</b>${row.note ? `<small>${row.note}</small>` : ""}</div>`).join("")}</div>`;
}
