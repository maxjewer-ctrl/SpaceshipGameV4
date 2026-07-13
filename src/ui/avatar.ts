// The character creator: name, former specialty, and a live avatar preview with
// species/attire/color pickers. Renders its modal ONCE, then every appearance
// change mutates the draft and repaints only the canvas + the changed label via
// DOM — so the name inputs never lose focus or value. A small rAF loop keeps the
// preview breathing while the modal is open.
import type { Appearance } from "../types";
import { uiRand } from "../rng";
import { modal } from "../modal";
import { HEADS, GARBS, AVATAR_LOOKS, SKINS, SUITS, TRIMS, DEFAULT_APPEARANCE, drawAvatar } from "./avatarDraw";
import { ROLES } from "../content";
import { startGame } from "./help";
import { introStart } from "../systems/intro";

const NAME_POOL = [
  "Cass Ardent", "Juno Marlowe", "Dashiell Okoro", "Vera Sant", "Idris Vale",
  "Nadia Roon", "Silas Bexley", "Runa Okonkwo", "Emeric Tal", "Ottoline Grey",
  "Kestrel Vane", "Marlow Sef", "Ariti Nwosu", "Dov Halloran", "Priya Sarn",
];

interface Draft { captainName: string; app: Appearance; }
let draft: Draft = { captainName: "Cass Ardent", app: { ...DEFAULT_APPEARANCE } };
let previewDir = "down";
let lookIndex = 2;
let previewRAF: number | null = null;

// Read by help.startGame() and systems/intro.introStart() at start time.
export function getCaptainName(): string { return draft.captainName.trim() || "Cass Ardent"; }
export function getAppearance(): Appearance { return { ...draft.app }; }

const idx = (list: { id: string }[], id: string) => Math.max(0, list.findIndex((x) => x.id === id));

export function openCreator() {
  const roleOpts = ["pilot", "mechanic", "gunner", "medic", "cook", "quartermaster"]
    .map((r) => `<option value="${r}">${ROLES[r].n}</option>`).join("");
  modal(`<div class="creator">
    <h2>☄ THE KESTREL RUN</h2>
    <p class="dim" style="margin-bottom:12px">Somewhere in a Port Solace cantina, a woman in a grey coat is watching the door. Not for you — not yet. First, become someone worth watching.</p>
    <div class="cc-wrap">
      <div class="cc-stage">
        <canvas id="avatarpreview" width="200" height="230"></canvas>
        <div class="cc-turn">
          <button onclick="avFace('left')" title="Face left">◀</button>
          <button onclick="avFace('down')" title="Face forward">●</button>
          <button onclick="avFace('up')" title="Face away">▲</button>
          <button onclick="avFace('right')" title="Face right">▶</button>
        </div>
      </div>
      <div class="cc-controls">
        <label class="cc-lbl">Captain's name <button class="cc-dice" onclick="avRandomName()" title="Random name">⟳</button></label>
        <input id="captainnamein" value="${draft.captainName}" maxlength="20" oninput="avName(this.value)" class="cc-input">
        <label class="cc-lbl">Ship's name</label>
        <input id="shipnamein" value="Kestrel" maxlength="18" class="cc-input">
        <label class="cc-lbl">Former specialty</label>
        <select id="captainrolein" class="cc-input">${roleOpts}</select>
        <div class="cc-cyc"><span>Look</span>
          <button onclick="avLook(-1)">◀</button><b id="cc-look">${AVATAR_LOOKS[lookIndex][0]}</b><button onclick="avLook(1)">▶</button></div>
        <div class="cc-cyc"><span>Species</span>
          <button onclick="avHead(-1)">◀</button><b id="cc-head">${HEADS[idx(HEADS, draft.app.head)].name}</b><button onclick="avHead(1)">▶</button></div>
        <div class="cc-cyc"><span>Attire</span>
          <button onclick="avGarb(-1)">◀</button><b id="cc-garb">${GARBS[idx(GARBS, draft.app.garb)].name}</b><button onclick="avGarb(1)">▶</button></div>
        <div class="cc-sw-lbl">Skin</div><div class="cc-swatches" id="cc-skin">${swatches(SKINS, draft.app.skin, "avSkin")}</div>
        <div class="cc-sw-lbl">Clothing</div><div class="cc-swatches" id="cc-suit">${swatches(SUITS, draft.app.suit, "avSuit")}</div>
        <div class="cc-sw-lbl">Trim</div><div class="cc-swatches" id="cc-trim">${swatches(TRIMS, draft.app.trim, "avTrim")}</div>
      </div>
    </div>
    <p class="dim" style="margin:10px 0 0; font-size:11px">A captain covers their old station until they hire a replacement — but a captain below decks isn't captaining.</p>
    <div class="choices">
      <button class="primary" onclick="avStart('prologue')">◆ Begin</button>
    </div>
  </div>`);
  startPreview();
}

function swatches(list: string[], sel: string, handler: string): string {
  return list.map((hex) =>
    `<button class="cc-swatch${hex === sel ? " on" : ""}" style="background:${hex}" onclick="${handler}('${hex}')" aria-label="${hex}"></button>`
  ).join("");
}

function startPreview() {
  if (previewRAF) cancelAnimationFrame(previewRAF);
  const loop = (t: number) => {
    const cv = document.getElementById("avatarpreview") as HTMLCanvasElement | null;
    if (!cv) { previewRAF = null; return; } // modal closed — stop
    const ctx = cv.getContext("2d");
    if (ctx) {
      ctx.clearRect(0, 0, cv.width, cv.height);
      const breathe = Math.sin(t / 700) * 1.5;
      drawAvatar(ctx, cv.width / 2, 150 + breathe, draft.app, { dir: previewDir, scale: 3.6 });
    }
    previewRAF = requestAnimationFrame(loop);
  };
  previewRAF = requestAnimationFrame(loop);
}

// ---- handlers (registered as globals in main.ts) ----
export function avName(v: string) { draft.captainName = v; }
export function avRandomName() {
  draft.captainName = NAME_POOL[Math.floor(uiRand() * NAME_POOL.length)];
  const el = document.getElementById("captainnamein") as HTMLInputElement | null;
  if (el) el.value = draft.captainName;
}
export function avFace(dir: string) { previewDir = dir; }
export function avLook(d: number) {
  lookIndex = (lookIndex + d + AVATAR_LOOKS.length) % AVATAR_LOOKS.length;
  const [label, head, garb, frame] = AVATAR_LOOKS[lookIndex];
  draft.app.head = head; draft.app.garb = garb; draft.app.frame = frame;
  setText("cc-look", label); setText("cc-head", HEADS[idx(HEADS, head)].name); setText("cc-garb", GARBS[idx(GARBS, garb)].name);
}

export function avHead(d: number) {
  const i = (idx(HEADS, draft.app.head) + d + HEADS.length) % HEADS.length;
  draft.app.head = HEADS[i].id;
  setText("cc-head", HEADS[i].name);
}
export function avGarb(d: number) {
  const i = (idx(GARBS, draft.app.garb) + d + GARBS.length) % GARBS.length;
  draft.app.garb = GARBS[i].id;
  setText("cc-garb", GARBS[i].name);
}
export function avSkin(hex: string) { draft.app.skin = hex; markSwatch("cc-skin", hex); }
export function avSuit(hex: string) { draft.app.suit = hex; markSwatch("cc-suit", hex); }
export function avTrim(hex: string) { draft.app.trim = hex; markSwatch("cc-trim", hex); }

export function avStart(mode: string) {
  const nameEl = document.getElementById("captainnamein") as HTMLInputElement | null;
  if (nameEl) draft.captainName = nameEl.value;
  if (previewRAF) { cancelAnimationFrame(previewRAF); previewRAF = null; }
  if (mode === "prologue") introStart(); else startGame();
}

function setText(id: string, txt: string) {
  const el = document.getElementById(id);
  if (el) el.textContent = txt;
}
function markSwatch(rowId: string, hex: string) {
  const row = document.getElementById(rowId);
  if (!row) return;
  row.querySelectorAll<HTMLElement>(".cc-swatch").forEach((b) => {
    b.classList.toggle("on", b.getAttribute("aria-label") === hex);
  });
}
