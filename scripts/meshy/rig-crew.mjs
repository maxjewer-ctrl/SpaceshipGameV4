// Rigs the crew statues. The crew GLBs in src/assets/models/ came out of
// text-to-3d as static meshes -- no skin, no joints, no clips -- so walk3d could
// only slide them around the deck. Meshy's rigging endpoint hands back the same
// character skinned to a biped armature with a walk cycle baked in: the same
// asset shape as captain-explorer.glb, which ui/playerModel3d.ts already drives
// through an AnimationMixer.
//
//   npm run meshy:rig-crew -- --only ada,rook          # pilot two (5 credits each)
//   npm run meshy:rig-crew -- --all                    # the whole roster
//
// We re-upload the mesh rather than passing `input_task_id` from the dossier
// manifest: Meshy has since expired those tasks (both the text-to-3d and
// rigging endpoints 404 the ids), so the local GLB is now the only copy. The
// endpoint's other input is `model_url`, which takes a data URI, so the file
// goes up inline and we never have to host it anywhere public.
//
// Rigged GLBs overwrite the static ones in place, so ui/walk3d.ts needs no new
// URLs -- it just starts finding animations in the files it already loads. Git
// holds the statues if a rig comes back mangled.
//
// Meshy only rigs textured humanoid bipeds under 300k faces that face +Z. A
// crew member who fails those (pip7, most likely -- it's not a biped) just stays
// a statue, which walk3d still renders fine.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { meshyFetch, pollTask, downloadUrlTo, parseArgs } from "./lib.mjs";

const args = parseArgs(process.argv.slice(2));
const manifestPath = args.manifest ?? "scripts/meshy/manifests/crew-dossier-results.json";

const source = JSON.parse(await readFile(manifestPath, "utf8"));
const generated = source.filter((r) => r.status === "ok");

// --only ada,rook addresses crew by bare name; the manifest keys them crew-ada.
const only = typeof args.only === "string"
  ? args.only.split(",").map((s) => s.trim().replace(/^crew-/, "")).filter(Boolean)
  : null;
if (!only && !args.all) {
  console.error("Refusing to spend credits by accident: pass --only ada,rook or --all.");
  console.error(`Roster: ${generated.map((r) => r.name.replace(/^crew-/, "")).join(", ")}`);
  process.exit(1);
}
const queue = only
  ? only.map((name) => {
      const hit = generated.find((r) => r.name === `crew-${name}` || r.name === name);
      if (!hit) throw new Error(`no generated model named "${name}" in ${manifestPath}`);
      return hit;
    })
  : generated;

// Meshy scales the rig it fits from this, so it wants the character's real-world
// height, not the 1.28m walk3d shrinks actors to for the deck's camera.
const HEIGHT_METERS = Number(args.height ?? 1.7);

// Rigging only ships walking/running clips, and the crew don't walk -- walk3d
// stands them at fixed posts -- so a walk cycle would just moonwalk them in
// place. What a standing NPC needs is an idle, which lives in the animation
// library. Deal each crew member a different one by roster position so a deck
// full of people doesn't breathe in unison: ids 0/11/12 and 243+ are Meshy's
// idle set. An id the library rejects fails only that crew member, who keeps
// their statue.
const IDLE_ACTIONS = [0, 11, 12, 243, 244, 245, 246, 247, 248, 249, 250, 251, 252, 253];
const idleFor = (name) => {
  const i = generated.findIndex((r) => r.name === name);
  return IDLE_ACTIONS[(i < 0 ? 0 : i) % IDLE_ACTIONS.length];
};

const resultsPath = "scripts/meshy/manifests/crew-rigging-results.json";
const prior = await readFile(resultsPath, "utf8").then(JSON.parse).catch(() => []);

// Meshy names the animated GLB differently per endpoint and has renamed these
// fields before; rather than hardcode a key, take the first .glb in the result
// that isn't the armature-only variant (which carries bones but no mesh).
function findGlbUrl(obj) {
  const urls = [];
  (function walk(node) {
    if (typeof node === "string") { if (node.startsWith("http") && node.includes(".glb")) urls.push(node); return; }
    if (node && typeof node === "object") for (const v of Object.values(node)) walk(v);
  })(obj);
  return urls.find((u) => !/armature/i.test(u)) ?? null;
}

console.log(`Rigging + idling ${queue.length} crew: ${queue.map((r) => r.name).join(", ")}\n`);
await mkdir("scripts/meshy/raw", { recursive: true });

const results = [];
for (const item of queue) {
  const label = item.name;
  try {
    // A crew member we already rigged keeps their rig task: re-rigging would
    // cost credits again *and* upload the rigged GLB we wrote over the statue
    // with, feeding a skinned mesh back into a rigger that wants a plain one.
    let rigId = prior.find((p) => p.name === label && p.status === "ok")?.riggingTaskId;
    if (rigId && !args.rerig) {
      console.log(`[${label}] reusing rig ${rigId}`);
    } else {
      const srcPath = item.path ?? `src/assets/models/${label}.glb`;
      const glb = await readFile(srcPath);
      console.log(`[${label}] uploading ${srcPath} (${(glb.length / 1048576).toFixed(1)}MB) to rig...`);
      ({ result: rigId } = await meshyFetch("/openapi/v1/rigging", {
        method: "POST",
        body: JSON.stringify({
          model_url: `data:model/gltf-binary;base64,${glb.toString("base64")}`,
          height_meters: HEIGHT_METERS,
        }),
      }));
      await pollTask("v1/rigging", rigId);
    }

    const actionId = Number(args.action ?? idleFor(label));
    console.log(`[${label}] applying idle action ${actionId}...`);
    const { result: animId } = await meshyFetch("/openapi/v1/animations", {
      method: "POST",
      body: JSON.stringify({ rig_task_id: rigId, action_id: actionId }),
    });
    const task = await pollTask("v1/animations", animId);

    const glbUrl = findGlbUrl(task.result ?? task);
    if (!glbUrl) throw new Error(`animation succeeded but returned no glb: ${JSON.stringify(task.result ?? {})}`);

    // Meshy re-bakes the albedo large on the way out, so the animated file lands
    // fat. Squeeze it back down or we undo the 413MB -> 57MB bundle work.
    const rawPath = `scripts/meshy/raw/${label}-idle-${actionId}.glb`;
    await downloadUrlTo(glbUrl, rawPath);
    const outPath = `src/assets/models/${label}.glb`;
    execFileSync("node", ["scripts/meshy/shrink-texture.mjs", rawPath, outPath], { stdio: "inherit" });

    console.log(`[${label}] idle ${actionId} -> ${outPath}\n`);
    results.push({ name: label, status: "ok", path: outPath, riggingTaskId: rigId, animationTaskId: animId, actionId });
  } catch (err) {
    console.error(`[${label}] FAILED: ${err.message}\n`);
    results.push({ name: label, status: "error", error: err.message });
  }
}

const outPath = resultsPath;
const merged = [...prior.filter((p) => !results.some((r) => r.name === p.name)), ...results];
await writeFile(outPath, JSON.stringify(merged, null, 2));

const ok = results.filter((r) => r.status === "ok").length;
console.log(`Done. ${ok}/${queue.length} rigged. Results written to ${outPath}`);
if (ok < queue.length) console.log("Failed crew keep their static mesh -- walk3d renders them unanimated.");
