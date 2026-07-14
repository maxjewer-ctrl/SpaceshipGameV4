// Dr. Imogen Hale's bonded-trust quest — the secret she's been counting
// stitches to avoid telling anyone finally comes out, but only once the
// captain has actually earned it. Unlike agendabeats.ts (which fires off raw
// days aboard), this is gated purely on trustTier() hitting "bonded" — she
// has to believe you before she'll say it out loud.
import { S, log } from "../state";
import { modal, closeModal } from "../modal";
import { requestRender } from "../bus";
import { clamp } from "../util";
import { remember, crewKey } from "./ledger";
import { trustTier } from "./trust";
import type { CrewMember } from "../types";
import { actionAttr } from "../dispatch";

function findCrew(id: number): CrewMember | undefined {
  return S.crew.find((c) => c.id === id);
}

let pendingId: number | null = null;

// Called on docking (see systems/travel.ts), same slot as checkAgendaBeats.
export function checkImogenQuest() {
  if (!S.docked) return;
  const c = S.crew.find((cm) =>
    cm.key === "imogen"
    && trustTier(cm) === "bonded"
    && !S.flags.imogen_quest_fired
  );
  if (!c) return;
  S.flags.imogen_quest_fired = true;
  pendingId = c.id;
  modal(`<div class="scene"><div class="scene-loc">${S.shipName} · sick bay</div>
    <h2>🩺 What Imogen Doesn't Say</h2>
    <p>You catch her mid-dose, alone, cutting a vial with water to stretch it. She doesn't jump — she's too tired to. "Directorate compounds," she says, before you can ask. "I stood two doors down from the dispersal-modeling teams for six years, Captain. Turns out the air recyclers weren't as one-way as the safety briefings promised."</p>
    <p>She sets the needle down. "It's slow. It's not stopping. And the only formulary that actually holds it back sits in a Union medical annex on Meridian — the one attached to the directorate I ran from. I wasn't going to ask. I'm asking."</p>
    <div class="choices">
      <button class="primary" ${actionAttr("imogenTreatUnion")}>Take her through Union channels <span class="dim">— 220cr, on the record</span></button>
      <button ${actionAttr("imogenTreatSyndicate")}>Get it off the books instead <span class="dim">— 140cr, a favor owed</span></button>
      <button ${actionAttr("imogenDecline")}>Tell her the ship can't spare either the credits or the risk</button>
    </div></div>`);
  requestRender();
}

export function imogenTreatUnion() {
  const c = pendingId != null ? findCrew(pendingId) : undefined;
  closeModal(); requestRender();
  if (!c) return;
  if (S.credits < 220) {
    log("You don't have 220cr to spare — Imogen says nothing, and keeps cutting her doses with water.");
    return;
  }
  S.credits -= 220;
  S.rep.union = clamp(S.rep.union + 1, -20, 20);
  c.perk = true;
  remember(crewKey(c), "imogen_treated_union", 6, "The captain walked her back into the directorate's own annex, on the record, to get her the real formulary.");
  log(`🩺 You file the request under her real name and stand next to her at the counter while it processes. Her hands don't shake filling out the form — yours do, a little, on her behalf. She gets a full course. "That's the last time I set foot on Meridian," she says. "Worth it, though." (+Union)`);
}

export function imogenTreatSyndicate() {
  const c = pendingId != null ? findCrew(pendingId) : undefined;
  closeModal(); requestRender();
  if (!c) return;
  if (S.credits < 140) {
    log("You don't have 140cr to spare — Imogen says nothing, and keeps cutting her doses with water.");
    return;
  }
  S.credits -= 140;
  S.rep.syndicate = clamp(S.rep.syndicate + 1, -20, 20);
  c.perk = true;
  remember(crewKey(c), "imogen_treated_syndicate", 4, "The captain got her the formulary through a Red Sky contact instead of the Union that made her sick.");
  log(`🩺 A Red Sky courier hands off a case of vials at a dead drop that never appears on any manifest. Imogen checks the batch numbers twice before she trusts them. "I'd rather owe the Syndicate than the people who did this to me," she says. It's not gratitude, exactly. It's close.`);
}

export function imogenDecline() {
  const c = pendingId != null ? findCrew(pendingId) : undefined;
  closeModal(); requestRender();
  if (!c) return;
  S.flags.imogen_declined_treatment = true;
  remember(crewKey(c), "imogen_declined", -5, "The captain heard what was wrong with her and decided the ship couldn't afford to help. She went back to cutting her doses with water and didn't ask again.");
  log(`🩺 "Understood, Captain." Imogen picks the needle back up like the conversation didn't happen. She doesn't bring it up again — she just gets quieter, and her doses get thinner.`);
}
