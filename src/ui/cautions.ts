import { foodPerDay, stats } from "../derive";
import { S } from "../state";

export interface CaptainAlert {
  t: string;
  crit: boolean;
}

export function cautions(): CaptainAlert[] {
  const st = stats();
  const out: CaptainAlert[] = [];
  const damaged = S.modules.filter((m) => m.dmg).length;
  if (S.hull < 40) out.push({ t: `HULL INTEGRITY ${Math.round((S.hull / S.hullMax) * 100)}%`, crit: true });
  if (damaged) out.push({ t: `${damaged} SYSTEM${damaged === 1 ? "" : "S"} DAMAGED - REPAIR REQUIRED`, crit: true });
  if (st.powerUse > st.powerOut) out.push({ t: "REACTOR OVERDRAW - SHED LOAD", crit: true });
  if (S.fuel < st.fuelDay * 2) out.push({ t: `FUEL RESERVE LOW - ${Math.floor(S.fuel)} UNITS`, crit: S.fuel < st.fuelDay });
  if (S.food < foodPerDay() * 2) out.push({ t: `PROVISIONS LOW - ${Math.floor(S.food)} RATIONS`, crit: S.food < foodPerDay() });
  if (S.arc.stage === 5 && S.arc.deadline) out.push({ t: `RUN DEADLINE - DAY ${S.arc.deadline}`, crit: S.arc.deadline - S.day <= 2 });
  if ((S.flags.injuredUntil ?? 0) > S.day) out.push({ t: `CAPTAIN INJURED - REDUCED VITALITY UNTIL DAY ${S.flags.injuredUntil}`, crit: false });
  return out.sort((a, b) => +b.crit - +a.crit);
}
