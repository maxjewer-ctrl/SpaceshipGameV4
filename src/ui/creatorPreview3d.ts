// Live 3D viewport for the character creator. Owns a tiny three.js renderer
// inside .cc-stage; the picker mutates the Appearance draft and calls
// refresh(), which rebuilds the shared rig (ui/character3d.ts) in place.
// If WebGL is unavailable, mountCreatorPreview returns null and the caller
// keeps the legacy 2D canvas path.
import * as THREE from "three";
import type { Appearance } from "../types";
import { createPlayerModel, disposePlayerModel, type PlayerModel } from "./playerModel3d";

export interface CreatorPreview {
  refresh(): void;       // rebuild model from the current draft
  setFacing(dir: string): void;
  teardown(): void;
}

export function mountCreatorPreview(stage: HTMLElement, getApp: () => Appearance): CreatorPreview | null {
  void getApp;
  let renderer: THREE.WebGLRenderer;
  try {
    // preserveDrawingBuffer so DOM-raster screenshots (__shot) can inline the bitmap
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  } catch { return null; }
  const W = 200, H = 230;
  renderer.setSize(W, H);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.7;
  renderer.domElement.className = "cc-preview3d";
  stage.insertBefore(renderer.domElement, stage.firstChild);

  const scene = new THREE.Scene();
  // stage lighting: cool hemisphere fill, warm key from upper-left, blue rim from behind
  scene.add(new THREE.HemisphereLight(0xbcd4ff, 0x232a3a, 1.1));
  const key = new THREE.DirectionalLight(0xffe8c8, 2.3); key.position.set(-1.6, 2.4, 2.2); scene.add(key);
  const rim = new THREE.DirectionalLight(0x5aa7ff, 1.5); rim.position.set(1.2, 1.6, -2.4); scene.add(rim);
  const fill = new THREE.DirectionalLight(0x8fb8e8, .55); fill.position.set(1.8, .6, 1.6); scene.add(fill);

  // pedestal disc so the figure isn't floating in the void
  const disc = new THREE.Mesh(
    new THREE.CylinderGeometry(.42, .46, .05, 28),
    new THREE.MeshStandardMaterial({ color: 0x1c2534, roughness: .6, metalness: .4, emissive: 0x2a3a55, emissiveIntensity: .25 }),
  );
  disc.position.y = -.03; scene.add(disc);
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(.45, .01, 6, 40),
    new THREE.MeshStandardMaterial({ color: 0xe8b04b, emissive: 0xe8b04b, emissiveIntensity: .9 }),
  );
  ring.rotation.x = Math.PI / 2; ring.position.y = .005; scene.add(ring);

  const camera = new THREE.PerspectiveCamera(30, W / H, .1, 20);
  camera.position.set(0, .92, 4.15);
  camera.lookAt(0, .72, 0);

  let model: PlayerModel | null = null;
  let disposed = false;
  let raf: number | null = null;
  void createPlayerModel(false).then((next) => {
    if (disposed) { disposePlayerModel(next); return; }
    model = next;
    next.group.scale.setScalar(.72);
    next.group.position.set(0, .03, 0);
    scene.add(next.group);
  });

  const loop = (t: number) => {
    if (!renderer.domElement.isConnected) { teardown(); return; } // modal closed
    if (model) {
      model.group.rotation.y = t * .00075;
      model.mixer?.update(.016);
    }
    renderer.render(scene, camera);
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);

  function teardown() {
    disposed = true;
    if (raf) cancelAnimationFrame(raf); raf = null;
    disposePlayerModel(model); model = null;
    disc.geometry.dispose(); (disc.material as THREE.Material).dispose();
    ring.geometry.dispose(); (ring.material as THREE.Material).dispose();
    renderer.dispose();
    renderer.domElement.remove();
  }

  return {
    refresh() {
      // Appearance controls are temporarily disabled while the Meshy explorer
      // is the only selectable captain model.
    },
    setFacing(dir: string) {
      void dir;
    },
    teardown,
  };
}
