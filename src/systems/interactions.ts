// Shared interaction contract for physical scenes. Geometry belongs to the
// presenter; this module only decides which eligible target gets the player's
// one interaction verb when targets overlap.
export interface InteractionTarget {
  label: string;
  priority?: number;
  onInteract: () => void;
}

export interface InteractionCandidate<T extends InteractionTarget> {
  target: T;
  distance: number;
  order: number;
}

export const INTERACTION_PRIORITY = {
  default: 0,
  objective: 100,
} as const;

// Higher priority wins first; within the same tier the closest target wins;
// declaration order makes exact ties deterministic for saved replays/tests.
export function resolveInteraction<T extends InteractionTarget>(
  candidates: InteractionCandidate<T>[],
): T | null {
  if (!candidates.length) return null;
  return candidates.slice().sort((a, b) =>
    (b.target.priority ?? INTERACTION_PRIORITY.default) - (a.target.priority ?? INTERACTION_PRIORITY.default)
    || a.distance - b.distance
    || a.order - b.order,
  )[0].target;
}
