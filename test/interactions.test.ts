import { describe, expect, it, vi } from "vitest";
import { INTERACTION_PRIORITY, resolveInteraction } from "../src/systems/interactions";

function target(label: string, priority?: number) {
  return { label, priority, onInteract: vi.fn() };
}

describe("shared interaction resolver", () => {
  it("chooses an objective over a closer utility target", () => {
    const objective = target("Repair drive", INTERACTION_PRIORITY.objective);
    const utility = target("Ship console");
    expect(resolveInteraction([
      { target: utility, distance: 1, order: 0 },
      { target: objective, distance: 42, order: 1 },
    ])).toBe(objective);
  });

  it("uses distance and declaration order as stable tie breakers", () => {
    const near = target("Near");
    const far = target("Far");
    const first = target("First");
    const second = target("Second");
    expect(resolveInteraction([{ target: far, distance: 20, order: 0 }, { target: near, distance: 10, order: 1 }])).toBe(near);
    expect(resolveInteraction([{ target: second, distance: 10, order: 1 }, { target: first, distance: 10, order: 0 }])).toBe(first);
  });
});
