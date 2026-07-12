// Diegetic instructions: the previous captain left notes stuck to the
// consoles — sticky notes, grease pencil on the glass, tape with scrawl.
// Tap one to peel it off; it stays gone for the life of the save. New game,
// new ship, same notes. R. never learned either.
import { S } from "../state";
import { requestRender } from "../bus";

export function peelNote(key: string) {
  S.flags["note_" + key] = true;
  requestRender();
}

// cls: "" = yellow sticky · "blue" = blue sticky · "grease" = grease pencil
// straight on the panel · "tape" = strip of labelled tape
export function note(key: string, text: string, cls = ""): string {
  if (S.flags["note_" + key]) return "";
  return `<div class="stickynote ${cls}" onclick="peelNote('${key}')" title="peel it off">
    <span class="sn-txt">${text}</span><span class="sn-peel">peel ✕</span>
  </div>`;
}
