// Re-textures a completed mesh task with a new text or image style (variant work,
// e.g. alternate crew outfits/skins). Not part of the base rig+animate pipeline.
//
// Usage: npm run meshy:retexture -- --taskId <source-task-id> --name crew-vex-variant --prompt "worn desert flight suit, tan and rust" [--pbr]
//        npm run meshy:retexture -- --taskId <source-task-id> --name crew-vex-variant --image path/to/style.png [--pbr]
import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import { meshyFetch, pollTask, downloadUrlTo, parseArgs } from "./lib.mjs";

const args = parseArgs(process.argv.slice(2));
if (!args.taskId || !args.name || (!args.prompt && !args.image)) {
  console.error(
    'Usage: npm run meshy:retexture -- --taskId <source-task-id> --name <output-name> (--prompt "style description" | --image path/to/style.png) [--pbr]'
  );
  process.exit(1);
}

const body = {
  input_task_id: args.taskId,
  enable_pbr: Boolean(args.pbr),
  target_formats: ["glb"],
};

if (args.image) {
  const ext = extname(args.image).slice(1) || "png";
  const buf = await readFile(args.image);
  body.image_style_url = `data:image/${ext};base64,${buf.toString("base64")}`;
} else {
  body.text_style_prompt = args.prompt;
}

console.log(`Creating retexture task for "${args.name}" (source ${args.taskId})...`);
const { result: taskId } = await meshyFetch("/openapi/v1/retexture", {
  method: "POST",
  body: JSON.stringify(body),
});
console.log("retexture task id:", taskId);

const task = await pollTask("v1/retexture", taskId);
if (!task.model_urls?.glb) {
  console.error("Retexture task succeeded but returned no GLB URL:", JSON.stringify(task, null, 2));
  process.exit(1);
}

const glbPath = `src/assets/models/${args.name}.glb`;
await downloadUrlTo(task.model_urls.glb, glbPath);
console.log(`Saved ${glbPath}`);

if (task.thumbnail_url) {
  const thumbPath = `src/assets/models/${args.name}-thumb.png`;
  await downloadUrlTo(task.thumbnail_url, thumbPath);
  console.log(`Saved ${thumbPath}`);
}
