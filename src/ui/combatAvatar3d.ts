import * as THREE from "three";
import { createPlayerModel, disposePlayerModel, type PlayerModel } from "./playerModel3d";

type CombatAvatarMood = "command" | "target" | "aim" | "over";

let renderer: THREE.WebGLRenderer | null = null;
let scene: THREE.Scene | null = null;
let camera: THREE.PerspectiveCamera | null = null;
let model: PlayerModel | null = null;
let pending: Promise<PlayerModel> | null = null;
let host: HTMLElement | null = null;
let raf: number | null = null;
let mood: CombatAvatarMood = "command";
let token = 0;

export function mountCombatAvatar(stage: HTMLElement, nextMood: CombatAvatarMood, modelId?: string) {
  mood = nextMood;
  if (host === stage && renderer?.domElement.isConnected) return;
  teardownCombatAvatar();
  host = stage;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  } catch { return; }
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.setSize(stage.clientWidth || 132, stage.clientHeight || 168, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.55;
  renderer.domElement.className = "combat-avatar-canvas";
  stage.appendChild(renderer.domElement);

  scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xbcdcff, 0x171b26, 1.15));
  const key = new THREE.DirectionalLight(0xffe0bb, 2.1); key.position.set(-1.4, 2.2, 2.4); scene.add(key);
  const rim = new THREE.DirectionalLight(0x5aa7ff, 1.45); rim.position.set(1.8, 1.3, -2); scene.add(rim);
  camera = new THREE.PerspectiveCamera(28, 1, .1, 20);
  camera.position.set(0, .95, 3.35);
  camera.lookAt(0, .75, 0);

  const myToken = ++token;
  pending = createPlayerModel(false, modelId).then((next) => {
    pending = null;
    if (myToken !== token || !scene || !host) { disposePlayerModel(next); return next; }
    model = next;
    next.group.rotation.y = -.3;
    scene.add(next.group);
    return next;
  });
  raf = requestAnimationFrame(loop);
}

export function updateCombatAvatar(nextMood: CombatAvatarMood) {
  mood = nextMood;
}

function loop(t: number) {
  if (!renderer || !scene || !camera || !host || !renderer.domElement.isConnected) {
    teardownCombatAvatar();
    return;
  }
  const w = Math.max(1, host.clientWidth || 132), h = Math.max(1, host.clientHeight || 168);
  if (renderer.domElement.width !== Math.round(w * renderer.getPixelRatio()) || renderer.domElement.height !== Math.round(h * renderer.getPixelRatio())) {
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  if (model) {
    const sweep = mood === "aim" ? .18 : mood === "target" ? .08 : .035;
    model.group.rotation.y += ((-.35 + Math.sin(t * .0014) * sweep) - model.group.rotation.y) * .08;
    model.group.rotation.x = mood === "over" ? Math.sin(t * .004) * .018 : 0;
    model.group.position.y = mood === "aim" ? Math.sin(t * .006) * .012 : Math.sin(t * .002) * .006;
  }
  renderer.render(scene, camera);
  raf = requestAnimationFrame(loop);
}

export function teardownCombatAvatar() {
  token++;
  if (raf) cancelAnimationFrame(raf);
  raf = null;
  pending = null;
  disposePlayerModel(model);
  model = null;
  renderer?.dispose();
  renderer?.domElement.remove();
  renderer = null;
  scene = null;
  camera = null;
  host = null;
}
