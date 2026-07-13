// Shared helpers for the Meshy.ai asset-pipeline scripts (scripts/meshy/*).
// Run these via `npm run meshy:*` — they load MESHY_API_KEY from .env via Node's --env-file flag.
import { writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

const BASE_URL = "https://api.meshy.ai";

function apiKey() {
  const key = process.env.MESHY_API_KEY;
  if (!key) {
    throw new Error(
      "MESHY_API_KEY is not set. Add it to .env, then run scripts with `node --env-file=.env ...` (or `npm run meshy:*`)."
    );
  }
  return key;
}

export async function meshyFetch(path, options = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${apiKey()}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Meshy API ${res.status} ${res.statusText} on ${path}: ${body}`);
  }
  return res.json();
}

// endpointPath e.g. "v2/text-to-3d" or "v1/image-to-3d" — Meshy versions these independently per endpoint.
export async function pollTask(endpointPath, taskId, { intervalMs = 5000, timeoutMs = 20 * 60 * 1000 } = {}) {
  const started = Date.now();
  for (;;) {
    const task = await meshyFetch(`/openapi/${endpointPath}/${taskId}`);
    process.stdout.write(`\r  ${endpointPath} ${taskId}: ${task.status} ${task.progress ?? ""}%   `);
    if (task.status === "SUCCEEDED") {
      process.stdout.write("\n");
      return task;
    }
    if (task.status === "FAILED" || task.status === "CANCELED") {
      process.stdout.write("\n");
      throw new Error(`Meshy task ${taskId} ended with status ${task.status}: ${JSON.stringify(task.task_error ?? {})}`);
    }
    if (Date.now() - started > timeoutMs) {
      throw new Error(`Meshy task ${taskId} timed out after ${timeoutMs}ms`);
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

export async function downloadUrlTo(url, filePath) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to download ${url}: ${res.status} ${res.statusText}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, buf);
  return filePath;
}

export function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("--")) {
        out[key] = next;
        i++;
      } else {
        out[key] = true;
      }
    } else {
      out._.push(a);
    }
  }
  return out;
}
