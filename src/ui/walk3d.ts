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
import { fork } from "../rng";
import { MODS } from "../content";
import { cargoUsed } from "../derive";
import { wearTier } from "../systems/wear";
import type { WalkActor, WalkDoor, WalkScene, ShipBerth } from "./walk";
import { spawnProp } from "./props3d";
import { buildCharacter, poseCharacter, type CharacterRig } from "./character3d";
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
let world = new THREE.Group();
let avatar = new THREE.Group();
let actorMeshes = new Map<string, THREE.Group>();
let actorRigs = new Map<string, CharacterRig>();
let captainRig: CharacterRig | null = null;
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
    // Reported (twice, on real hardware — never reproduced against the
    // SwiftShader software renderer used for local testing) as a loud,
    // screen-covering, moving static/noise pattern, even after fixing a
    // real sin()-precision bug in hash() and adding anisotropic filtering
    // to the tiled textures it could've been aliasing with. Rather than
    // keep guessing at a per-GPU rendering quirk we can't see locally,
    // grain is off by default; the hash/mix code is left in place in case
    // it's worth re-enabling at a much gentler value with real feedback.
    grain: { value: 0 },
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

// Fixed semi-top-down follow camera. It sits due "south" of the avatar
// (+z, the direction game-y grows) and looks down at ~68°, so screen-up is
// exactly world-up on the deck plan and input needs no camera transform.
// Steep enough that room walls rarely sit between camera and avatar (Dustwell
// walls are opaque), shallow enough that people still read as figures, not
// dots. There is deliberately no orbit: one authored angle, everywhere — the
// whole camera-relative-movement bug class (see a56feda) dies with it.
// Three-quarter action-RPG angle (~33° down from horizontal) with a normal
// lens: the original long-lens near-top-down setup (15.5 height / 6.5 offset
// / 30° FOV) kept walls perfectly vertical on screen, but read as too narrow,
// too zoomed out, and too top-down to place rooms or read the avatar against.
// Movement has no camera-relative transform (screen axes ARE world axes —
// see a56feda), so the camera must stay directly behind the avatar in Z with
// no diagonal/X offset, or WASD would stop matching what's on screen; all the
// tuning room is in height, distance, and FOV. CAM_HEIGHT still comfortably
// clears Dustwell's opaque waist-high walls.
const CAM_OFFSET_Z = 6.2;
const CAM_HEIGHT = 4.5;
const CAM_FOV = 56;

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
  const r = fork("tex:plank");
  for (let i = 0; i < 500; i++) { x.fillStyle = `rgba(20,10,5,${r() * .12})`; x.fillRect(r() * 256, r() * 256, 2, 2); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(2.2, 1.5); t.anisotropy = maxAniso(); return t;
}
function sandTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas"); c.width = 256; c.height = 256; const x = c.getContext("2d")!;
  // Lighter, warmer packed sand — the old value sat too close to the plank
  // walls, so from top-down floor and fence read as one brown mass. This lifts
  // the ground a full value above the walls so rooms read as bounded spaces.
  x.fillStyle = "#c19064"; x.fillRect(0, 0, 256, 256);
  const r = fork("tex:sand");
  for (let i = 0; i < 3000; i++) { x.fillStyle = r() < .5 ? "rgba(60,34,16,.09)" : "rgba(240,200,150,.12)"; x.fillRect(r() * 256, r() * 256, 2, 2); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(6, 4); t.anisotropy = maxAniso(); return t;
}
// The Meshy-generated desert props, scattered across the open plaza (game-space
// coords) clear of the buildings and the central ship pad, so the square reads
// as a lived-in frontier town. Heights kept ≤2.6m for the top-down camera.
function spawnDesertProps(g: THREE.Group, _scene: WalkScene) {
  const place = (name: string, gx: number, gy: number, h: number, rotY = 0, color = 0x8a6a4a) =>
    spawnProp(g, { name, x: wx(gx), z: wz(gy), rotY, placeholderRadius: h * .3, placeholderHeight: h, placeholderColor: color });

  // landmarks anchoring the upper square, off-centre so they don't block the gate
  place("water-tower", 420, 255, 2.5, 0.3);
  place("windmill-turbine", 600, 245, 2.6, -0.5);
  place("satellite-dish", 660, 250, 1.1, -0.3);
  // frontage clutter by the shops
  place("cargo-crate", 350, 470, 0.6, 0.6);
  place("barrel-stack", 330, 545, 0.75);
  place("cargo-crate", 470, 300, 0.6, -0.4);
  // the east-side ship dock: beacons + fuel flanking the hatch approach
  place("beacon-lamp", 672, 478, 1.15);
  place("beacon-lamp", 672, 612, 1.15);
  place("fuel-tank", 640, 545, 1.15);
  place("mooring-post", 700, 455, 0.9);
}

// Open-ground rendering: the perimeter town wall (with a gate gap), the
// The player's ship, on display in this port (THE RULE — see ShipBerth). Built
// nose-up (toward -z) then rotated to the berth facing, so the rear hatch — the
// warm lit doorway with the boarding ramp — always lands on the side shipHatch()
// put the board door. A dock pad + gantry posts frame it as a berth.
function renderShip(g: THREE.Group, b: ShipBerth, dark: boolean) {
  const along = (b.facing === "up" || b.facing === "down") ? b.h : b.w; // nose-axis length
  const across = (b.facing === "up" || b.facing === "down") ? b.w : b.h; // beam
  const L = along * SCALE, W = across * SCALE, rear = L * 0.36;
  const ship = new THREE.Group();
  // dock: pad + four gantry posts
  const pad = box(W + .4, .06, L + .4, mat(dark ? "#4a4234" : "#7a6650", .05)); pad.position.y = -.02; ship.add(pad);
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const p = box(.13, 1.7, .13, mat("#5a3d26", .05)); p.position.set(sx * (W / 2 + .14), .85, sz * (L / 2 + .14)); ship.add(p); }
  // hull, dorsal spine (lit so it reads from top-down), tapered nose, canopy
  const hull = box(W * .72, .55, L * .74, mat(dark ? "#2b3340" : "#47566a", dark ? .04 : .09)); hull.position.y = .3; ship.add(hull);
  const spine = box(W * .44, .1, L * .62, mat(dark ? "#3a4658" : "#63768e", dark ? .05 : .13)); spine.position.y = .6; ship.add(spine);
  const nose = box(W * .4, .42, L * .26, mat(dark ? "#333c4a" : "#3e4b5c", .06)); nose.position.set(0, .28, -L * .35); ship.add(nose);
  const canopy = box(W * .26, .12, L * .13, mat("#0a2b3a", .22)); canopy.position.set(0, .64, -L * .24); ship.add(canopy);
  // engine nacelles on the flanks (soft glow), aft of the beam
  for (const sx of [-1, 1]) {
    const nac = box(.14, .18, L * .3, mat(dark ? "#2a3038" : "#3a4450", .05)); nac.position.set(sx * W * .42, .28, L * .12); ship.add(nac);
    if (!dark) { const e = new THREE.PointLight(0xff9b4a, .6, 2.4); e.position.set(sx * W * .42, .28, L * .28); ship.add(e); }
  }
  // REAR HATCH: the way in. A lit doorway on the back + a ramp onto the ground.
  const frame = box(W * .32, .52, .1, mat(dark ? "#3a2c1c" : "#8a6236", .06)); frame.position.set(0, .3, rear); ship.add(frame);
  const glow = box(W * .24, .38, .05, mat("#ffca8a", dark ? .18 : .7)); glow.position.set(0, .26, rear + .03); ship.add(glow);
  const ramp = box(W * .26, .03, .55, mat(dark ? "#3a2c1c" : "#54402c", .05)); ramp.position.set(0, -.02, rear + .32); ship.add(ramp);
  if (!dark) { const spill = new THREE.PointLight(0xffca8a, .7, 3); spill.position.set(0, .5, rear + .3); ship.add(spill); }
  ship.rotation.y = b.facing === "up" ? 0 : b.facing === "down" ? Math.PI : b.facing === "left" ? Math.PI / 2 : -Math.PI / 2;
  ship.position.set(wx(b.x + b.w / 2), 0, wz(b.y + b.h / 2));
  g.add(ship);
}

// freestanding service buildings, and the ship on its pad. Called instead of
// the per-room wall loop when scene.openGround is set (planet towns).
function renderOpenGround(g: THREE.Group, scene: WalkScene, dark: boolean) {
  // Plaza bounds = bounding box of the walkable floor.
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const f of scene.floors) { minX = Math.min(minX, f.x); minY = Math.min(minY, f.y); maxX = Math.max(maxX, f.x + f.w); maxY = Math.max(maxY, f.y + f.h); }
  const left = wx(minX), right = wx(maxX), top = wz(minY), bot = wz(maxY);
  const Ww = right - left, Dw = bot - top, cxw = (left + right) / 2, czw = (top + bot) / 2;
  const wallH = 1.85, t = 0.24;
  const wallMat = mat(dark ? "#4a3a2c" : "#9c7048", dark ? 0 : .05);
  const seg = (cx: number, cz: number, w: number, d: number, h = wallH) => { const q = box(w, h, d, wallMat); q.position.set(cx, h / 2 - .04, cz); g.add(q); };
  // Gate gap in the top (north) wall — the road out of town.
  const gx0 = wx(430), gx1 = wx(570);
  seg((left + gx0) / 2, top, gx0 - left, t);
  seg((gx1 + right) / 2, top, right - gx1, t);
  seg(cxw, bot, Ww, t);          // south wall
  seg(left, czw, t, Dw);         // west wall
  seg(right, czw, t, Dw);        // east wall
  // Gate posts flanking the opening.
  for (const gp of [gx0, gx1]) { const p = box(.28, 2.4, .28, mat("#5a3d26", .05)); p.position.set(gp, 1.2, top); g.add(p); }

  // Buildings (solids): plank walls, a warm lit roof, a sign, and a porch light.
  for (const o of scene.obstacles || []) {
    const bx = wx(o.x + o.w / 2), bz = wz(o.y + o.h / 2), bw = o.w * SCALE, bd = o.h * SCALE;
    const bh = o.tall ? 2.2 : 1.0;
    const col = o.color || "#c9a15a";
    const bmat = mat(dark ? "#4a3524" : "#b07f4f", dark ? 0 : .05);
    [[bw, t, bx, bz - bd / 2], [bw, t, bx, bz + bd / 2], [t, bd, bx - bw / 2, bz], [t, bd, bx + bw / 2, bz]].forEach(([w, d, x, z]) => { const q = box(w as number, bh, d as number, bmat); q.position.set(x as number, bh / 2 - .04, z as number); g.add(q); });
    // The top-down camera mostly sees roofs, so they're lit and warm (weathered
    // corrugated tin) rather than a dark lid — otherwise buildings read as holes.
    const roof = box(bw + .12, .16, bd + .12, mat(dark ? "#3a2c1c" : "#b98a52", dark ? 0 : .08)); roof.position.set(bx, bh, bz); g.add(roof);
    const ridge = box(bw + .14, .05, .12, mat(dark ? "#2a2014" : "#8a6236", .04)); ridge.position.set(bx, bh + .1, bz); g.add(ridge);
    const lab = sprite(`${o.icon || ""} ${o.label || ""}`.trim(), col, .6); lab.position.set(bx, bh + .6, bz); g.add(lab);
    if (!dark) { const porch = new THREE.PointLight(0xffca92, 1.0, 7); porch.position.set(bx, bh + .3, bz + bd / 2 + .3); g.add(porch); }
  }
  // Fill lights so the open square reads under the top-down camera — the plaza
  // lost its per-room lights, so a couple of broad warm lamps stand in for the
  // sun bouncing off the sand.
  for (const [fx, fz] of [[cxw, czw], [(left + cxw) / 2, (top + czw) / 2], [(right + cxw) / 2, (bot + czw) / 2]]) {
    const fill = new THREE.PointLight(dark ? 0x4a5a72 : 0xffdca6, dark ? .3 : 1.0, Math.max(Ww, Dw) * .9);
    fill.position.set(fx, 5.5, fz); g.add(fill);
  }
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
// One shared articulated figure (ui/character3d.ts) for the captain and every
// actor: the captain gets their picked Appearance verbatim, NPCs get a derived
// appearance from their roster/wardrobe colour plus seed-driven frame, height,
// and hair variance so a crowd doesn't read as one repeated mold.
function addPerson(color: string, skin = "#bd8668", trim = "#9fb6d4", seed = -1): CharacterRig {
  const frame = seed < 0 ? "neutral" : (["neutral", "masculine", "feminine"] as const)[seed % 3];
  return buildCharacter({ head: "human", garb: "jumpsuit", frame, skin, suit: color, trim }, seed);
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
  root.remove(world); disposeObject(world); world = new THREE.Group(); root.add(world); actorMeshes.clear(); actorRigs.clear();
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
    const w=f.w*SCALE,d=f.h*SCALE;
    // Open ground (a town plaza): the whole floor is packed sand — no room
    // tint, no corridor path-borders. Buildings and the wall come after.
    if(current.openGround){const fm=mat("#b5895a",.06);fm.map=sandTexture();const m=box(w,.12,d,fm);m.position.set(wx(f.x+f.w/2),-.08,wz(f.y+f.h/2));world.add(m);continue;}
    const isRoom=current.rooms.some((r)=>matchesRect(f,r));
    const fm=isRoom?mat(isDustwell?"#a9764a":dark?"#252e3e":"#466080",isDustwell?.08:dark?.05:.16):(isDustwell?mat("#b5895a",.06):corridorFloorMat(w,d,dark));
    if(isRoom)fm.map=deck; else if(isDustwell)fm.map=sandTexture();
    const m=box(w,.12,d,fm); m.position.set(wx(f.x+f.w/2),-.08,wz(f.y+f.h/2)); world.add(m);
    if(!isRoom) addPathBorder(world,m.position.x,m.position.z,w,d,corridorWallMat);
  }
  if(current.openGround) renderOpenGround(world, current, dark);
  else for (const r of current.rooms) {
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
    // Solid-reading walls: ship/station opacity was low enough (.68-.84) that
    // every room was see-through into whatever was behind it — a corridor's
    // worth of rooms all bleeding into frame at once read as haze, not a
    // ship. Nearly opaque still keeps the depthWrite:false blend safe at
    // shared edges without the x-ray effect. Dustwell keeps its original,
    // more transparent value — it's tuned separately for the open plaza.
    const wallMat=mat(isDustwell?"#d9b98a":dark?"#465365":"#8fa7bd",isDustwell?.04:dark?.08:.16);wallMat.map=roomTextures[wallKind];wallMat.transparent=true;wallMat.opacity=isDustwell?(dark?.68:.84):(dark?.88:.96);wallMat.depthWrite=false;
    // Dustwell's plank walls stay waist-high — the fixed top-down camera must
    // see over an outdoor town's fences, where a station's bulkheads can rise.
    const wallH=isDustwell?1.05:1.85;
    [[w,.18,cx,cz-d/2],[w,.18,cx,cz+d/2],[.18,d,cx-w/2,cz],[.18,d,cx+w/2,cz]].forEach(([a,b,x,z])=>{const q=box(a as number,wallH,b as number,wallMat);q.position.set(x as number,wallH/2-.04,z as number);world.add(q);});
    // Corner posts mark room boundaries. Ships get quiet illuminated pylons —
    // toned down from the original pass, which ran four saturated neon rods
    // per room at full room height; across several adjacent bays that read as
    // a picket fence of clashing colour instead of quiet edge-lighting.
    // Dustwell gets squat weathered fence posts (no glow) that suit an
    // outdoor frontier town and don't tower over the waist-high plank walls.
    const pylonH=isDustwell?1.25:1.9, pylonMat=isDustwell?mat("#5a3d26",.04):mat(c,.2), pylonW=isDustwell?.13:.1;
    for(const [px,pz] of [[cx-w/2,cz-d/2],[cx+w/2,cz-d/2],[cx-w/2,cz+d/2],[cx+w/2,cz+d/2]]){const p=box(pylonW,pylonH,pylonW,pylonMat);p.position.set(px,pylonH/2,pz);world.add(p);}
    const trim=box(Math.max(.5,w-.3),.04,.05,mat(c,isDustwell?.45:.35)); trim.position.set(cx,.04,cz-d/2+.12); world.add(trim);
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
  // THE RULE: the player's ship is on display wherever it's berthed.
  if (current.ship) renderShip(world, current.ship, dark);
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
    const rig=addPerson(suitC,skinC,a.color?"#e8d9b0":"#8fa8c9",hv);g.add(rig.group);attachCrewModel(g,a.modelKey,rig.group);
    actorRigs.set(a.key,rig);
    const l=sprite(a.label,a.color||"#c9d2e4",.55);l.position.y=1.9;g.add(l);world.add(g);actorMeshes.set(a.key,g);actorLabels.set(a,l);
  }
}

export function mount(container: HTMLElement | null, s: WalkScene, actions: {move:(x:number,y:number)=>void;aim:(x:number,y:number)=>void;fire:()=>void}) {
  teardown(); host=container; current=s; click=actions.move;aimCallback=actions.aim;fireCallback=actions.fire;
  if(!container) return;
  try {
    // Cap pixel ratio at 1.5 (not full device 2-3x): the bloom mip chain + CRT
    // pass are fragment-heavy, so a HiDPI 2x buffer roughly quadruples GPU work
    // for a difference the CRT filter already softens away. 1.5 is the sweet
    // spot between crisp and cheap.
    renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:"high-performance"}); renderer.setPixelRatio(Math.min(devicePixelRatio,1.5)); renderer.outputColorSpace=THREE.SRGBColorSpace;
    renderer.domElement.className="walk3d-canvas"; container.insertBefore(renderer.domElement,container.firstChild);
    const isDesert = s.id === "station:dustwell";
    root=new THREE.Scene(); root.background=new THREE.Color(s.dark?0x05070b:isDesert?0xc98a54:0x0c1420); root.fog=new THREE.Fog(root.background,34,85); root.add(new THREE.HemisphereLight(s.dark?0x7384a0:isDesert?0xf0ca96:0xbcdcff,isDesert?0x5a3f28:0x1a2130,s.dark ? .6 : isDesert ? 1.5 : 1.7));root.add(new THREE.AmbientLight(s.dark?0x647087:isDesert?0xd0a878:0x91b8df,s.dark?.35:isDesert?.95:.9));root.add(avatar,actionFx);
    // Desert sun: a warm high directional gives the open town form and lifts
    // the buildings — the plaza has no per-room lights, so this and the fill
    // light in renderOpenGround do the lifting. Kept modest so bloom doesn't
    // blow out the bright sand.
    if(isDesert){const sun=new THREE.DirectionalLight(0xffe6bc,.85);sun.position.set(-6,12,4);root.add(sun);}
    if(s.dark){flashlight=new THREE.SpotLight(0xc8dcff,3.2,7,Math.PI/5,.55,1.2);flashlight.target=new THREE.Object3D();root.add(flashlight,flashlight.target);}else flashlight=null;
    camera=new THREE.PerspectiveCamera(CAM_FOV,1,.1,100);
    // Post-processing chain: bloom makes every emissive (drive core, LEDs,
    // module glows, the cockpit starfield) actually radiate, then the CRT pass
    // adds the tube finish. Guarded separately from the WebGL fallback above —
    // if only post-fx fails we keep plain 3D rather than dropping to 2D.
    try {
      // Lower exposure for the desert: its sunlit sand is far brighter than a
      // dim ship interior, so the same 1.95 blows the highlights to white.
      renderer.toneMapping=THREE.ACESFilmicToneMapping; renderer.toneMappingExposure=isDesert?1.35:1.95;
      composer=new EffectComposer(renderer); composer.setPixelRatio(Math.min(devicePixelRatio,1.5));
      composer.addPass(new RenderPass(root,camera));
      // Gentle bloom in daylight — the desert has no emissives to make radiate,
      // so a strong threshold would just haze the whole bright scene.
      bloomPass=new UnrealBloomPass(new THREE.Vector2(1,1), s.dark?0.75:isDesert?0.22:0.5, 0.55, isDesert?0.5:0.32);
      composer.addPass(bloomPass);
      crtPass=new ShaderPass(CRT_SHADER); composer.addPass(crtPass);
      composer.addPass(new OutputPass());
    } catch { composer=null; bloomPass=null; crtPass=null; renderer.toneMapping=THREE.NoToneMapping; }
    signature=""; setScene(s); resizeObserver=new ResizeObserver(resize);resizeObserver.observe(container);resize();
    const floorPoint=(e:PointerEvent)=>{if(!renderer||!camera||!current)return null;const r=renderer.domElement.getBoundingClientRect();pointer.set((e.clientX-r.left)/r.width*2-1,-((e.clientY-r.top)/r.height*2-1));ray.setFromCamera(pointer,camera);const p=new THREE.Vector3();return ray.ray.intersectPlane(ground,p)?{x:p.x/SCALE+current.width/2,y:p.z/SCALE+current.height/2}:null;};
    // Deck mode: left-click walks there. Action mode: left-click fires,
    // right-click walks (Hades convention). Right-click walks in both.
    clickHandler=(e)=>{const p=floorPoint(e);if(!p)return;if(e.button===0){if(current?.action)fireCallback?.();else click?.(p.x,p.y);}else if(e.button===2)click?.(p.x,p.y);};renderer.domElement.addEventListener("pointerdown",clickHandler);renderer.domElement.addEventListener("pointermove",(e)=>{if(!current?.action)return;const p=floorPoint(e);if(p)aimCallback?.(p.x,p.y);});renderer.domElement.addEventListener("contextmenu",e=>e.preventDefault());
  } catch {
    // WebGL is required (the 2D canvas fallback was removed in the beta
    // foundations pass). Leave a plain notice instead of a dead viewport.
    teardown();
    if (container && !container.querySelector(".walk3d-unavailable")) {
      const note = document.createElement("div");
      note.className = "walk3d-unavailable";
      note.textContent = "3D VIEW UNAVAILABLE — this game needs WebGL.";
      note.style.cssText = "padding:24px;color:#a25b5b;font:12px Consolas,monospace;text-align:center;";
      container.appendChild(note);
    }
  }
}
function resize(){if(!renderer||!camera||!host)return;const r=host.getBoundingClientRect();const w=Math.max(1,r.width),h=Math.max(1,r.height);renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();composer?.setSize(w,h);const pr=Math.min(devicePixelRatio,1.5);crtPass?.uniforms.resolution.value.set(w*pr,h*pr);}
export function setScene(s: WalkScene){current=s;const sig=s.id+"|"+s.rooms.map(r=>`${r.id}:${r.moduleType}:${r.moduleIndex}`).join()+"|"+s.doors.map(d=>d.label+d.locked).join()+"|"+s.actors.map(a=>a.key).join()+"|"+(s.ship?`${s.ship.x},${s.ship.y},${s.ship.facing}`:"")+"|"+S.modules.map(m=>`${m.t}${m.on}${m.dmg}${wearTier(m)}`).join();if(sig!==signature){signature=sig;rebuild();}}
export function render(v:{pos:{x:number;y:number};facing:string;moving:boolean;phase:number;nearDoor:WalkDoor|null;nearActor:WalkActor|null;time:number;aim:{x:number;y:number};rolling:boolean;rollCooldown:number;projectiles:Array<{x:number;y:number}>;dummy:{x:number;y:number;hp:number;hit:number}|null;highlightKey:string|null}){
  if(!renderer||!root||!camera||!current)return; const x=wx(v.pos.x),z=wz(v.pos.y);avatar.position.set(x,0,z);
  if(!avatar.children.length){captainRig=buildCharacter(S.appearance||undefined);avatar.add(captainRig.group);}
  // procedural walk cycle: limbs swing from their joint pivots, driven by the
  // 2D sim's phase so animation speed always matches actual ground speed
  if(captainRig)poseCharacter(captainRig,{moving:v.moving,phase:v.phase*1.6,t:v.time});
  for(const a of current.actors){const r=actorRigs.get(a.key);if(r)poseCharacter(r,{t:v.time+(a.x*131)%997});}
  avatar.rotation.z=v.rolling?-.45:0;avatar.scale.setScalar(v.rolling?.82:1);
  const ang=v.facing==="right"?Math.PI/2:v.facing==="left"?-Math.PI/2:v.facing==="up"?Math.PI:0;avatar.rotation.y=ang;
  const room=current.rooms.find(r=>v.pos.x>=r.x&&v.pos.x<=r.x+r.w&&v.pos.y>=r.y&&v.pos.y<=r.y+r.h);const shake=room?.kind==="engine"?Math.sin(v.time*.045)*.025:0;
  const target=new THREE.Vector3(x+shake,CAM_HEIGHT,z+CAM_OFFSET_Z);camera.position.lerp(target,.09);camera.lookAt(x,.45,z);
  if(flashlight){flashlight.position.set(x,1.25,z);flashlight.target.position.set(x+Math.sin(ang)*4,.45,z+Math.cos(ang)*4);}
  for(const a of current.actors){const g=actorMeshes.get(a.key);if(!g)continue;g.position.set(wx(a.x+a.w/2),0,wz(a.y+a.h/2));if(a.bubble&&!g.getObjectByName("bubble")){const b=sprite(a.bubble,"#fff",.65);b.name="bubble";b.position.y=2.55;g.add(b);}else if(!a.bubble){const b=g.getObjectByName("bubble");if(b){g.remove(b);disposeObject(b);}}}
  // A room full of nametags/door labels reads as a wall of overlapping text;
  // fade everything but whatever's actually interactable right now so the
  // player's eye has one thing to land on instead of five stacked signs.
  for(const [d,l] of doorLabels)(l.material as THREE.SpriteMaterial).opacity=d===v.nearDoor?1:LABEL_DIM;
  // Roster-panel highlight (setHighlight): that actor's nametag stays lit and
  // pulses so the player can find them in a crowd from the crew list.
  for(const [a,l] of actorLabels){const hl=a.key===v.highlightKey;(l.material as THREE.SpriteMaterial).opacity=a===v.nearActor||hl?1:LABEL_DIM;const g=actorMeshes.get(a.key);if(g)g.scale.setScalar(hl?1+Math.sin(v.time/140)*.06:1);}
  actionFx.clear();
  if(current.action){const aimLine=new THREE.Mesh(new THREE.BoxGeometry(.035,.025,1.15),mat("#70d7ff",.9));aimLine.position.set(x+v.aim.x*.55,.04,z+v.aim.y*.55);aimLine.rotation.y=Math.atan2(v.aim.x,v.aim.y);actionFx.add(aimLine);}
  for(const p of v.projectiles){const m=new THREE.Mesh(new THREE.SphereGeometry(.075,7,5),mat("#70d7ff",2));m.position.set(wx(p.x),.55,wz(p.y));actionFx.add(m);}
  if(v.dummy){const dm=box(.48,1,.48,mat(v.dummy.hp<=0?"#333842":v.dummy.hit>0?"#ffffff":"#d95b5b",v.dummy.hp>0?.5:0));dm.position.set(wx(v.dummy.x),.5,wz(v.dummy.y));actionFx.add(dm);const dl=sprite(v.dummy.hp>0?`TARGET ${v.dummy.hp}/5`:"TARGET DOWN",v.dummy.hp>0?"#ff9b9b":"#7d8294",.45);dl.position.set(wx(v.dummy.x),1.45,wz(v.dummy.y));actionFx.add(dl);}
  world.traverse((o:any)=>{if(o.userData.spark!==undefined){o.visible=Math.sin(v.time*.025+o.userData.spark)>0;o.position.y=1+(o.userData.spark*.12+v.time*.0004)%1;}if(o.userData.starfield&&S.travel)o.rotation.y=v.time*.00002;});
  // Wrapped, not raw elapsed ms: grain only needs a value that changes every
  // frame, and letting it climb for a whole session fed the hash below
  // ever-larger numbers for no visual benefit.
  if(composer){if(crtPass)crtPass.uniforms.time.value=(v.time*.001)%1000;composer.render();}else renderer.render(root,camera);
}
export function teardown(){resizeObserver?.disconnect();resizeObserver=null;if(renderer&&clickHandler)renderer.domElement.removeEventListener("pointerdown",clickHandler);clickHandler=null;if(root)disposeObject(root);composer?.dispose();bloomPass?.dispose();composer=null;bloomPass=null;crtPass=null;renderer?.dispose();renderer?.domElement.remove();renderer=null;root=null;camera=null;flashlight=null;current=null;host=null;signature="";world=new THREE.Group();avatar=new THREE.Group();actionFx=new THREE.Group();actorMeshes.clear();actorRigs.clear();captainRig=null;doorLabels=new Map();actorLabels=new Map();aimCallback=null;fireCallback=null;}
