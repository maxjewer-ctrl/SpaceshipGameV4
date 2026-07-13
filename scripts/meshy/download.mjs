// Downloads a completed Meshy task's GLB (+ thumbnail) into src/assets/models/.
// Usage: npm run meshy:download -- --id <task-id> --name cargo-ship [--kind text-to-3d|image-to-3d]
import { meshyFetch, downloadUrlTo, parseArgs } from "./lib.mjs";

const args = parseArgs(process.argv.slice(2));
if (!args.id || !args.name) {
  console.error("Usage: npm run meshy:download -- --id <task-id> --name <output-name> [--kind text-to-3d|image-to-3d]");
  process.exit(1);
}

const kind = args.kind ?? "text-to-3d";
const endpoint = kind === "image-to-3d" ? "v1/image-to-3d" : "v2/text-to-3d";

const task = await meshyFetch(`/openapi/${endpoint}/${args.id}`);
if (task.status !== "SUCCEEDED") {
  console.error(`Task ${args.id} is not finished yet (status: ${task.status}). Nothing to download.`);
  process.exit(1);
}
if (!task.model_urls?.glb) {
  console.error(`Task ${args.id} has no GLB output.`);
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
