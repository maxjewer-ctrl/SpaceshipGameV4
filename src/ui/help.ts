import {
  S, setState, newState, log, clearSave, save,
  slotList, loadSlot, deleteSlot, setActiveSlot, activeSlot, exportSave, importSave,
  type SlotMeta,
} from "../state";
import { modal, clearModal, closeModal } from "../modal";
import { requestRender } from "../bus";
import { refreshMarket } from "../systems/market";
import { PLANETS } from "../content";
import { openCreator, getCaptainName, getAppearance } from "./avatar";
import { $ } from "../util";
import { actionAttr } from "../dispatch";

// The character creator (ui/avatar.ts) renders the #captainrolein select; both
// startGame() here and systems/intro.ts introStart() read the selection.
export function readCaptainRole(): string | null {
  const sel = document.getElementById("captainrolein") as HTMLSelectElement | null;
  return (sel && sel.value) || null;
}

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
    <div class="panel" style="margin-top:14px">
      <h3>🎮 Controller</h3>
      <p id="gp-status" class="dim">Checking for a controller…</p>
      <p class="dim" style="margin-top:6px">Wired Xbox / standard-mapping USB controllers: left stick or D-pad moves in the walking scenes (Walk Ship / Station), A interacts. Browsers only report a controller after it's woken up — press any button or move a stick on it now.</p>
    </div>
    <div class="choices"><button class="primary" ${actionAttr("closeHelp")}>Back to the black</button></div>`);
  startGamepadWatch();
}

// ---- controller detection (surfaced in the Help modal — see systems/intro.ts
// tutorial callout and ui/walk.ts pollGamepad for the actual movement wiring) ----
let gpWatchHandle: number | null = null;

function startGamepadWatch() {
  stopGamepadWatch();
  updateGamepadStatus();
  gpWatchHandle = window.setInterval(updateGamepadStatus, 200);
}

function stopGamepadWatch() {
  if (gpWatchHandle !== null) { clearInterval(gpWatchHandle); gpWatchHandle = null; }
}

function updateGamepadStatus() {
  const el = document.getElementById("gp-status");
  if (!el) { stopGamepadWatch(); return; } // modal closed some other way — stop polling
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  const gp = Array.from(pads || []).find((p) => !!p);
  if (!gp) {
    el.innerHTML = `<span style="color:var(--bad,#d96b6b)">✕ No controller detected.</span> Plug in a wired controller and press a button on it.`;
    return;
  }
  const nonStandard = gp.mapping !== "standard" ? ` <span class="dim">(non-standard button mapping — Up/Down/Left/Right and A may not line up)</span>` : "";
  const btn = (i: number) => (gp.buttons[i]?.pressed ? "●" : "○");
  const ax = gp.axes.slice(0, 2).map((v) => v.toFixed(2)).join(", ");
  el.innerHTML = `<span style="color:var(--good,#6fbf73)">✓ Connected:</span> ${gp.id}${nonStandard}<br>` +
    `stick: [${ax}] · D-pad ▲${btn(12)} ▼${btn(13)} ◀${btn(14)} ▶${btn(15)} · A${btn(0)} B${btn(1)} X${btn(2)} Y${btn(3)}`;
}

export function closeHelp() {
  stopGamepadWatch();
  closeModal();
}

export function confirmNewGame() {
  modal(`<h2>Abandon ship?</h2><p>This scuttles the current save and starts over.</p>
    <div class="choices">
      <button class="danger" ${actionAttr("newGame")}>Yes — new game</button>
      <button ${actionAttr("closeModal")}>Keep flying</button>
    </div>`);
}

export function newGame() {
  clearSave();
  clearModal();
  intro();
}

// The opening screen IS the character creator now (ui/avatar.ts).
export function intro() { openCreator(); }

// ---- save slots + export/import ----
function slotRow(m: SlotMeta): string {
  const active = m.slot === activeSlot();
  const tag = active ? ` <span class="dim">(active)</span>` : "";
  if (m.empty) {
    return `<div class="panel" style="margin:6px 0; display:flex; justify-content:space-between; align-items:center; gap:10px">
      <div><b>Slot ${m.slot + 1}</b>${tag}<br><span class="dim">— empty —</span></div>
      <div class="choices" style="margin:0"><button ${actionAttr("saveHere", m.slot)}>Save here</button></div>
    </div>`;
  }
  const where = (m.loc && PLANETS[m.loc]?.n) || m.loc || "the black";
  return `<div class="panel" style="margin:6px 0; display:flex; justify-content:space-between; align-items:center; gap:10px">
    <div><b>Slot ${m.slot + 1}</b>${tag}<br>
      <span>${m.captainName || "Captain"} · ${m.shipName || "ship"}</span><br>
      <span class="dim">Day ${m.day ?? "?"} · ${(m.credits ?? 0).toLocaleString()}cr · ${m.prestige ?? 0}★ · ${where}</span></div>
    <div class="choices" style="margin:0; flex-wrap:wrap; justify-content:flex-end">
      <button class="primary" ${actionAttr("loadSaveSlot", m.slot)}>Load</button>
      <button ${actionAttr("saveHere", m.slot)}>Save here</button>
      <button class="danger" ${actionAttr("deleteSaveSlot", m.slot)}>Delete</button>
    </div>
  </div>`;
}

export function openSaves() {
  const slots = slotList().map(slotRow).join("");
  modal(`<h2>💾 Saves</h2>
    <p class="dim">The game autosaves to the active slot as you play. Load a slot, keep separate runs, or back up a game to a file.</p>
    ${slots}
    <div class="panel" style="margin-top:10px">
      <h3>Backup</h3>
      <div class="choices" style="margin-top:8px">
        <button ${actionAttr("exportSaveFile")}>⬇ Export current game</button>
        <button ${actionAttr("importSaveFile")}>⬆ Import from file</button>
      </div>
      <p id="save-msg" class="dim" style="margin-top:8px; min-height:16px"></p>
    </div>
    <div class="choices"><button class="primary" ${actionAttr("closeModal")}>Back to the black</button></div>`);
}

function saveMsg(text: string) { const el = document.getElementById("save-msg"); if (el) el.textContent = text; }

// Point the autosave at a different slot and immediately write the current run
// there — the manual "save to this slot" action.
export function saveHere(slot: number) {
  setActiveSlot(slot);
  save(slot);   // write the current run to this slot now
  openSaves();  // re-render so the row reflects it
}

export function loadSaveSlot(slot: number) {
  const s = loadSlot(slot);
  if (!s) { saveMsg("That slot is empty or unreadable."); return; }
  setActiveSlot(slot);
  setState(s);
  clearModal();
  requestRender();
  log("— Save loaded. Welcome back, Captain. —");
  requestRender();
}

export function deleteSaveSlot(slot: number) {
  deleteSlot(slot);
  openSaves();
}

export function exportSaveFile() {
  try {
    const blob = new Blob([exportSave()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const stamp = `d${S.day}-${(S.shipName || "kestrel").replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`;
    a.href = url; a.download = `kestrel-run-${stamp}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
    saveMsg("Exported. Check your downloads.");
  } catch { saveMsg("Export failed — your browser blocked the download."); }
}

export function importSaveFile() {
  const input = document.createElement("input");
  input.type = "file"; input.accept = "application/json,.json";
  input.onchange = () => {
    const file = input.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const s = importSave(String(reader.result), activeSlot());
      if (!s) { saveMsg("That file isn't a valid Kestrel Run save."); return; }
      setState(s);
      clearModal();
      requestRender();
      log("— Save imported. Welcome aboard, Captain. —");
      requestRender();
    };
    reader.readAsText(file);
  };
  input.click();
}

export function startGame() {
  const input = document.getElementById("shipnamein") as HTMLInputElement | null;
  const name = (input && input.value.trim()) || "Kestrel";
  const role = readCaptainRole();
  setState(newState(name));
  S.captainName = getCaptainName();
  S.appearance = getAppearance();
  S.captainRole = role;
  clearModal();
  // log() unshifts — write the story line LAST so it reads FIRST.
  log("Tip: hit the Cantina for work, the Market for fuel & food, the Shipyard for modules. ? Help has the full manual.");
  if (role) log(`You know your way around ${role === "quartermaster" ? "a ledger" : "the " + role + "'s station"} — you can cover it yourself for now. Hire your own replacement soon; a captain who never leaves that station isn't captaining.`);
  log(`Captain ${S.captainName} takes possession of the ${name} at Port Solace. She's ugly, slow, and yours.`);
  refreshMarket();
  requestRender();
}
