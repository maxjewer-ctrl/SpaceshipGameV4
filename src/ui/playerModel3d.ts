import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clone as cloneSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js";

export const PLAYER_MODEL_LABEL = "Explorer";

// World height every consumer can assume a fitted model has, with its feet at
// the group origin. Callers scale from this rather than re-measuring.
export const MODEL_HEIGHT = 1.5;

// One asset for every surface: it carries the mesh, the skeleton and the walk
// clip, so the still poses (creator, combat portrait) just park the clip on a
// good frame instead of shipping a second GLB whose only job was a T-pose.
// Rebuilt from the raw Meshy export by scripts/meshy/shrink-texture.mjs.
const modelUrl = new URL("../assets/models/captain-explorer.glb", import.meta.url).href;

// Seconds into the 1.07s walk cycle to freeze on for a still pose. This is the
// cycle's passing position: feet together, shoulders square, arms hanging. It
// reads as a natural standing captain instead of the splayed T-pose the raw rig
// ships in. Other frames in the cycle put the pelvis mid-rotation and look drunk.
const IDLE_POSE_TIME = 0.13;

const loader = new GLTFLoader();
let cached: Promise<{ scene: THREE.Group; animations: THREE.AnimationClip[] }> | null = null;

export interface PlayerModel {
  group: THREE.Group;
  mixer: THREE.AnimationMixer | null;
  walk: THREE.AnimationAction | null;
}

function load() {
  cached ??= loader.loadAsync(modelUrl).then((gltf) => ({
    scene: gltf.scene,
    animations: gltf.animations || [],
  }));
  return cached;
}

// The Meshy rig's root node is scaled 0.01 (its bones are in centimetres) while
// the mesh geometry is already in metres. A plain Box3.setFromObject measures a
// skinned mesh as geometry-bounds x matrixWorld, so it reports that 0.01 and
// comes out 100x too small -- but three binds glTF skins with an identity
// bindMatrix and rebuilds bindMatrixInverse from matrixWorld each frame, so the
// 0.01 cancels and the rig actually renders at its geometry size. Fitting to the
// bogus box scaled the captain to ~150m. `precise` walks the vertices through
// applyBoneTransform instead, which is what the GPU does, so it agrees with what
// you see. It's ~10k verts, twice, at load only.
function skinnedBounds(model: THREE.Object3D): THREE.Box3 {
  model.updateMatrixWorld(true); // bone matrices + bindMatrixInverse must be current
  return new THREE.Box3().setFromObject(model, true);
}

// Centre the rig on its origin with its feet on y=0, for whatever pose the bones
// are currently in. Zeroes the offset first so it stays idempotent -- callers
// re-run it after posing, since the bind pose and the posed pose don't agree.
function reground(model: THREE.Object3D) {
  model.position.set(0, 0, 0);
  const box = skinnedBounds(model);
  if (!Number.isFinite(box.min.y)) return;
  model.position.set(
    -(box.min.x + box.max.x) / 2,
    -box.min.y,
    -(box.min.z + box.max.z) / 2,
  );
}

function fitModel(src: THREE.Group): THREE.Group {
  const model = cloneSkeleton(src) as THREE.Group;
  const size = new THREE.Vector3();
  skinnedBounds(model).getSize(size);
  if (size.y > 0.0001) model.scale.multiplyScalar(MODEL_HEIGHT / size.y);
  reground(model);
  model.traverse((o: any) => {
    if (!o.isMesh) return;
    o.castShadow = false;
    o.receiveShadow = false;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    mats.forEach((m: any) => {
      if (!m) return;
      // Meshy bakes the albedo into emissive (emissiveFactor 1,1,1 + the colour
      // map as emissiveMap) so the model self-illuminates. That makes it ignore
      // the deck's lighting entirely and read as a flat sticker against the
      // ship's bloom. Drop the emissive so the scene's lights actually reach it;
      // the same image is still the baseColorTexture, so nothing is lost.
      m.emissive?.setRGB(0, 0, 0);
      m.emissiveMap = null;
      m.emissiveIntensity = 0;
      // KHR_materials_specular ships specularColorFactor 2,2,2 -- a >1 specular
      // that blows out to white under the deck's point lights.
      m.specularColor?.setRGB(1, 1, 1);
      m.roughness = Math.max(m.roughness ?? .65, .55);
      m.metalness = Math.min(m.metalness ?? .1, .35);
      m.needsUpdate = true;
    });
  });
  return model;
}

export async function createPlayerModel(animated = false): Promise<PlayerModel> {
  const gltf = await load();
  const group = new THREE.Group();
  const model = fitModel(gltf.scene);
  const mixer = gltf.animations.length ? new THREE.AnimationMixer(model) : null;
  const walk = mixer ? mixer.clipAction(gltf.animations[0]) : null;
  if (walk && mixer) {
    walk.enabled = true;
    walk.play();
    if (!animated) {
      // Still pose: hold one frame of the cycle. paused (not timeScale 0) so a
      // caller that pumps the mixer every frame can't drift off the pose.
      walk.time = IDLE_POSE_TIME;
      walk.paused = true;
      mixer.update(0); // stamp the pose onto the bones before anyone measures
    }
  }
  // fitModel grounds and centres the rig, but it does that against the bind
  // pose; re-fit once the still pose is posed so the feet actually sit on y=0.
  if (!animated) reground(model);
  group.add(model);
  return { group, mixer, walk };
}

export function disposePlayerModel(model: PlayerModel | null) {
  if (!model) return;
  model.mixer?.stopAllAction();
  model.group.traverse((n: any) => {
    n.geometry?.dispose?.();
    const mats = Array.isArray(n.material) ? n.material : [n.material];
    mats.forEach((m: any) => {
      m?.map?.dispose?.();
      m?.normalMap?.dispose?.();
      m?.roughnessMap?.dispose?.();
      m?.metalnessMap?.dispose?.();
      m?.dispose?.();
    });
  });
}
