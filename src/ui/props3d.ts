// Loading + placement for the Meshy-generated 3D props (walk decks, Dustwell).
// Each name maps to a GLB dropped at src/assets/models/<name>.glb by
// scripts/meshy/generate-batch.mjs. Until that file exists (still generating,
// or generation failed), a procedural placeholder stands in so the scene is
// always inspectable. (Moved from the deleted src/spaceport/ demo.)
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

const loader = new GLTFLoader();
const propModelUrls: Record<string, string> = {
  "barrel-stack": new URL("../assets/models/barrel-stack.glb", import.meta.url).href,
  "beacon-lamp": new URL("../assets/models/beacon-lamp.glb", import.meta.url).href,
  "cargo-crate": new URL("../assets/models/cargo-crate.glb", import.meta.url).href,
  "cargo-hauler": new URL("../assets/models/cargo-hauler.glb", import.meta.url).href,
  "cargo-shuttle": new URL("../assets/models/cargo-shuttle.glb", import.meta.url).href,
  "cockpit-breaker-panel": new URL("../assets/models/cockpit-breaker-panel.glb", import.meta.url).href,
  "cockpit-cable-tray": new URL("../assets/models/cockpit-cable-tray.glb", import.meta.url).href,
  "cockpit-captains-chair": new URL("../assets/models/cockpit-captains-chair.glb", import.meta.url).href,
  "cockpit-command-console": new URL("../assets/models/cockpit-command-console.glb", import.meta.url).href,
  "cockpit-comms-radar-stack": new URL("../assets/models/cockpit-comms-radar-stack.glb", import.meta.url).href,
  "cockpit-flight-recorder": new URL("../assets/models/cockpit-flight-recorder.glb", import.meta.url).href,
  "cockpit-navigation-holo": new URL("../assets/models/cockpit-navigation-holo.glb", import.meta.url).href,
  "cockpit-overhead-lockers": new URL("../assets/models/cockpit-overhead-lockers.glb", import.meta.url).href,
  "fuel-tank": new URL("../assets/models/fuel-tank.glb", import.meta.url).href,
  "mooring-post": new URL("../assets/models/mooring-post.glb", import.meta.url).href,
  "satellite-dish": new URL("../assets/models/satellite-dish.glb", import.meta.url).href,
  "water-tower": new URL("../assets/models/water-tower.glb", import.meta.url).href,
  "windmill-turbine": new URL("../assets/models/windmill-turbine.glb", import.meta.url).href,
  "ship-engine-core": new URL("../assets/models/ship-engine-core.glb", import.meta.url).href,
  "ship-hydro-planter": new URL("../assets/models/ship-hydro-planter.glb", import.meta.url).href,
  "ship-lux-berth": new URL("../assets/models/ship-lux-berth.glb", import.meta.url).href,
  "ship-med-bed": new URL("../assets/models/ship-med-bed.glb", import.meta.url).href,
  "ship-shield-generator": new URL("../assets/models/ship-shield-generator.glb", import.meta.url).href,
  "ship-smuggler-hatch": new URL("../assets/models/ship-smuggler-hatch.glb", import.meta.url).href,
  "ship-weapons-rack": new URL("../assets/models/ship-weapons-rack.glb", import.meta.url).href,
  "ship-workbench": new URL("../assets/models/ship-workbench.glb", import.meta.url).href,
  "station-auction-lot": new URL("../assets/models/station-auction-lot.glb", import.meta.url).href,
  "station-cantina-booth": new URL("../assets/models/station-cantina-booth.glb", import.meta.url).href,
  "station-customs-podium": new URL("../assets/models/station-customs-podium.glb", import.meta.url).href,
  "station-drydock-toolcart": new URL("../assets/models/station-drydock-toolcart.glb", import.meta.url).href,
  "station-listening-array": new URL("../assets/models/station-listening-array.glb", import.meta.url).href,
  "station-market-kiosk": new URL("../assets/models/station-market-kiosk.glb", import.meta.url).href,
  "station-memorial-lighthouse": new URL("../assets/models/station-memorial-lighthouse.glb", import.meta.url).href,
  "station-recycler-line": new URL("../assets/models/station-recycler-line.glb", import.meta.url).href,
  // Free CC0 clutter from Kenney's Space Kit (kenney.nl/assets/space-kit) —
  // fills out common station rooms that don't have a bespoke Meshy prop.
  "kenney-desk-computer": new URL("../assets/models/kenney-desk-computer.glb", import.meta.url).href,
  "kenney-desk-chair": new URL("../assets/models/kenney-desk-chair.glb", import.meta.url).href,
  "kenney-stool": new URL("../assets/models/kenney-stool.glb", import.meta.url).href,
  "kenney-barrels": new URL("../assets/models/kenney-barrels.glb", import.meta.url).href,
  "kenney-generator": new URL("../assets/models/kenney-generator.glb", import.meta.url).href,
  "kenney-wireless": new URL("../assets/models/kenney-wireless.glb", import.meta.url).href,
  "kenney-pipe-corner": new URL("../assets/models/kenney-pipe-corner.glb", import.meta.url).href,
};
const gltfCache = new Map<string, Promise<THREE.Group | null>>();

function placeholderMesh(p: PropPlacement): THREE.Group {
  // A soft solid block in the prop's own colour — stands in for the ~1s while
  // the GLB streams in. Deliberately NOT the old bright wireframe cage, which
  // read as a sci-fi hologram in a weathered frontier town and drew the eye to
  // exactly the thing that isn't loaded yet.
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: p.placeholderColor, roughness: 0.9, metalness: 0.1, transparent: true, opacity: 0.72 });
  const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(p.placeholderRadius * 0.7, p.placeholderHeight * 0.66, 4, 8), mat);
  mesh.position.y = p.placeholderHeight / 2;
  mesh.castShadow = true;
  g.add(mesh);
  g.userData.isPlaceholder = true;
  return g;
}

async function loadGltf(name: string): Promise<THREE.Group | null> {
  if (!gltfCache.has(name)) {
    const url = propModelUrls[name];
    gltfCache.set(
      name,
      (url ? loader.loadAsync(url) : Promise.resolve(null))
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
    anchor.remove(ph);
    anchor.add(real);
    return { group: anchor, loaded: true };
  }
  return { group: anchor, loaded: false };
}
