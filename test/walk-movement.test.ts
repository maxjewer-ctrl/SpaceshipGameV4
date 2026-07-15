import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/ui/walk3d", () => ({
  mount: () => {}, setScene: () => {}, render: () => {}, teardown: () => {},
}));

(globalThis as any).requestAnimationFrame = () => 0;
(globalThis as any).cancelAnimationFrame = () => {};

import * as walk from "../src/ui/walk";
import type { WalkScene } from "../src/ui/walk";

function deck(action = false): WalkScene {
  return {
    id: "test:movement", title: "Movement Test", status: "TEST",
    width: 1200, height: 700,
    floors: [{ x: 0, y: 0, w: 1200, h: 700 }],
    rooms: [], doors: [], actors: [], spawn: { x: 500, y: 350 }, action,
  };
}

function key(type: "keydown" | "keyup", code: string) {
  document.dispatchEvent(new KeyboardEvent(type, { code, bubbles: true }));
}

describe("walk sprint", () => {
  beforeEach(() => { walk.teardown(); walk.forgetSpawn("test:movement"); });

  it("speeds deck traversal but leaves action movement at its combat pace", () => {
    walk.start(deck());
    key("keydown", "KeyD"); walk.debugStep(0.5); key("keyup", "KeyD");
    const normal = walk.debugPos().x;

    walk.start(deck());
    key("keydown", "ShiftLeft"); key("keydown", "KeyD"); walk.debugStep(0.5);
    key("keyup", "KeyD"); key("keyup", "ShiftLeft");
    const sprint = walk.debugPos().x;

    walk.start(deck(true));
    key("keydown", "ShiftLeft"); key("keydown", "KeyD"); walk.debugStep(0.5);
    key("keyup", "KeyD"); key("keyup", "ShiftLeft");
    const action = walk.debugPos().x;

    expect(normal).toBeCloseTo(615);
    expect(sprint).toBeCloseTo(672.5);
    expect(action).toBeCloseTo(660);
  });
});
