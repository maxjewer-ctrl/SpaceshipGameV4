import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import {
  buildGround, buildLandingPad, buildSky, buildDistantMoon,
  buildHangar, buildControlTower, buildCantina, buildFencePerimeter,
  setupLighting, buildBeaconGlow,
} from "./environment";
import { SPACEPORT_PROPS, spawnProp } from "./assets";

const app = document.getElementById("app")!;
const statusEl = document.getElementById("asset-status")!;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(52, window.innerWidth / window.innerHeight, 0.1, 500);
camera.position.set(28, 20, 34);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
app.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 2, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 6;
controls.maxDistance = 110;
controls.maxPolarAngle = Math.PI * 0.49;

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.55, 0.6, 0.72);
composer.addPass(bloom);
composer.addPass(new OutputPass());

scene.add(buildSky());
scene.add(buildDistantMoon());
scene.add(buildGround());
scene.add(buildLandingPad());

const hangar = buildHangar();
hangar.position.set(-16, 0, -2);
hangar.rotation.y = 0.15;
scene.add(hangar);

const tower = buildControlTower();
tower.position.set(-10, 0, -14);
scene.add(tower);

const cantina = buildCantina();
cantina.position.set(16, 0, 8);
cantina.rotation.y = -0.5;
scene.add(cantina);

scene.add(buildFencePerimeter(48, 40));

setupLighting(scene);

const propRoot = new THREE.Group();
scene.add(propRoot);

let loadedCount = 0;
const total = SPACEPORT_PROPS.length;
statusEl.textContent = `loading assets… 0/${total}`;

Promise.all(
  SPACEPORT_PROPS.map((p) =>
    spawnProp(propRoot, p).then((r) => {
      loadedCount++;
      statusEl.textContent = `assets: ${loadedCount}/${total} checked (Meshy models swap in as they finish; ghost outlines = still generating)`;
      return r;
    })
  )
).then((results) => {
  const realCount = results.filter((r) => r.loaded).length;
  statusEl.innerHTML = `<b>${realCount}/${total}</b> Meshy models loaded — the rest show as ghost placeholders until generation finishes. Reload the page to pick up newly finished ones.`;
});

// A couple of warm beacon glows near the pad; matches beacon-lamp placements in assets.ts.
scene.add(buildBeaconGlow(9, 9));
scene.add(buildBeaconGlow(-9, 9));
scene.add(buildBeaconGlow(0, 15));

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
}
window.addEventListener("resize", onResize);

function tick() {
  controls.update();
  composer.render();
  requestAnimationFrame(tick);
}
tick();

// Dev-only self-screenshot, same convention as src/debug/shot.ts: rAF is
// suspended in the backgrounded preview tab, so force a render then POST the
// canvas bitmap to the /__shot dev middleware (see vite.config.ts).
if (import.meta.env.DEV) {
  (window as any).__cam = { camera, controls };
  (window as any).__shot = async () => {
    controls.update();
    composer.render();
    const canvas = renderer.domElement;
    const blob: Blob | null = await new Promise((r) => canvas.toBlob(r, "image/png"));
    if (!blob) return "shot: capture failed";
    const res = await fetch("/__shot", { method: "POST", body: blob });
    return `shot ${Math.round(blob.size / 1024)}KB -> .shots/latest.png (${res.status})`;
  };
}
