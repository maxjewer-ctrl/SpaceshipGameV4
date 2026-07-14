import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clone as cloneSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js";

export const PLAYER_MODEL_LABEL = "Explorer";

const MODEL_HEIGHT = 1.5;
const staticUrl = new URL(
  "../assets/Meshy_AI_explorer_rigged_biped/Meshy_AI_explorer_rigged_biped/Meshy_AI_explorer_rigged_biped_Character_output.glb",
  import.meta.url,
).href;
const walkUrl = new URL(
  "../assets/Meshy_AI_explorer_rigged_biped/Meshy_AI_explorer_rigged_biped/Meshy_AI_explorer_rigged_biped_Animation_Walking_withSkin.glb",
  import.meta.url,
).href;

const loader = new GLTFLoader();
const cache = new Map<string, Promise<{ scene: THREE.Group; animations: THREE.AnimationClip[] }>>();

export interface PlayerModel {
  group: THREE.Group;
  mixer: THREE.AnimationMixer | null;
  walk: THREE.AnimationAction | null;
}

function load(url: string) {
  const cached = cache.get(url);
  if (cached) return cached;
  const pending = loader.loadAsync(url).then((gltf) => ({
    scene: gltf.scene,
    animations: gltf.animations || [],
  }));
  cache.set(url, pending);
  return pending;
}

function fitModel(src: THREE.Group): THREE.Group {
  const model = cloneSkeleton(src) as THREE.Group;
  const box = new THREE.Box3().setFromObject(model);
  const size = new THREE.Vector3();
  box.getSize(size);
  if (size.y > 0.0001) model.scale.multiplyScalar(MODEL_HEIGHT / size.y);
  const fitted = new THREE.Box3().setFromObject(model);
  model.position.set(
    -(fitted.min.x + fitted.max.x) / 2,
    -fitted.min.y,
    -(fitted.min.z + fitted.max.z) / 2,
  );
  model.traverse((o: any) => {
    if (!o.isMesh) return;
    o.castShadow = false;
    o.receiveShadow = false;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    mats.forEach((m: any) => {
      if (!m) return;
      m.roughness = Math.max(m.roughness ?? .65, .55);
      m.metalness = Math.min(m.metalness ?? .1, .35);
    });
  });
  return model;
}

export async function createPlayerModel(animated = false): Promise<PlayerModel> {
  const gltf = await load(animated ? walkUrl : staticUrl);
  const group = new THREE.Group();
  const model = fitModel(gltf.scene);
  group.add(model);
  const mixer = gltf.animations.length ? new THREE.AnimationMixer(model) : null;
  const walk = mixer ? mixer.clipAction(gltf.animations[0]) : null;
  if (walk) {
    walk.enabled = true;
    walk.play();
  }
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
