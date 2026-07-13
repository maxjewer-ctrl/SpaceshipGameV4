// Lists your existing Meshy tasks so you can see what's already been generated.
// Usage: npm run meshy:list -- [--kind text-to-3d|image-to-3d] [--page 1] [--size 20]
import { meshyFetch, parseArgs } from "./lib.mjs";

const args = parseArgs(process.argv.slice(2));
const kind = args.kind ?? "text-to-3d";
const endpoint = kind === "image-to-3d" ? "v1/image-to-3d" : "v2/text-to-3d";
const pageSize = args.size ?? 20;
const pageNum = args.page ?? 1;

const query =
  kind === "image-to-3d"
    ? `?page_size=${pageSize}&page_num=${pageNum}`
    : `?page_size=${pageSize}&sort_by=-created_at`;

const tasks = await meshyFetch(`/openapi/${endpoint}${query}`);
const list = Array.isArray(tasks) ? tasks : tasks.result ?? [];

if (list.length === 0) {
  console.log(`No ${kind} tasks found on this account.`);
} else {
  for (const t of list) {
    console.log(
      `${t.id}  [${t.status}]  ${t.mode ?? ""}  "${(t.prompt ?? t.name ?? "").slice(0, 60)}"  glb=${t.model_urls?.glb ? "yes" : "no"}`
    );
  }
}
