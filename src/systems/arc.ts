// The Voss / Elysium Gate storyline. In Phase 1 this becomes data in
// content_arcs — for now it's the reference implementation the DSL must match.
import { S, log } from "../state";
import { dialogueHeadHTML } from "../ui/portraits";
import { stats, paxJobs, vipJobs, cargoUsed, daysTo } from "../derive";
import { rand, ri } from "../rng";
import { clamp, fmt } from "../util";
import { modal, closeModal } from "../modal";
import { requestRender } from "../bus";
import { actionAttr } from "../dispatch";
import { startCombat } from "./combat";
import { witnessAll } from "./ledger";
import { shift } from "./disposition";

export function arcCantinaCard(): string {
  const a = S.arc;
  if (a.done || a.betrayed || a.stage === 99) return "";
  if (a.stage === 0) {
    if (S.prestige >= 12) {
      return `<div class="card" style="border-color:var(--amber)">
        <div class="title" style="color:var(--amber)">◆ A woman in a grey coat</div>
        <div class="dim">She's been in the corner all night, nursing one drink, watching you. When you glance over, she nods — like she already knows you'll come.</div>
        <button class="primary" style="margin-top:8px" ${actionAttr("arcMeet")}>Hear her out</button>
      </div>`;
    }
    // She's a fixture in every cantina from day one — visible, unexplained,
    // and increasingly hard to ignore as prestige climbs toward the meeting.
    const near = S.prestige >= 8;
    const seen = near
      ? `<div class="title" style="color:var(--amber)">◆ Her again</div>
         <div class="dim">The woman in the grey coat is at her usual table. She's stopped pretending not to watch you. Word in the cantina says she only talks to captains who've made a name for themselves — and yours is getting loud enough to hear.</div>`
      : `<div class="title dim">A woman in a grey coat</div>
         <div class="dim">She's here again — same corner, same one drink, nursing it slow. Never approaches, never explains. Ask around and you get shrugs: <i>"She's been asking about a captain with a reputation. Not you. Not yet."</i></div>`;
    return `<div class="card" style="${near ? "border-color:var(--amber)" : ""}">${seen}</div>`;
  }
  if (a.stage === 2 && S.loc === "verge") {
    return `<div class="card" style="border-color:var(--amber)">
      <div class="title" style="color:var(--amber)">◆ Dr. Voss is waiting</div>
      <div class="dim">She needs passage to Haven's Folly. One passenger berth or stateroom required.</div>
      <button class="primary" style="margin-top:8px" ${actionAttr("arcAcceptVoss")}>Take her aboard (pay: 500cr on arrival)</button>
    </div>`;
  }
  if (a.stage === 4 && S.loc === "havens") {
    return `<div class="card" style="border-color:var(--amber)">
      <div class="title" style="color:var(--amber)">◆ Voss: "Ready when you are, Captain."</div>
      <div class="dim">The Run to Elysium Gate. Once you commit, the Union will know within hours — and the clock starts. Stock fuel and food FIRST.</div>
      <button class="primary" style="margin-top:8px" ${actionAttr("arcStartRun")}>Begin the Run</button>
    </div>`;
  }
  return "";
}

export function arcMeet() {
  modal(`${dialogueHeadHTML(null, "🧥", "Dr. Elara Voss", "the woman in the grey coat")}
    <p>"Captain. I'll be brief. I have a crate — sealed, heavy, and very much not your business what's inside. It needs to reach <b>Verge Station</b> intact. No manifests, no questions."</p>
    <p>"The Union would prefer it didn't arrive. That's all you need to know, and honestly more than is safe."</p>
    <p class="dim">Requires 4 free cargo space. Pays 600cr on delivery.</p>
    <div class="choices">
      <button class="primary" ${actionAttr("arcAcceptCrate")}>Take the crate</button>
      <button ${actionAttr("arcCrateDecline")}>Not interested</button>
    </div>`);
}

export function arcAcceptCrate() {
  if (cargoUsed() + 4 > stats().cargoCap) {
    closeModal();
    log("You need 4 free cargo space for Voss's crate.");
    requestRender();
    return;
  }
  S.arc.stage = 1;
  S.jobs.push({
    id: S.uid++, kind: "arc", title: "◆ Sealed crate for Dr. Voss", dest: "verge",
    units: 4, pay: 600, prestige: 2, needs: [], arcCrate: true,
    desc: "Deliver the sealed crate to Verge Station. Ask nothing.",
  });
  closeModal();
  log("◆ The crate is aboard. It hums, very faintly, if you press your ear to it. You decide not to do that again.");
  requestRender();
}

// The "Not interested" button used to chain two calls in one onclick string
// (`closeModal(); log(...)`) — the dispatcher's data-action only carries one
// action name, so this composite stands in for that pair.
export function arcCrateDecline() {
  closeModal();
  log("You pass on the grey-coat woman's job. She'll be around.");
}

export function arcVergeScene() {
  S.arc.stage = 2;
  modal(`<h2>◆ Verge Station — the handoff</h2>
    <p>The "contact" waiting at the dock is Dr. Voss herself — she beat you here on a fast packet ship. She cracks the crate just enough for you to see inside: a Union data core, military-grade, scorched at the edges.</p>
    <p>"Evidence," she says. "Of what the Union did at Meridian, eleven years ago. Sixty thousand people, Captain. They called it a reactor accident."</p>
    <p>"I need to reach a broker on <b>Haven's Folly</b> who can decrypt it. I need a ship nobody looks at twice. I need <i>you</i>."</p>
    <p class="dim">Take Dr. Voss to Haven's Folly (needs 1 free berth or stateroom — find her in the Verge cantina when ready). 500cr.</p>
    <div class="choices"><button class="primary" ${actionAttr("closeModal")}>"...I'll think about it."</button></div>`);
  log("◆ The crate held a Union data core. Voss wants passage to Haven's Folly. She'll wait in the Verge cantina.");
}

export function arcAcceptVoss() {
  const st = stats();
  if (paxJobs().length >= st.paxCap && vipJobs().length >= st.vipCap) {
    log("No free berth for Dr. Voss — free up a cabin or install one.");
    requestRender();
    return;
  }
  const useVip = paxJobs().length >= st.paxCap;
  S.arc.stage = 3;
  S.jobs.push({
    id: S.uid++, kind: "arc", title: "◆ Passage: Dr. Elara Voss", dest: "havens",
    pay: 500, prestige: 2, needs: [], arcVoss: true, vip: useVip,
    pax: { name: "Dr. Elara Voss", motive: "fugitive", sick: false, arc: true },
    desc: "Get Voss to Haven's Folly. The Union is looking for her.",
  });
  log("◆ Dr. Voss is aboard, with the core in a duffel bag like it's laundry. Set course for Haven's Folly.");
  requestRender();
}

export function evAmbush() {
  modal(`<h2>🛰 Interdiction — Union Gunship</h2>
    <p>They were waiting along the lane. A gunship slides out of the dark, targeting lasers crawling across your viewport.</p>
    <p><i>"Freighter, we know Elara Voss is aboard. Surrender the fugitive and her cargo, and you fly away rich. This offer expires in sixty seconds."</i></p>
    <p>Behind you, Voss says quietly: "Sixty thousand people, Captain."</p>
    <div class="choices">
      <button ${actionAttr("ambushHandOver")}>Hand her over (+1,000cr, Union loves you)</button>
      <button ${actionAttr("ambushFight")}>"Get off my ship's scope." (fight)</button>
      <button ${actionAttr("ambushRun")}>Run the blockade</button>
    </div>`);
}
export function ambushHandOver() {
  closeModal();
  S.jobs = S.jobs.filter((j) => !j.arcVoss);
  S.arc.stage = 99; S.arc.betrayed = true;
  S.flags.arc_resolved = true; // the Reckoning can now find you
  S.credits += 1000;
  S.rep.union = clamp(S.rep.union + 10, -20, 20);
  S.prestige = Math.max(0, S.prestige - 5);
  // The crew watched you do it. They carry it forever, and will cite it back.
  witnessAll("captain_sold_out_voss", -4, "You handed Dr. Voss to the Union for a thousand credits. Everyone aboard watched.");
  shift("mercy", -4, "handed Voss to the Union");
  shift("law", 2, "sided with the Union");
  S.flags.sold_out_voss = true;
  log("◆ You watched them take her. The credits spend fine. The Union owes you a favor. You tell yourself that's the whole story (−5 prestige, +10 Union rep).");
}
export function ambushFight() {
  closeModal();
  startCombat({ name: "Union Gunship", hull: 70, dmg: 14 },
    () => {
      S.rep.union = clamp(S.rep.union - 8, -20, 20); S.prestige += 3;
      witnessAll("captain_stood_by_voss", 4, "You took on a Union gunship rather than give Dr. Voss up. The crew won't forget that either.");
      shift("mercy", 3, "protected Voss"); shift("law", -2, "fought the Union"); shift("daring", 2, "took on a gunship");
      log("◆ The gunship burns behind you. Voss exhales for the first time in an hour. There's no going back now (+3 prestige, −8 Union rep).");
    },
    () => { log("◆ You broke off and slipped away into the debris of an old battle. Fitting."); });
}
export function ambushRun() {
  closeModal();
  shift("law", -1, "ran a Union blockade"); shift("daring", 2, "ran a Union blockade");
  const st = stats();
  const chance = 0.4 + (st.has("pilot") ? 0.25 : 0) + S.engineLvl * 0.08;
  if (rand() < chance) {
    S.rep.union = clamp(S.rep.union - 4, -20, 20);
    log("◆ You dive into an asteroid shadow and cut power. The gunship sweeps past, blind. Voss grins: \"Knew I picked the right ship.\" (−4 Union rep)");
  } else {
    log("◆ No good — they cut off your escape vector. Weapons range in ten seconds.");
    startCombat({ name: "Union Gunship", hull: 70, dmg: 14 },
      () => { S.rep.union = clamp(S.rep.union - 8, -20, 20); S.prestige += 3; log("◆ Gunship down. No going back (+3 prestige, −8 Union rep)."); },
      () => { log("◆ You escaped by the skin of the hull plating."); });
  }
}

export function arcHavensScene() {
  S.arc.stage = 4;
  modal(`<h2>◆ Haven's Folly — the broker</h2>
    <p>In a back room that smells of solder and gin, the broker decrypts the core. The room goes very quiet.</p>
    <p>It's all there. Orders, signatures, sensor logs. The Meridian "accident" was a strike — and the survivors, the witnesses, fled beyond the charts to a place called <b>Elysium Gate</b>. The Union has hunted them for eleven years. This core is proof, and the Gate's location, both.</p>
    <p>"Get me and the core to the Gate," Voss says. "They can broadcast it from there — a transmitter the Union can't silence. But the moment we buy fuel for that heading, they'll know. We'll have <b>14 days</b> before their interdiction net closes."</p>
    <p class="dim">When you begin the Run, Elysium Gate appears on your star map and the countdown starts. Hunters will dog you daily. Stock up FIRST — fuel, food, hull, weapons. This is the part of the story where captains die.</p>
    <div class="choices"><button class="primary" ${actionAttr("closeModal")}>"I'll say when."</button></div>`);
  log("◆ The core is decrypted. When you're provisioned, see Voss in the Haven's Folly cantina to begin the Run.");
}

export function arcStartRun() {
  S.arc.stage = 5;
  S.arc.deadline = S.day + 14;
  shift("daring", 3, "began the Run to Elysium Gate");
  shift("mercy", 2, "risked everything for the Meridian truth");
  log(`◆ THE RUN BEGINS. Elysium Gate is on your chart. Reach it by day ${S.arc.deadline}. The Union net is closing.`);
  modal(`<h2>◆ The Run</h2>
    <p>Voss straps in beside you and sets the duffel between her boots. Somewhere back toward the core worlds, alarms you'll never hear are starting to sound.</p>
    <p><b>Reach Elysium Gate by day ${S.arc.deadline}.</b> Union hunter-killers will find you almost daily. Fuel and food burn fast. There are no friendly ports where you're going.</p>
    <p class="dim">It's roughly a ${daysTo("havens", "gate")}-day burn from Haven's Folly — if nothing goes wrong. Something will go wrong.</p>
    <div class="choices"><button class="primary" ${actionAttr("closeModal")}>Punch it.</button></div>`);
}

// The Run's daily pressure rotates through three shapes — a straight fight, a
// picket to outmaneuver, and a listening net with no combat at all — so the
// dash reads as a manhunt, not the same modal five days straight.
export function evHunter() {
  const beat = (S.flags.run_beat || 0) % 3;
  S.flags.run_beat = beat + 1;
  if (beat === 1) { evRunPicket(); return; }
  if (beat === 2) { evRunNet(); return; }
  modal(`<h2>⚠ Hunter-Killer on Intercept</h2>
    <p>A sleek Union hunter drops out of high burn, weapons already cycling. No hails. No demands. They're not here to arrest anyone anymore.</p>
    <div class="choices">
      <button ${actionAttr("evHunterEngage")}>Turn and fight</button>
      <button ${actionAttr("hunterRun")}>Evade (${Math.round((0.35 + (stats().has("pilot") ? 0.25 : 0) + S.engineLvl * 0.08) * 100)}%)</button>
    </div>`);
}

// The "Turn and fight" button used to chain two calls in one onclick string
// (`closeModal(); startCombat(...)`) — the dispatcher's data-action only
// carries one action name, so this composite stands in for that pair.
export function evHunterEngage() {
  closeModal();
  startCombat({ name: "Union Hunter-Killer", hull: 58, dmg: 15 }, hunterWin, hunterFled);
}

function evRunPicket() {
  modal(`<h2>⚠ Picket Line</h2>
    <p>Two Union interceptors hold station across the lane ahead, drives cold, running dark — a tripwire with guns. They haven't seen you yet. The wide way around costs fuel you'd rather keep.</p>
    <div class="choices">
      <button ${actionAttr("runPicketAround")}>Burn wide around them <span class="dim">— −4 fuel, clean</span></button>
      <button ${actionAttr("runPicketThread")}>Thread the line dark <span class="dim">— nerve and drift, no burn</span></button>
      <button ${actionAttr("evPicketEngage")}>Hit the picket before it wakes</button>
    </div>`);
}

// Same chained-onclick composite pattern as evHunterEngage above.
export function evPicketEngage() {
  closeModal();
  startCombat({ name: "Union Interceptor", hull: 40, dmg: 11 }, hunterWin, hunterFled);
}
export function runPicketAround() {
  closeModal();
  S.fuel = Math.max(0, S.fuel - 4);
  log("◆ You swing wide of the picket line, engines feathered, and lose four units of fuel buying silence. Nobody stirs.");
  requestRender();
}
export function runPicketThread() {
  closeModal();
  shift("daring", 1, "threaded a Union picket dark");
  const st = stats();
  const chance = 0.5 + (st.has("pilot") ? 0.25 : 0) + S.engineLvl * 0.06;
  if (rand() < chance) {
    log("◆ Drives cold, transponder dead, you drift straight through the middle of their tripwire. Voss doesn't breathe for an hour. Neither do you.");
  } else {
    log("◆ A proximity buoy pings you halfway through the line. The near interceptor lights its drive.");
    startCombat({ name: "Union Interceptor", hull: 40, dmg: 11 }, hunterWin, hunterFled);
  }
  requestRender();
}

function evRunNet() {
  modal(`<h2>📡 The Listening Net</h2>
    <p>The band fills with soft, patient pinging — a Union drone net sweeping the lane, triangulating everything that moves. No guns out here. Just ears, and every hour they listen, the hunters behind you get a cleaner fix.</p>
    <div class="choices">
      <button ${actionAttr("runNetDecoy")}>Rig a decoy beacon from spares <span class="dim">— −80cr, they chase the ghost</span></button>
      <button ${actionAttr("runNetSilent")}>Go silent and drift through <span class="dim">— costs most of a day</span></button>
      <button ${actionAttr("runNetPush")}>Push through at full burn <span class="dim">— they'll vector something onto you</span></button>
    </div>`);
}
export function runNetDecoy() {
  closeModal();
  if (S.credits < 80) { log("◆ Not enough spare credits for decoy parts. You'll have to drift or push."); evRunNet(); return; }
  S.credits -= 80;
  log("◆ The decoy beacon tumbles away squawking your transponder codes. Somewhere behind you, hunters converge on eighty credits of scrap.");
  requestRender();
}
export function runNetSilent() {
  closeModal();
  if (S.travel) S.travel.left++;
  log("◆ You cut everything and drift through the net like wreckage. It works — but the deadline doesn't drift with you. (+1 day to this leg)");
  requestRender();
}
export function runNetPush() {
  closeModal();
  shift("daring", 1, "ran a listening net at full burn");
  const hit = ri(5, 10);
  S.hull = Math.max(1, S.hull - hit);
  log(`◆ You redline it through the net. The fix they get is good enough for a long-range volley as you clear the far side (−${hit} hull).`);
  requestRender();
}
export function hunterWin() { S.prestige += 2; log("◆ Hunter-killer destroyed. Voss doesn't celebrate. Neither do you. (+2 prestige)"); }
export function hunterFled() { log("◆ You shook the hunter — this time."); }
export function hunterRun() {
  closeModal();
  const st = stats();
  const chance = 0.35 + (st.has("pilot") ? 0.25 : 0) + S.engineLvl * 0.08;
  if (rand() < chance) log("◆ You kill the transponder and drift cold behind a comet's tail. The hunter overshoots and is gone.");
  else {
    log("◆ They predicted your vector perfectly. Contact in seconds.");
    startCombat({ name: "Union Hunter-Killer", hull: 58, dmg: 15 }, hunterWin, hunterFled);
  }
}

export function arcIntercept() {
  S.arc.deadline = null;
  log("◆ Day of the deadline. The Union interdiction net snaps shut — one ship stands between you and the Gate. The big one.");
  modal(`<h2>◆ The Net Closes</h2>
    <p>You're out of time. Ahead, silhouetted against the stars, a Union <b>Interdictor</b> — twice the tonnage of anything that's chased you yet — powers up its main battery.</p>
    <p>Voss checks the duffel strap. "Through them, then."</p>
    <div class="choices"><button class="danger" ${actionAttr("arcInterceptEngage")}>Through them, then.</button></div>`);
}

// Same chained-onclick composite pattern as evHunterEngage above.
export function arcInterceptEngage() {
  closeModal();
  startCombat({ name: "Union Interdictor", hull: 90, dmg: 16 }, interceptWin, interceptFled);
}
export function interceptWin() {
  log("◆ The Interdictor lists, venting fire. The lane to the Gate is open. Nothing else will catch you now.");
}
export function interceptFled() {
  log("◆ You slipped the Interdictor's firing arc. It's still out there, coming about. Get to the Gate. NOW.");
}

export function arcVictory() {
  S.arc.stage = 6; S.arc.done = true; S.won = true;
  S.flags.arc_resolved = true; // the Reckoning can now find you
  S.flags.arc_broadcast = true; // you carried the truth to the Gate — the tribunal knows
  S.fuel = stats().fuelCap; S.hull = S.hullMax; S.food += 40;
  S.prestige += 10;
  const rep = S.rep;
  let flavor: string;
  if (rep.frontier >= 8) flavor = "The Frontier Compact declares your ship a protected vessel. Out here, that's worth more than any medal.";
  else if (rep.syndicate >= 8) flavor = "The Syndicate sends a bottle of real Earth whiskey and a note: \"We don't forget.\" You'll drink it slowly.";
  else flavor = "You're a wanted criminal in Union space and a folk hero everywhere else. On balance? Worth it.";
  modal(`<h2>◆ ELYSIUM GATE</h2>
    <p>The dead moon opens. Hangar doors, hidden for eleven years, swallow your battered ship — and inside: lights, hydroponics, children. Sixty thousand people's worth of descendants and survivors.</p>
    <p>Voss carries the core to the transmitter herself. At 0300 station time, the truth about Meridian goes out on every band, on every world, unstoppable — signed by the dead and delivered by <b>${S.shipName}</b>.</p>
    <p>${flavor}</p>
    <p class="dim">Day ${S.day} · ${fmt(S.credits)}cr · ${S.prestige}★ prestige · crew of ${S.crew.length}</p>
    <p style="color:var(--amber)"><b>YOU KEPT FLYING. YOU WON.</b></p>
    <div class="choices">
      <button class="primary" ${actionAttr("arcVictoryContinue")}>Keep flying (freeplay)</button>
      <button ${actionAttr("newGame")}>New game</button>
    </div>`);
  log("◆ VICTORY — the Meridian truth is broadcast from Elysium Gate.");
}

// Same chained-onclick composite pattern as arcCrateDecline above.
export function arcVictoryContinue() {
  closeModal();
  log("◆ The Gate refuels and repairs your ship. The sky is still full of work.");
}
