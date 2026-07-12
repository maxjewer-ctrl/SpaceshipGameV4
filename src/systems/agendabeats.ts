// Agenda beats — the honest and dishonest objectives from docs/CREW_DOSSIERS.md
// stop being flavor text and start billing (or paying) the captain. Fires once
// per named character, ~2-3 weeks aboard, at most one per docking (same pacing
// rule as checkCrewQuests). This is where "dishonest agenda" becomes a fact
// about play, not just a line in a dossier.
import { S, log } from "../state";
import { CHARACTERS } from "../content";
import { modal, closeModal, hasModal } from "../modal";
import { requestRender } from "../bus";
import { rand, ri } from "../rng";
import { clamp } from "../util";
import { remember, crewKey } from "./ledger";
import { shift } from "./disposition";
import type { CrewMember } from "../types";

const BEAT_KEYS = ["vex", "corbin", "miri", "rook", "nyla", "dez"];
const THRESHOLD = 14; // days aboard before their agenda has had time to surface

function findCrew(id: number): CrewMember | undefined {
  return S.crew.find((c) => c.id === id);
}

let pendingId: number | null = null;

export function checkAgendaBeats() {
  if (hasModal() || !S.docked) return;
  const c = S.crew.find((cm) =>
    cm.key && BEAT_KEYS.includes(cm.key)
    && (cm.daysAboard || 0) >= THRESHOLD
    && !S.flags["agenda_fired_" + cm.id]
  );
  if (!c || !c.key) return;
  S.flags["agenda_fired_" + c.id] = true;
  pendingId = c.id;
  const opener: Record<string, () => void> = {
    vex: beatVex, corbin: beatCorbin, miri: beatMiri, rook: beatRook, nyla: beatNyla, dez: beatDez,
  };
  opener[c.key]?.();
}

// ---------- Callum Vex — the Syndicate debt calls in ----------
function beatVex() {
  const c = findCrew(pendingId!)!;
  modal(`<div class="scene"><div class="scene-loc">${S.shipName} · comms</div>
    <h2>📡 A Voice For Vex</h2>
    <p>The open channel crackles mid-refuel: <i>"Callum. It's been a season. The book doesn't forget."</i> Vex goes white and mutes it from his own station before you can hear the number. "Captain — it's handled. It's — give me a minute."</p>
    <p class="dim">It is not handled. Red Sky collectors want a cut, or they want your route logs. Vex is asking you, silently, to choose which.</p>
    <div class="choices">
      <button onclick="abVexPay()">Cover his debt from ship funds <span class="dim">— 300cr, he owes you now</span></button>
      <button onclick="abVexRefuse()">Tell him it's his mess to clean up</button>
      <button onclick="abVexReport()">Report the contact to the Union — burn him to burn the debt</button>
    </div></div>`);
}
export function abVexPay() {
  const c = findCrew(pendingId!);
  closeModal(); requestRender();
  if (!c) return;
  if (S.credits < 300) { log("You don't have 300cr to spare — Vex handles it himself, badly."); return; }
  S.credits -= 300;
  shift("mercy", 1, "covered a crewman's debt");
  remember(crewKey(c), "captain_covered_the_debt", 4, "The captain paid off the Syndicate collectors on Vex's tab without being asked twice.");
  log(`📡 You wire 300cr to a number Vex won't repeat. The channel goes quiet. He doesn't say thank you — he just flies very, very well for the next week.`);
}
export function abVexRefuse() {
  const c = findCrew(pendingId!);
  closeModal(); requestRender();
  if (!c) return;
  remember(crewKey(c), "captain_left_him_to_it", -2, "The captain let the Syndicate collectors keep calling. Vex handled it himself, and it cost him.");
  S.flags.vex_owes_syndicate = true;
  log(`📡 "Your funeral," you tell him, and mean his, not yours. Vex goes quiet for days. Whatever he traded them to make it stop, he doesn't log it.`);
}
export function abVexReport() {
  const c = findCrew(pendingId!);
  closeModal(); requestRender();
  if (!c) return;
  S.rep.union = clamp(S.rep.union + 2, -20, 20);
  S.rep.syndicate = clamp(S.rep.syndicate - 3, -20, 20);
  remember(crewKey(c), "captain_sold_out_vex", -6, "The captain reported the Syndicate contact to Union comms — with Vex still aboard, still listening.");
  log(`📡 You flag the contact to a Union relay before Vex can stop you. He hears every word of it. "You just made me worth killing for free," he says, and doesn't speak to you for a long while. (+Union, −Syndicate)`);
}

// ---------- "Saint" Corbin — the gossip comes home ----------
function beatCorbin() {
  modal(`<div class="scene"><div class="scene-loc">${S.shipName} · sick bay</div>
    <h2>🗣 What Corbin Said</h2>
    <p>A trader at the last port knew your cargo manifest before you told anyone — knew it down to the unit count. It traces back one place: Corbin, trading ship gossip to an information broker to keep his clinic stocked, same as always. You corner him about it.</p>
    <p>He doesn't deny it. "Words for credits, Captain. Never the stuff that gets anyone killed. I'm careful." You believe he believes that.</p>
    <div class="choices">
      <button onclick="abCorbinConfront()">Make him stop, full stop — no more talk, no more broker</button>
      <button onclick="abCorbinCut()">Cut him in on it instead <span class="dim">— split the information money</span></button>
      <button onclick="abCorbinIgnore()">Let it go. He's the best hands on the frontier for a reason.</button>
    </div></div>`);
}
export function abCorbinConfront() {
  const c = findCrew(pendingId!);
  closeModal(); requestRender();
  if (!c) return;
  shift("law", 1, "shut down a leak");
  remember(crewKey(c), "captain_shut_it_down", 2, "The captain made Corbin cut ties with his information broker. He grumbled. He complied.");
  log(`🗣 "Fine. FINE." Corbin holds up both hands. "No more talk." He means it, mostly — old habits don't die, they just get quieter.`);
}
export function abCorbinCut() {
  const c = findCrew(pendingId!);
  closeModal(); requestRender();
  if (!c) return;
  const cr = ri(80, 160);
  S.credits += cr;
  shift("law", -2, "monetized a crewman's leak");
  remember(crewKey(c), "captain_took_a_cut", -1, "The captain took a cut of Corbin's gossip money instead of stopping it.");
  log(`🗣 "Now THAT," Corbin grins, "is a captain I can work with." ${cr}cr changes hands. Your manifests are still leaking. You're just getting paid for the privilege now.`);
}
export function abCorbinIgnore() {
  closeModal(); requestRender();
  log(`🗣 You let it go. Corbin goes back to stitching wounds and trading whispers, exactly as before. Somewhere, a broker's ledger has your ship's name in it.`);
}

// ---------- Rook Vandermeer — the old crew calls ----------
function beatRook() {
  modal(`<div class="scene"><div class="scene-loc">${S.shipName} · comms</div>
    <h2>✦ An Old Call Sign</h2>
    <p>A hail comes in using a name Rook hasn't answered to in years — his old black-flag call sign. <i>"Knife-Eight, this is Marrow. Long time. We're running the same lanes you are these days. Come say hello. Bring the ship."</i></p>
    <p>Rook's hand hovers over the comm, not touching it. "Captain. Your call. I can talk them down, or we can go dark and hope they lose interest."</p>
    <div class="choices">
      <button onclick="abRookTalk()">Let him handle it — trust the man you hired</button>
      <button onclick="abRookDark()">Cut comms and burn away — don't risk it</button>
      <button onclick="abRookConfront()">Get on the channel yourself — make it your problem, not his</button>
    </div></div>`);
}
export function abRookTalk() {
  const c = findCrew(pendingId!);
  closeModal(); requestRender();
  if (!c) return;
  if (rand() < 0.7) {
    remember(crewKey(c), "captain_trusted_him", 5, "The captain let Rook talk down his old crew alone. He did. It cost him something you never saw.");
    shift("daring", 1, "trusted an ex-pirate with his own past");
    log(`✦ Rook talks for eleven long minutes in a voice you've never heard him use. Whatever he says, Marrow's ship peels off without incident. Rook doesn't explain. You don't ask.`);
  } else {
    S.hull = Math.max(1, S.hull - ri(6, 14));
    remember(crewKey(c), "captain_trusted_him_it_cost", 2, "The captain trusted Rook to talk down his old crew. It didn't fully work, but he tried, hard, in front of you.");
    log(`✦ It goes sideways — a parting shot as Marrow's ship burns off, more warning than attack (−hull). "They don't forgive easy," Rook says, hollow. "Now you know."`);
  }
}
export function abRookDark() {
  const c = findCrew(pendingId!);
  closeModal(); requestRender();
  if (!c) return;
  remember(crewKey(c), "captain_didnt_trust_him", -3, "The captain went dark rather than let Rook face his old crew. He noticed exactly what that meant.");
  log(`✦ You kill the comm and redline the drive. Rook watches the scope until Marrow's ship is gone. "Smart," he says, in a tone that isn't a compliment.`);
}
export function abRookConfront() {
  const c = findCrew(pendingId!);
  closeModal(); requestRender();
  if (!c) return;
  S.rep.syndicate = clamp(S.rep.syndicate - 2, -20, 20);
  remember(crewKey(c), "captain_took_it_from_him", -1, "The captain took the comm out of Rook's hands to deal with his old crew personally.");
  log(`✦ You take the channel yourself. "This is the captain. Rook flies for me now — that conversation's over." It lands as a challenge, not a diplomacy. (−Syndicate)`);
}

// ---------- Nyla Sorrensen — the pantry books ----------
function beatNyla() {
  modal(`<div class="scene"><div class="scene-loc">${S.shipName} · galley</div>
    <h2>🍳 The Pantry Ledger</h2>
    <p>Doing your own accounting for once, you find it: small skims off the galley budget, going back weeks, careful and consistent. Nyla, out of old habit, or old fear. There's a specific number in a specific account — she's been saving, not stealing for herself.</p>
    <div class="choices">
      <button onclick="abNylaConfront()">Confront her — dock the difference from her pay</button>
      <button onclick="abNylaAsk()">Ask why, instead of accusing</button>
      <button onclick="abNylaIgnore()">Say nothing. It's not hurting anyone.</button>
    </div></div>`);
}
export function abNylaConfront() {
  const c = findCrew(pendingId!);
  closeModal(); requestRender();
  if (!c) return;
  const back = Math.min(S.credits, ri(40, 90));
  S.credits += back;
  remember(crewKey(c), "captain_docked_her_pay", -3, "The captain caught the pantry skim and docked her pay without asking why. She went quiet for a week.");
  log(`🍳 You lay the numbers on the table. Nyla doesn't argue — just pays it back, ${back}cr, counted out in front of you, and doesn't meet your eyes again for a while.`);
}
export function abNylaAsk() {
  const c = findCrew(pendingId!);
  closeModal(); requestRender();
  if (!c) return;
  remember(crewKey(c), "captain_asked_instead", 4, "The captain found the pantry skim and asked why instead of docking her pay. She told the truth.");
  log(`🍳 "It's for a stone," she says finally, quiet. "Teller's Claim doesn't have graves anymore. I wanted one somewhere that does." You let her keep saving. She starts cooking like she means it.`);
}
export function abNylaIgnore() {
  closeModal(); requestRender();
  log(`🍳 You close the ledger and don't mention it. The skimming continues, small and steady, under a captain who noticed and chose not to.`);
}

// ---------- Mirelle "Miri" Datta — the manifest leak ----------
function beatMiri() {
  modal(`<div class="scene"><div class="scene-loc">${S.shipName} · quartermaster's station</div>
    <h2>📋 A Courtesy</h2>
    <p>A Syndicate dockmaster waves your berth fees with a smile that knows your name before you give it. "Compliments of the house, Captain — Miri speaks well of you." You never told anyone your schedule. Miri's manifests, it turns out, have been doing quiet second duty.</p>
    <p>She doesn't flinch when you ask. "The margins are real. So's the arrangement. You can end one or the other, Captain. Not both."</p>
    <div class="choices">
      <button onclick="abMiriEnd()">End it — margins or not, the leak stops today</button>
      <button onclick="abMiriKeep()">Keep the arrangement — the money's real and so is the risk</button>
    </div></div>`);
}
export function abMiriEnd() {
  const c = findCrew(pendingId!);
  closeModal(); requestRender();
  if (!c) return;
  S.rep.syndicate = clamp(S.rep.syndicate - 3, -20, 20);
  remember(crewKey(c), "captain_cut_the_arrangement", -1, "The captain ended Miri's arrangement with the Syndicate. She respected it and resented it in equal measure.");
  log(`📋 "Understood, Captain." Miri's voice is perfectly level. The next contract you take pays exactly what it says on the label — no more, no less. (−Syndicate)`);
}
export function abMiriKeep() {
  const c = findCrew(pendingId!);
  closeModal(); requestRender();
  if (!c) return;
  S.flags.miri_syndicate_active = true;
  remember(crewKey(c), "captain_kept_the_arrangement", -2, "The captain let Miri keep feeding the Syndicate your manifests, for the margins. The Syndicate now has a very good picture of your ship.");
  log(`📋 "Smart," she says, and means it as praise. The margins hold. Somewhere in a Red Sky ledger, your ship's routes are filed under 'reliable.'`);
}

// ---------- Dessa "Dez" Okonkwo — the honest payoff ----------
function beatDez() {
  const c = findCrew(pendingId!)!;
  closeModal();
  S.prestige += 1;
  remember(crewKey(c), "dez_network_paid_off", 3, "Dez's Frontier mail network warned the ship off a Union sweep before it happened. It was the kind of favor you can't buy.");
  log(`📡 Dez catches you before you can plot a course through the Solace approach. "Don't. Compact mail runners say the Union's running a surprise compliance sweep there — my sister's network, not gossip." You route around it. Nothing you were carrying would have survived that scan. (+1 prestige)`);
  requestRender();
}
