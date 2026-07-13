// Applies a Meshy animation preset to a rigged crew mesh (npm run meshy:rig first).
// "walk"/"run" are pulled straight from the rigging task's free basic_animations
// (no extra credits); anything else calls the Animation API with an action_id.
// See https://docs.meshy.ai for the full 0-696 action library ("idle" = 0).
//
// Usage: npm run meshy:animate -- --name crew-vex --action idle
//        npm run meshy:animate -- --name crew-vex --action walk
//        npm run meshy:animate -- --name crew-vex --action custom --actionId 106
import { meshyFetch, pollTask, downloadUrlTo, parseArgs } from "./lib.mjs";
import { readManifest, writeManifest } from "./manifest.mjs";

const PRESETS = { idle: 0 };
const FREE_RIG_ANIMATIONS = { walk: "walking", run: "running" };

const args = parseArgs(process.argv.slice(2));
if (!args.name || !args.action) {
  console.error("Usage: npm run meshy:animate -- --name <crew-name> --action idle|walk|run|<custom> [--actionId <n>]");
  process.exit(1);
}

const manifest = await readManifest();
const entry = manifest[args.name];
if (!entry?.rigTaskId) {
  console.error(`No rigTaskId for "${args.name}" — run npm run meshy:rig -- --taskId <id> --name ${args.name} first.`);
  process.exit(1);
}

const rawPath = `scripts/meshy/raw/${args.name}-${args.action}.glb`;

if (!args.actionId && FREE_RIG_ANIMATIONS[args.action]) {
  console.log(`Pulling free "${args.action}" animation from rig task ${entry.rigTaskId} (no extra credits)...`);
  const rigTask = await meshyFetch(`/openapi/v1/rigging/${entry.rigTaskId}`);
  const url = rigTask.result?.basic_animations?.[`${FREE_RIG_ANIMATIONS[args.action]}_glb_url`];
  if (!url) {
    console.error(`Rig task ${entry.rigTaskId} has no free "${args.action}" animation. Try --actionId to use the Animation API instead.`);
    process.exit(1);
  }
  await downloadUrlTo(url, rawPath);
  entry.animations = { ...entry.animations, [args.action]: { rawPath, source: "rig-free" } };
} else {
  const actionId = args.actionId !== undefined ? Number(args.actionId) : PRESETS[args.action];
  if (actionId === undefined) {
    console.error(`Unknown preset "${args.action}" — pass --actionId <n> (see Meshy's animation library reference).`);
    process.exit(1);
  }
  console.log(`Creating animation task for "${args.name}" (action_id ${actionId})...`);
  const { result: animTaskId } = await meshyFetch("/openapi/v1/animations", {
    method: "POST",
    body: JSON.stringify({ rig_task_id: entry.rigTaskId, action_id: actionId }),
  });
  console.log("animation task id:", animTaskId);

  const animTask = await pollTask("v1/animations", animTaskId);
  const url = animTask.result?.animation_glb_url;
  if (!url) {
    console.error("Animation task succeeded but returned no GLB URL:", JSON.stringify(animTask, null, 2));
    process.exit(1);
  }
  await downloadUrlTo(url, rawPath);
  entry.animations = { ...entry.animations, [args.action]: { rawPath, source: "animation-api", actionId, animTaskId } };
}

manifest[args.name] = entry;
await writeManifest(manifest);
console.log(`Saved raw "${args.action}" animation for "${args.name}" -> ${rawPath}`);
