import { defineConfig } from "vitest/config";

// Headless simulation harness. jsdom gives the modal renderer a DOM to no-op
// against and localStorage for save round-trips; the game systems themselves
// are pure state transforms (see BETA_PLAN §4 Phase A). No WebGL is ever
// touched — walk3d/three are only dynamically imported by the UI, never by the
// systems the tests drive.
export default defineConfig({
  test: {
    environment: "jsdom",
    include: ["test/**/*.test.ts"],
    // The fuzz suite runs thousands of day-ticks; give it room.
    testTimeout: 30_000,
  },
});
