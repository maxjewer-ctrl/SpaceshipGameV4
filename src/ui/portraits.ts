import dez from "../assets/portraits/dez.webp";
import vex from "../assets/portraits/vex.webp";
import brix from "../assets/portraits/brix.webp";
import tomas from "../assets/portraits/tomas.webp";
import ada from "../assets/portraits/ada.webp";
import rook from "../assets/portraits/rook.webp";
import imogen from "../assets/portraits/imogen.webp";
import corbin from "../assets/portraits/corbin.webp";
import bapu from "../assets/portraits/bapu.webp";
import nyla from "../assets/portraits/nyla.webp";
import elias from "../assets/portraits/elias.webp";
import miri from "../assets/portraits/miri.webp";
import juno from "../assets/portraits/juno.webp";
import junoWorried from "../assets/portraits/juno-worried.webp";
import junoAngry from "../assets/portraits/juno-angry.webp";
import pip7 from "../assets/portraits/pip7.webp";
import storeOwner from "../assets/portraits/store-owner.webp";
import nymQuell from "../assets/portraits/nym-quell.webp";
import ilyaVeer from "../assets/portraits/ilya-veer.webp";
import ossVarda from "../assets/portraits/oss-varda.webp";
import senAsha from "../assets/portraits/sen-asha.webp";
import type { CrewMember } from "../types";

const CREW_PORTRAITS: Record<string, string> = {
  dez, vex, brix, tomas, ada, rook, imogen, corbin, bapu, nyla, elias, miri,
  juno, pip7,
};

const CREW_EXPRESSIONS: Record<string, Record<string, string>> = {
  juno: { worried: junoWorried, angry: junoAngry },
};

const NPC_PORTRAITS: Record<string, string> = {
  nym_quell: nymQuell,
  ilya_veer: ilyaVeer,
  oss_varda: ossVarda,
  sen_asha: senAsha,
};

export function crewPortrait(c: Pick<CrewMember, "key">, expression = "neutral"): string | null {
  if (!c.key) return null;
  return CREW_EXPRESSIONS[c.key]?.[expression] || CREW_PORTRAITS[c.key] || null;
}

export function crewPortraitKey(c: Pick<CrewMember, "key">): string | null {
  return crewPortrait(c);
}

export function portraitFigure(src: string | null, alt: string, cls = ""): string {
  if (!src) return "";
  return `<div class="portrait ${cls}"><img src="${src}" alt="${alt}"></div>`;
}

export function dialogueHeadHTML(src: string | null, fallbackIcon: string, name: string, subline = ""): string {
  return `<div class="dialogue-head">
    ${src ? `<div class="portrait portrait-dialogue"><img src="${src}" alt="${name}"></div>` : `<div class="portrait-fallback">${fallbackIcon}</div>`}
    <div class="dialogue-title"><h2>${name}</h2>${subline ? `<p class="dim">${subline}</p>` : ""}</div>
  </div>`;
}

export function storeOwnerPortrait(): string {
  return storeOwner;
}

export function npcPortrait(key: string): string | null {
  return NPC_PORTRAITS[key] || null;
}
