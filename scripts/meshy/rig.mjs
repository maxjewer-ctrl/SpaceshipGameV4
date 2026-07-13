// Rigs a completed text-to-3d (or image-to-3d) task into a humanoid skeleton via Meshy.
// The rig response also includes free walking/running animations (basic_animations) —
// animate.mjs pulls those directly instead of spending credits on a duplicate walk call.
//
// Usage: npm run meshy:rig -- --taskId <source-task-id> --name crew-vex [--height 1.75]
import { meshyFetch, pollTask, parseArgs } from "./lib.mjs";
import { readManifest, writeManifest } from "./manifest.mjs";

const args = parseArgs(process.argv.slice(2));
if (!args.taskId || !args.name) {
  console.error("Usage: npm run meshy:rig -- --taskId <source-task-id> --name <crew-name> [--height 1.75]");
  process.exit(1);
}

const heightMeters = Number(args.height ?? 1.75);

console.log(`Creating rigging task for "${args.name}" (source ${args.taskId}, height ${heightMeters}m)...`);
const { result: rigTaskId } = await meshyFetch("/openapi/v1/rigging", {
  method: "POST",
  body: JSON.stringify({
    input_task_id: args.taskId,
    height_meters: heightMeters,
  }),
});
console.log("rig task id:", rigTaskId);

const rigTask = await pollTask("v1/rigging", rigTaskId);
if (!rigTask.result?.rigged_character_glb_url) {
  console.error("Rig task succeeded but returned no rigged GLB URL:", JSON.stringify(rigTask, null, 2));
  process.exit(1);
}

const manifest = await readManifest();
manifest[args.name] = {
  ...manifest[args.name],
  name: args.name,
  sourceTaskId: args.taskId,
  rigTaskId,
  heightMeters,
  riggedAt: new Date().toISOString(),
};
await writeManifest(manifest);

console.log(`Rigged "${args.name}" -> rigTaskId ${rigTaskId} (saved to manifest).`);
console.log(`Free basic animations available: ${Object.keys(rigTask.result.basic_animations ?? {}).join(", ")}`);
