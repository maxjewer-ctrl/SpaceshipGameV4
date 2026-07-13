// Movement helpers for the walk simulation. The walk API is pixels-in/
// pixels-out and deterministic — no physics engine, no navmesh library.
// (Rapier, three-pathfinding, and yuka were removed in the beta foundations
// pass: the 2D rect sim in ui/walk.ts is authoritative for both deck and
// action modes, and grid A* over the same predicate handles click-to-move.)

// Arrive steering: step an agent toward a target at a capped speed. Used by
// ship crew walking between posts and break areas (ui/shipwalk.ts).
export function steerAgent(agent: { x: number; y: number }, target: { x: number; y: number }, speed: number, dt: number) {
  const dx = target.x - agent.x;
  const dy = target.y - agent.y;
  const dist = Math.hypot(dx, dy);
  if (dist <= 0.001) return { x: agent.x, y: agent.y };
  const step = Math.min(speed * dt, dist);
  return { x: agent.x + dx / dist * step, y: agent.y + dy / dist * step };
}
