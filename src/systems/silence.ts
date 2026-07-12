// THE LONG SILENCE — the main campaign.
// Worlds stop answering the radio. The player advances by LEARNING, not by
// waypoints: five knowledge fragments (sk_* flags) exist, gathered along
// disposition-shaped routes; any three tip the galaxy into the Dimming.
// The map itself is the doomsday clock — silenced worlds go dark for real.
//
// Stages (S.campaign.silence.stage):
//   0 dormant → 1 the Broadcast (gathering) → 2 the Dimming (Verge dark)
//   → 3 source known → 4 resolved (flags: silence_answered/stilled/sold)
import { S, log, whisper } from "../state";
import { PLANETS } from "../content";
import { modal, hasModal, closeModal } from "../modal";
import { requestRender } from "../bus";
import { ri, rand, pick } from "../rng";
import { remember, witnessAll, crewKey } from "./ledger";
import { shift } from "./disposition";
import { clamp } from "../util";

const sil = () => S.campaign.silence;

export const KNOWLEDGE_KEYS = ["sk_numbers", "sk_returned", "sk_cult", "sk_archive", "sk_survivor"];
export function knowledgeCount(): number {
  return KNOWLEDGE_KEYS.filter((k) => S.flags[k]).length;
}

// Record a fragment. The campaign advances on understanding, so this is the
// campaign's real currency — three fragments start the Dimming.
export function learn(key: string, line: string) {
  if (S.flags[key]) return;
  S.flags[key] = true;
  log(`◇ SIGNAL FRAGMENT (${knowledgeCount()}/3) — ${line}`);
  const c = sil();
  if (c.stage === 1 && knowledgeCount() >= 3) {
    c.nextDay = S.day + ri(4, 8);
    c.nextWorld = "verge";
    whisper("The pattern is almost legible now. You find yourself checking the radio the way you'd check a wound.");
  }
}

// ---------- daily tick (called from dayTick) ----------
export function silenceTick() {
  const c = sil();
  if (S.over) return;
  // The conductor: two campaigns never share a stage. The Silence holds its
  // breath during the prologue and the Run — its clocks simply resume after,
  // so nothing is lost, only deferred past someone else's climax.
  if (S.arc.stage === 5) return;
  if (typeof S.flags.intro === "number" && !S.flags.intro_done) return;
  // Scene-granted fragments (set as plain flags by the dialogue DSL) also count
  // toward the threshold — check it here so every route can tip the Dimming.
  if (c.stage === 1 && c.nextDay === null && knowledgeCount() >= 3) {
    c.nextDay = S.day + ri(4, 8);
    c.nextWorld = "verge";
    whisper("Three fragments, one bearing. The pattern is almost legible now — and it is getting closer to being finished with almost.");
  }
  // The Broadcast: four seconds, every radio, every world.
  if (c.stage === 0 && S.day >= 18 && !hasModal()) {
    c.stage = 1;
    S.flags.sil_stage1 = true;
    const pool: string[] = S.flags.riderRumors || (S.flags.riderRumors = []);
    pool.push("\"Every receiver on the station played it. Four seconds. My cousin on Meridian heard the same four seconds at the same tick. Explain that.\"");
    modal(`<h2>📻 The Broadcast</h2>
      <p>It happens at 0314 station time, everywhere at once.</p>
      <p>Every radio on the ship — the galley set, the comm stack, the hand unit clipped in the airlock — plays the same four seconds of sound. Not static. Not a voice. Something between a tide and a breath, patient and enormous, like the sea heard from inside a shell the size of a system.</p>
      <p>Then it stops, and the ordinary chatter of the band resumes as if nothing happened. Except it's thinner than it was. There are <b>holes</b> in it now — frequencies that used to carry a mining colony's traffic, carrying nothing. Not distress. Nothing.</p>
      <p class="dim">The Union is calling it correlated equipment failure. The pilgrims are calling it the Quiet. Fragments of the truth are out there — in the deep lanes, in the cults, in what the Union isn't saying. A listening captain could piece it together.</p>
      <div class="choices"><button class="primary" onclick="closeModal()">Log it. Keep flying.</button></div>`);
    log("◇ THE BROADCAST — every radio in the sector played the same four seconds. The band has holes in it now.");
    return;
  }
  // Scheduled silencings.
  if (c.nextDay !== null && S.day >= c.nextDay && c.stage >= 1 && c.stage < 4 && !hasModal()) {
    const w = c.nextWorld!;
    c.nextDay = null; c.nextWorld = null;
    silenceWorld(w);
    return;
  }
  // The sold ending's bill: the Union's "containment research" eats Foundry.
  if (c.billDay !== null && S.day >= c.billDay && !hasModal()) {
    c.billDay = null;
    c.silenced.push("foundry");
    voidJobsTo("foundry");
    S.rep.union = clamp(S.rep.union - 2, -20, 20);
    modal(`<h2>📻 Containment</h2>
      <p>The newsnets get four minutes of it before the Union blanket-jams the story: a "resonance research facility" on Foundry, a test that didn't stop when they told it to.</p>
      <p><b>Foundry has gone quiet.</b> The yard, the smelters, the eighty thousand people. The Union calls it a temporary exclusion zone. The word temporary is doing work no word has ever done before.</p>
      <p class="dim">You sold them the recording. They played it back louder.</p>
      <div class="choices"><button class="primary" onclick="closeModal()">Live with it.</button></div>`);
    log("◇ FOUNDRY HAS GONE SILENT — the Union's experiments with your recording did this. The exclusion zone is permanent.");
    witnessAll("captain_sold_the_silence", -3, "Foundry went dark because the captain sold the deep recording to the Union.");
    return;
  }
  // Ambient radio while flying: the band gets stranger as you learn more.
  if (S.travel && c.stage >= 1 && c.stage < 4 && rand() < 0.13) {
    whisper(pick(RADIO_LINES));
  }
}

const RADIO_LINES = [
  "The radio sweeps a band that used to carry a mining net's chatter. Flat carrier. Nobody's transmitting, but something's holding the channel open.",
  "A preacher station is reading names tonight — ships that stopped reporting. It's a longer list than last week.",
  "For half a second, between channels, you hear the four seconds again. Or you don't. You turn the gain down anyway.",
  "A child's voice, very far away, counting down from some enormous number in a dead language. The pilgrims say to change frequency politely.",
  "The Union weather service reports 'no anomalies.' It has reported 'no anomalies' hourly, unprompted, for nine days.",
  "Somewhere out past the Verge, a beacon is transmitting a repair manual, page by page, to no one. It's on page four thousand.",
];

// ---------- silencing a world ----------
export function voidJobsTo(world: string) {
  const doomed = S.jobs.filter((j) => j.dest === world);
  for (const j of doomed) {
    S.jobs = S.jobs.filter((x) => x.id !== j.id);
    log(`Contract void — "${j.title}". Its destination stopped answering.`);
  }
}

export function silenceWorld(w: string) {
  const c = sil();
  if (c.silenced.includes(w)) return;
  c.silenced.push(w);
  voidJobsTo(w);
  const pool: string[] = S.flags.riderRumors || (S.flags.riderRumors = []);
  if (w === "verge") {
    c.stage = 2;
    S.flags.sil_stage2 = true;
    // the next world starts its own clock — dawdling has a price
    c.nextDay = S.day + ri(22, 30);
    c.nextWorld = "kestrel";
    pool.push("\"Verge Station's gone dark. Not destroyed — dark. Ships fly out, ships come back, nobody's home. Where do you think the Verge folk WENT, exactly?\"");
    modal(`<h2>📻 NO CARRIER</h2>
      <p>It's the fuel broker who notices first, because the Verge's fuel prices stop updating. Then the relay pings go unanswered. Then a mail packet comes back unopened, and the sector holds its breath.</p>
      <p><b>Verge Station has gone silent.</b> Not a distress call. Not wreckage. Eleven hundred registered inhabitants, and the last transmission out of it is a dockmaster's routine manifest, ending mid-sentence — not cut off. <i>Finished</i>, like the sentence didn't need the rest of itself anymore.</p>
      <p>Refugee boats from the outer moorings are limping into every port that will have them. The ones who got out early describe the same thing: the station got <b>quiet</b>. People stopped talking mid-meal, mid-shift, mid-word — and smiled, and listened to something nobody else could hear.</p>
      <p class="dim">The Verge is still on your chart. Something is still drawing power down there. A captain could go and look — nobody else is going to.</p>
      <div class="choices"><button class="primary" onclick="closeModal()">The black just got bigger.</button></div>`);
    log("◇ VERGE STATION HAS GONE SILENT. Refugees are scattering to every port. The station is still on your chart — dark.");
  } else {
    pool.push(`"${PLANETS[w].n}. Say it again so I believe it. ${PLANETS[w].n} is GONE QUIET. That's not an outer moon, that's the breadbasket."`);
    modal(`<h2>📻 NO CARRIER — ${PLANETS[w].n.toUpperCase()}</h2>
      <p><b>${PLANETS[w].n} has gone silent.</b> The pattern is the same as the Verge — no distress, no wreckage, a last transmission that simply considers itself complete.</p>
      <p>The sector is starting to understand that this is a <i>spreading</i> thing, and the understanding looks like fuel hoarding, port riots, and a Union fleet that patrols in tight, frightened circles and boards nobody.</p>
      <p class="dim">However many fragments of this you've gathered, the arithmetic is now simple: someone has to follow the signal all the way down, or the map keeps dimming.</p>
      <div class="choices"><button class="primary" onclick="closeModal()">Time is not on the sector's side.</button></div>`);
    log(`◇ ${PLANETS[w].n.toUpperCase()} HAS GONE SILENT. The Dimming is spreading.`);
    S.prestige = Math.max(0, S.prestige); // no penalty — but the galaxy is worse
  }
  requestRender();
}

// ---------- arrival hooks (called from arrive) ----------
// Returns true if it consumed the arrival with a story beat.
export function silenceArrive(): boolean {
  const c = sil();
  // The expedition into dark Verge Station.
  if (S.loc === "verge" && c.stage === 2 && c.silenced.includes("verge")) {
    modal(`<h2>🕯 Verge Station — dark side of the band</h2>
      <p>The docking clamps accept you like they always did; the automation never stopped caring. Past the airlock, the station is lit and warm and utterly wrong. Trays of food at empty tables, gone soft. A cantina radio playing the <i>hiss between stations</i> at careful, deliberate volume.</p>
      <p>No bodies. No blood. Eleven hundred people are simply <b>elsewhere</b>, and the deeper decks hum with power draw that has no business being there. Whatever they heard, they followed it <i>down</i>.</p>
      <div class="choices">
        <button class="danger" onclick="silDescend()">Descend into the lower decks</button>
        <button onclick="closeModal(); log('You stay in the ring dock and keep your boots off the deck plating. Some doors want opening; this one only wants company. You can come back.')">Not yet. Undock and breathe.</button>
      </div>`);
    return true;
  }
  // Arrival at the source.
  if (S.loc === "anechoic" && c.stage === 3) {
    sourceScene();
    return true;
  }
  return false;
}

export function silDescend() {
  closeModal();
  shift("daring", 2, "descended into a silenced station");
  const st = S.crew.length;
  // the deep decks take a toll — someone hears their name in the static
  let scare = "";
  if (st > 0 && rand() < 0.6) {
    const c = pick(S.crew);
    scare = `<p>Halfway down, ${c.name} stops dead on the ladder and won't say why. Later, in the mess, they'll tell you: the static said their name. Pronounced it correctly. <i>Twice.</i></p>`;
    remember(crewKey(c), "heard_the_static_speak", -2, `${c.name} heard their name in the static on the Verge's lower decks. They don't sleep with the radio on anymore.`);
  }
  const hullHit = ri(4, 9);
  S.hull = Math.max(1, S.hull - hullHit);
  modal(`<h2>🕯 The Lower Decks</h2>
    <p>The deeper you go, the cleaner it gets. Dust stops. Sound stops — your own boots go hushed, like the air has been persuaded not to carry them. On deck nine you find the station's entire population's worth of <b>shoes</b>, in rows, neat as a chapel.</p>
    ${scare}
    <p>And in the hollow of the reactor bay: a survey buoy the Verge crews must have hauled in from the deep black years ago and never reported. It's transmitting. It has, by its own logs, been transmitting for <b>eleven years</b> — and eleven days ago, something started <i>answering</i>.</p>
    <p>You rip the nav solution out of its core a half-second before the buoy notices you the way a sleeping thing notices a fly. The scramble back to the ship costs you paint and hull plating (−${hullHit} hull) and any remaining belief that this is a natural phenomenon.</p>
    <p><b>You have the bearing. The source is on your chart now: THE ANECHOIC.</b></p>
    <p class="dim">It's deep. Provision like your life depends on it — fuel, food, hull. It does.</p>
    <div class="choices"><button class="primary" onclick="silBearing()">Plot it.</button></div>`);
}

export function silBearing() {
  closeModal();
  const c = sil();
  c.stage = 3;
  S.flags.sil_stage3 = true;
  S.flags.source_unlocked = true;
  log("◇ THE ANECHOIC is on your chart — the source of the Silence, deep past the Verge. Provision hard before you commit.");
  witnessAll("followed_the_signal_down", 2, "The captain walked a silenced station's lower decks and came back with the source's coordinates.");
  requestRender();
}

// ---------- the source ----------
function sourceScene() {
  modal(`<h2>◆ THE ANECHOIC</h2>
    <p>There is nothing here, and the nothing has <b>structure</b>.</p>
    <p>The ship's instruments disagree politely with each other and then, one by one, stop arguing and point the same direction — at a region of black that is blacker than the black behind it, arranged in a pattern your eyes keep trying to file as a coastline.</p>
    <p>The radio wakes on its own. The four seconds play — and this time they don't stop. Up close it isn't a tide or a breath. It's a <b>question</b>, patient and enormous, asked in the shape of every voice it has ever collected: the Verge dockmaster. Eleven hundred people. A child, counting down.</p>
    <p>It has been asking for eleven years. The colonies that went quiet are the places where something finally answered. It doesn't take. It <i>invites</i> — and it does not understand why the rest of you keep declining the call.</p>
    <p>The transmitter array Voss's people would recognize is right there on your board. You could answer it. You could scream across its frequency and still it for good. You could record four clean minutes and sell the Union the keys to a god's front door.</p>
    <div class="choices">
      <button onclick="silAnswer()">◆ ANSWER IT — open the channel and speak for the sector</button>
      <button onclick="silStill()">◆ STILL IT — flood the frequency, end the invitation</button>
      <button onclick="silSell()">◆ RECORD IT — four clean minutes, for the Union's price</button>
    </div>`);
}

export function silAnswer() {
  closeModal();
  const c = sil();
  c.stage = 4; S.flags.sil_stage4 = true; S.flags.silence_answered = true;
  c.silenced = []; c.nextDay = null; c.nextWorld = null;
  S.prestige += 10;
  shift("daring", 3, "answered the thing in the dark");
  witnessAll("answered_the_silence", 4, "At the Anechoic, the captain opened the channel and answered. Everyone aboard heard the sector say hello.");
  const pool: string[] = S.flags.riderRumors || (S.flags.riderRumors = []);
  pool.push("\"The lost stations came back ONLINE. All of them. Every soul accounted for, and every one of them humming the same tune while they work. Sleep well.\"");
  pool.push("\"They say a freighter captain talked to it. Talked BACK to it. Bought the whole sector a seat at a table we can't see.\"");
  modal(`<h2>◆ THE ANSWER</h2>
    <p>You open the channel, and you tell it the truth: <i>we hear you. We are small, and busy, and afraid, and we are not finished being ourselves yet.</i></p>
    <p>The question stops. The whole deep band goes still — a held breath eleven years long, releasing. And then, one by one, like ports lighting up along a dark coast: <b>the silenced worlds come back.</b> The Verge. Every colony. Every soul, walking back out of the lower decks with the mild embarrassment of people waking on a train.</p>
    <p>They remember it as a long conversation none of them can quote. All of them came back <i>kinder</i>, and all of them hum the same four seconds while they work, and on clear nights every radio in the sector carries, very faintly, the sound of something enormous learning to say <b>you're welcome</b>.</p>
    <p>The galaxy is different now. Wondrous, and slightly tilted, forever. It knows your ship's name.</p>
    <p style="color:var(--amber)"><b>THE LONG SILENCE — ANSWERED. The sector wakes strange and whole.</b></p>
    <div class="choices"><button class="primary" onclick="closeModal(); log('◇ The worlds are awake. The band is full of voices again — and one more voice than there used to be. It likes you.')">Keep flying</button></div>`);
  log("◇ CAMPAIGN COMPLETE — you ANSWERED the Silence. Every silenced world woke. The deep band will never be empty again.");
}

export function silStill() {
  closeModal();
  const c = sil();
  c.stage = 4; S.flags.sil_stage4 = true; S.flags.silence_stilled = true;
  c.silenced = []; c.nextDay = null; c.nextWorld = null;
  S.prestige += 6;
  shift("mercy", 2, "chose the sector over the wonder");
  witnessAll("stilled_the_silence", 3, "At the Anechoic, the captain flooded the frequency and stilled the thing in the dark. The crew watched the coastline of black unmake itself.");
  const pool: string[] = S.flags.riderRumors || (S.flags.riderRumors = []);
  pool.push("\"Verge Station's back online like nothing happened. Eleven hundred people with a gap in their memory and no curiosity about it. Officially: solar event. Sure.\"");
  modal(`<h2>◆ THE STILLING</h2>
    <p>You flood the frequency — every watt the ship can make, screamed across the four seconds until the question can't hold its own shape.</p>
    <p>It doesn't fight. That's the part you'll wake up remembering: it just… stops asking, the way a caller who has been very patient finally, politely, hangs up. The coastline of black unravels. The instruments agree with each other again. The universe becomes exactly as large as it was advertised to be.</p>
    <p><b>The silenced worlds wake within hours</b> — everyone accounted for, remembering nothing, mildly embarrassed. Official cause: solar event. Life resumes. Prices normalize. In a year it will be a story dockworkers argue about.</p>
    <p>Only your crew knows that the galaxy used to contain one more voice than it does now — and that you're the captain who declined the call on everyone's behalf. It was probably right. You'll spend the rest of your life listening to ordinary static, checking.</p>
    <p style="color:var(--amber)"><b>THE LONG SILENCE — STILLED. The sector is safe, small, and yours to fly.</b></p>
    <div class="choices"><button class="primary" onclick="closeModal(); log('◇ The band is ordinary again. Sometimes, docked and half asleep, you reach over and turn the radio on. Just to check.')">Keep flying</button></div>`);
  log("◇ CAMPAIGN COMPLETE — you STILLED the Silence. The worlds woke, remembering nothing. Only your crew knows what the sector lost.");
}

export function silSell() {
  closeModal();
  const c = sil();
  c.stage = 4; S.flags.sil_stage4 = true; S.flags.silence_sold = true;
  c.silenced = []; c.nextDay = null; c.nextWorld = null;
  c.billDay = S.day + ri(25, 40);
  S.credits += 3000;
  S.rep.union = clamp(S.rep.union + 8, -20, 20);
  shift("mercy", -2, "sold the deep recording");
  witnessAll("sold_the_silence", -3, "At the Anechoic, the captain recorded the question and sold it to the Union. The crew heard the price. It was 3,000 credits.");
  modal(`<h2>◆ THE TRANSACTION</h2>
    <p>You don't answer, and you don't interfere. You record four clean minutes of a god's patient question, encrypt it, and burn for home.</p>
    <p>The Union pays <b>3,000 credits</b> without haggling, which is how you know you underpriced it. A research directorate you'll never see again takes delivery. The silenced worlds wake on their own within the week — whatever was asking has lost interest in colonies now that something far more interesting has begun <i>studying it back</i>.</p>
    <p>The liaison officer shakes your hand with both of hers. "The Union thanks you, Captain. This changes the strategic picture entirely." You are rich, favored, and — say it plainly — you have sold the keys to a door mankind cannot lock, to the only institution in the sector arrogant enough to open it on purpose.</p>
    <p class="dim">Somewhere, in a facility with no name, a playback is being scheduled.</p>
    <p style="color:var(--amber)"><b>THE LONG SILENCE — SOLD. The worlds woke. The recording is theirs now.</b></p>
    <div class="choices"><button class="primary" onclick="closeModal(); log('◇ 3,000 credits. The worlds woke on their own. The Union has the recording, and the Union has never once left a lever unpulled.')">Spend it well</button></div>`);
  log("◇ CAMPAIGN COMPLETE — you SOLD the Silence to the Union for 3,000cr. The worlds woke. The recording did not stay in a drawer.");
}

// ---------- travel events (wired into rollEvent) ----------
export function evNumbersStation() {
  if (!S.flags.sk_numbers) {
    modal(`<h2>📻 Numbers</h2>
      <p>Mid-shift, the comm stack locks onto a channel nobody tuned. A voice — flat, unhurried, neither man nor woman — is reading numbers. It has the cadence of someone reading a list they have read a very long time.</p>
      <p>Your nav computer, unprompted, starts writing the numbers down. When you finally kill the channel, it has produced something impossible: a partial <b>bearing</b>, deep past the Verge, annotated in your own computer's hand with a word it did not learn from you: <i>SOON.</i></p>
      <div class="choices"><button class="primary" onclick="closeModal(); silLearnNumbers()">Log the bearing</button></div>`);
  } else {
    whisper("The numbers station again, fainter this time. The same patient voice. You don't write it down. It doesn't need you to.");
  }
}
export function silLearnNumbers() {
  learn("sk_numbers", "a numbers station is broadcasting a bearing into the deep black, and your own nav computer transcribed it.");
  requestRender();
}

export function evReturnedShip() {
  S.flags.sil_returned_done = true;
  modal(`<h2>🛸 The Returned</h2>
    <p>She's drifting sunward on a dead-slow tumble: the <b>Prodigal Anne</b>, a Verge-registered prospector that the traffic nets listed as overdue eight months ago. Hull intact. Reactor warm. Running lights cycling a pattern running lights don't have.</p>
    <p>She's answering hails — with a carrier tone. Just the tone. Held open, like a door.</p>
    <div class="choices">
      <button class="danger" onclick="silBoardReturned()">Suit up and board her</button>
      <button onclick="silScanReturned()">Stand off and deep-scan (a day's fuel margin, no risk)</button>
      <button onclick="closeModal(); log('You give the Prodigal Anne a wide, superstitious berth. Some doors hold themselves open for a reason.')">Burn away. Not today.</button>
    </div>`);
}
export function silBoardReturned() {
  closeModal();
  shift("daring", 2, "boarded a returned ship");
  const cr = ri(120, 260);
  S.credits += cr;
  modal(`<h2>🛸 Aboard the Prodigal Anne</h2>
    <p>The crew is aboard. All four of them, seated in the mess, upright and breathing, their eyes tracking together toward things that are not in the room. On the table between them, arranged with terrible care: their comm implants, removed. <i>Neatly.</i></p>
    <p>The logs are a diary of a fishing trip: they found a signal out past the charts, and they followed it, and the last entry — dated three days ago, in a ship missing eight months — reads, in a steady hand: <b>"We heard the rest of it. We came back for you."</b></p>
    <p>You strip the nav core and ${cr}cr in unclaimed salvage bonds, tow-tag the ship for the authorities, and do not look at the crew again. The nav core's final fix points deep past the Verge — the same bearing the whole sector's nightmares are pointing.</p>
    <div class="choices"><button class="primary" onclick="closeModal(); silLearnReturned()">Take the fix. Leave the Anne.</button></div>`);
}
export function silScanReturned() {
  closeModal();
  S.fuel = Math.max(0, S.fuel - 2);
  modal(`<h2>🛸 The Standoff Scan</h2>
    <p>You burn a careful day at sensor range. Four life signs, resting-calm heartbeats, synchronized — <i>exactly</i> synchronized, four hearts keeping one time. The drive logs show an eight-month cruise into a region your charts render as plain black, and a turnaround at a point your instruments refuse to give the same coordinates for twice.</p>
    <p>It's enough. You transmit the tow-tag, log the bearing, and leave the Prodigal Anne holding her door open for somebody braver.</p>
    <div class="choices"><button class="primary" onclick="closeModal(); silLearnReturned()">Log the bearing (−2 fuel)</button></div>`);
}
export function silLearnReturned() {
  learn("sk_returned", "a ship eight months lost came back with its crew changed and its nav core pointing into the deep black.");
  requestRender();
}

// ---------- story surface (ship screen / concourse card) ----------
export function storyCards(): string {
  const c = sil();
  const cards: string[] = [];
  if (c.stage >= 1 && c.stage < 4) {
    let line = "";
    if (c.stage === 1) line = `Fragments gathered: <b>${knowledgeCount()}/3</b>. The band has holes in it. Listen in the deep lanes; ask on Haven's Folly; press the Union about its listening posts; talk to the refugees nobody talks to.`;
    if (c.stage === 2) line = `<b>${c.silenced.map((k) => PLANETS[k].n).join(", ")} dark.</b> The answer is in the silence itself — fly to the Verge and walk in. ${c.nextWorld ? "The Dimming is still spreading." : ""}`;
    if (c.stage === 3) line = `<b>THE ANECHOIC is charted.</b> Provision hard — fuel, food, hull — and fly past the edge of everything. End this, one way or another.`;
    cards.push(`<div class="card" style="border-color:var(--amber)">
      <div class="title" style="color:var(--amber)">◇ THE LONG SILENCE</div>
      <div class="dim">${line}</div></div>`);
  }
  if (c.stage === 4) {
    const how = S.flags.silence_answered ? "Answered. The deep band hums, friendly, forever." : S.flags.silence_stilled ? "Stilled. Only your crew remembers the other voice." : "Sold. The Union has the recording.";
    cards.push(`<div class="card"><div class="title dim">◇ THE LONG SILENCE — resolved</div><div class="dim">${how}</div></div>`);
  }
  // The Reckoning: surfaced once the Voss arc has resolved.
  if (S.flags.arc_resolved && !S.flags.reckoning_resolved) {
    const line = !S.flags.reckoning_started
      ? "A tribunal is collecting witnesses to the Meridian massacre. Word is their advocate works out of the <b>Haven's Folly undercity</b> — and that your name is already in their files."
      : S.flags.job_witness1
        ? "Witness testimony is aboard the tribunal's ledger. Return to <b>Advocate Reyes on Haven's Folly</b> when you're ready to force judgment — or hear the Union's counteroffer first."
        : "Advocate Reyes needs witnesses moved. Corporal Marek is hiding in the <b>Foundry undercity</b>; Dr. Senn waits on <b>Meridian</b> with blood on his hands and testimony in his head.";
    cards.push(`<div class="card" style="border-color:#a86bd9">
      <div class="title" style="color:#a86bd9">⚖ THE RECKONING</div>
      <div class="dim">${line}</div></div>`);
  }
  if (S.flags.reckoning_resolved) {
    const how = S.flags.reckoning_tribunal ? "Admiral Ottesen stood before the tribunal. History has him now." : S.flags.reckoning_public ? "You gave it to the newsnets. The truth is loose, wild, and unowned." : "You sold the case to Ottesen's people. He owes you. You own that.";
    cards.push(`<div class="card"><div class="title dim">⚖ THE RECKONING — resolved</div><div class="dim">${how}</div></div>`);
  }
  if (!cards.length) return "";
  return `<div class="panel"><h3>◇ Transmissions</h3>${cards.join("")}</div>`;
}
