// Placement + loading for the Meshy-generated props. Each entry maps to a GLB
// dropped at src/assets/models/<name>.glb by scripts/meshy/generate-batch.mjs.
// Until that file exists (still generating, or generation failed), a procedural
// placeholder stands in so the level is always inspectable.
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

export interface PropPlacement {
  name: string;
  x: number;
  z: number;
  rotY?: number;
  scale?: number;
  // Rough placeholder footprint while the real model isn't downloaded yet.
  placeholderRadius: number;
  placeholderHeight: number;
  placeholderColor: number;
}

export const SPACEPORT_PROPS: PropPlacement[] = [
  { name: "water-tower",      x: -18, z: -10, rotY: 0.3,  scale: 1.0, placeholderRadius: 1.6, placeholderHeight: 6.5, placeholderColor: 0x8a6a4a },
  { name: "cargo-crate",      x: 10,  z: 6,   rotY: 0.2,  scale: 1.0, placeholderRadius: 0.9, placeholderHeight: 1.2, placeholderColor: 0x9c7a45 },
  { name: "cargo-crate",      x: 11.6,z: 7.4, rotY: -0.6, scale: 0.9, placeholderRadius: 0.9, placeholderHeight: 1.2, placeholderColor: 0x9c7a45 },
  { name: "satellite-dish",   x: -8,  z: -16, rotY: -0.4, scale: 1.0, placeholderRadius: 1.2, placeholderHeight: 3.2, placeholderColor: 0x6d7580 },
  { name: "fuel-tank",        x: -20, z: 4,   rotY: 0,    scale: 1.0, placeholderRadius: 1.4, placeholderHeight: 3.6, placeholderColor: 0x7a5230 },
  { name: "fuel-tank",        x: -22.6,z: 6.2,rotY: 0.5,  scale: 0.85,placeholderRadius: 1.4, placeholderHeight: 3.6, placeholderColor: 0x7a5230 },
  { name: "mooring-post",     x: 6,   z: -8,  rotY: 0,    scale: 1.0, placeholderRadius: 0.4, placeholderHeight: 2.4, placeholderColor: 0x4a3524 },
  { name: "mooring-post",     x: -6,  z: -8,  rotY: 0,    scale: 1.0, placeholderRadius: 0.4, placeholderHeight: 2.4, placeholderColor: 0x4a3524 },
  { name: "cargo-hauler",     x: 16,  z: -6,  rotY: 2.4,  scale: 1.0, placeholderRadius: 2.2, placeholderHeight: 1.8, placeholderColor: 0x5c4632 },
  { name: "windmill-turbine", x: -26, z: -18, rotY: 0.8,  scale: 1.0, placeholderRadius: 1.0, placeholderHeight: 8.5, placeholderColor: 0x8a7a5a },
  { name: "barrel-stack",     x: 14,  z: 10,  rotY: 0.4,  scale: 1.0, placeholderRadius: 0.8, placeholderHeight: 1.4, placeholderColor: 0x54402c },
  { name: "beacon-lamp",      x: 9,   z: 9,   rotY: 0,    scale: 1.0, placeholderRadius: 0.35,placeholderHeight: 3.4, placeholderColor: 0x2c2620 },
  { name: "beacon-lamp",      x: -9,  z: 9,   rotY: 0,    scale: 1.0, placeholderRadius: 0.35,placeholderHeight: 3.4, placeholderColor: 0x2c2620 },
  { name: "beacon-lamp",      x: 0,   z: 15,  rotY: 0,    scale: 1.0, placeholderRadius: 0.35,placeholderHeight: 3.4, placeholderColor: 0x2c2620 },
  { name: "cargo-shuttle",    x: 0,   z: -2,  rotY: 3.14, scale: 1.0, placeholderRadius: 3.2, placeholderHeight: 2.6, placeholderColor: 0x6a5a48 },
  { name: "job-board",        x: 4,   z: 11,  rotY: -0.5, scale: 1.0, placeholderRadius: 0.5, placeholderHeight: 2.8, placeholderColor: 0x3a2a24 },
];

const loader = new GLTFLoader();
const propModelUrls = import.meta.glob<string>(
  [
    "../assets/models/barrel-stack.glb",
    "../assets/models/beacon-lamp.glb",
    "../assets/models/cargo-crate.glb",
    "../assets/models/cargo-hauler.glb",
    "../assets/models/cargo-shuttle.glb",
    "../assets/models/fuel-tank.glb",
    "../assets/models/job-board.glb",
    "../assets/models/mooring-post.glb",
    "../assets/models/satellite-dish.glb",
    "../assets/models/water-tower.glb",
    "../assets/models/windmill-turbine.glb",
    "../assets/models/ship-*.glb",
  ],
  { query: "?url", import: "default" },
);
const gltfCache = new Map<string, Promise<THREE.Group | null>>();

function placeholderMesh(p: PropPlacement): THREE.Group {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: p.placeholderColor, roughness: 0.85, metalness: 0.15, wireframe: false, transparent: true, opacity: 0.55 });
  const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(p.placeholderRadius * 0.6, p.placeholderHeight * 0.7, 4, 8), mat);
  mesh.position.y = p.placeholderHeight / 2;
  mesh.castShadow = true;
  g.add(mesh);
  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.CylinderGeometry(p.placeholderRadius, p.placeholderRadius, p.placeholderHeight, 8)),
    new THREE.LineBasicMaterial({ color: 0xffb464, transparent: true, opacity: 0.4 })
  );
  edges.position.y = p.placeholderHeight / 2;
  g.add(edges);
  g.userData.isPlaceholder = true;
  return g;
}

async function loadGltf(name: string): Promise<THREE.Group | null> {
  if (!gltfCache.has(name)) {
    const urlLoader = propModelUrls[`../assets/models/${name}.glb`];
    gltfCache.set(
      name,
      (urlLoader ? urlLoader() : Promise.resolve(null))
        .then((url) => url ? loader.loadAsync(url) : null)
        .then((gltf) => {
          if (!gltf) return null;
          gltf.scene.traverse((o) => {
            if (o instanceof THREE.Mesh) {
              o.castShadow = true;
              o.receiveShadow = true;
            }
          });
          return gltf.scene;
        })
        .catch(() => null)
    );
  }
  return gltfCache.get(name)!;
}

// Normalizes a loaded model's footprint to roughly match the placeholder it
// replaces, since Meshy output scale varies a lot per generation.
function fitToHeight(model: THREE.Object3D, targetHeight: number) {
  const box = new THREE.Box3().setFromObject(model);
  const size = new THREE.Vector3();
  box.getSize(size);
  if (size.y > 0.0001) {
    const s = targetHeight / size.y;
    model.scale.multiplyScalar(s);
  }
  const box2 = new THREE.Box3().setFromObject(model);
  model.position.y -= box2.min.y;
}

// Meshy bakes illegible glyphs into any in-mesh "text" (a known limitation of
// text-to-3D generation), so the job-board's screen labels are rendered as
// crisp canvas-texture decals mounted just proud of the model's front face
// instead of relying on the generated texture.
function screenLabelTexture(text: string, accent: string): THREE.CanvasTexture {
  const w = 256, h = 128;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#160c08";
  ctx.fillRect(0, 0, w, h);
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, "rgba(255,150,60,0.18)");
  grad.addColorStop(1, "rgba(255,90,40,0.05)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = accent;
  ctx.lineWidth = 6;
  ctx.strokeRect(3, 3, w - 6, h - 6);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  let size = 46;
  const maxTextWidth = w - 40;
  do {
    ctx.font = `bold ${size}px 'Courier New', monospace`;
    size -= 2;
  } while (ctx.measureText(text).width > maxTextWidth && size > 14);
  ctx.shadowColor = accent;
  ctx.shadowBlur = 18;
  ctx.fillStyle = accent;
  ctx.fillText(text, w / 2, h / 2 + 2);
  ctx.shadowBlur = 0;
  for (let y = 0; y < h; y += 4) {
    ctx.fillStyle = "rgba(0,0,0,0.12)";
    ctx.fillRect(0, y, w, 1);
  }
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Local-space rig for the job-board's front face, measured by loading the
// GLB and inspecting its bounding box/orientation at the SPACEPORT_PROPS
// placement (x:4, z:11, rotY:-0.5): the pillar's front normal in its own
// local frame, plus the three screen bands read top to bottom.
function attachJobBoardScreens(real: THREE.Group) {
  const normal = new THREE.Vector3(0.479, 0, 0.878).normalize();
  const labels: { text: string; y: number; w: number; h: number; accent: string }[] = [
    { text: "JOBS", y: 0.69, w: 0.24, h: 0.15, accent: "#ffcf6b" },
    { text: "CONTRACTS", y: 0.27, w: 0.26, h: 0.19, accent: "#ff9d4a" },
    { text: "BOUNTIES", y: -0.13, w: 0.26, h: 0.19, accent: "#ff6a4a" },
  ];
  const lookTarget = new THREE.Vector3();
  for (const l of labels) {
    const tex = screenLabelTexture(l.text, l.accent);
    const mat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, depthTest: false });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(l.w, l.h), mat);
    mesh.renderOrder = 10;
    mesh.position.set(normal.x * 0.42, l.y, normal.z * 0.42);
    lookTarget.copy(mesh.position).add(normal);
    mesh.lookAt(lookTarget);
    real.add(mesh);
  }
}

export interface SpawnResult {
  group: THREE.Group;
  loaded: boolean;
}

export async function spawnProp(scene: THREE.Group, p: PropPlacement): Promise<SpawnResult> {
  const anchor = new THREE.Group();
  anchor.position.set(p.x, 0, p.z);
  anchor.rotation.y = p.rotY ?? 0;
  scene.add(anchor);

  const ph = placeholderMesh(p);
  anchor.add(ph);

  const model = await loadGltf(p.name);
  if (model) {
    const real = model.clone(true);
    fitToHeight(real, p.placeholderHeight);
    real.scale.multiplyScalar(p.scale ?? 1);
    if (p.name === "job-board") attachJobBoardScreens(real);
    anchor.remove(ph);
    anchor.add(real);
    return { group: anchor, loaded: true };
  }
  return { group: anchor, loaded: false };
}
