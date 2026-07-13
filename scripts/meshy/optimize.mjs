// Compresses a raw Meshy GLB (~9 MB) down to a shippable size (~300-400 KB) via
// @gltf-transform/cli's `optimize` (draco geometry + webp textures). Shells out —
// no runtime dependency needed, matches the recipe proven on crew-vex (8.7 MB -> 284 KB).
//
// Usage: npm run meshy:optimize -- --in scripts/meshy/raw/crew-vex-idle.glb --out src/assets/models/crew-vex-idle.glb
//        npm run meshy:optimize -- --name crew-vex --action idle   (resolves in/out via manifest)
//        npm run meshy:optimize -- --name crew-vex --all           (optimizes every recorded animation)
import { spawn } from "node:child_process";
import { stat } from "node:fs/promises";
import { parseArgs } from "./lib.mjs";
import { readManifest, writeManifest } from "./manifest.mjs";

const args = parseArgs(process.argv.slice(2));
const textureSize = args.textureSize ?? "1024";

function run(cmd, cmdArgs) {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, cmdArgs, { stdio: "inherit" });
    proc.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited with code ${code}`))));
  });
}

async function optimizeOne(inPath, outPath) {
  console.log(`Optimizing ${inPath} -> ${outPath}...`);
  await run("npx", [
    "--yes",
    "@gltf-transform/cli@4",
    "optimize",
    inPath,
    outPath,
    "--compress",
    "draco",
    "--texture-compress",
    "webp",
    "--texture-size",
    String(textureSize),
  ]);
  const before = (await stat(inPath)).size;
  const after = (await stat(outPath)).size;
  console.log(`  ${(before / 1e6).toFixed(2)} MB -> ${(after / 1024).toFixed(0)} KB`);
}

if (args.in && args.out) {
  await optimizeOne(args.in, args.out);
  process.exit(0);
}

if (!args.name) {
  console.error(
    "Usage: npm run meshy:optimize -- --in <raw.glb> --out <optimized.glb>\n" +
      "   or: npm run meshy:optimize -- --name <crew-name> --action <action> [--textureSize 1024]\n" +
      "   or: npm run meshy:optimize -- --name <crew-name> --all"
  );
  process.exit(1);
}

const manifest = await readManifest();
const entry = manifest[args.name];
if (!entry?.animations) {
  console.error(`No animations recorded for "${args.name}" — run meshy:animate first.`);
  process.exit(1);
}

const actionsToRun = args.all ? Object.keys(entry.animations) : [args.action];
if (!args.all && !args.action) {
  console.error("Pass --action <name> or --all.");
  process.exit(1);
}

for (const action of actionsToRun) {
  const anim = entry.animations[action];
  if (!anim) {
    console.error(`No raw animation "${action}" for "${args.name}" — skipping.`);
    continue;
  }
  const outPath = `src/assets/models/${args.name}-${action}.glb`;
  await optimizeOne(anim.rawPath, outPath);
  anim.optimizedPath = outPath;
}

manifest[args.name] = entry;
await writeManifest(manifest);
