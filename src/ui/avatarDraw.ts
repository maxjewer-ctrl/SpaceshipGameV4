// The shared captain avatar renderer. Pure canvas — no game-state imports — so
// the character creator preview and the walking sprite draw from the exact same
// code and can never drift apart. Native footprint matches the old drawPlayer:
// head at y≈-18 (r8), feet at y≈+14, so walk positioning/collision is unchanged.
import type { Appearance } from "../types";

export const HEADS = [
  { id: "human", name: "Human" },
  { id: "saurian", name: "Saurian" },
  { id: "insectoid", name: "Insectoid" },
  { id: "cyclops", name: "Cyclops" },
  { id: "avian", name: "Avian" },
  { id: "synth", name: "Synthetic" },
];

export const GARBS = [
  { id: "jumpsuit", name: "Flight Suit" },
  { id: "coat", name: "Captain's Coat" },
  { id: "armor", name: "Voidsuit Armor" },
];

export const AVATAR_LOOKS = [
  ["Human woman · flight tech", "human", "jumpsuit", "feminine"],
  ["Human man · flight tech", "human", "jumpsuit", "masculine"],
  ["Human neutral · flight tech", "human", "jumpsuit", "neutral"],
  ["Human woman · captain", "human", "coat", "feminine"],
  ["Human man · captain", "human", "coat", "masculine"],
  ["Human neutral · void armor", "human", "armor", "neutral"],
  ["Saurian woman · flight tech", "saurian", "jumpsuit", "feminine"],
  ["Saurian man · captain", "saurian", "coat", "masculine"],
  ["Saurian neutral · void armor", "saurian", "armor", "neutral"],
  ["Insectoid woman · flight tech", "insectoid", "jumpsuit", "feminine"],
  ["Insectoid man · void armor", "insectoid", "armor", "masculine"],
  ["Insectoid neutral · captain", "insectoid", "coat", "neutral"],
  ["Cyclops woman · captain", "cyclops", "coat", "feminine"],
  ["Cyclops man · void armor", "cyclops", "armor", "masculine"],
  ["Cyclops neutral · flight tech", "cyclops", "jumpsuit", "neutral"],
  ["Avian woman · flight tech", "avian", "jumpsuit", "feminine"],
  ["Avian man · captain", "avian", "coat", "masculine"],
  ["Avian neutral · void armor", "avian", "armor", "neutral"],
  ["Synthetic humanoid · utility", "synth", "jumpsuit", "neutral"],
  ["Synthetic humanoid · command", "synth", "coat", "neutral"],
] as const;

// head / skin tones — human range first, then alien hues
export const SKINS = [
  "#f2c9a0", "#d89b6c", "#a86b45", "#6b4a34",
  "#8fbf7a", "#7ab0c9", "#b0a8c9", "#9aa0a8", "#c98f8f", "#cfc07a",
];
// jumpsuit / clothing colors
export const SUITS = [
  "#1c2131", "#14202a", "#14261c", "#2a1f14", "#26221a",
  "#2a1420", "#40202a", "#203a2a", "#3a4256",
];
// accent / trim (piping, visor glow, outline)
export const TRIMS = [
  "#e8b04b", "#5aa7ff", "#6fbf73", "#d96b6b",
  "#b98bd9", "#d8d5cc", "#e8843b", "#7ad0c0",
];

export const DEFAULT_APPEARANCE: Appearance = {
  head: "human", garb: "jumpsuit", frame: "neutral", model: "explorer", skin: "#d89b6c", suit: "#1c2131", trim: "#e8b04b",
};

// ---- color helpers ----
function hx(h: string): [number, number, number] {
  const s = h.replace("#", "");
  return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
}
function mix(a: string, b: string, t: number): string {
  const A = hx(a), B = hx(b);
  const c = A.map((v, i) => Math.round(v + (B[i] - v) * t));
  return "#" + c.map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, "0")).join("");
}

// Light falls from the upper-left: cheap 3-stop gradients replace flat fills
// so the sprite reads as a lit figure instead of a sticker.
function bodyGrad(c: CanvasRenderingContext2D, base: string): CanvasGradient {
  const g = c.createLinearGradient(-9, -14, 9, 8);
  g.addColorStop(0, mix(base, "#ffffff", 0.22));
  g.addColorStop(0.55, base);
  g.addColorStop(1, mix(base, "#000000", 0.32));
  return g;
}
function headGrad(c: CanvasRenderingContext2D, skin: string, cy = -18, r = 9): CanvasGradient {
  const g = c.createRadialGradient(-2.6, cy - 2.6, 1, 0, cy, r + 1);
  g.addColorStop(0, mix(skin, "#ffffff", 0.3));
  g.addColorStop(0.6, skin);
  g.addColorStop(1, mix(skin, "#000000", 0.28));
  return g;
}

function eyeShift(dir: string): [number, number] {
  if (dir === "left") return [-3, 0];
  if (dir === "right") return [3, 0];
  if (dir === "up") return [0, -3];
  return [0, 2];
}

const TAU = Math.PI * 2;

export interface AvatarOpts {
  dir?: string; moving?: boolean; phase?: number; dark?: boolean; scale?: number;
}

export function drawAvatar(c: CanvasRenderingContext2D, x: number, y: number, app?: Appearance, o: AvatarOpts = {}) {
  const a = app || DEFAULT_APPEARANCE;
  const dir = o.dir || "down", moving = !!o.moving, phase = o.phase || 0, dark = !!o.dark, scale = o.scale || 1;
  const skin = dark ? mix(a.skin, "#6a6f7c", 0.55) : a.skin;
  const suit = dark ? mix(a.suit, "#2a2d36", 0.5) : a.suit;
  const trim = dark ? "#8a8fa0" : a.trim;
  const bob = moving ? Math.sin(phase) * 2 : 0;
  const legOff = moving ? Math.sin(phase * 1.6) * 4 : 0;
  c.save();
  c.translate(x, y + bob);
  if (scale !== 1) c.scale(scale, scale);
  // ground shadow
  c.beginPath(); c.ellipse(0, 12, 12, 5, 0, 0, TAU); c.fillStyle = "#00000055"; c.fill();
  // legs
  c.strokeStyle = trim; c.lineWidth = 3; c.lineCap = "round";
  c.beginPath(); c.moveTo(-4, 4); c.lineTo(-4 + legOff * 0.3, 14); c.stroke();
  c.beginPath(); c.moveTo(4, 4); c.lineTo(4 - legOff * 0.3, 14); c.stroke();
  drawGarb(c, a.garb || "jumpsuit", suit, trim, a.frame || "neutral");
  drawHead(c, a.head || "human", dir, skin, trim, a.frame || "neutral");
  c.restore();
}

function drawGarb(c: CanvasRenderingContext2D, garb: string, suit: string, trim: string, frame: string) {
  const bodyScale = frame === "masculine" ? 1.1 : frame === "feminine" ? .93 : 1;
  c.save(); c.scale(bodyScale, 1);
  c.lineJoin = "round";
  if (garb === "coat") {
    // flared captain's coat with a center seam and collar
    c.beginPath();
    c.moveTo(-9, 6); c.lineTo(-6, -12); c.lineTo(6, -12); c.lineTo(9, 6); c.closePath();
    c.fillStyle = bodyGrad(c, suit); c.fill(); c.strokeStyle = trim; c.lineWidth = 1.5; c.stroke();
    c.strokeStyle = mix(suit, "#000000", 0.4); c.lineWidth = 1;
    c.beginPath(); c.moveTo(0, -11); c.lineTo(0, 5); c.stroke();
    c.fillStyle = trim;
    c.beginPath(); c.moveTo(-6, -12); c.lineTo(-2, -11); c.lineTo(-6, -7); c.closePath(); c.fill();
    c.beginPath(); c.moveTo(6, -12); c.lineTo(2, -11); c.lineTo(6, -7); c.closePath(); c.fill();
  } else if (garb === "armor") {
    // plated voidsuit with shoulder pads and a chest seam
    c.beginPath();
    c.moveTo(-8, 4); c.lineTo(-6, -12); c.lineTo(6, -12); c.lineTo(8, 4); c.closePath();
    c.fillStyle = bodyGrad(c, suit); c.fill(); c.strokeStyle = trim; c.lineWidth = 1.5; c.stroke();
    c.fillStyle = mix(suit, "#ffffff", 0.18);
    c.beginPath(); c.arc(-6, -11, 3.2, 0, TAU); c.fill();
    c.beginPath(); c.arc(6, -11, 3.2, 0, TAU); c.fill();
    c.strokeStyle = trim; c.lineWidth = 1; c.beginPath(); c.arc(-6, -11, 3.2, 0, TAU); c.stroke();
    c.beginPath(); c.arc(6, -11, 3.2, 0, TAU); c.stroke();
    c.strokeStyle = mix(trim, "#000000", 0.2); c.lineWidth = 1;
    c.beginPath(); c.moveTo(-4, -6); c.lineTo(4, -6); c.stroke();
  } else {
    // plain flight suit (the original silhouette) + folds and a chest strap
    c.beginPath();
    c.moveTo(-8, 4); c.lineTo(-6, -12); c.lineTo(6, -12); c.lineTo(8, 4); c.closePath();
    c.fillStyle = bodyGrad(c, suit); c.fill(); c.strokeStyle = trim; c.lineWidth = 1.5; c.stroke();
    c.strokeStyle = mix(suit, "#000000", 0.38); c.lineWidth = 1;
    c.beginPath(); c.moveTo(-3.5, -5); c.lineTo(-2.6, 2.5); c.moveTo(3.5, -5); c.lineTo(2.6, 2.5); c.stroke();
    c.strokeStyle = mix(trim, "#000000", 0.15); c.lineWidth = 1.2;
    c.beginPath(); c.moveTo(-5.8, -8.2); c.lineTo(5.8, -8.2); c.stroke();
  }
  c.restore();
}

function drawHead(c: CanvasRenderingContext2D, head: string, dir: string, skin: string, trim: string, frame: string) {
  const [ox, oy] = eyeShift(dir);
  const up = dir === "up";
  c.lineJoin = "round";
  if (head === "saurian") {
    c.beginPath(); c.ellipse(ox * 0.3, -18, 9, 6.5, 0, 0, TAU);
    c.fillStyle = headGrad(c, skin); c.fill(); c.strokeStyle = trim; c.lineWidth = 1.5; c.stroke();
    c.strokeStyle = mix(skin, "#000000", 0.45); c.lineWidth = 1.2;
    for (let i = -1; i <= 1; i++) { c.beginPath(); c.moveTo(i * 3, -24); c.lineTo(i * 3, -20.5); c.stroke(); }
    if (!up) {
      c.strokeStyle = "#12141a"; c.lineWidth = 1.6; c.lineCap = "round";
      c.beginPath(); c.moveTo(-5.5 + ox * 0.3, -19.2); c.lineTo(-2.5 + ox * 0.3, -18.4); c.stroke();
      c.beginPath(); c.moveTo(2.5 + ox * 0.3, -18.4); c.lineTo(5.5 + ox * 0.3, -19.2); c.stroke();
    }
  } else if (head === "insectoid") {
    c.strokeStyle = trim; c.lineWidth = 1.2;
    c.beginPath(); c.moveTo(-2, -24); c.quadraticCurveTo(-7, -30, -9.5, -26.5); c.stroke();
    c.beginPath(); c.moveTo(2, -24); c.quadraticCurveTo(7, -30, 9.5, -26.5); c.stroke();
    c.beginPath(); c.arc(0, -18, 7, 0, TAU); c.fillStyle = headGrad(c, skin); c.fill();
    c.strokeStyle = trim; c.lineWidth = 1.5; c.stroke();
    if (!up) {
      c.fillStyle = mix(trim, "#101014", 0.35);
      c.beginPath(); c.ellipse(-3.4 + ox * 0.3, -18, 2.6, 3.3, 0, 0, TAU); c.fill();
      c.beginPath(); c.ellipse(3.4 + ox * 0.3, -18, 2.6, 3.3, 0, 0, TAU); c.fill();
      c.fillStyle = "#ffffff99";
      c.beginPath(); c.arc(-4.2 + ox * 0.3, -19, 0.7, 0, TAU); c.fill();
      c.beginPath(); c.arc(2.6 + ox * 0.3, -19, 0.7, 0, TAU); c.fill();
    }
  } else if (head === "cyclops") {
    c.beginPath(); c.arc(0, -18, 8, 0, TAU); c.fillStyle = headGrad(c, skin); c.fill();
    c.strokeStyle = trim; c.lineWidth = 1.5; c.stroke();
    if (!up) {
      c.fillStyle = "#f4f4f0"; c.beginPath(); c.arc(0, -18, 3.6, 0, TAU); c.fill();
      c.fillStyle = "#12141a"; c.beginPath(); c.arc(ox * 0.5, -18 + oy * 0.4, 1.7, 0, TAU); c.fill();
      c.strokeStyle = trim; c.lineWidth = 1; c.beginPath(); c.arc(0, -18, 3.6, 0, TAU); c.stroke();
    }
  } else if (head === "avian") {
    c.beginPath(); c.arc(0, -18, 7, 0, TAU); c.fillStyle = headGrad(c, skin); c.fill();
    c.strokeStyle = trim; c.lineWidth = 1.5; c.stroke();
    c.strokeStyle = trim; c.lineWidth = 1.4; c.lineCap = "round";
    c.beginPath(); c.moveTo(0, -25); c.lineTo(-2, -29); c.moveTo(0, -25); c.lineTo(1, -30); c.moveTo(0, -25); c.lineTo(3.2, -28); c.stroke();
    c.fillStyle = mix(trim, "#e8843b", 0.4);
    if (dir === "left") { c.beginPath(); c.moveTo(-6.5, -19); c.lineTo(-12, -18); c.lineTo(-6.5, -16.5); c.closePath(); c.fill(); }
    else if (dir === "right") { c.beginPath(); c.moveTo(6.5, -19); c.lineTo(12, -18); c.lineTo(6.5, -16.5); c.closePath(); c.fill(); }
    else if (!up) { c.beginPath(); c.moveTo(-2.5, -15.5); c.lineTo(0, -11.5); c.lineTo(2.5, -15.5); c.closePath(); c.fill(); }
    if (!up) {
      c.fillStyle = "#12141a";
      if (dir !== "right") { c.beginPath(); c.arc(-2.4 + ox * 0.5, -19, 1.3, 0, TAU); c.fill(); }
      if (dir !== "left") { c.beginPath(); c.arc(2.4 + ox * 0.5, -19, 1.3, 0, TAU); c.fill(); }
    }
  } else if (head === "synth") {
    const w = 15, h = 13;
    c.beginPath();
    if ((c as any).roundRect) (c as any).roundRect(-w / 2, -18 - h / 2, w, h, 3);
    else c.rect(-w / 2, -18 - h / 2, w, h);
    c.fillStyle = headGrad(c, skin); c.fill(); c.strokeStyle = trim; c.lineWidth = 1.5; c.stroke();
    c.strokeStyle = trim; c.lineWidth = 1.2;
    c.beginPath(); c.moveTo(0, -24.5); c.lineTo(0, -27.5); c.stroke();
    c.fillStyle = trim; c.beginPath(); c.arc(0, -28.5, 1.3, 0, TAU); c.fill();
    c.fillStyle = mix(trim, "#000000", 0.2); c.fillRect(-5, -19.6, 10, 3.2);
    const ex = up ? 0 : ox * 0.8;
    c.fillStyle = "#ffffff"; c.shadowColor = trim; c.shadowBlur = 6;
    c.beginPath(); c.arc(ex, -18, 1.1, 0, TAU); c.fill(); c.shadowBlur = 0;
  } else {
    // human
    c.beginPath(); c.arc(0, -18, 8, 0, TAU); c.fillStyle = headGrad(c, skin); c.fill();
    c.strokeStyle = trim; c.lineWidth = 1.5; c.stroke();
    // hair cap
    c.beginPath(); c.arc(0, -19, 7.6, Math.PI * 0.98, Math.PI * 2.02); c.closePath();
    c.fillStyle = mix(skin, "#100c08", 0.6); c.fill();
    if (frame === "feminine") {
      c.beginPath(); c.arc(-6.2, -15.8, 2.2, 0, TAU); c.arc(6.2, -15.8, 2.2, 0, TAU); c.fill();
    }
    if (!up) {
      c.fillStyle = "#12141a";
      c.beginPath(); c.arc(-3 + ox * 0.4, -18 + oy * 0.5, 1.3, 0, TAU); c.fill();
      c.beginPath(); c.arc(3 + ox * 0.4, -18 + oy * 0.5, 1.3, 0, TAU); c.fill();
    }
  }
}
