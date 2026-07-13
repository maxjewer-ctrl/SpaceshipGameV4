import type { WalkRect, WalkScene } from "../ui/walk";

// Optional high-performance helpers for the walk simulation. The public walk
// API remains pixels-in/pixels-out, so gameplay and save data stay independent
// of any rendering or physics package.
let pathfinder: any = null;
let THREE: typeof import("three") | null = null;
let zone = "";
let rapier: typeof import("@dimforge/rapier3d-compat") | null = null;
let physics: import("@dimforge/rapier3d-compat").World | null = null;
let playerBody: import("@dimforge/rapier3d-compat").RigidBody | null = null;

function floorGeometry(T: typeof import("three"), floors: WalkRect[]): import("three").BufferGeometry {
  const positions: number[] = [];
  for (const f of floors) {
    const x0 = f.x, x1 = f.x + f.w, z0 = f.y, z1 = f.y + f.h;
    positions.push(x0, 0, z0, x1, 0, z1, x1, 0, z0, x0, 0, z0, x0, 0, z1, x1, 0, z1);
  }
  const geometry = new T.BufferGeometry();
  geometry.setAttribute("position", new T.Float32BufferAttribute(positions, 3));
  return geometry;
}

export function configureWalkRuntime(scene: WalkScene, spawn: { x: number; y: number }) {
  zone = scene.id;
  pathfinder = null;
  void Promise.all([import("three"), import("three-pathfinding")])
    .then(([T, pathfinding]) => {
      if (zone !== scene.id) return;
      THREE = T;
      const Pathfinding = pathfinding.Pathfinding;
      const geometry = floorGeometry(T, scene.floors);
      pathfinder = new Pathfinding();
      pathfinder.setZoneData(zone, Pathfinding.createZone(geometry));
      geometry.dispose();
    })
    .catch(() => { pathfinder = null; });

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
  if (!pathfinder || !zone || !THREE) return null;
  try {
    const start = new THREE.Vector3(from.x, 0, from.y);
    const end = new THREE.Vector3(to.x, 0, to.y);
    const group = pathfinder.getGroup(zone, start);
    const path = pathfinder.findPath(start, end, zone, group);
    return path?.map((p) => ({ x: p.x, y: p.z })) || null;
  } catch { return null; }
}

export function steerAgent(agent: { x: number; y: number }, target: { x: number; y: number }, speed: number, dt: number) {
  const dx = target.x - agent.x;
  const dy = target.y - agent.y;
  const dist = Math.hypot(dx, dy);
  if (dist <= 0.001) return { x: agent.x, y: agent.y };
  const step = Math.min(speed * dt, dist);
  return { x: agent.x + dx / dist * step, y: agent.y + dy / dist * step };
}

export function disposeWalkRuntime() {
  pathfinder = null; zone = ""; physics = null; playerBody = null; rapier = null;
}
