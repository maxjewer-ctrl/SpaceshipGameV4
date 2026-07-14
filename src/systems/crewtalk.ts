// Walk up to a crew member and actually talk to them. Topic dialogue reads
// real ship state and the hidden Tapestry bundle; trust gates how much of the
// bundle leaks. A resolved "want" becomes a small personal quest with a real
// payoff — a stacking bonus on their role perk. Neglect them badly enough and
// they leave, citing the specific memory that broke it.
import { S, log } from "../state";
import { modal, replaceModal, closeModal } from "../modal";
import { requestRender } from "../bus";
import { actionAttr } from "../dispatch";
import { ROLES, PLANETS, CREW_TREES } from "../content";
import { sentiment, crewKey, remember, strongestMemory, hasMemory } from "./ledger";
import { trustTier, dispositionWord } from "./trust";
import { dialogueHeadHTML, crewPortraitKey } from "../ui/portraits";
import { stats } from "../derive";
import { pick } from "../rng";
import { fmt } from "../util";
import { openCrewDialogue } from "./crewdialogue";
import { rankOf, RANK_NAME } from "./veterancy";
import { LOYALTY_KEYS } from "./loyalty";
import type { CrewMember } from "../types";

function findCrew(id: number): CrewMember | undefined {
  return S.crew.find((c) => c.id === id);
}

let activeCrewId: number | null = null;
let lastLine = "";

export function openCrewTalk(id: number) {
  activeCrewId = id;
  lastLine = "";
  renderCrewTalk();
}

const TIER_LABEL: Record<string, string> = {
  stranger: "Just met", shipmate: "Shipmate", trusted: "Trusted", bonded: "Bonded",
};

function renderCrewTalk() {
  const c = activeCrewId != null ? findCrew(activeCrewId) : undefined;
  if (!c) { activeCrewId = null; closeModal(); return; }
  const tier = trustTier(c);
  const dw = dispositionWord(c);
  const rank = rankOf(c);
  const rankTag = rank > 1 ? ` · ${RANK_NAME[rank]}` : "";
  const rev = c.revealed || (c.revealed = {});
  const questBtn = rev.want ? `<button ${actionAttr("ctQuest")}>${questLabel(c)}</button>` : "";
  const where = S.docked && S.screen === "stationwalk"
    ? `${PLANETS[S.loc].n} · off duty`
    : `${S.shipName} · ${ROLES[c.role]?.n || c.role}`;
  replaceModal(`<div class="scene">
    <div class="scene-loc">${where}</div>
    ${dialogueHeadHTML(crewPortraitKey(c), "🧑‍🚀", c.name, `${TIER_LABEL[tier]}${rankTag} · <span class="ctword ${dw.cls}">${dw.word}</span>`)}
    ${lastLine ? `<p>${lastLine}</p>` : `<p class="dim">${c.name} looks up as you approach.</p>`}
    <div class="choices">
      <button ${actionAttr("ctVibe")}>How are you holding up?</button>
      <button ${actionAttr("ctAbout")}>Tell me about yourself</button>
      <button ${actionAttr("ctShip")}>About the ship</button>
      <button ${actionAttr("ctWorld")}>What do you make of all this?</button>
      ${c.key && CREW_TREES[c.key] ? `<button ${actionAttr("ctDeepTalk")}>Talk it through — the long version</button>` : ""}
      ${questBtn}
      <button class="primary" ${actionAttr("ctClose")}>Nod and move on</button>
    </div>
  </div>`);
}

// ---- "What do you make of all this?" — the state of the world, in their voice.
// Reads the campaigns and the current port; each NEW subject shared deepens
// trust once (talking through big events together is how crews become crews).
function worldLine(c: CrewMember): string {
  const sil = S.campaign.silence;
  const pick2 = <T,>(arr: T[]): T => arr[(c.id + S.day) % arr.length];
  const share = (bucket: string, line: string): string => {
    const fact = "talked_through_" + bucket;
    if (!hasMemory(crewKey(c), fact)) {
      remember(crewKey(c), fact, 1, `You and ${c.name} talked through ${bucket.replace(/_/g, " ")} like crewmates, not staff.`);
    }
    return line;
  };
  // campaign states, most dramatic first
  if (S.arc.stage === 5) return share("the_run", pick2([
    `"What do I make of it? Fourteen days, the whole Union net, and us." A short laugh. "I make us even money, Captain. Don't tell the odds I said so."`,
    `"I keep thinking about the people at that Gate. Eleven years hiding. We're the first good news they'll ever get — if we're fast."`,
  ]));
  if (S.flags.silence_answered) return share("the_answer", `"You talked to it. It talked BACK." ${c.name} shakes their head slowly. "I was there and I don't believe it. Every world woke up... I'm glad it was this ship. I'd have hated hearing it secondhand."`);
  if (S.flags.silence_stilled) return share("the_stilling", `${c.name} is quiet a moment. "We're the only ones who know the sky used to have one more voice in it. That's ours to carry now. I'm not sorry. I'm not exactly proud either."`);
  if (sil.stage === 3) return share("the_bearing", `"The Anechoic." ${c.name} says the word like it costs something. "We pulled a bearing out of a dead station and now we KNOW where it lives. Knowing's the part you can't undo, Captain."`);
  if (sil.stage === 2) return share("the_dimming", pick2([
    `"${sil.silenced.length ? "Whole worlds" : "Stations"} going quiet mid-sentence." ${c.name} wipes clean hands on a rag, twice. "My whole life the black was empty. Empty was BETTER."`,
    `"Everybody dockside talks about it in the same small voice. Nobody says 'what if it's us next.' Everybody means it."`,
  ]));
  if (sil.stage === 1) return share("the_broadcast", `"Four seconds, every radio, everywhere at once." ${c.name} shrugs, not casually. "Equipment failure, the Union says. Sure. All of it. At once. In tune."`);
  if (S.flags.reckoning_started) return share("the_tribunal", `"Sixty thousand names and we're hauling the witnesses." ${c.name} looks at you straight. "This is the good kind of dangerous, Captain. Don't let anyone tell you different."`);
  if (S.flags.arc_resolved && S.flags.arc_broadcast) return share("the_gate", `"I think about the Gate sometimes. Kids growing up in a hollow moon because of what somebody signed." A beat. "We moved the needle on that. Whatever else we haul, we did that."`);
  // no campaign live — talk about where you are
  const portLines: Record<string, string> = {
    meridian: `"Meridian gives me the crawls, honestly. All that glass and nobody looks up. Eleven years since the 'accident' and the whole planet acts like grief is a customs violation."`,
    foundry: `"Foundry's honest, at least. Everything here is exactly as ugly as it looks, priced fair. You know where you stand — downwind of the smelters."`,
    solace: `"Solace is everybody's second-favorite port. Nobody's from here, everybody's been here, half the sector owes it money. Good place to be a captain. Bad place to be broke."`,
    kestrel: `"The Rest is what the frontier's supposed to be, isn't it? Bread and horizon. If the Union squeezes these folk much harder, something's going to give — and I know which side of it I'm standing on."`,
    havens: `"The Folly runs on the honest kind of dishonesty — everyone knows the rules because nobody wrote them down. Watch the quartermasters and never gamble with a man missing exactly one finger."`,
    verge: `"Last light before the black. I always sleep badly here. It's not the noise — it's the direction the quiet comes from."`,
  };
  if (S.docked && portLines[S.loc]) return share("port_" + S.loc, portLines[S.loc]);
  return pick2([
    `"The sector's holding its breath about something, Captain. Prices say so before people do. Keep the tanks full — that's all I know."`,
    `"Big empty, small ship, decent company. There are worse ways to be poor."`,
  ]);
}

// ---- "How are you holding up?" — always on the table, reads real state ----
function vibeLine(c: CrewMember): string {
  const st = stats();
  const lines: string[] = [];
  if (S.hull < S.hullMax * 0.5) lines.push(`"Hull's taken a beating. I've had better days, Captain."`);
  if (S.fuel < st.fuelDay * 2) lines.push(`"We're running thin on fuel. Just saying."`);
  if (S.food < 6) lines.push(`"Stomach's been growling. Nobody's said anything, but."`);
  if (S.travel) lines.push(`"Feels good to be moving. Beats sitting in port."`);
  if (!S.travel && S.docked) lines.push(`"Docked and quiet. Could get used to this — for a day, anyway."`);
  if (lines.length) return pick(lines);
  const tier = trustTier(c);
  if (tier === "bonded") return `"Good, Captain. Better with you asking."`;
  if (tier === "trusted") return `"Can't complain. This crew's alright."`;
  return `"Fine. Still getting my bearings."`;
}

// ---- "Tell me about yourself" — the Tapestry leak, staged by trust ----
function aboutLine(c: CrewMember): string {
  const tier = trustTier(c);
  const rev = c.revealed || (c.revealed = {});
  const b = c.bundle;
  if (!b) return `${c.name} shrugs. "Not much to tell, Captain."`;
  if (!rev.origin) {
    rev.origin = true;
    remember(crewKey(c), "shared_origin", 1, `${c.name} told you where they're from.`);
    return `"I'm from ${b.origin}." ${c.name} doesn't say much more, but it's something.`;
  }
  if (!rev.want) {
    if (tier === "trusted" || tier === "bonded") {
      rev.want = true;
      if (!c.questStage) c.questStage = 1;
      remember(crewKey(c), "shared_want", 2, `${c.name} told you what they're really after.`);
      return `"...Since you're asking. What I really want is ${b.want}." It's the most ${c.name} has said in one go.`;
    }
    return `${c.name} shrugs. "Give it time, Captain."`;
  }
  if (!rev.wound) {
    if (tier === "bonded") {
      rev.wound = true;
      remember(crewKey(c), "shared_wound", 2, `${c.name} told you what happened to them.`);
      return `${c.name} goes quiet a moment. "...${b.wound}." Nobody else on this ship knows that.`;
    }
    return `${c.name} isn't ready to go there yet. Maybe with more time.`;
  }
  return `You know each other well by now. ${c.name} just nods — no need to say it again.`;
}

// ---- "About the ship" — role-flavored read on the state that's actually true ----
function shipLine(c: CrewMember): string {
  const st = stats();
  switch (c.role) {
    case "pilot":
      return S.travel
        ? `"Holding ${st.speed} u/day, ${S.travel.left} day${S.travel.left === 1 ? "" : "s"} out. Burning ${st.fuelDay} fuel a day to do it."`
        : `"Ready when you are, Captain. ${st.fuelDay} fuel a day once we're underway."`;
    case "mechanic": {
      const dmgd = S.modules.filter((m) => m.dmg).length;
      return dmgd
        ? `"${dmgd} system${dmgd > 1 ? "s" : ""} down. I'm on it, but parts don't grow on trees out here."`
        : `"Everything's holding together. Don't jinx it."`;
    }
    case "medic": {
      const sick = S.jobs.filter((j) => j.pax && j.pax.sick).length;
      return sick
        ? `"${sick} passenger${sick > 1 ? "s" : ""} under my care right now. They'll live — probably."`
        : `"Sick bay's quiet. Good. Keep it that way."`;
    }
    case "gunner":
      return S.hull < S.hullMax
        ? `"Hull's dinged up. Whoever did that, I remember faces."`
        : `"Guns are hot and the safeties are off. Say the word."`;
    case "cook":
      return S.food < 10
        ? `"Larder's thin, Captain. I can stretch it, not summon it."`
        : `"Nobody's going hungry on my watch."`;
    case "quartermaster":
      return `"${S.jobs.length} contract${S.jobs.length === 1 ? "" : "s"} on the books, ${fmt(S.credits)}cr in the account. I keep the numbers honest."`;
    default:
      return `"All quiet on my end, Captain."`;
  }
}

// ---- personal quest: want -> a place -> a resolution -> a perk ----
function questLabel(c: CrewMember): string {
  if (c.questStage && c.questStage >= 3) return "What they were chasing";
  if (c.questStage === 2 && c.questDest) return `The road to ${PLANETS[c.questDest].n}`;
  return "What they're chasing";
}

function pickQuestDest(c: CrewMember): string {
  const origin = (c.bundle?.origin || "").toLowerCase();
  const visible = Object.keys(PLANETS).filter((k) => !PLANETS[k].hidden);
  const match = visible.find((k) => origin.includes(PLANETS[k].n.split(" ")[0].toLowerCase()));
  if (match) return match;
  const candidates = visible.filter((k) => k !== S.loc);
  return pick(candidates.length ? candidates : visible);
}

function questLine(c: CrewMember): string {
  const tier = trustTier(c);
  // A named character with an authored loyalty mission doesn't run the generic
  // want→random-world quest — their errand is hand-written and offered on
  // docking once the bond is deep (see systems/loyalty.ts). Keep the topic warm
  // without ever advancing the generic quest to a random destination.
  if (c.key && LOYALTY_KEYS.has(c.key)) {
    return `${c.name} holds something back — not from mistrust. There's a thing they'll ask of you, when they're ready. Not yet.`;
  }
  if (c.questStage === 1) {
    if (tier === "bonded" && (c.daysAboard || 0) >= 15) {
      c.questStage = 2;
      c.questDest = pickQuestDest(c);
      remember(crewKey(c), "quest_opened", 1, `${c.name} finally named the place they need to go.`);
      log(`${c.name} finally says it out loud: they need to get to ${PLANETS[c.questDest].n}.`);
      requestRender();
      return `"There's somewhere I need to go, Captain. ${PLANETS[c.questDest].n}. I've been putting it off." `;
    }
    return `${c.name} goes quiet, like there's more to say. Not yet, though. Give it time.`;
  }
  if (c.questStage === 2 && c.questDest) {
    return `"${PLANETS[c.questDest].n}, Captain. That's where this ends, one way or another." Dock there and see it through.`;
  }
  if (c.questStage === 3) {
    return c.perk
      ? `"Because of you, I finally got there. I won't forget it."`
      : `"...It's done. Wasn't the ending I wanted." ${c.name} doesn't say more.`;
  }
  return "";
}

let pendingQuestCrewId: number | null = null;
let pendingQuestCost = 0;

// Called on docking (see systems/travel.ts). Opens the resolution scene the
// moment you make port at the world their want pointed to.
export function checkCrewQuests() {
  const c = S.crew.find((cm) => cm.questStage === 2 && cm.questDest === S.loc && !(cm.key && LOYALTY_KEYS.has(cm.key)));
  if (!c || !c.bundle) return;
  pendingQuestCrewId = c.id;
  pendingQuestCost = 60 + c.daysAboard! * 2;
  modal(`<div class="scene">
    <div class="scene-loc">${PLANETS[S.loc].n}</div>
    <h2>${c.name}'s Moment</h2>
    <p>${c.name} stops you on the ramp. "This is it, Captain. What I've been chasing — ${c.bundle.want} — it's here, if it's anywhere."</p>
    <div class="choices">
      <button class="primary" ${actionAttr("ctQuestHelp")}>Help them see it through (${pendingQuestCost}cr)</button>
      <button ${actionAttr("ctQuestSkip")}>There's no time for this</button>
    </div>
  </div>`);
  requestRender();
}

export function ctQuestHelp() {
  const c = pendingQuestCrewId != null ? findCrew(pendingQuestCrewId) : undefined;
  if (!c || !c.bundle) { closeModal(); return; }
  if (S.credits < pendingQuestCost) {
    log(`Not enough credits to back ${c.name} up (need ${pendingQuestCost}cr).`);
    requestRender();
    return;
  }
  S.credits -= pendingQuestCost;
  c.questStage = 3; c.perk = true;
  remember(crewKey(c), "quest_resolved_good", 5, `You backed ${c.name} when it mattered — ${c.bundle.want}.`);
  log(`⭐ ${c.name}'s search ends here, and you paid the way. They won't forget it.`);
  closeModal(); requestRender();
}

export function ctQuestSkip() {
  const c = pendingQuestCrewId != null ? findCrew(pendingQuestCrewId) : undefined;
  if (!c || !c.bundle) { closeModal(); return; }
  c.questStage = 3; c.perk = false;
  remember(crewKey(c), "quest_resolved_bad", -4, `You walked past ${c.name} when they needed you — ${c.bundle.want}.`);
  log(`${c.name} watches the moment pass without you. Something closes over in their face.`);
  closeModal(); requestRender();
}

// Called on docking. Deeply neglected crew quit at the next port, citing the
// exact memory that broke them.
export function checkCrewDeparture() {
  if (!S.docked) return;
  const c = S.crew.find((cm) => sentiment(crewKey(cm)) <= -6);
  if (!c) return;
  S.crew = S.crew.filter((x) => x.id !== c.id);
  const mem = strongestMemory(crewKey(c));
  const reason = mem && mem.note ? mem.note : `${c.name} never really forgave you for how things went.`;
  modal(`<div class="scene">
    <div class="scene-loc">${PLANETS[S.loc].n}</div>
    <h2>${c.name} is leaving</h2>
    <p>${c.name} already has their duffel packed by the time you find them on the ramp. "I'm done, Captain."</p>
    <p class="dim" style="font-style:italic">${reason}</p>
    <div class="choices"><button class="primary" ${actionAttr("closeModal")}>Let them go.</button></div>
  </div>`);
  log(`${c.name} left the crew at ${PLANETS[S.loc].n}.`);
  requestRender();
}

// ---- topic button handlers (registered as globals in main.ts) ----
export function ctVibe() {
  const c = activeCrewId != null ? findCrew(activeCrewId) : undefined;
  if (!c) return;
  lastLine = vibeLine(c);
  renderCrewTalk();
}
export function ctAbout() {
  const c = activeCrewId != null ? findCrew(activeCrewId) : undefined;
  if (!c) return;
  lastLine = aboutLine(c);
  requestRender();
  renderCrewTalk();
}
export function ctShip() {
  const c = activeCrewId != null ? findCrew(activeCrewId) : undefined;
  if (!c) return;
  lastLine = shipLine(c);
  renderCrewTalk();
}
export function ctQuest() {
  const c = activeCrewId != null ? findCrew(activeCrewId) : undefined;
  if (!c) return;
  lastLine = questLine(c);
  requestRender();
  renderCrewTalk();
}
export function ctWorld() {
  const c = activeCrewId != null ? findCrew(activeCrewId) : undefined;
  if (!c) return;
  lastLine = worldLine(c);
  requestRender();
  renderCrewTalk();
}
export function ctClose() {
  activeCrewId = null;
  lastLine = "";
  closeModal();
}
// Registered crew get a deep conversation tree (systems/crewdialogue.ts) on
// top of the topic menu above; this just opens it for whoever's aboard.
export function ctDeepTalk() {
  if (activeCrewId == null) return;
  openCrewDialogue(activeCrewId);
}
