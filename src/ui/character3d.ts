// The shared 3D captain/crew figure. One procedural builder feeds both the
// character-creator preview and the walk-mode avatar, so the person you dress
// in the picker is exactly the person who walks the decks.
//
// Built for where this is heading:
//  - ANIMATION: every limb hangs from a named pivot group (hips/torso/head/
//    armL/armR/legL/legR) positioned at the joint, so poseCharacter() can
//    swing them like bones today and a real AnimationMixer can drive the same
//    hierarchy later.
//  - OUTFITS: garb meshes live in a single `outfit` group attached over the
//    base body. setOutfit() disposes and rebuilds just that group, which is
//    the same seam a wardrobe/loadout screen will use.
import * as THREE from "three";
import type { Appearance } from "../types";
import { DEFAULT_APPEARANCE } from "./avatarDraw";

export interface CharacterParts {
  hips: THREE.Group;   // root of the articulated body, at hip height
  torso: THREE.Group;  // pivots at the waist
  head: THREE.Group;   // pivots at the neck
  armL: THREE.Group;   // pivot at shoulder
  armR: THREE.Group;
  legL: THREE.Group;   // pivot at hip socket
  legR: THREE.Group;
}

export interface CharacterRig {
  group: THREE.Group;  // feet at y=0, faces +z, ~1.56 tall
  parts: CharacterParts;
  outfit: THREE.Group; // current garb attachments (children of torso/limbs live here)
  app: Appearance;
}

const TAU = Math.PI * 2;

// Falls back to a neutral slate if `color` ever comes through undefined —
// THREE.Material otherwise logs a console warning for every undefined param,
// which is what an incomplete crew appearance object used to produce here.
function mat(color: THREE.ColorRepresentation | undefined, emissive = 0, roughness = .72): THREE.MeshStandardMaterial {
  const c = color ?? "#7d8294";
  return new THREE.MeshStandardMaterial({ color: c, roughness, metalness: .22, emissive: c, emissiveIntensity: emissive });
}
function mix(a: string, b: string, t: number): string {
  const h = (s: string) => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];
  const A = h(a), B = h(b);
  return "#" + A.map((v, i) => Math.max(0, Math.min(255, Math.round(v + (B[i] - v) * t))).toString(16).padStart(2, "0")).join("");
}
function capsule(r: number, len: number, m: THREE.Material, segs = 8): THREE.Mesh {
  return new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 4, segs), m);
}
// A tapered bone: cylinder with hemispherical caps welded on, so a limb reads
// as a rounded, tapering muscle rather than a constant-radius pool noodle. The
// caps also hide the joint seam at any swing angle — no balloon spheres needed.
function bone(rTop: number, rBottom: number, len: number, m: THREE.Material, segs = 10): THREE.Group {
  const g = new THREE.Group();
  const cyl = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBottom, len, segs, 1, true), m);
  g.add(cyl);
  const top = new THREE.Mesh(new THREE.SphereGeometry(rTop, segs, 6, 0, TAU, 0, Math.PI / 2), m);
  top.position.y = len / 2; g.add(top);
  const bot = new THREE.Mesh(new THREE.SphereGeometry(rBottom, segs, 6, Math.PI / 2, TAU, 0, Math.PI / 2), m);
  bot.position.y = -len / 2; g.add(bot);
  return g;
}
// A smooth solid of revolution from a [radius, height] profile, flattened
// front-to-back so torsos/hips read as bodies, not barrels.
function lathe(profile: [number, number][], m: THREE.Material, zSquash = .62, seg = 20): THREE.Mesh {
  const pts = profile.map(([r, y]) => new THREE.Vector2(Math.max(.0008, r), y));
  const mesh = new THREE.Mesh(new THREE.LatheGeometry(pts, seg), m);
  mesh.scale.z = zSquash;
  return mesh;
}

// ---- proportions (metres-ish; total standing height ≈ 1.6) ----
const HIP_Y = .66;
const TORSO_LEN = .5;          // waist → shoulder span (torso-local)
const TORSO_R = .205;          // max chest radius, referenced by outfits
const SHOULDER_Y = .44, SHOULDER_X = .2;
const ARM_LEN = .52, ARM_R = .062;
const NECK_Y = .5, HEAD_R = .135;

// frame → silhouette: shoulder span, hip width, chest depth
function frameDims(frame: string) {
  if (frame === "masculine") return { sh: 1.12, hip: .92, torsoR: 1.05, waist: .96 };
  if (frame === "feminine") return { sh: .9, hip: 1.08, torsoR: .93, waist: .82 };
  return { sh: 1, hip: 1, torsoR: 1, waist: .9 };
}

export function buildCharacter(app?: Appearance, seed = -1): CharacterRig {
  const a = { ...DEFAULT_APPEARANCE, ...(app || {}) };
  const dims = frameDims(a.frame || "neutral");
  // chest a shade brighter than legs so the fabric reads as lit cloth, not one
  // dark mass — matters most for the near-black default suit colours
  const suitM = mat(mix(a.suit, "#8090a8", .18), .14);
  const legM = mat(mix(a.suit, "#000000", .12), .1);
  const skinM = mat(a.skin, .07);
  const bootM = mat(mix(a.suit, "#000000", .45), .06, .5);

  const group = new THREE.Group();
  const hips = new THREE.Group(); hips.name = "hips"; hips.position.y = HIP_Y; group.add(hips);

  // pelvis: a short flattened lathe that bridges torso and legs, so the waist
  // stays filled mid-stride instead of splitting into two floating legs
  const pelvis = lathe([
    [.13 * dims.hip, -.14], [.165 * dims.hip, -.08], [.17 * dims.hip, -.01], [.15 * dims.hip, .04],
  ], legM, .74, 16);
  pelvis.name = "pelvis"; hips.add(pelvis);

  // ---- legs: pivot at the hip socket, tapered thigh→shin, sculpted boot ----
  const soleY = -(HIP_Y - .02);
  const mkLeg = (side: 1 | -1) => {
    const g = new THREE.Group(); g.name = side < 0 ? "legL" : "legR";
    g.position.set(side * .1 * dims.hip, -.04, 0);
    g.rotation.z = side * .02;
    const thigh = bone(.088, .072, .3, legM); thigh.position.y = -.17; g.add(thigh);
    const shin = bone(.07, .05, .3, legM); shin.position.y = -.44; g.add(shin);
    // boot: heel block + angled toe, in a darkened suit tone
    const boot = new THREE.Group();
    const heel = new THREE.Mesh(new THREE.BoxGeometry(.1, .1, .14), bootM); heel.position.set(0, .05, -.01); boot.add(heel);
    const toe = new THREE.Mesh(new THREE.BoxGeometry(.1, .06, .1), bootM); toe.position.set(0, .03, .11); boot.add(toe);
    const ankle = new THREE.Mesh(new THREE.SphereGeometry(.055, 8, 6), legM); ankle.position.y = .1; boot.add(ankle);
    boot.position.y = soleY + .04; g.add(boot);
    hips.add(g);
    return g;
  };
  const legL = mkLeg(-1), legR = mkLeg(1);

  // ---- torso: lathe-profiled chest→waist, pivots at the waist ----
  const torso = new THREE.Group(); torso.name = "torso"; hips.add(torso);
  const chest = lathe([
    [.15 * dims.waist, -.02], [.168 * dims.waist, .06], [.192, .18], [.205, .28],
    [.2, .38], [.172, .45], [.11, .49], [.07, .52],
  ], suitM, .64, 22);
  chest.scale.x = dims.sh; torso.add(chest);
  // shoulder yoke: a soft flattened cap across the top of the chest gives a real
  // shoulder line the round lathe can't, and roots the arms convincingly
  const yoke = new THREE.Mesh(new THREE.SphereGeometry(.2, 16, 10, 0, TAU, 0, Math.PI * .6), suitM);
  yoke.scale.set(dims.sh * 1.02, .5, .66); yoke.position.y = .43; torso.add(yoke);

  // ---- arms: pivot at shoulder, tapered upper→fore, real hand ----
  const mkArm = (side: 1 | -1) => {
    const g = new THREE.Group(); g.name = side < 0 ? "armL" : "armR";
    g.position.set(side * SHOULDER_X * dims.sh, SHOULDER_Y, 0);
    g.rotation.z = side * .09;
    const delt = new THREE.Mesh(new THREE.SphereGeometry(.078, 10, 8), suitM);
    delt.scale.set(1, 1.1, 1); g.add(delt); // deltoid, sized to the arm not a beach ball
    const upper = bone(.062, .05, .24, suitM); upper.position.y = -.16; g.add(upper);
    const fore = bone(.05, .04, .22, suitM);
    fore.position.set(0, -.4, .03); fore.rotation.x = -.14; g.add(fore); // relaxed elbow
    // hand: a flattened, slightly cupped palm reads far better than a sphere
    const hand = new THREE.Mesh(new THREE.BoxGeometry(.06, .1, .038), skinM);
    (hand.geometry as THREE.BoxGeometry).translate(0, -.03, 0);
    hand.position.set(0, -.5, .075); hand.rotation.x = -.2; g.add(hand);
    const knuck = new THREE.Mesh(new THREE.SphereGeometry(.032, 8, 6), skinM);
    knuck.position.set(0, -.44, .05); g.add(knuck);
    torso.add(g);
    return g;
  };
  const armL = mkArm(-1), armR = mkArm(1);

  // ---- head: pivots at the neck ----
  const head = new THREE.Group(); head.name = "head"; head.position.y = NECK_Y; torso.add(head);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(.048, .066, .14, 10), skinM);
  neck.position.y = .07; head.add(neck);
  buildHead(head, a, seed);

  const outfit = new THREE.Group(); outfit.name = "outfit";
  torso.add(outfit);
  const rig: CharacterRig = { group, parts: { hips, torso, head, armL, armR, legL, legR }, outfit, app: a };
  buildOutfit(rig);

  // deterministic crowd variance so NPC crowds don't read as one repeated mold
  if (seed >= 0) group.scale.y = .94 + ((seed % 13) / 12) * .12;
  return rig;
}

// ---- species heads: all attach to the `head` pivot; face is on +z ----
const HAIR3D = ["#241d19", "#4a3527", "#6b4a30", "#17181c", "#8a6a45", "#3d2b1f"];

function buildHead(head: THREE.Group, a: Appearance, seed: number) {
  const skinM = mat(a.skin, .07);
  const skinDkM = mat(mix(a.skin, "#000000", .32), .04);
  const trimM = mat(a.trim, .55, .55);
  const trimGlowM = mat(a.trim, 1.3, .4);
  const darkM = mat("#0e1016", 0, .45);
  const whiteM = mat("#efeee6", .12, .3);
  const cy = HEAD_R + .1; // skull centre above the neck pivot (head sits ON the shoulders)
  const add = (m: THREE.Object3D) => head.add(m);

  // shared expressive eye: white + coloured iris + pupil + a thin lid line
  const eyeball = (x: number, y: number, z: number, r = .026, iris = "#3a4a63") => {
    const w = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), whiteM); w.position.set(x, cy + y, z);
    w.scale.set(1.15, 1, .8); add(w);
    const i = new THREE.Mesh(new THREE.SphereGeometry(r * .55, 8, 6), mat(iris, .06)); i.position.set(x, cy + y, z + r * .55); add(i);
    const p = new THREE.Mesh(new THREE.SphereGeometry(r * .28, 6, 6), darkM); p.position.set(x, cy + y, z + r * .72); add(p);
    const lid = new THREE.Mesh(new THREE.BoxGeometry(r * 2.3, .012, .02), skinDkM); lid.position.set(x, cy + y + r * .8, z + r * .5); add(lid);
  };

  if (a.head === "saurian") {
    const skull = new THREE.Mesh(new THREE.SphereGeometry(HEAD_R, 16, 12), skinM);
    skull.position.set(0, cy, 0); skull.scale.set(.9, .82, 1.18); add(skull);
    // tapering snout with a defined bridge, nostrils, and a jaw
    const snout = new THREE.Mesh(new THREE.CylinderGeometry(.04, .085, .17, 8), skinM);
    snout.rotation.x = Math.PI / 2; snout.position.set(0, cy - .02, HEAD_R * .95); snout.scale.set(1, .78, 1); add(snout);
    const jaw = new THREE.Mesh(new THREE.BoxGeometry(.12, .05, .17), skinDkM);
    (jaw.geometry as THREE.BoxGeometry).translate(0, 0, .03); jaw.position.set(0, cy - .07, HEAD_R * .7); add(jaw);
    for (const s of [-1, 1]) {
      const nostril = new THREE.Mesh(new THREE.SphereGeometry(.008, 6, 5), darkM);
      nostril.position.set(s * .022, cy + .01, HEAD_R * .95 + .075); add(nostril);
      // brow ridge over each eye
      const brow = new THREE.Mesh(new THREE.SphereGeometry(.045, 8, 6, 0, TAU, 0, Math.PI / 2), skinDkM);
      brow.scale.set(1, .5, 1); brow.position.set(s * .07, cy + .06, HEAD_R * .55); add(brow);
    }
    // dorsal crest — trim-coloured fins marching back over the skull
    for (let i = 0; i < 5; i++) {
      const fin = new THREE.Mesh(new THREE.ConeGeometry(.03 - i * .003, .07 + (2 - Math.abs(i - 2)) * .03, 4), trimM);
      fin.position.set(0, cy + HEAD_R * .7 - i * .012, .07 - i * .062); fin.rotation.x = -.2; add(fin);
    }
    eyeball(-.08, .055, HEAD_R * .62, .026, "#d8a24a");
    eyeball(.08, .055, HEAD_R * .62, .026, "#d8a24a");
  } else if (a.head === "insectoid") {
    const skull = new THREE.Mesh(new THREE.SphereGeometry(HEAD_R * .9, 14, 12), skinM);
    skull.position.set(0, cy, 0); skull.scale.set(1, 1.12, .95); add(skull);
    // chitinous face plate + mandibles
    const face = new THREE.Mesh(new THREE.SphereGeometry(HEAD_R * .7, 12, 8), skinDkM);
    face.position.set(0, cy - .02, HEAD_R * .5); face.scale.set(1, 1.1, .7); add(face);
    const eyeM = mat(mix(a.trim, "#0a0a10", .25), .55, .25);
    for (const s of [-1, 1]) {
      // big wrap-around compound eye
      const bigEye = new THREE.Mesh(new THREE.SphereGeometry(.062, 12, 10), eyeM);
      bigEye.position.set(s * .075, cy + .03, HEAD_R * .5); bigEye.scale.set(.85, 1.4, .95); add(bigEye);
      const glint = new THREE.Mesh(new THREE.SphereGeometry(.014, 6, 5), mat("#ffffff", .6));
      glint.position.set(s * .06, cy + .09, HEAD_R * .5 + .05); add(glint);
      // mandible
      const mand = new THREE.Mesh(new THREE.ConeGeometry(.016, .07, 5), skinDkM);
      mand.position.set(s * .03, cy - .1, HEAD_R * .6); mand.rotation.set(1.4, 0, s * .3); add(mand);
      // slim antenna in a pivot group so the trim tip rides its swept-back end
      const antenna = new THREE.Group();
      antenna.position.set(s * .045, cy + HEAD_R * .82, 0);
      antenna.rotation.z = s * -.35; antenna.rotation.x = .7; // swept up and back
      const stalk = new THREE.Mesh(new THREE.CylinderGeometry(.006, .009, .11, 5), trimM);
      stalk.position.y = .055; antenna.add(stalk);
      const tip = new THREE.Mesh(new THREE.SphereGeometry(.014, 6, 5), trimGlowM);
      tip.position.y = .115; antenna.add(tip);
      add(antenna);
    }
  } else if (a.head === "cyclops") {
    const skull = new THREE.Mesh(new THREE.SphereGeometry(HEAD_R * 1.06, 16, 12), skinM);
    skull.position.set(0, cy, 0); skull.scale.set(1, 1.05, 1); add(skull);
    // heavy brow ridge over one great eye
    const brow = new THREE.Mesh(new THREE.SphereGeometry(.1, 12, 8, 0, TAU, 0, Math.PI / 2), skinDkM);
    brow.scale.set(1.1, .45, .9); brow.position.set(0, cy + .075, HEAD_R * .62); add(brow);
    const socket = new THREE.Mesh(new THREE.SphereGeometry(.085, 12, 10), skinDkM);
    socket.position.set(0, cy + .01, HEAD_R * .62); socket.scale.set(1, 1, .5); add(socket);
    const white = new THREE.Mesh(new THREE.SphereGeometry(.072, 14, 12), whiteM);
    white.position.set(0, cy + .01, HEAD_R * .74); add(white);
    const iris = new THREE.Mesh(new THREE.SphereGeometry(.038, 10, 8), mat(a.trim, .1));
    iris.position.set(0, cy + .01, HEAD_R * .74 + .05); add(iris);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(.018, 8, 6), darkM);
    pupil.position.set(0, cy + .01, HEAD_R * .74 + .07); add(pupil);
    const mouth = new THREE.Mesh(new THREE.BoxGeometry(.05, .012, .02), skinDkM);
    mouth.position.set(0, cy - .11, HEAD_R * .74); add(mouth);
  } else if (a.head === "avian") {
    const skull = new THREE.Mesh(new THREE.SphereGeometry(HEAD_R * .92, 16, 12), skinM);
    skull.position.set(0, cy, 0); skull.scale.set(.92, 1, 1.02); add(skull);
    // two-part keratin beak — warm keratin blended toward the trim colour
    const beakC = mix(a.trim, "#e8983b", .5);
    const beakM = mat(mix(beakC, "#ffffff", .12), .12, .4);
    const upper = new THREE.Mesh(new THREE.ConeGeometry(.05, .16, 8), beakM);
    upper.rotation.x = Math.PI / 2; upper.position.set(0, cy - .01, HEAD_R * .78 + .05); upper.scale.set(1, .7, 1); add(upper);
    const lower = new THREE.Mesh(new THREE.ConeGeometry(.036, .1, 8), mat(mix(beakC, "#000000", .2), .08));
    lower.rotation.x = Math.PI / 2; lower.position.set(0, cy - .05, HEAD_R * .78 + .02); lower.scale.set(1, .55, 1); add(lower);
    // swept crest of trim-coloured feathers
    for (let i = -2; i <= 2; i++) {
      const feather = new THREE.Mesh(new THREE.ConeGeometry(.016, .13 + (2 - Math.abs(i)) * .03, 5), trimM);
      feather.position.set(i * .035, cy + HEAD_R * .78, -.03); feather.rotation.set(-.55, 0, i * .3); add(feather);
    }
    for (const s of [-1, 1]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(.03, .008, 6, 12), skinDkM);
      ring.position.set(s * .085, cy + .04, HEAD_R * .5); ring.rotation.y = s * .5; add(ring);
      eyeball(s * .085, .04, HEAD_R * .52, .022, "#1a1a1e");
    }
  } else if (a.head === "synth") {
    // beveled two-tone head shell
    const shell = new THREE.Mesh(new THREE.BoxGeometry(HEAD_R * 1.55, HEAD_R * 1.75, HEAD_R * 1.5), mat(mix(a.skin, "#c8d0dc", .25), .05, .4));
    shell.position.set(0, cy, 0); add(shell);
    const jaw = new THREE.Mesh(new THREE.BoxGeometry(HEAD_R * 1.2, HEAD_R * .5, HEAD_R * 1.3), skinDkM);
    jaw.position.set(0, cy - HEAD_R * .78, .01); add(jaw);
    // recessed dark faceplate carrying a glowing visor band (trim)
    const faceplate = new THREE.Mesh(new THREE.BoxGeometry(HEAD_R * 1.25, HEAD_R * 1.0, .04), mat("#0c0f16", 0, .3));
    faceplate.position.set(0, cy + .01, HEAD_R * .76); add(faceplate);
    const visor = new THREE.Mesh(new THREE.BoxGeometry(HEAD_R * 1.15, .05, .05), trimGlowM);
    visor.position.set(0, cy + .02, HEAD_R * .78); add(visor);
    // two brighter optic sensors riding the band
    for (const s of [-1, 1]) {
      const optic = new THREE.Mesh(new THREE.SphereGeometry(.02, 8, 6), mat("#ffffff", 1.1));
      optic.position.set(s * .05, cy + .02, HEAD_R * .8); add(optic);
      // side vent panels
      const vent = new THREE.Mesh(new THREE.BoxGeometry(.02, .09, .09), mat(mix(a.skin, "#000000", .3), .04));
      vent.position.set(s * HEAD_R * .78, cy, 0); add(vent);
    }
    // antenna + status bulb
    const stalk = new THREE.Mesh(new THREE.CylinderGeometry(.008, .008, .09, 5), skinDkM);
    stalk.position.set(HEAD_R * .5, cy + HEAD_R * .9 + .04, 0); add(stalk);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(.02, 8, 6), trimGlowM);
    bulb.position.set(HEAD_R * .5, cy + HEAD_R * .9 + .1, 0); add(bulb);
  } else {
    // human — sculpted skull, brow, nose, ears, hair, eyebrows
    const skull = new THREE.Mesh(new THREE.SphereGeometry(HEAD_R, 18, 14), skinM);
    skull.position.set(0, cy, 0); skull.scale.set(.94, 1.04, .98); add(skull);
    const jaw = new THREE.Mesh(new THREE.SphereGeometry(HEAD_R * .74, 12, 10), skinM);
    jaw.position.set(0, cy - HEAD_R * .55, .015); jaw.scale.set(.9, .82, .92); add(jaw);
    const nose = new THREE.Mesh(new THREE.ConeGeometry(.024, .06, 5), skinM);
    nose.rotation.x = Math.PI / 2.1; nose.position.set(0, cy - .02, HEAD_R * .95); add(nose);
    for (const s of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.SphereGeometry(.032, 8, 6), skinM);
      ear.scale.set(.5, 1, .8); ear.position.set(s * HEAD_R * .96, cy - .01, -.01); add(ear);
      const brow = new THREE.Mesh(new THREE.BoxGeometry(.05, .012, .02), mat(mix(a.skin, "#100c08", .55), .03));
      brow.position.set(s * .05, cy + .06, HEAD_R * .82); brow.rotation.z = s * .1; add(brow);
    }
    eyeball(-.05, .015, HEAD_R * .82, .024, "#3a4a63");
    eyeball(.05, .015, HEAD_R * .82, .024, "#3a4a63");
    const hairC = seed >= 0 ? HAIR3D[(seed >> 3) % HAIR3D.length] : mix(a.skin, "#0e0a06", .62);
    const hairM = mat(hairC, .03);
    // crown cap that stops at a hairline, not a bowl over the eyes
    const cap = new THREE.Mesh(new THREE.SphereGeometry(HEAD_R * 1.05, 16, 12, 0, TAU, 0, Math.PI * .58), hairM);
    cap.position.set(0, cy + .012, -.01); cap.rotation.x = -.12; add(cap);
    if (a.frame === "feminine") {
      // longer hair: volume down the back and sides
      const back = new THREE.Mesh(new THREE.SphereGeometry(HEAD_R * 1.08, 14, 12), hairM);
      back.scale.set(1, 1.15, 1); back.position.set(0, cy - .03, -.05); add(back);
      for (const s of [-1, 1]) {
        const side = new THREE.Mesh(new THREE.CapsuleGeometry(.03, .12, 4, 8), hairM);
        side.position.set(s * HEAD_R * .95, cy - .1, -.02); add(side);
      }
    } else {
      // short back-and-sides
      const back = new THREE.Mesh(new THREE.SphereGeometry(HEAD_R * 1.02, 12, 10, 0, TAU, Math.PI * .35, Math.PI * .4), hairM);
      back.position.set(0, cy, -.02); add(back);
    }
  }
}

// ---- outfits: everything garb-specific lives in rig.outfit so a wardrobe
// change never touches the base body ----
export function setOutfit(rig: CharacterRig, garb: string) {
  rig.app.garb = garb;
  buildOutfit(rig);
}

function clearGroup(g: THREE.Group) {
  for (const c of [...g.children]) {
    c.traverse((n: any) => { n.geometry?.dispose?.(); n.material?.dispose?.(); });
    g.remove(c);
  }
}

function buildOutfit(rig: CharacterRig) {
  clearGroup(rig.outfit);
  // clear anything previously parented onto the limbs (piping, cuffs, guards)
  for (const limb of [rig.parts.legL, rig.parts.legR, rig.parts.armL, rig.parts.armR]) {
    for (const c of [...limb.children]) if (c.userData.outfit) {
      (c as any).geometry?.dispose?.(); (c as any).material?.dispose?.(); limb.remove(c);
    }
  }
  const a = rig.app;
  const dims = frameDims(a.frame || "neutral");
  const trimM = mat(a.trim, .55, .5);
  const trimGlowM = mat(a.trim, 1.4, .4);
  const darkM = mat(mix(a.suit, "#000000", .4), .04);
  const o = rig.outfit;
  const onLimb = (limb: THREE.Group, m: THREE.Mesh) => { m.userData.outfit = true; limb.add(m); };

  // shared: belt at the waist with a trim buckle
  const belt = new THREE.Mesh(new THREE.CylinderGeometry(TORSO_R * 1.0 * dims.hip, TORSO_R * 1.0 * dims.hip, .05, 16), darkM);
  belt.scale.set(dims.sh, 1, .66); belt.position.y = .02; o.add(belt);
  const buckle = new THREE.Mesh(new THREE.BoxGeometry(.055, .045, .022), trimM);
  buckle.position.set(0, .02, TORSO_R * .72); o.add(buckle);

  if (a.garb === "coat") {
    // flared captain's coat: open skirt, standing collar, epaulettes, cuffs
    const coatM = new THREE.MeshStandardMaterial({ color: a.suit, roughness: .78, metalness: .12, emissive: a.suit, emissiveIntensity: .1, side: THREE.DoubleSide });
    const skirt = new THREE.Mesh(new THREE.CylinderGeometry(TORSO_R * .96 * dims.hip, TORSO_R * 1.6 * dims.hip, .54, 20, 1, true), coatM);
    skirt.scale.z = .82; skirt.position.y = -.24; o.add(skirt);
    // front opening: two lapels of trim running down the chest to the hem
    for (const s of [-1, 1]) {
      const lapel = new THREE.Mesh(new THREE.BoxGeometry(.03, .5, .014), trimM);
      lapel.position.set(s * .045, .2, TORSO_R * .7); lapel.rotation.z = s * .04; o.add(lapel);
    }
    const hem = new THREE.Mesh(new THREE.TorusGeometry(TORSO_R * 1.55 * dims.hip, .014, 8, 24), trimM);
    hem.rotation.x = Math.PI / 2; hem.scale.z = .82; hem.position.y = -.5; o.add(hem);
    // three trim buttons down the placket
    for (let i = 0; i < 3; i++) {
      const btn = new THREE.Mesh(new THREE.SphereGeometry(.014, 8, 6), trimGlowM);
      btn.position.set(0, .34 - i * .12, TORSO_R * .74); o.add(btn);
    }
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(.1, .118, .08, 14, 1, true),
      new THREE.MeshStandardMaterial({ color: a.trim, roughness: .55, metalness: .35, emissive: a.trim, emissiveIntensity: .3, side: THREE.DoubleSide }));
    collar.position.y = NECK_Y - .04; o.add(collar);
    for (const s of [-1, 1]) {
      // clean epaulette: a small trim slab flat on the shoulder
      const ep = new THREE.Mesh(new THREE.BoxGeometry(.11, .022, .085), trimM);
      ep.position.set(s * SHOULDER_X * dims.sh * 1.02, SHOULDER_Y + .085, 0); o.add(ep);
      // cuff band near the wrist, riding the arm
      const cuff = new THREE.Mesh(new THREE.CylinderGeometry(.055, .052, .05, 12), trimM);
      cuff.position.y = -.46; onLimb(s < 0 ? rig.parts.armL : rig.parts.armR, cuff);
    }
  } else if (a.garb === "armor") {
    // voidsuit: layered chest plate, pauldrons, ab plates, shin guards, gauntlets
    const plateM = mat(mix(a.suit, "#8a93a6", .32), .08, .42);
    const plateHiM = mat(mix(a.suit, "#aab2c2", .4), .1, .38);
    const plate = new THREE.Mesh(new THREE.SphereGeometry(TORSO_R * 1.12, 16, 12), plateM);
    plate.scale.set(dims.sh, .92, .64); plate.position.y = .34; o.add(plate);
    // collarbone + sternum trim seams
    const sternum = new THREE.Mesh(new THREE.BoxGeometry(.02, .3, .015), trimM);
    sternum.position.set(0, .34, TORSO_R * .74); o.add(sternum);
    for (const s of [-1, 1]) {
      const clav = new THREE.Mesh(new THREE.BoxGeometry(.11, .018, .015), trimM);
      clav.position.set(s * .07, .46, TORSO_R * .66); clav.rotation.z = s * -.3; o.add(clav);
    }
    // glowing reactor core
    const ring = new THREE.Mesh(new THREE.TorusGeometry(.04, .012, 8, 16), trimM);
    ring.position.set(0, .36, TORSO_R * .8); o.add(ring);
    const core = new THREE.Mesh(new THREE.SphereGeometry(.028, 10, 8), trimGlowM);
    core.position.set(0, .36, TORSO_R * .8); o.add(core);
    // ab plates
    for (let i = 0; i < 2; i++) {
      const ab = new THREE.Mesh(new THREE.BoxGeometry(.13 - i * .02, .05, .1), plateHiM);
      ab.position.set(0, .16 - i * .07, TORSO_R * .58); o.add(ab);
    }
    for (const s of [-1, 1]) {
      const pd = new THREE.Mesh(new THREE.SphereGeometry(.1, 12, 8, 0, TAU, 0, Math.PI * .58), plateHiM);
      pd.position.set(s * (SHOULDER_X * dims.sh + .015), SHOULDER_Y + .06, 0); pd.rotation.z = s * .3; o.add(pd);
      const pdrim = new THREE.Mesh(new THREE.TorusGeometry(.098, .008, 6, 16), trimM);
      pdrim.position.copy(pd.position); pdrim.rotation.set(Math.PI / 2, 0, 0); o.add(pdrim);
      // gauntlet on the forearm
      const gaunt = new THREE.Mesh(new THREE.CylinderGeometry(.055, .048, .16, 10), plateHiM);
      gaunt.position.set(0, -.42, .02); onLimb(s < 0 ? rig.parts.armL : rig.parts.armR, gaunt);
      // curved shin guard on the front of the lower leg
      const shinG = new THREE.Mesh(new THREE.CylinderGeometry(.075, .06, .26, 12, 1, true, -0.9, 1.8), plateHiM);
      shinG.position.set(0, -.46, .01); onLimb(s < 0 ? rig.parts.legL : rig.parts.legR, shinG);
      const kneeG = new THREE.Mesh(new THREE.SphereGeometry(.06, 10, 8, 0, TAU, 0, Math.PI * .55), plateM);
      kneeG.position.set(0, -.31, .04); kneeG.rotation.x = Math.PI * .3; onLimb(s < 0 ? rig.parts.legL : rig.parts.legR, kneeG);
    }
  } else {
    // flight suit: diagonal harness strap, zip, shoulder patches, limb piping
    const strap = new THREE.Mesh(new THREE.CylinderGeometry(TORSO_R * 1.03, TORSO_R * 1.03, .04, 16), trimM);
    strap.scale.set(dims.sh, 1, .7); strap.position.y = .32; strap.rotation.z = .14; o.add(strap);
    const zip = new THREE.Mesh(new THREE.BoxGeometry(.012, .44, .012), mat(mix(a.suit, "#000000", .4), .08));
    zip.position.set(0, .26, TORSO_R * .74); o.add(zip);
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(.085, .1, .05, 12, 1, true),
      new THREE.MeshStandardMaterial({ color: mix(a.suit, "#000000", .25), roughness: .8, metalness: .1, emissive: a.suit, emissiveIntensity: .06, side: THREE.DoubleSide }));
    collar.position.y = NECK_Y - .05; o.add(collar);
    for (const s of [-1, 1]) {
      const patch = new THREE.Mesh(new THREE.BoxGeometry(.05, .035, .014), trimM);
      patch.position.set(s * SHOULDER_X * dims.sh * .95, SHOULDER_Y - .02, TORSO_R * .48); o.add(patch);
      // trim piping down the outer arm and outer leg — the suit's main trim read
      const armPipe = new THREE.Mesh(new THREE.BoxGeometry(.012, .46, .012), trimM);
      armPipe.position.set(s * .058, -.24, .02); onLimb(s < 0 ? rig.parts.armL : rig.parts.armR, armPipe);
      const legPipe = new THREE.Mesh(new THREE.BoxGeometry(.014, .56, .014), trimM);
      legPipe.position.set(s * .07, -.3, .01); onLimb(s < 0 ? rig.parts.legL : rig.parts.legR, legPipe);
    }
  }
}

// ---- posing: procedural bone driver (walk swing + idle breathing) ----
export interface PoseOpts { moving?: boolean; phase?: number; t?: number; }

export function poseCharacter(rig: CharacterRig, o: PoseOpts = {}) {
  const { parts } = rig;
  const t = o.t || 0;
  if (o.moving) {
    const swing = Math.sin(o.phase || 0);
    parts.legL.rotation.x = swing * .62;
    parts.legR.rotation.x = -swing * .62;
    parts.armL.rotation.x = -swing * .5;
    parts.armR.rotation.x = swing * .5;
    parts.torso.rotation.y = swing * .06;
    parts.torso.rotation.x = .08; // slight forward lean while striding
    parts.head.rotation.x = -.06;
    parts.hips.position.y = HIP_Y + Math.abs(Math.cos(o.phase || 0)) * .028;
  } else {
    // idle: breath + micro arm sway
    const br = Math.sin(t * .0016);
    parts.legL.rotation.x = parts.legR.rotation.x = 0;
    parts.armL.rotation.x = br * .025;
    parts.armR.rotation.x = -br * .025;
    parts.torso.rotation.y = 0;
    parts.torso.rotation.x = br * .012;
    parts.torso.scale.y = 1 + br * .008;
    parts.head.rotation.x = br * .018;
    parts.hips.position.y = HIP_Y + br * .006;
  }
}

export function disposeCharacter(rig: CharacterRig) {
  rig.group.traverse((n: any) => { n.geometry?.dispose?.(); n.material?.dispose?.(); });
}
