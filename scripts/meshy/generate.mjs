// Generates a new 3D asset via Meshy and downloads the GLB into src/assets/models/.
//
// Text-to-3D:  npm run meshy:generate -- --prompt "sleek sci-fi cargo ship, low poly, hard surface" --name cargo-ship [--pbr]
// Image-to-3D: npm run meshy:generate -- --image path/to/concept.png --name cargo-ship [--pbr]
import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import { meshyFetch, pollTask, downloadUrlTo, parseArgs } from "./lib.mjs";

const args = parseArgs(process.argv.slice(2));
if (!args.name || (!args.prompt && !args.image)) {
  console.error(
    'Usage: npm run meshy:generate -- --name <output-name> (--prompt "text description" | --image path/to/file.png) [--pbr]'
  );
  process.exit(1);
}

const enablePbr = Boolean(args.pbr);

async function runTextTo3D() {
  console.log(`Creating text-to-3d preview task for "${args.prompt}"...`);
  const { result: previewId } = await meshyFetch("/openapi/v2/text-to-3d", {
    method: "POST",
    body: JSON.stringify({
      mode: "preview",
      prompt: args.prompt,
      ai_model: "latest",
      should_remesh: true,
      target_formats: ["glb"],
    }),
  });
  await pollTask("v2/text-to-3d", previewId);

  console.log("Preview mesh ready — refining with texture...");
  const { result: refineId } = await meshyFetch("/openapi/v2/text-to-3d", {
    method: "POST",
    body: JSON.stringify({
      mode: "refine",
      preview_task_id: previewId,
      enable_pbr: enablePbr,
      target_formats: ["glb"],
    }),
  });
  return pollTask("v2/text-to-3d", refineId);
}

async function runImageTo3D() {
  const ext = extname(args.image).slice(1) || "png";
  const buf = await readFile(args.image);
  const dataUri = `data:image/${ext};base64,${buf.toString("base64")}`;

  console.log(`Creating image-to-3d task from ${args.image}...`);
  const { result: taskId } = await meshyFetch("/openapi/v1/image-to-3d", {
    method: "POST",
    body: JSON.stringify({
      image_url: dataUri,
      enable_pbr: enablePbr,
      should_texture: true,
      target_formats: ["glb"],
    }),
  });
  return pollTask("v1/image-to-3d", taskId);
}

const task = args.image ? await runImageTo3D() : await runTextTo3D();

if (!task.model_urls?.glb) {
  console.error("Task succeeded but returned no GLB URL:", JSON.stringify(task, null, 2));
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
