// Portrait resolver for dialogue UIs. Art drops into
// src/assets/portraits/<key>.png (or .webp/.jpg) — see the key manifest in
// src/assets/portraits/KEYS.md — and lights up automatically via Vite's
// build-time glob. Anything missing falls back to a styled icon tile, so the
// dialogue UI reads finished with or without the art.
import type { CrewMember } from "../types";

const FILES = import.meta.glob("../assets/portraits/*.{png,webp,jpg}", {
  eager: true, query: "?url", import: "default",
}) as Record<string, string>;

function urlFor(key: string): string | null {
  for (const ext of ["png", "webp", "jpg"]) {
    const hit = FILES[`../assets/portraits/${key}.${ext}`];
    if (hit) return hit;
  }
  return null;
}

// Which portrait file a crew member wants: named characters by roster key,
// Juno by name (prologue crew), procedural hires by role.
export function crewPortraitKey(c: CrewMember): string {
  if (c.key) return c.key;
  if (c.name.startsWith("Juno Vale")) return "juno";
  if (c.name.startsWith("Tomas")) return "tomas";
  return "crew_" + c.role;
}

// An <img> if the art exists, else a styled icon tile. Both share .dlg-portrait
// so the dialogue layout is identical either way.
export function portraitHTML(key: string, icon: string, name: string, size = 76): string {
  const url = urlFor(key);
  if (url) {
    return `<img class="dlg-portrait" src="${url}" alt="${name}" style="width:${size}px;height:${size}px">`;
  }
  return `<span class="dlg-portrait dlg-portrait-fallback" style="width:${size}px;height:${size}px;font-size:${Math.round(size * 0.48)}px" aria-label="${name}">${icon}</span>`;
}

// Standard dialogue header: portrait beside the name, subtitle underneath.
export function dialogueHeadHTML(key: string, icon: string, name: string, sub?: string): string {
  return `<div class="dlg-head">
    ${portraitHTML(key, icon, name)}
    <div class="dlg-head-text">
      <h2>${name}</h2>
      ${sub ? `<div class="dim" style="margin-top:2px">${sub}</div>` : ""}
    </div>
  </div>`;
}
