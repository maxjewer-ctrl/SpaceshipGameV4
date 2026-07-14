// Batch-shrinks the Meshy props and crew in src/assets/models/ in place.
//
//   node scripts/meshy/shrink-models.mjs [--dry]
//
// Meshy bakes every asset with four 2048x2048 textures (base colour,
// metallic-roughness, normal, emissive). That is ~10MB on disk per model, but
// the real cost is VRAM: textures do not stay JPEG-compressed on the GPU, so
// one prop expands to 4 * 2048^2 * 4B * 1.33 (mips) = ~85MB. The 29 props a
// walk deck references came to ~1.3GB of texture memory on their own, which is
// past what most GPUs will hold -- so they thrash, and the frame stutters.
//
// Props render at ~100px under a top-down camera, so 512 is already more detail
// than the screen can show. Crew get 1024: still NPC-sized on the deck, but
// they are characters and the extra headroom costs little at their count.
//
// Reversible: these files are tracked, so `git checkout -- src/assets/models`
// restores the originals.
import { readdirSync, statSync, renameSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

const DIR = "src/assets/models";
const DRY = process.argv.includes("--dry");

// Below this, it is a Kenney CC0 model (a few KB, untextured) -- nothing to do.
const MIN_BYTES = 1.5 * 1048576;

// captain-explorer is the one asset already shrunk by hand; leave it alone.
const SKIP = new Set(["captain-explorer.glb"]);

const isCharacter = (f) => f.startsWith("crew-") || f.startsWith("player-captain-");

let before = 0;
let after = 0;
const done = [];

for (const file of readdirSync(DIR).filter((f) => f.endsWith(".glb")).sort()) {
  if (SKIP.has(file)) continue;
  const path = join(DIR, file);
  const size = statSync(path).size;
  if (size < MIN_BYTES) continue;

  const max = isCharacter(file) ? 1024 : 512;
  const quality = isCharacter(file) ? 85 : 82;
  before += size;

  if (DRY) {
    console.log(`${file} -> ${max}px q${quality} (${(size / 1048576).toFixed(1)}MB)`);
    continue;
  }

  console.log(`${file} @ ${max}px`);
  const tmp = `${path}.tmp`;
  try {
    execFileSync("node", ["scripts/meshy/shrink-texture.mjs", path, tmp, String(max), String(quality)], {
      stdio: ["ignore", "ignore", "inherit"],
    });
    renameSync(tmp, path);
  } catch (err) {
    rmSync(tmp, { force: true });
    throw new Error(`failed on ${file}: ${err.message}`);
  }
  const now = statSync(path).size;
  after += now;
  done.push({ file, from: size, to: now });
}

if (DRY) process.exit(0);

for (const d of done) {
  console.log(
    `  ${d.file.padEnd(34)} ${(d.from / 1048576).toFixed(1).padStart(5)}MB -> ${(d.to / 1048576).toFixed(2).padStart(5)}MB`,
  );
}
console.log(
  `\n${done.length} models: ${(before / 1048576).toFixed(0)}MB -> ${(after / 1048576).toFixed(0)}MB ` +
  `(${(100 - (after / before) * 100).toFixed(0)}% smaller)`,
);
