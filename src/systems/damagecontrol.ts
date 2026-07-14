// Damage control — what problems feel like WITHOUT the right crew aboard.
// Design rule: a specialist makes a problem a log line; a missing specialist
// makes it YOUR problem — a hands-on scramble that eats hull, fuel, food and
// dignity. The minigames are deliberately simple and a little unfair. That's
// the pitch for the hire: not a stat bonus, an absence of this.
import { S, log } from "../state";
import { modal, closeModal } from "../modal";
import { requestRender } from "../bus";
import { rand, ri } from "../rng";
import { stats } from "../derive";
import { actionAttr } from "../dispatch";
import { checkDead } from "./gameover";
import { damageModule } from "./actions";
import type { Job } from "../types";

// ---------- coolant rupture (no mechanic aboard) ----------
// Three isolation valves, water-damaged schematic, one right answer. Wrong
// guesses vent fuel and cook hull until you find it. A mechanic aboard never
// sees this screen.
let dcCorrect = 0;
let dcTried: number[] = [];

export function dcBreakdown() {
  dcCorrect = ri(0, 2);
  dcTried = [];
  drawValves(
    `A coolant line lets go somewhere aft with a sound like a kettle the size of a room. Pressure is climbing. The isolation schematic is water-damaged — of course it is — and there are <b>three shutoff valves</b>, and you are the closest thing this ship has to a mechanic.`,
  );
}

function drawValves(lead: string) {
  const names = ["Valve A — feed manifold", "Valve B — heat exchanger", "Valve C — return loop"];
  const btns = [0, 1, 2].map((i) =>
    dcTried.includes(i)
      ? `<button disabled>${names[i]} <span class="dim">— tried, wrong</span></button>`
      : `<button ${actionAttr("dcValve", i)}>${names[i]}</button>`
  ).join("");
  modal(`<div class="scene"><div class="scene-loc">${S.shipName} · engine room · unassisted</div>
    <h2>🔧 Coolant Rupture</h2>
    <p>${lead}</p>
    <p class="dim">No mechanic aboard. Guess wrong and the relief line vents fuel while the overpressure chews hull.</p>
    <div class="choices">${btns}</div></div>`);
}

export function dcValve(i: number) {
  if (dcTried.includes(i)) return;
  if (i === dcCorrect) {
    const hull = ri(3, 6);
    S.hull = Math.max(0, S.hull - hull);
    const tries = dcTried.length + 1;
    closeModal();
    log(`🔧 Coolant rupture contained on guess ${tries}/3 (−${hull} hull, a ruined shift, burned knuckles). A mechanic would have had it in minutes.`);
    checkDead("The coolant cascade won the guessing game.");
    requestRender();
    return;
  }
  dcTried.push(i);
  const hull = ri(3, 5);
  S.hull = Math.max(0, S.hull - hull);
  S.fuel = Math.max(0, S.fuel - 1);
  if (S.hull <= 0) {
    closeModal();
    checkDead("The coolant cascade won the guessing game.");
    requestRender();
    return;
  }
  drawValves(`Wrong valve. The pressure spikes, the relief line vents a curl of precious fuel into the black (−${hull} hull, −1 fuel), and the kettle-scream gets a half-tone angrier. Pick again.`);
}

// ---------- meteor swarm (no pilot aboard) ----------
// Three vectors, one clean line through the rocks. A pilot threads this in
// their sleep; you get to gamble the hull on a hunch.
let dcSafe = 0;

export function dcMeteor() {
  dcSafe = ri(0, 2);
  modal(`<div class="scene"><div class="scene-loc">${S.shipName} · helm · unassisted</div>
    <h2>☄ Swarm — Manual Helm</h2>
    <p>The scope goes from empty to gravel in four seconds. Micro-meteors, a whole drift of them, and nobody in the pilot's chair but you. Three lines through it. One of them is clean. The scope will not tell you which.</p>
    <div class="choices">
      <button ${actionAttr("dcVector", 0)}>Pitch high over the drift</button>
      <button ${actionAttr("dcVector", 1)}>Roll belly-to and thread the middle</button>
      <button ${actionAttr("dcVector", 2)}>Burn straight through, speed as armor</button>
    </div></div>`);
}

export function dcVector(i: number) {
  const st = stats();
  closeModal();
  if (i === dcSafe) {
    const dmg = ri(2, 4);
    S.hull = Math.max(0, S.hull - dmg);
    log(`☄ You pick the right line through the swarm — ugly, white-knuckled, alive (−${dmg} hull). A pilot reads rock the way you read a menu.`);
  } else {
    const dmg = Math.max(1, ri(8, 13) - st.shield);
    S.hull = Math.max(0, S.hull - dmg);
    log(`☄ Wrong line. The hull sounds like a tin roof in hail (−${dmg} hull).`);
    if (rand() < 0.25 && damageModule("Meteor strike")) { /* module hit logged by damageModule */ }
  }
  checkDead("A rock the size of a fist ended the whole story.");
  requestRender();
}

// ---------- sick passenger (no med bay aboard) ----------
// Soup and prayers, or burn stores playing nurse. A medic makes this a line
// in the log and full fare on arrival.
let dcSickJobId: number | null = null;

export function dcSickPassenger(j: Job) {
  dcSickJobId = j.id;
  const can = S.food >= 3 && S.credits >= 25;
  modal(`<div class="scene"><div class="scene-loc">${S.shipName} · passenger berths</div>
    <h2>🤒 ${j.pax!.name} Is Burning Up</h2>
    <p>Fever, chills, the works — and your entire medical corps is a first-aid kit and a positive attitude. They will not be paying full fare in this condition.</p>
    <div class="choices">
      <button ${can ? "" : "disabled"} ${actionAttr("dcCare", 'nurse')}>Play nurse — broth, cold cloths, round-the-clock <span class="dim">— −3 food, −25cr${can ? "" : " (can't afford it)"}</span></button>
      <button ${actionAttr("dcCare", 'soup')}>Soup and prayers — let it run its course</button>
    </div></div>`);
}

export function dcCare(kind: string) {
  const j = S.jobs.find((x) => x.id === dcSickJobId);
  dcSickJobId = null;
  closeModal();
  if (!j || !j.pax) { requestRender(); return; }
  if (kind === "nurse") {
    S.food = Math.max(0, S.food - 3);
    S.credits = Math.max(0, S.credits - 25);
    if (rand() < 0.6) {
      j.pax.sick = false;
      log(`🤒 Two sleepless days of broth and cold cloths and ${j.pax.name}'s fever breaks. Full fare intact — and you never want to see soup again. A med bay does this without the sleep deprivation.`);
    } else {
      log(`🤒 You nurse ${j.pax.name} as best you can. The fever holds anyway — some things need a real med bay, not a warm towel (half fare on arrival).`);
    }
  } else {
    log(`🤒 ${j.pax.name} sweats it out in their bunk on soup and prayers. They'll live — and they'll deduct it from the fare with a shaking hand.`);
  }
  requestRender();
}
