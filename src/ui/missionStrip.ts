import { PLANETS } from "../content";
import { daysTo } from "../derive";
import { S } from "../state";

export function missionStripHTML(): string {
  if (!S.jobs.length) return `<aside class="mission-strip empty"><span>ACTIVE CONTRACTS</span><b>None</b><small>Station cantinas post new work.</small></aside>`;
  return `<aside class="mission-strip"><span>ACTIVE CONTRACTS · ${S.jobs.length}</span><div class="mission-strip-list">${S.jobs.map((job) => {
    const eta = daysTo(S.loc, job.dest);
    const late = !!job.deadline && S.day + eta > job.deadline;
    return `<div class="mission-chip${late ? " risk" : ""}"><b>${job.title}</b><small>${PLANETS[job.dest].n}${job.deadline ? ` · D${job.deadline}` : ""}</small></div>`;
  }).join("")}</div></aside>`;
}
