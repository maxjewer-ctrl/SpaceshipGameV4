import dez from "../assets/portraits/dez.png";
import vex from "../assets/portraits/vex.png";
import brix from "../assets/portraits/brix.png";
import tomas from "../assets/portraits/tomas.png";
import ada from "../assets/portraits/ada.png";
import rook from "../assets/portraits/rook.png";
import imogen from "../assets/portraits/imogen.png";
import corbin from "../assets/portraits/corbin.png";
import bapu from "../assets/portraits/bapu.png";
import nyla from "../assets/portraits/nyla.png";
import elias from "../assets/portraits/elias.png";
import miri from "../assets/portraits/miri.png";
import juno from "../assets/portraits/juno.png";
import pip7 from "../assets/portraits/pip7.png";
import storeOwner from "../assets/portraits/store-owner.png";
import type { CrewMember } from "../types";

const CREW_PORTRAITS: Record<string, string> = {
  dez, vex, brix, tomas, ada, rook, imogen, corbin, bapu, nyla, elias, miri,
  juno, pip7,
};

export function crewPortrait(c: Pick<CrewMember, "key">): string | null {
  return c.key ? CREW_PORTRAITS[c.key] || null : null;
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
