// Three.js is deliberately a view over walk.ts. It never owns positions,
// collision, proximity, or interaction; those remain in the deterministic 2D sim.
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { S } from "../state";
import { MODS } from "../content";
import { cargoUsed } from "../derive";
import { wearTier } from "../systems/wear";
import type { WalkActor, WalkDoor, WalkScene } from "./walk";
import { spawnProp } from "../spaceport/assets";
import bulkheadWallUrl from "../assets/ship/bulkhead-wall.webp";
import corridorWallUrl from "../assets/ship/corridor-wall.webp";
import corridorFloorUrl from "../assets/ship/corridor-floor.webp";
import cockpitWallUrl from "../assets/ship/cockpit-wall.webp";
import combatWallUrl from "../assets/ship/combat-wall.webp";
import engineCoreUrl from "../assets/ship/engine-core.webp";
import cargoWallUrl from "../assets/ship/cargo-wall.webp";
import medbayWallUrl from "../assets/ship/medbay-wall.webp";
import quartersWallUrl from "../assets/ship/quarters-wall.webp";
import hydroWallUrl from "../assets/ship/hydro-wall.webp";
import shieldWallUrl from "../assets/ship/shield-wall.webp";
import utilityWallUrl from "../assets/ship/utility-wall.webp";
import quartersFridgeFrontUrl from "../assets/ship/quarters-fridge-front.webp";
import quartersFridgeSideUrl from "../assets/ship/quarters-fridge-side.webp";
import quartersFridgeTopUrl from "../assets/ship/quarters-fridge-top.webp";

const SCALE = 0.02;
let renderer: THREE.WebGLRenderer | null = null;
let root: THREE.Scene | null = null;
let camera: THREE.PerspectiveCamera | null = null;
let current: WalkScene | null = null;
let host: HTMLElement | null = null;
let fallbackCanvas: HTMLCanvasElement | null = null;
let world = new THREE.Group();
let avatar = new THREE.Group();
let actorMeshes = new Map<string, THREE.Group>();
let flashlight: THREE.SpotLight | null = null;
let composer: EffectComposer | null = null;
let bloomPass: UnrealBloomPass | null = null;
let crtPass: ShaderPass | null = null;
let signature = "";
// A crowded room stacks a nametag/door label per occupant — legible one at a
// time, a wall of overlapping text once four or five stand near each other.
// Keep the near-door/near-actor label at full strength and fade the rest, so
// only what's actually interactable competes for the player's eye.
let doorLabels = new Map<WalkDoor, THREE.Sprite>();
let actorLabels = new Map<WalkActor, THREE.Sprite>();
const LABEL_DIM = 0.32;

// One-pass CRT finish: subtle chromatic aberration, curved-tube scanlines,
// radial vignette, and animated film grain. Runs after UnrealBloom in the
// composer chain, before OutputPass tone-maps to sRGB. Kept gentle — this is
// atmosphere, not a filter you fight to read gameplay through.
const CRT_SHADER = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    resolution: { value: new THREE.Vector2(1, 1) },
    time: { value: 0 },
    vignette: { value: 0.55 },
    grain: { value: 0.028 },
    aberration: { value: 0.0016 },
    scanline: { value: 0.032 },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  // hash() and the scanline phase both used to feed sin()/dot() a raw
  // resolution*uv(+time) value — thousands, growing unboundedly with session
  // time. Many real GPUs (this never showed up against SwiftShader in
  // headless testing) lose range-reduction precision on sin() well before
  // that point, so the intended subtle dither/scanline degenerated into
  // incoherent full-contrast static that got worse — and visibly drifted, as
  // `time` kept climbing — the longer a session ran. hash() is now a
  // trig-free multiply/fract hash (bounded regardless of input magnitude),
  // and the scanline phase is range-reduced into [0, 2π) before sin().
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform vec2 resolution; uniform float time;
    uniform float vignette; uniform float grain; uniform float aberration; uniform float scanline;
    varying vec2 vUv;
    float hash(vec2 p){
      vec3 p3 = fract(vec3(p.xyx) * 0.1031);
      p3 += dot(p3, p3.yzx + 33.33);
      return fract((p3.x + p3.y) * p3.z);
    }
    void main(){
      vec2 center = vUv - 0.5;
      float dist = length(center);
      vec2 shift = center * dist * aberration;
      float r = texture2D(tDiffuse, vUv + shift).r;
      float g = texture2D(tDiffuse, vUv).g;
      float b = texture2D(tDiffuse, vUv - shift).b;
      vec3 col = vec3(r, g, b);
      float slTurns = vUv.y * resolution.y * 1.4 / 6.2831853;
      float sl = sin(fract(slTurns) * 6.2831853) * 0.5 + 0.5;
      col *= 1.0 - scanline * (1.0 - sl);
      float vig = smoothstep(0.85, 0.15, dist);
      col *= mix(1.0, vig, vignette);
      float n = hash(vUv * resolution + time);
      col += (n - 0.5) * grain;
      gl_FragColor = vec4(col, 1.0);
    }`,
};
let resizeObserver: ResizeObserver | null = null;
let clickHandler: ((e: PointerEvent) => void) | null = null;
let click: ((x: number, y: number) => void) | null = null;
let aimCallback: ((x:number,y:number)=>void)|null=null;
let fireCallback:(()=>void)|null=null;
let actionFx=new THREE.Group();
const ray = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

// Right-stick camera orbit (fed by ui/walk.ts's gamepad poll). Base chase
// offset is (3.8, 4.7, 5.4) — camYaw/camPitch are added on top of that so a
// controller with no input reproduces the original fixed chase view exactly.
const CAM_BASE_DIST = Math.hypot(3.8, 5.4);
const CAM_BASE_ANGLE = Math.atan2(5.4, 3.8);
const CAM_BASE_HEIGHT = 4.7;
const CAM_PITCH_MIN = -3, CAM_PITCH_MAX = 3;
let camYaw = 0;
let camPitch = 0;

export function nudgeCamera(rx: number, ry: number, dt: number) {
  camYaw -= rx * 2.2 * dt;
  camPitch = Math.max(CAM_PITCH_MIN, Math.min(CAM_PITCH_MAX, camPitch - ry * 3 * dt));
}

// Convert screen-relative movement into deck/world axes. This keeps controls
// intuitive after orbiting the chase camera: up is always away from the camera
// (toward the top of the screen), and left/right remain screen-left/right.
export function cameraRelativeMovement(screenX: number, screenY: number) {
  const a = CAM_BASE_ANGLE + camYaw;
  // screen-right must map to the camera's world right-vector, cross(up, camera→avatar);
  // the previous form negated the horizontal axis, so left/right were swapped.
  return {
    x:  Math.sin(a) * screenX + Math.cos(a) * screenY,
    y: -Math.cos(a) * screenX + Math.sin(a) * screenY,
  };
}

const wx = (x: number) => (x - (current?.width || 0) / 2) * SCALE;
const wz = (y: number) => (y - (current?.height || 0) / 2) * SCALE;

// Civilian wardrobe + skin tones for actors without an explicit roster colour.
const WARDROBE = ["#3a4a63", "#4f3a55", "#54402e", "#2f5240", "#5a3333", "#39505c", "#4a4436", "#333a52"];
const SKIN3D = ["#c9977a", "#a8714f", "#8a5a3c", "#e0b490", "#6d4a33", "#b98a68"];
const crewGltfLoader = new GLTFLoader();
const crewModelUrls = import.meta.glob<string>("../assets/models/crew-*.glb", { query: "?url", import: "default" });
const crewModelCache = new Map<string, Promise<THREE.Object3D | null>>();

function loadCrewModel(key: string): Promise<THREE.Object3D | null> {
  const urlLoader = crewModelUrls[`../assets/models/crew-${key}.glb`];
  if (!urlLoader) return Promise.resolve(null);
  const cached = crewModelCache.get(key);
  if (cached) return cached;
  const pending = urlLoader()
    .then((url) => crewGltfLoader.loadAsync(url))
    .then((gltf) => gltf.scene)
    .catch(() => null);
  crewModelCache.set(key, pending);
  return pending;
}

function fitCrewModel(src: THREE.Object3D, targetHeight = 1.28): THREE.Object3D {
  const model = src.clone(true);
  const b = new THREE.Box3().setFromObject(model);
  const size = new THREE.Vector3(); b.getSize(size);
  if (size.y > 0.0001) model.scale.multiplyScalar(targetHeight / size.y);
  const b2 = new THREE.Box3().setFromObject(model);
  model.position.set(-(b2.min.x + b2.max.x) / 2, -b2.min.y, -(b2.min.z + b2.max.z) / 2);
  model.traverse((o: any) => {
    if (!o.isMesh) return;
    o.castShadow = false; o.receiveShadow = false;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    mats.forEach((m: any) => { if (m) { m.roughness = Math.max(m.roughness ?? .65, .55); m.metalness = Math.min(m.metalness ?? .1, .35); } });
  });
  return model;
}

function attachCrewModel(group: THREE.Group, modelKey: string | undefined, fallback: THREE.Object3D) {
  if (!modelKey) return;
  loadCrewModel(modelKey).then((src) => {
    if (!src || !group.parent) return;
    const model = fitCrewModel(src, modelKey === "pip7" ? .9 : 1.28);
    model.name = `mesh:${modelKey}`;
    fallback.visible = false;
    group.add(model);
  });
}

function mat(color: THREE.ColorRepresentation, emissive = 0): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness: .72, metalness: .25, emissive: color, emissiveIntensity: emissive });
}
// Every fine repeating texture (deck grating, wall panels, floor grid) is
// viewed at a steep grazing angle from the chase camera — a corridor floor
// stretching into the distance is the textbook case where isotropic
// mipmapping under-samples one axis of the minification footprint and the
// fine pattern breaks into a shimmering, camera-motion-reactive diagonal
// moiré (exactly what reads as "static that moves and covers everything").
// Anisotropic filtering samples along the true elongated footprint instead
// of approximating it as square, which is the standard fix. None of these
// textures set it, so it silently defaulted to 1 (off) on every one of them.
function maxAniso(): number { return renderer?.capabilities.getMaxAnisotropy() ?? 1; }
function panelTexture(url: string, repeatX = 2.2, repeatY = 1.5): THREE.Texture {
  const t=new THREE.TextureLoader().load(url);
  t.colorSpace=THREE.SRGBColorSpace;t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(repeatX,repeatY);t.anisotropy=maxAniso();return t;
}
function floorPanelTexture(url: string, w: number, d: number): THREE.Texture {
  const t = new THREE.TextureLoader().load(url);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(Math.max(1, w / 1.8), Math.max(1, d / 1.8));
  t.anisotropy = maxAniso();
  return t;
}
function propTexture(url: string): THREE.Texture {
  const t=new THREE.TextureLoader().load(url);
  t.colorSpace=THREE.SRGBColorSpace;t.wrapS=t.wrapT=THREE.ClampToEdgeWrapping;t.anisotropy=maxAniso();return t;
}
function texturedMat(url: string, glow = 0.03): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color: "#ffffff", map: propTexture(url), roughness: .78, metalness: .16, emissive: "#ffffff", emissiveIntensity: glow });
}
function deckTexture(dark: boolean): THREE.CanvasTexture {
  const c=document.createElement("canvas");c.width=256;c.height=256;const x=c.getContext("2d")!;
  x.fillStyle=dark?"#131923":"#26354a";x.fillRect(0,0,256,256);x.strokeStyle=dark?"#303b4c":"#57708c";x.lineWidth=3;
  for(let i=0;i<=256;i+=32){x.beginPath();x.moveTo(i,0);x.lineTo(i,256);x.stroke();x.beginPath();x.moveTo(0,i);x.lineTo(256,i);x.stroke();}
  x.strokeStyle=dark?"#222b38":"#3d526a";for(let i=0;i<256;i+=64)x.strokeRect(i+5,i%128+5,54,22);
  const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(8,5);t.anisotropy=maxAniso();return t;
}
// Dustwell-only re-skin textures (canvas-generated, same pattern as deckTexture)
// — weathered planks instead of bulkhead panels, packed sand instead of deck grating.
function desertPlankTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas"); c.width = 256; c.height = 256; const x = c.getContext("2d")!;
  x.fillStyle = "#8a6448"; x.fillRect(0, 0, 256, 256);
  x.strokeStyle = "rgba(30,16,8,.35)"; x.lineWidth = 3;
  for (let i = 0; i <= 256; i += 26) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, 256); x.stroke(); }
  for (let i = 0; i < 500; i++) { x.fillStyle = `rgba(20,10,5,${Math.random() * .12})`; x.fillRect(Math.random() * 256, Math.random() * 256, 2, 2); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(2.2, 1.5); t.anisotropy = maxAniso(); return t;
}
function sandTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas"); c.width = 256; c.height = 256; const x = c.getContext("2d")!;
  x.fillStyle = "#8a5a34"; x.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 3000; i++) { x.fillStyle = Math.random() < .5 ? "rgba(40,22,10,.10)" : "rgba(210,160,100,.10)"; x.fillRect(Math.random() * 256, Math.random() * 256, 2, 2); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(6, 4); t.anisotropy = maxAniso(); return t;
}
// The 10 Meshy-generated spaceport props (see scripts/meshy/, src/spaceport/),
// scattered one per Dustwell room so the town actually looks like the desert
// spaceport it's named after instead of a re-tinted station deck.
function spawnDesertProps(g: THREE.Group, scene: WalkScene) {
  const at = (roomId: string) => {
    const r = scene.rooms.find((rm) => rm.id === roomId);
    return r ? { x: wx(r.x + r.w / 2), z: wz(r.y + r.h / 2) } : { x: 0, z: 0 };
  };
  const docks = at("docks"), drydock = at("drydock"), concourse = at("concourse"), market = at("market"), harbor = at("harbor");
  const place = (name: string, x: number, z: number, h: number, rotY = 0, color = 0x8a6a4a) =>
    spawnProp(g, { name, x, z, rotY, placeholderRadius: h * .3, placeholderHeight: h, placeholderColor: color });

  place("cargo-shuttle", docks.x + .3, docks.z - 1.3, 0.85, 1.6);
  place("beacon-lamp", docks.x - 2.0, docks.z + 1.1, 1.3);
  place("beacon-lamp", docks.x + 2.0, docks.z + 1.1, 1.3);
  place("mooring-post", docks.x - 1.9, docks.z - .3, 1.0);
  place("mooring-post", docks.x + 1.9, docks.z - .3, 1.0);
  place("cargo-hauler", drydock.x - .6, drydock.z + .8, 1.0, 1.1);
  place("fuel-tank", drydock.x + 1.1, drydock.z - .6, 1.3);
  place("water-tower", concourse.x - 1.6, concourse.z - 1.2, 3.2, 0.3);
  place("windmill-turbine", concourse.x + 1.8, concourse.z + 1.0, 4.0, -0.5);
  place("cargo-crate", market.x + 1.2, market.z + .9, 0.6, 0.6);
  place("barrel-stack", market.x - 1.1, market.z - .8, 0.8);
  place("satellite-dish", harbor.x + 1.3, harbor.z - .9, 1.2, -0.3);
}
function box(w: number, h: number, d: number, material: THREE.Material) {
  return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
}
function matchesRect(a: {x:number;y:number;w:number;h:number}, b: {x:number;y:number;w:number;h:number}) {
  return a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
}
function corridorFloorMat(w: number, d: number, dark: boolean): THREE.MeshStandardMaterial {
  const m = mat(dark ? "#596270" : "#aab5bf", dark ? .1 : .18);
  m.map = floorPanelTexture(corridorFloorUrl, w, d);
  return m;
}
function addPathBorder(g: THREE.Group, x: number, z: number, w: number, d: number, material: THREE.Material) {
  const h = .78, y = .34, thick = .07;
  [[w,thick,x,z-d/2],[w,thick,x,z+d/2],[thick,d,x-w/2,z],[thick,d,x+w/2,z]].forEach(([bw,bd,bx,bz]) => {
    const rail = box(bw as number, h, bd as number, material);
    rail.position.set(bx as number, y, bz as number);
    g.add(rail);
  });
}
function quartersFridge(): THREE.Mesh {
  return new THREE.Mesh(
    new THREE.BoxGeometry(.48, .9, .55),
    [
      texturedMat(quartersFridgeSideUrl),
      texturedMat(quartersFridgeSideUrl),
      texturedMat(quartersFridgeTopUrl),
      texturedMat(quartersFridgeSideUrl),
      texturedMat(quartersFridgeFrontUrl, .05),
      texturedMat(quartersFridgeSideUrl),
    ],
  );
}

function addModelProp(
  g: THREE.Group,
  name: string,
  x: number,
  z: number,
  height: number,
  rotY = 0,
  color = 0x6d7580,
  scale = 1,
) {
  void spawnProp(g, {
    name,
    x,
    z,
    rotY,
    scale,
    placeholderRadius: Math.max(.22, height * .32),
    placeholderHeight: height,
    placeholderColor: color,
  });
}

function sprite(text: string, color = "#d7e6ff", scale = 1): THREE.Sprite {
  const c = document.createElement("canvas"); c.width = 512; c.height = 96;
  const x = c.getContext("2d")!; x.font = "600 30px Consolas, monospace"; x.textAlign = "center";
  x.fillStyle = "rgba(5,8,15,.82)"; x.fillRect(0, 12, 512, 62); x.fillStyle = color; x.fillText(text, 256, 54);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  // toneMapped:false — labels are HUD, not scene; ACES would crush them to grey
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false, toneMapped: false }));
  s.scale.set(3.8 * scale, .72 * scale, 1); return s;
}
function disposeObject(o: THREE.Object3D) {
  o.traverse((n: any) => { n.geometry?.dispose?.(); const ms = Array.isArray(n.material) ? n.material : [n.material]; ms.forEach((m: any) => { m?.map?.dispose?.(); m?.dispose?.(); }); });
}
const HAIR3D = ["#241d19", "#4a3527", "#6b4a30", "#17181c", "#8a6a45", "#3d2b1f"];
// Low-poly spacer: legs, torso, arms, head with a visor band, and an emissive
// chest stripe in the trim colour. Shared by the captain (appearance colours)
// and every actor (their roster colour), so crowds read as people, not pills.
// `seed` (>=0 for NPCs, -1 for the captain) drives a small deterministic height
// variance and a coin-flip hairstyle — otherwise a station crowd is one mold
// repeated in different paint jobs, which reads as clones even with varied
// wardrobe colour.
function addPerson(color: string, skin = "#bd8668", trim = "#9fb6d4", seed = -1): THREE.Group {
  const g = new THREE.Group();
  // slight self-glow so dark suits don't vanish into dark deck plating
  const suitM = mat(color, .14), skinM = mat(skin, .08);
  const legG = new THREE.CapsuleGeometry(.09, .3, 3, 6);
  const l1 = new THREE.Mesh(legG, suitM); l1.position.set(-.12, .34, 0); g.add(l1);
  const l2 = new THREE.Mesh(legG, suitM); l2.position.set(.12, .34, 0); g.add(l2);
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(.23, .42, 4, 10), suitM);
  torso.position.y = .92; torso.scale.set(1, .95, .72); g.add(torso);
  const armG = new THREE.CapsuleGeometry(.065, .34, 3, 6);
  const a1 = new THREE.Mesh(armG, suitM); a1.position.set(-.3, .92, 0); a1.rotation.z = .14; g.add(a1);
  const a2 = new THREE.Mesh(armG, suitM); a2.position.set(.3, .92, 0); a2.rotation.z = -.14; g.add(a2);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(.26, .045, .03), mat(trim, .85));
  stripe.position.set(0, 1.06, .155); g.add(stripe);
  const belt = new THREE.Mesh(new THREE.BoxGeometry(.34, .05, .2), mat("#141821", .05));
  belt.position.y = .64; g.add(belt);
  const head = new THREE.Mesh(new THREE.SphereGeometry(.16, 12, 10), skinM); head.position.y = 1.4; g.add(head);
  const band = new THREE.Mesh(new THREE.BoxGeometry(.2, .055, .05), mat("#0c1018", .25));
  band.position.set(0, 1.43, .12); g.add(band);
  if (seed >= 0) {
    if (seed % 2 === 0) {
      const hair = new THREE.Mesh(new THREE.SphereGeometry(.135, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), mat(HAIR3D[(seed >> 3) % HAIR3D.length], .04));
      hair.position.set(0, 1.5, -.015); g.add(hair);
    }
    g.scale.y = 0.94 + ((seed % 13) / 12) * 0.12;
  }
  return g;
}
function addMachinery(g: THREE.Group, type: string, color: string, online: boolean, damaged: boolean, worn: boolean) {
  const base = mat(worn ? "#735f52" : damaged ? "#8c2727" : color, online ? .18 : 0);
  const add = (m: THREE.Object3D, x = 0, y = 0, z = 0) => { m.position.set(x, y, z); g.add(m); };
  if (type === "weapons" || type === "armory") {
    addModelProp(g, "ship-weapons-rack", 0, -.18, 1.12, .08, 0x8c2727, .92);
    add(box(.18,.18,1.35,base),0,.72,-.72);
  }
  else if (type === "shields") {
    addModelProp(g, "ship-shield-generator", 0, 0, 1.12, 0, 0x6d7bd9, .9);
    add(new THREE.Mesh(new THREE.TorusGeometry(.72,.08,8,28),mat("#9fd7ff",online?.42:.08)),0,1.05);
  }
  else if (type === "hydro") {
    addModelProp(g, "ship-hydro-planter", 0, -.42, .78, 0, 0x42c96b, .78);
    addModelProp(g, "ship-hydro-planter", 0, .42, .78, Math.PI, 0x42c96b, .78);
    for(let i=-1;i<=1;i++) add(box(1.5,.08,.12,mat(online?"#8bf7a2":"#465448",online?.28:0)),0,.72,i*.4);
  }
  else if (type === "cargohold") { const n=Math.max(2,Math.min(8,Math.ceil(cargoUsed()/8))); for(let i=0;i<n;i++) add(box(.5,.45,.5,base),(i%3-.9)*.55,.25+Math.floor(i/3)*.45,(i%2)*.55); }
  else if (type === "reactor" || type === "engine") {
    addModelProp(g, "ship-engine-core", 0, 0, 1.45, 0, 0xe8843b, .9);
    add(new THREE.Mesh(new THREE.CylinderGeometry(.66,.66,.08,20),mat("#ffb16b",online?.35:.08)),0,1.24);
  }
  else if (type === "medbay") {
    addModelProp(g, "ship-med-bed", 0, 0, .9, Math.PI/2, 0x71d98a, .9);
    add(box(.12,.52,.12,mat("#71d98a",online?.5:0)),0,.9);
    add(box(.52,.12,.12,mat("#71d98a",online?.5:0)),0,.9);
  }
  else if (type === "quarters") {
    add(box(1.55,.25,.65,base),0,.3);
    add(box(1.55,.25,.65,base),0,.85);
    add(quartersFridge(),.98,.48,-.42);
  }
  else if (type === "fuel" || type === "fueltank") {
    addModelProp(g, "fuel-tank", -.38, 0, 1.08, 0, 0x7a5230, .68);
    addModelProp(g, "fuel-tank", .38, 0, 1.08, Math.PI, 0x7a5230, .68);
  }
  else if (type === "workshop") {
    addModelProp(g, "ship-workbench", 0, 0, .88, 0, 0x6d7580, .88);
    add(box(1.35,.08,.08,mat("#ffd17d",online?.25:.04)),0,.92,-.5);
  }
  else if (type === "smuggler") {
    addModelProp(g, "ship-smuggler-hatch", 0, 0, .42, 0, 0x6d7580, .9);
    add(box(1.5,.04,.04,mat("#a98f61",online?.22:.04)),0,.18,.62);
  }
  else if (type === "luxcabin") {
    addModelProp(g, "ship-lux-berth", 0, 0, .85, Math.PI/2, 0xe8b04b, .86);
    add(box(1.35,.06,.08,mat("#ffe0a3",online?.3:.06)),0,1.05,-.62);
  }
  else if (type === "cabin") {
    addModelProp(g, "ship-lux-berth", 0, 0, .72, Math.PI/2, 0x5a83b7, .72);
  }
  else { add(box(1.5,.65,.75,base),0,.4); }
  if (damaged) for(let i=0;i<5;i++){ const spark=new THREE.Mesh(new THREE.SphereGeometry(.025,4,3),mat("#ff6b3d",1)); spark.position.set((i-2)*.13,1+i*.08,0); spark.userData.spark=i; g.add(spark); }
}

function rebuild() {
  if (!root || !current) return;
  root.remove(world); disposeObject(world); world = new THREE.Group(); root.add(world); actorMeshes.clear();
  doorLabels = new Map(); actorLabels = new Map();
  const dark = !!current.dark;
  const isDustwell = current.id === "station:dustwell";
  const roomTextures: Record<string, THREE.Texture> = {
    general: isDustwell ? desertPlankTexture() : panelTexture(bulkheadWallUrl),
    corridor: panelTexture(corridorWallUrl, 1.5, 1),
    cockpit: panelTexture(cockpitWallUrl, 1.35, 1.1),
    combat: panelTexture(combatWallUrl, 1.35, 1.1),
    engine: panelTexture(engineCoreUrl, 1, 1),
    cargo: panelTexture(cargoWallUrl, 1.5, 1.15),
    medbay: panelTexture(medbayWallUrl, 1.5, 1.15),
    quarters: panelTexture(quartersWallUrl, 1.35, 1.1),
    hydro: panelTexture(hydroWallUrl, 1.25, 1.05),
    shield: panelTexture(shieldWallUrl, 1.15, 1),
    utility: panelTexture(utilityWallUrl, 1.55, 1),
  };
  const deck=isDustwell?sandTexture():deckTexture(dark);
  if(current.id==="ship"){const hullMat=mat("#111b29");hullMat.emissiveIntensity=.08;const hull=box(current.width*SCALE,.08,current.height*SCALE,hullMat);hull.position.set(0,-.18,0);world.add(hull);}
  // Placeholder exterior hull frame (scene.hull, built in shipwalk.ts): a keel
  // rail and a roofline rail joined by corner struts, built from thin emissive
  // beams rather than THREE.Line — hairline Line materials are capped at 1px
  // with no glow, so at a low oblique angle they read as indistinguishable
  // scribble against the room walls and door labels. Beams pick up real
  // lighting and the bloom pass, and a warm amber keeps the hull visually
  // distinct from the cool blue room dressing. Enough silhouette to judge
  // room placement against the ship's outer shape; swapped for real hull
  // geometry later.
  if (current.hull && current.hull.length > 2) {
    const hullMat = mat("#ffb463", .55);
    const beam = (a: THREE.Vector3, b: THREE.Vector3, thick = .05) => {
      const mid = a.clone().add(b).multiplyScalar(.5);
      const len = a.distanceTo(b);
      if (len < .001) return;
      const m = new THREE.Mesh(new THREE.CylinderGeometry(thick, thick, len, 6), hullMat);
      m.position.copy(mid);
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
      world.add(m);
    };
    const keel = current.hull.map((p) => new THREE.Vector3(wx(p.x), -.1, wz(p.y)));
    const roof = current.hull.map((p) => new THREE.Vector3(wx(p.x) * .94, 2.75, wz(p.y) * .94));
    for (let i = 0; i < keel.length; i++) {
      const j = (i + 1) % keel.length;
      beam(keel[i], keel[j], .022);
      beam(roof[i], roof[j], .022);
      beam(keel[i], roof[i], .018);
    }
  }
  const corridorWallMat=isDustwell?mat("#6b4a30",.05):mat(dark?"#5f6671":"#aeb7c0",dark?.1:.18);
  if(!isDustwell){corridorWallMat.map=roomTextures.corridor;corridorWallMat.transparent=true;corridorWallMat.opacity=dark?.85:.95;corridorWallMat.depthWrite=false;}
  for (const f of current.floors) {
    const w=f.w*SCALE,d=f.h*SCALE,isRoom=current.rooms.some((r)=>matchesRect(f,r));
    const fm=isRoom?mat(isDustwell?"#7a5230":dark?"#252e3e":"#466080",isDustwell?.06:dark?.05:.16):(isDustwell?mat("#8a5a34",.04):corridorFloorMat(w,d,dark));
    if(isRoom)fm.map=deck; else if(isDustwell)fm.map=sandTexture();
    const m=box(w,.12,d,fm); m.position.set(wx(f.x+f.w/2),-.08,wz(f.y+f.h/2)); world.add(m);
    if(!isRoom) addPathBorder(world,m.position.x,m.position.z,w,d,corridorWallMat);
  }
  for (const r of current.rooms) {
    const c=r.color|| (dark?"#465064":"#5a83b7"), cx=wx(r.x+r.w/2), cz=wz(r.y+r.h/2), w=r.w*SCALE,d=r.h*SCALE;
    const wallKind = r.kind === "cockpit" ? "cockpit"
      : r.kind === "engine" || r.moduleType === "reactor" ? "engine"
      : r.kind === "cargo" || r.moduleType === "cargohold" ? "cargo"
      : r.kind === "medbay" || r.moduleType === "medbay" ? "medbay"
      : r.kind === "quarters" || r.moduleType === "quarters" ? "quarters"
      : r.kind === "hydro" || r.moduleType === "hydro" ? "hydro"
      : r.moduleType === "weapons" || r.moduleType === "armory" ? "combat"
      : r.moduleType === "shields" ? "shield"
      : r.moduleType === "fueltank" || r.moduleType === "workshop" || r.moduleType === "smuggler" || r.moduleType === "cabin" || r.moduleType === "luxcabin" ? "utility"
      : "general";
    // Solid-reading walls: opacity was low enough (.68-.84) that every room
    // was see-through into whatever was behind it — a corridor's worth of
    // rooms all bleeding into frame at once read as haze, not a ship. Nearly
    // opaque still keeps the depthWrite:false blend safe at shared edges
    // without the x-ray effect.
    const wallMat=mat(isDustwell?"#d9b98a":dark?"#465365":"#8fa7bd",isDustwell?.04:dark?.08:.16);wallMat.map=roomTextures[wallKind];wallMat.transparent=true;wallMat.opacity=dark?.88:.96;wallMat.depthWrite=false;
    [[w,.18,cx,cz-d/2],[w,.18,cx,cz+d/2],[.18,d,cx-w/2,cz],[.18,d,cx+w/2,cz]].forEach(([a,b,x,z])=>{const q=box(a as number,1.85,b as number,wallMat);q.position.set(x as number,.88,z as number);world.add(q);});
    // Corner pylons mark room boundaries at a glance from the follow camera —
    // toned down from the original pass, which ran four saturated neon rods
    // per room at full room height; across several adjacent bays that read as
    // a picket fence of clashing colour instead of quiet edge-lighting.
    for(const [px,pz] of [[cx-w/2,cz-d/2],[cx+w/2,cz-d/2],[cx-w/2,cz+d/2],[cx+w/2,cz+d/2]]){const p=box(.1,1.9,.1,mat(c,.2));p.position.set(px,.95,pz);world.add(p);}
    const trim=box(Math.max(.5,w-.3),.04,.05,mat(c,.35)); trim.position.set(cx,.04,cz-d/2+.12); world.add(trim);
    const label=sprite(`${r.icon||""} ${r.label}`.trim(),c,.62); label.position.set(cx,2.72,cz); world.add(label);
    if(r.kind==="cockpit"){
      const glass=box(Math.max(1,w*.7),1.15,.04,mat("#071323",.15));glass.position.set(cx,.78,cz-d/2+.1);world.add(glass);
      const stars=new THREE.BufferGeometry(),pts:number[]=[];for(let i=0;i<45;i++)pts.push(cx-w*.3+((i*37)%97)/97*w*.6,.35+((i*53)%83)/83,.01+cz-d/2);
      stars.setAttribute("position",new THREE.Float32BufferAttribute(pts,3));const field=new THREE.Points(stars,new THREE.PointsMaterial({color:0xd8e8ff,size:.025}));field.userData.starfield=true;world.add(field);
    }
    if(r.moduleType){const g=new THREE.Group(),m=S.modules[r.moduleIndex!]; addMachinery(g,r.moduleType,c,!m?.dmg&&(m?.on!==false),!!m?.dmg,m?wearTier(m)!=="sound":false);g.position.set(cx,0,cz);world.add(g);}
    const light=new THREE.PointLight(c,dark ? .55 : 1.05,7.2);light.position.set(cx,2.6,cz);world.add(light);
  }
  if (isDustwell) spawnDesertProps(world, current);
  for (const d of current.doors) { const g=box(Math.max(.4,d.w*SCALE),.04,Math.max(.28,d.h*SCALE),mat(d.locked?"#8a3030":"#3d91df",d.locked?.15:.8));g.position.set(wx(d.x+d.w/2),.04,wz(d.y+d.h/2));world.add(g);const l=sprite(d.label,d.locked?"#d77":"#9fd7ff",.55);l.position.set(g.position.x,.75,g.position.z);world.add(l);doorLabels.set(d,l); }
  for (const a of current.actors) {
    // Not every actor is a person. Ship module bays and the captain's chair
    // are interact points standing in for furniture already drawn by
    // addMachinery/the room itself (see the `if(r.moduleType)` block above) —
    // rendering them as a wardrobe-dressed mannequin with the module's name
    // floating over its head duplicated the room's own ceiling label and left
    // every bay looking staffed by an invisible crew. They still work as
    // interact targets (walk.ts's 2D sim owns proximity/prompts); they just
    // get no 3D body of their own.
    if (a.key.startsWith("module:") || a.key === "captains-chair") continue;
    // No explicit roster colour → deal one from the wardrobe by key hash, so a
    // station concourse is a crowd of strangers instead of identical clones.
    let hv=0; for(let i=0;i<a.key.length;i++) hv=(hv*31+a.key.charCodeAt(i))|0; hv>>>=0;
    const suitC=a.color||WARDROBE[hv%WARDROBE.length], skinC=SKIN3D[(hv>>4)%SKIN3D.length];
    const g=new THREE.Group();
    const body=addPerson(suitC,skinC,a.color?"#e8d9b0":"#8fa8c9",hv);g.add(body);attachCrewModel(g,a.modelKey,body);
    const l=sprite(a.label,a.color||"#c9d2e4",.55);l.position.y=1.9;g.add(l);world.add(g);actorMeshes.set(a.key,g);actorLabels.set(a,l);
  }
}

export function mount(container: HTMLElement | null, s: WalkScene, actions: {move:(x:number,y:number)=>void;aim:(x:number,y:number)=>void;fire:()=>void}) {
  teardown(); host=container; current=s; click=actions.move;aimCallback=actions.aim;fireCallback=actions.fire; fallbackCanvas=container?.querySelector("canvas")||null;
  if(!container) return;
  try {
    renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:"high-performance"}); renderer.setPixelRatio(Math.min(devicePixelRatio,2)); renderer.outputColorSpace=THREE.SRGBColorSpace;
    renderer.domElement.className="walk3d-canvas"; container.insertBefore(renderer.domElement,container.firstChild); if(fallbackCanvas) fallbackCanvas.style.display="none";
    const isDesert = s.id === "station:dustwell";
    root=new THREE.Scene(); root.background=new THREE.Color(s.dark?0x05070b:isDesert?0xc27a48:0x0c1420); root.fog=new THREE.Fog(root.background,18,44); root.add(new THREE.HemisphereLight(s.dark?0x7384a0:isDesert?0xe8b078:0xbcdcff,isDesert?0x3a2818:0x1a2130,s.dark ? .6 : 1.7));root.add(new THREE.AmbientLight(s.dark?0x647087:isDesert?0xc98858:0x91b8df,s.dark?.35:.9));root.add(avatar,actionFx);
    if(s.dark){flashlight=new THREE.SpotLight(0xc8dcff,3.2,7,Math.PI/5,.55,1.2);flashlight.target=new THREE.Object3D();root.add(flashlight,flashlight.target);}else flashlight=null;
    camera=new THREE.PerspectiveCamera(58,1,.1,100);
    // Post-processing chain: bloom makes every emissive (drive core, LEDs,
    // module glows, the cockpit starfield) actually radiate, then the CRT pass
    // adds the tube finish. Guarded separately from the WebGL fallback above —
    // if only post-fx fails we keep plain 3D rather than dropping to 2D.
    try {
      renderer.toneMapping=THREE.ACESFilmicToneMapping; renderer.toneMappingExposure=1.95;
      composer=new EffectComposer(renderer); composer.setPixelRatio(Math.min(devicePixelRatio,2));
      composer.addPass(new RenderPass(root,camera));
      bloomPass=new UnrealBloomPass(new THREE.Vector2(1,1), s.dark?0.75:0.5, 0.55, 0.32);
      composer.addPass(bloomPass);
      crtPass=new ShaderPass(CRT_SHADER); composer.addPass(crtPass);
      composer.addPass(new OutputPass());
    } catch { composer=null; bloomPass=null; crtPass=null; renderer.toneMapping=THREE.NoToneMapping; }
    signature=""; setScene(s); resizeObserver=new ResizeObserver(resize);resizeObserver.observe(container);resize();
    const floorPoint=(e:PointerEvent)=>{if(!renderer||!camera||!current)return null;const r=renderer.domElement.getBoundingClientRect();pointer.set((e.clientX-r.left)/r.width*2-1,-((e.clientY-r.top)/r.height*2-1));ray.setFromCamera(pointer,camera);const p=new THREE.Vector3();return ray.ray.intersectPlane(ground,p)?{x:p.x/SCALE+current.width/2,y:p.z/SCALE+current.height/2}:null;};
    clickHandler=(e)=>{const p=floorPoint(e);if(!p)return;if(e.button===0)fireCallback?.();else if(e.button===2)click?.(p.x,p.y);};renderer.domElement.addEventListener("pointerdown",clickHandler);renderer.domElement.addEventListener("pointermove",(e)=>{const p=floorPoint(e);if(p)aimCallback?.(p.x,p.y);});renderer.domElement.addEventListener("contextmenu",e=>e.preventDefault());
  } catch { teardown(); if(fallbackCanvas) fallbackCanvas.style.display="block"; }
}
function resize(){if(!renderer||!camera||!host)return;const r=host.getBoundingClientRect();const w=Math.max(1,r.width),h=Math.max(1,r.height);renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();composer?.setSize(w,h);const pr=Math.min(devicePixelRatio,2);crtPass?.uniforms.resolution.value.set(w*pr,h*pr);}
export function setScene(s: WalkScene){current=s;const sig=s.id+"|"+s.rooms.map(r=>`${r.id}:${r.moduleType}:${r.moduleIndex}`).join()+"|"+s.doors.map(d=>d.label+d.locked).join()+"|"+s.actors.map(a=>a.key).join()+"|"+S.modules.map(m=>`${m.t}${m.on}${m.dmg}${wearTier(m)}`).join();if(sig!==signature){signature=sig;rebuild();}}
export function render(v:{pos:{x:number;y:number};facing:string;moving:boolean;phase:number;nearDoor:WalkDoor|null;nearActor:WalkActor|null;time:number;aim:{x:number;y:number};rolling:boolean;rollCooldown:number;projectiles:Array<{x:number;y:number}>;dummy:{x:number;y:number;hp:number;hit:number}|null}){
  if(!renderer||!root||!camera||!current)return; const x=wx(v.pos.x),z=wz(v.pos.y);avatar.position.set(x,v.moving?Math.abs(Math.sin(v.phase))*.06:0,z);
  const suit=S.appearance?.suit||"#4779bd",skin=S.appearance?.skin||"#bd8668",trim=S.appearance?.trim||"#e8b04b"; if(!avatar.children.length){const p=addPerson(suit,skin,trim);avatar.add(p);}
  avatar.rotation.z=v.rolling?-.45:0;avatar.scale.setScalar(v.rolling?.82:1);
  const ang=v.facing==="right"?Math.PI/2:v.facing==="left"?-Math.PI/2:v.facing==="up"?Math.PI:0;avatar.rotation.y=ang;
  const room=current.rooms.find(r=>v.pos.x>=r.x&&v.pos.x<=r.x+r.w&&v.pos.y>=r.y&&v.pos.y<=r.y+r.h);const shake=room?.kind==="engine"?Math.sin(v.time*.045)*.025:0;
  // Stable chase angle: avatar rotation no longer whips the camera 180° when
  // the player taps up/down. Screen-up is always deck-forward, unless the
  // right stick has orbited the camera off its default heading (nudgeCamera).
  const camAngle=CAM_BASE_ANGLE+camYaw;
  const target=new THREE.Vector3(x+Math.cos(camAngle)*CAM_BASE_DIST+shake,CAM_BASE_HEIGHT+camPitch,z+Math.sin(camAngle)*CAM_BASE_DIST);camera.position.lerp(target,.09);camera.lookAt(x,.65,z);
  if(flashlight){flashlight.position.set(x,1.25,z);flashlight.target.position.set(x+Math.sin(ang)*4,.45,z+Math.cos(ang)*4);}
  for(const a of current.actors){const g=actorMeshes.get(a.key);if(!g)continue;g.position.set(wx(a.x+a.w/2),Math.sin(v.time/700+a.x)*.025,wz(a.y+a.h/2));if(a.bubble&&!g.getObjectByName("bubble")){const b=sprite(a.bubble,"#fff",.65);b.name="bubble";b.position.y=2.55;g.add(b);}else if(!a.bubble){const b=g.getObjectByName("bubble");if(b){g.remove(b);disposeObject(b);}}}
  // A room full of nametags/door labels reads as a wall of overlapping text;
  // fade everything but whatever's actually interactable right now so the
  // player's eye has one thing to land on instead of five stacked signs.
  for(const [d,l] of doorLabels)(l.material as THREE.SpriteMaterial).opacity=d===v.nearDoor?1:LABEL_DIM;
  for(const [a,l] of actorLabels)(l.material as THREE.SpriteMaterial).opacity=a===v.nearActor?1:LABEL_DIM;
  actionFx.clear();
  const aimLine=new THREE.Mesh(new THREE.BoxGeometry(.035,.025,1.15),mat("#70d7ff",.9));aimLine.position.set(x+v.aim.x*.55,.04,z+v.aim.y*.55);aimLine.rotation.y=Math.atan2(v.aim.x,v.aim.y);actionFx.add(aimLine);
  for(const p of v.projectiles){const m=new THREE.Mesh(new THREE.SphereGeometry(.075,7,5),mat("#70d7ff",2));m.position.set(wx(p.x),.55,wz(p.y));actionFx.add(m);}
  if(v.dummy){const dm=box(.48,1,.48,mat(v.dummy.hp<=0?"#333842":v.dummy.hit>0?"#ffffff":"#d95b5b",v.dummy.hp>0?.5:0));dm.position.set(wx(v.dummy.x),.5,wz(v.dummy.y));actionFx.add(dm);const dl=sprite(v.dummy.hp>0?`TARGET ${v.dummy.hp}/5`:"TARGET DOWN",v.dummy.hp>0?"#ff9b9b":"#7d8294",.45);dl.position.set(wx(v.dummy.x),1.45,wz(v.dummy.y));actionFx.add(dl);}
  world.traverse((o:any)=>{if(o.userData.spark!==undefined){o.visible=Math.sin(v.time*.025+o.userData.spark)>0;o.position.y=1+(o.userData.spark*.12+v.time*.0004)%1;}if(o.userData.starfield&&S.travel)o.rotation.y=v.time*.00002;});
  // Wrapped, not raw elapsed ms: grain only needs a value that changes every
  // frame, and letting it climb for a whole session fed the hash below
  // ever-larger numbers for no visual benefit.
  if(composer){if(crtPass)crtPass.uniforms.time.value=(v.time*.001)%1000;composer.render();}else renderer.render(root,camera);
}
export function teardown(){resizeObserver?.disconnect();resizeObserver=null;if(renderer&&clickHandler)renderer.domElement.removeEventListener("pointerdown",clickHandler);clickHandler=null;if(root)disposeObject(root);composer?.dispose();bloomPass?.dispose();composer=null;bloomPass=null;crtPass=null;renderer?.dispose();renderer?.domElement.remove();if(fallbackCanvas)fallbackCanvas.style.display="block";renderer=null;root=null;camera=null;flashlight=null;current=null;host=null;fallbackCanvas=null;signature="";world=new THREE.Group();avatar=new THREE.Group();actionFx=new THREE.Group();actorMeshes.clear();doorLabels=new Map();actorLabels=new Map();aimCallback=null;fireCallback=null;camYaw=0;camPitch=0;}
