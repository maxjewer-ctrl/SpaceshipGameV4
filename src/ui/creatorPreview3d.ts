// Live 3D viewport for the character creator. Owns a tiny three.js renderer
// inside .cc-stage; the picker mutates the Appearance draft and calls
// refresh(), which rebuilds the shared rig (ui/character3d.ts) in place.
// If WebGL is unavailable, mountCreatorPreview returns null and the caller
// keeps the legacy 2D canvas path.
import * as THREE from "three";
import type { Appearance } from "../types";
import { buildCharacter, poseCharacter, disposeCharacter, type CharacterRig } from "./character3d";

export interface CreatorPreview {
  refresh(): void;       // rebuild model from the current draft
  setFacing(dir: string): void;
  teardown(): void;
}

const FACING: Record<string, number> = { down: 0, right: Math.PI / 2, up: Math.PI, left: -Math.PI / 2 };

export function mountCreatorPreview(stage: HTMLElement, getApp: () => Appearance): CreatorPreview | null {
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
    new THREE.CylinderGeometry(.52, .58, .06, 28),
    new THREE.MeshStandardMaterial({ color: 0x1c2534, roughness: .6, metalness: .4, emissive: 0x2a3a55, emissiveIntensity: .25 }),
  );
  disc.position.y = -.03; scene.add(disc);
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(.55, .012, 6, 40),
    new THREE.MeshStandardMaterial({ color: 0xe8b04b, emissive: 0xe8b04b, emissiveIntensity: .9 }),
  );
  ring.rotation.x = Math.PI / 2; ring.position.y = .005; scene.add(ring);

  const camera = new THREE.PerspectiveCamera(30, W / H, .1, 20);
  camera.position.set(0, .98, 2.85);
  camera.lookAt(0, .8, 0);

  let rig: CharacterRig = buildCharacter(getApp());
  scene.add(rig.group);
  let targetYaw = 0;
  let raf: number | null = null;

  const loop = (t: number) => {
    if (!renderer.domElement.isConnected) { teardown(); return; } // modal closed
    rig.group.rotation.y += (targetYaw - rig.group.rotation.y) * .14;
    poseCharacter(rig, { t });
    renderer.render(scene, camera);
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);

  function teardown() {
    if (raf) cancelAnimationFrame(raf); raf = null;
    disposeCharacter(rig);
    disc.geometry.dispose(); (disc.material as THREE.Material).dispose();
    ring.geometry.dispose(); (ring.material as THREE.Material).dispose();
    renderer.dispose();
    renderer.domElement.remove();
  }

  return {
    refresh() {
      const yaw = rig.group.rotation.y;
      scene.remove(rig.group); disposeCharacter(rig);
      rig = buildCharacter(getApp());
      rig.group.rotation.y = yaw;
      scene.add(rig.group);
    },
    setFacing(dir: string) {
      const want = FACING[dir] ?? 0;
      // rotate the short way around from wherever we are
      const cur = rig.group.rotation.y;
      let d = want - (cur % (Math.PI * 2));
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      targetYaw = cur + d;
    },
    teardown,
  };
}
