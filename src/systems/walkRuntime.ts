import * as THREE from "three";
import { Pathfinding } from "three-pathfinding";
import * as YUKA from "yuka";
import type { WalkRect, WalkScene } from "../ui/walk";

// Optional high-performance helpers for the walk simulation. The public walk
// API remains pixels-in/pixels-out, so gameplay and save data stay independent
// of any rendering or physics package.
let pathfinder: Pathfinding | null = null;
let zone = "";
let rapier: typeof import("@dimforge/rapier3d-compat") | null = null;
let physics: import("@dimforge/rapier3d-compat").World | null = null;
let playerBody: import("@dimforge/rapier3d-compat").RigidBody | null = null;

function floorGeometry(floors: WalkRect[]): THREE.BufferGeometry {
  const positions: number[] = [];
  for (const f of floors) {
    const x0 = f.x, x1 = f.x + f.w, z0 = f.y, z1 = f.y + f.h;
    positions.push(x0, 0, z0, x1, 0, z1, x1, 0, z0, x0, 0, z0, x0, 0, z1, x1, 0, z1);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  return geometry;
}

export function configureWalkRuntime(scene: WalkScene, spawn: { x: number; y: number }) {
  zone = scene.id;
  try {
    const geometry = floorGeometry(scene.floors);
    pathfinder = new Pathfinding();
    pathfinder.setZoneData(zone, Pathfinding.createZone(geometry));
    geometry.dispose();
  } catch {
    pathfinder = null;
  }

  // Rapier is WASM and initializes asynchronously. Existing rectangle
  // collision remains the immediate fallback during the first few frames.
  void import("@dimforge/rapier3d-compat").then(async (R) => {
    await R.init();
    rapier = R;
    physics = new R.World({ x: 0, y: 0, z: 0 });
    playerBody = physics.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(spawn.x, 0, spawn.y));
    physics.createCollider(R.ColliderDesc.ball(9).setSensor(true), playerBody);
    for (const a of scene.actors) {
      const body = physics.createRigidBody(R.RigidBodyDesc.fixed().setTranslation(a.x + a.w / 2, 0, a.y + a.h / 2));
      physics.createCollider(R.ColliderDesc.ball(Math.max(a.w, a.h) / 2).setSensor(true), body);
    }
  }).catch(() => { rapier = null; physics = null; playerBody = null; });
}

export function syncWalkPhysics(position: { x: number; y: number }) {
  if (!rapier || !physics || !playerBody) return;
  playerBody.setNextKinematicTranslation({ x: position.x, y: 0, z: position.y });
  physics.step();
}

export function navPath(from: { x: number; y: number }, to: { x: number; y: number }) {
  if (!pathfinder || !zone) return null;
  try {
    const start = new THREE.Vector3(from.x, 0, from.y);
    const end = new THREE.Vector3(to.x, 0, to.y);
    const group = pathfinder.getGroup(zone, start);
    const path = pathfinder.findPath(start, end, zone, group);
    return path?.map((p) => ({ x: p.x, y: p.z })) || null;
  } catch { return null; }
}

export function steerAgent(agent: { x: number; y: number }, target: { x: number; y: number }, speed: number, dt: number) {
  const vehicle = new YUKA.Vehicle();
  vehicle.position.set(agent.x, 0, agent.y);
  vehicle.maxSpeed = speed;
  const arrive = new YUKA.ArriveBehavior(new YUKA.Vector3(target.x, 0, target.y), 2.5, 8);
  vehicle.steering.add(arrive);
  vehicle.update(dt);
  return { x: vehicle.position.x, y: vehicle.position.z };
}

export function disposeWalkRuntime() {
  pathfinder = null; zone = ""; physics = null; playerBody = null; rapier = null;
}
