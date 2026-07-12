import { setState, newState, log, clearSave } from "../state";
import { modal, clearModal, closeModal } from "../modal";
import { requestRender } from "../bus";
import { refreshMarket } from "../systems/market";
import { $ } from "../util";

export function showHelp() {
  modal(`<h2>How to Fly</h2>
    <p><b>Goal:</b> keep the ship fueled, fed, and flying. Take contracts from cantinas, haul goods between worlds, buy modules, hire crew — and when your prestige reaches <b>12★</b>, a woman in a grey coat will find you. That's when the real story starts.</p>
    <p><b>Loop:</b> dock → cantina for jobs → market for fuel/food/trade → shipyard for modules & repairs → star map → depart → advance days, survive events → deliver → profit.</p>
    <p><b>Modules</b> define what jobs you can take: cabins for passengers, med bay for medical runs, weapons + armory for bounties, smuggler's hold for the shady stuff, hydroponics to grow food. Slots are limited — choices matter.</p>
    <p><b>Power:</b> active systems (⚡ pips on the deck plan) draw reactor power; the drive core only makes so much. Toggle modules on/off from the Ship screen, upgrade the drive (+2⚡ per mark), or fit an Auxiliary Reactor (+3⚡). <b>Damage:</b> combat hits and breakdowns knock specific modules offline — red LED, lost capability, sometimes vented fuel or jettisoned cargo. Fix them at a dry dock (80cr) or let a mechanic jury-rig them mid-flight.</p>
    <p><b>Crew</b> delegate the work: a mechanic repairs in flight, a pilot saves fuel and dodges trouble, a cook stretches rations, a gunner hits harder, a quartermaster squeezes contracts. They need quarters, salaries, and food.</p>
    <p><b>Economy tips:</b> food is dirt-cheap on Kestrel's Rest; modules are 15% off at Foundry; goods bought at their source world sell high on the frontier. Medicine from Meridian → Verge is a classic.</p>
    <p><b>Don't:</b> run out of fuel mid-flight (ruinous tow fees), run out of food (crew starve and quit), skip payroll, or fly weaponless through pirate country with full holds.</p>
    <p><b>The Run:</b> the endgame is a timed dash against the Union net — Oregon Trail rules. Provision like your life depends on it. It does.</p>
    <div class="choices"><button class="primary" onclick="closeModal()">Back to the black</button></div>`);
}

export function confirmNewGame() {
  modal(`<h2>Abandon ship?</h2><p>This scuttles the current save and starts over.</p>
    <div class="choices">
      <button class="danger" onclick="newGame()">Yes — new game</button>
      <button onclick="closeModal()">Keep flying</button>
    </div>`);
}

export function newGame() {
  clearSave();
  clearModal();
  intro();
}

export function intro() {
  modal(`<h2>☄ THE KESTREL RUN</h2>
    <p>The war's over, the Union won, and the paperwork never stops. Out here past the core worlds, folk need things moved — cargo, passengers, secrets. A ship is a spine with room to grow: cabins, cargo, guns, a hydroponics bay full of beans. You can't have everything. That's the job: choosing.</p>
    <p>Earn credits. Earn a reputation. And when your name means something (<b>12★ prestige</b>), somebody with a very dangerous crate is going to come looking for a captain exactly like you.</p>
    <p style="margin-bottom:4px"><b>Name your ship:</b></p>
    <input id="shipnamein" value="Kestrel" maxlength="18" style="width:100%; padding:8px; background:#0d0f17; border:1px solid var(--line); color:var(--amber); border-radius:4px; font-size:15px; font-family:inherit">
    <div class="choices">
      <button class="primary" onclick="introStart()">◆ Begin at the beginning — the prologue <span class="dim">(recommended: how you got this ship)</span></button>
      <button onclick="startGame()">Skip it — start docked at Port Solace with 500cr</button>
    </div>`);
}

export function startGame() {
  const input = document.getElementById("shipnamein") as HTMLInputElement | null;
  const name = (input && input.value.trim()) || "Kestrel";
  setState(newState(name));
  clearModal();
  log(`You take possession of the ${name} at Port Solace. She's ugly, slow, and yours.`);
  log("Tip: hit the Cantina for work, the Market for fuel & food, the Shipyard for modules. ? Help has the full manual.");
  refreshMarket();
  requestRender();
}
