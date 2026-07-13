// Batch-generates every entry in a manifest JSON ([{name, prompt, pbr?}]) via
// Meshy text-to-3d (preview -> refine) and downloads each GLB into src/assets/models/.
// Usage: npm run meshy:batch -- --manifest scripts/meshy/manifests/spaceport.json [--concurrency 2]
import { readFile, writeFile } from "node:fs/promises";
import { meshyFetch, pollTask, downloadUrlTo, parseArgs } from "./lib.mjs";

const args = parseArgs(process.argv.slice(2));
const manifestPath = args.manifest ?? "scripts/meshy/manifests/spaceport.json";
const concurrency = Number(args.concurrency ?? 2);

const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const results = [];

async function generateOne(item) {
  const label = item.name;
  try {
    console.log(`[${label}] creating preview task...`);
    const { result: previewId } = await meshyFetch("/openapi/v2/text-to-3d", {
      method: "POST",
      body: JSON.stringify({
        mode: "preview",
        prompt: item.prompt,
        ai_model: "latest",
        should_remesh: true,
        target_formats: ["glb"],
      }),
    });
    await pollTask("v2/text-to-3d", previewId);

    console.log(`[${label}] preview done, refining...`);
    const { result: refineId } = await meshyFetch("/openapi/v2/text-to-3d", {
      method: "POST",
      body: JSON.stringify({
        mode: "refine",
        preview_task_id: previewId,
        enable_pbr: Boolean(item.pbr),
        target_formats: ["glb"],
      }),
    });
    const task = await pollTask("v2/text-to-3d", refineId);

    if (!task.model_urls?.glb) throw new Error("no glb in refined task result");

    const glbPath = `src/assets/models/${label}.glb`;
    await downloadUrlTo(task.model_urls.glb, glbPath);
    console.log(`[${label}] saved ${glbPath}`);

    if (task.thumbnail_url) {
      await downloadUrlTo(task.thumbnail_url, `src/assets/models/${label}-thumb.png`);
    }

    results.push({ name: label, status: "ok", path: glbPath, taskId: refineId });
  } catch (err) {
    console.error(`[${label}] FAILED: ${err.message}`);
    results.push({ name: label, status: "error", error: err.message });
  }
}

// Simple fixed-size worker pool over the manifest queue.
const queue = [...manifest];
async function worker() {
  while (queue.length) {
    const item = queue.shift();
    if (item) await generateOne(item);
  }
}
await Promise.all(Array.from({ length: concurrency }, worker));

const outPath = manifestPath.replace(/\.json$/, "-results.json");
await writeFile(outPath, JSON.stringify(results, null, 2));
console.log(`\nDone. ${results.filter((r) => r.status === "ok").length}/${manifest.length} succeeded. Results written to ${outPath}`);
