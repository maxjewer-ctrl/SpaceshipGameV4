import { MODS, PLANETS } from "../content";
import { cargoUsed, modInst, stats } from "../derive";
import { actionAttr } from "../dispatch";
import { requestRender } from "../bus";
import { S } from "../state";
import { ensureSlots, bayCount } from "../systems/actions";
import { markLabel, markOf } from "../systems/modtier";
import { wearOf, wearTier } from "../systems/wear";
import { cockpitControlState, commsReadout } from "./cockpit";

export function selSlot(i: number) { S.sel = S.sel === i ? null : i; requestRender(); }

let shipViewMode: "plan" | "feed" = "plan";
export function shipView(v: "plan" | "feed") { shipViewMode = v; requestRender(); }

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

export function radarBlips(): { l: number; t: number; c: string; title: string }[] {
  const out: { l: number; t: number; c: string; title: string }[] = [];
  const place = (ang: number, dist: number, c: string, title: string) => {
    const r = 8 + dist * 40;
    out.push({ l: 50 + r * Math.cos(ang), t: 50 + r * Math.sin(ang), c, title });
  };
  if (S.travel) {
    const prog = 1 - S.travel.left / S.travel.total;
    const a = (hash(S.travel.dest) % 360) * Math.PI / 180;
    place(a, 1 - prog * 0.85, "var(--blue)", PLANETS[S.travel.dest].n + " (destination)");
    if (prog < 0.5) place(a + Math.PI, 0.3 + prog, "#6b7280", PLANETS[S.travel.from].n + " (departure)");
  } else if (S.docked) {
    place((hash(S.loc) % 360) * Math.PI / 180, 0.18, "var(--blue)", PLANETS[S.loc].n + " (docked)");
  }
  const h = hash(S.loc + ":" + S.day);
  for (let i = 0; i < h % 3; i++) {
    const a = ((h >> (4 + i * 7)) % 360) * Math.PI / 180;
    place(a, 0.45 + ((h >> (2 + i * 5)) % 50) / 100, "var(--green)", "Unresolved contact");
  }
  return out;
}

export function captainsLogHTML(): string {
  const visible = S.logLines.slice(0, 30);
  return `<div class="record-list">${visible.map((l) => `<div class="logline${l.bark ? " bark" : ""}"><b>D${l.d}</b> ${l.m}</div>`).join("") || '<div class="empty-state">Nothing logged yet.</div>'}</div>`;
}

export function modCategory(t: string): string {
  if (["weapons", "shields", "armory"].includes(t)) return "cat-combat";
  if (["cargohold", "fueltank", "smuggler"].includes(t)) return "cat-flow";
  if (["cabin", "quarters", "luxcabin"].includes(t)) return "cat-life";
  if (["hydro", "medbay"].includes(t)) return "cat-bio";
  if (["reactor", "workshop"].includes(t)) return "cat-power";
  return "";
}

function schematicHTML(): string {
  ensureSlots();
  const inst = modInst();
  const bySlot = Array.from({ length: bayCount() }, (_, slot) => inst.find((m) => m.slot === slot) || null);
  const bays = bySlot.map((m, slot) => {
    if (!m) return `<button class="system-bay empty" ${actionAttr("selSlot", -1)}><span>Bay ${slot + 1}</span><strong>Empty</strong><small>Available for installation</small></button>`;
    const index = inst.indexOf(m);
    const md = MODS[m.t];
    const state = m.dmg ? "DAMAGED" : md.pw ? (m.on ? "ONLINE" : "POWERED DOWN") : "OPERATIONAL";
    const power = md.pw ? `${md.pw} power draw` : md.gen ? `+${md.gen} output` : "passive";
    return `<button class="system-bay ${modCategory(m.t)}${m.dmg ? " damaged" : ""}${S.sel === index ? " selected" : ""}" ${actionAttr("selSlot", index)}>
      <span>Bay ${slot + 1} · Mk-${markLabel(markOf(m))}</span><strong>${md.icon} ${md.n}</strong><small>${state} · ${power}</small>
    </button>`;
  }).join("");
  return `<div class="deck-blueprint"><div class="deck-nose">COCKPIT</div><div class="system-bay-grid">${bays}</div><div class="deck-drive">DRIVE CORE · MK-${markLabel(S.engineLvl)}</div></div>`;
}

function inspectorHTML(): string {
  const inst = modInst();
  if (S.sel == null || S.sel < 0 || !inst[S.sel]) return `<aside class="system-inspector empty"><div class="console-kicker">SELECTED SYSTEM</div><h2>Choose a bay</h2><p>Select a module to inspect its power, wear, and placement.</p></aside>`;
  const m = inst[S.sel];
  const md = MODS[m.t];
  const st = stats();
  const wear = wearTier(m);
  const projected = md.pw ? st.powerUse + (m.on ? -md.pw : md.pw) : st.powerUse;
  const canToggle = !!md.pw && !m.dmg;
  return `<aside class="system-inspector">
    <div class="console-kicker">BAY ${(m.slot ?? 0) + 1} · MK-${markLabel(markOf(m))}</div>
    <h2>${md.icon} ${md.n}</h2>
    <div class="system-state ${m.dmg ? "critical" : m.on ? "nominal" : "offline"}">${m.dmg ? "DAMAGED" : md.pw ? (m.on ? "ONLINE" : "POWERED DOWN") : "OPERATIONAL"}</div>
    <p>${md.d}</p>
    <div class="outcome-table">
      <div><span>Wear</span><b>${wear.toUpperCase()} · ${Math.round(wearOf(m))}%</b></div>
      <div><span>Reactor now</span><b>${st.powerUse}/${st.powerOut}</b></div>
      ${md.pw ? `<div><span>After toggle</span><b class="${projected > st.powerOut ? "low" : ""}">${projected}/${st.powerOut}</b></div>` : ""}
    </div>
    ${canToggle ? `<section class="inspector-group"><h3>Power</h3><button class="primary" ${actionAttr("toggleMod", S.sel)}>${m.on ? "Power down" : "Power up"}</button></section>` : ""}
    <section class="inspector-group"><h3>Placement</h3><div class="button-row"><button ${m.slot! > 0 ? "" : "disabled"} ${actionAttr("moveModTo", S.sel, m.slot! - 1)}>Move fore</button><button ${m.slot! < S.slotsMax - 1 ? "" : "disabled"} ${actionAttr("moveModTo", S.sel, m.slot! + 1)}>Move aft</button></div></section>
    <p class="dim">Installation and resale are handled by a Dry Dock.</p>
  </aside>`;
}

function sensorsHTML(): string {
  const blips = radarBlips();
  const comms = commsReadout();
  return `<div class="sensor-workspace">
    <div class="sensor-scope"><div class="radar"><div class="ring r1"></div><div class="ring r2"></div><div class="ax-v"></div><div class="ax-h"></div><div class="rsweep"></div>${blips.map((b) => `<i class="blip" style="left:${b.l}%;top:${b.t}%;background:${b.c}" title="${b.title}"></i>`).join("")}<div class="self"></div></div>
      <div class="sensor-count"><b>${blips.length}</b><span>CONTACTS</span></div></div>
    <aside class="sensor-comms"><div class="console-kicker">COMMS CHANNEL</div><h2>${comms.channel}</h2><p>${comms.text}</p><div class="signal-meter"><i style="width:${Math.round(comms.signal * 100)}%"></i></div><button class="primary" ${actionAttr("commsTune")}>Tune next channel</button></aside>
  </div>`;
}

function manualHTML(): string {
  const ctl = cockpitControlState();
  return `<details class="manual-controls"><summary>MANUAL / EMERGENCY</summary><div class="manual-grid">
    <div><span>Cargo bay</span><b>${ctl.bayMoving ? "CYCLING" : ctl.bay.toUpperCase()}</b><button ${actionAttr("bayToggle")}>${ctl.bay === "open" ? "Seal bay" : "Cycle bay open"}</button></div>
    <div><span>Jettison cargo</span><b>${cargoUsed()} units aboard</b><div class="button-row">${["ore", "med", "lux"].map((g) => `<button class="danger" ${S.cargo[g] ? "" : "disabled"} ${actionAttr("confirmJettisonGood", g)}>${g.toUpperCase()} ${S.cargo[g] || 0}</button>`).join("")}</div></div>
    <div><span>Fuel vent guard</span><b>${ctl.guard ? "RAISED" : "SAFE"}</b><button ${actionAttr("ventGuard")}>${ctl.guard ? "Lower guard" : "Raise guard"}</button><button class="danger" ${ctl.guard ? "" : "disabled"} ${actionAttr("confirmVentFuel")}>Vent 5 fuel</button></div>
  </div></details>`;
}

export function shipSystemsHTML(): string {
  const st = stats();
  const damaged = S.modules.filter((m) => m.dmg).length;
  return `<div class="systems-workspace">
    <div class="condition-strip">
      <div><span>Hull</span><b class="${S.hull < 40 ? "low" : ""}">${Math.round(S.hull)}/${S.hullMax}</b></div>
      <div><span>Reactor</span><b class="${st.powerUse > st.powerOut ? "low" : ""}">${st.powerUse}/${st.powerOut}</b></div>
      <div><span>Damage</span><b class="${damaged ? "low" : ""}">${damaged || "NONE"}</b></div>
      <div><span>Bays</span><b>${modInst().length}/${S.slotsMax}</b></div>
    </div>
    <div class="workspace-tabs"><button class="${shipViewMode === "plan" ? "on" : ""}" ${actionAttr("shipView", "plan")}>Deck plan</button><button class="${shipViewMode === "feed" ? "on" : ""}" ${actionAttr("shipView", "feed")}>Sensors</button></div>
    ${shipViewMode === "feed" ? sensorsHTML() : `<div class="system-layout">${schematicHTML()}${inspectorHTML()}</div>`}
    ${manualHTML()}
  </div>`;
}

export function shipHTML(): string { return shipSystemsHTML(); }
