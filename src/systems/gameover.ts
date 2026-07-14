import { S, log, clearSave } from "../state";
import { modal } from "../modal";
import { fmt } from "../util";
import { actionAttr } from "../dispatch";

export function gameOver(msg: string) {
  S.over = true; S.dead = true;
  clearSave();
  modal(`<h2 style="color:var(--red)">✝ END OF THE LINE</h2>
    <p>${msg}</p>
    <p class="dim">Survived to day ${S.day} · ${fmt(S.credits)}cr · ${S.prestige}★ prestige${S.arc.stage >= 5 ? " · died on the Run" : ""}</p>
    <div class="choices"><button class="primary" ${actionAttr("newGame")}>Start over</button></div>`);
}

export function checkDead(msg?: string): boolean {
  if (S.hull <= 0) {
    gameOver(msg || "The hull gave out. It was quick, at least.");
    return true;
  }
  return false;
}
