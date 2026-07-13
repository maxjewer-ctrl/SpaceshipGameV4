// Shared read/write for scripts/meshy/manifests/crew-rig-results.json, keyed by crew name.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

const MANIFEST_PATH = "scripts/meshy/manifests/crew-rig-results.json";

export async function readManifest() {
  try {
    return JSON.parse(await readFile(MANIFEST_PATH, "utf8"));
  } catch (err) {
    if (err.code === "ENOENT") return {};
    throw err;
  }
}

export async function writeManifest(manifest) {
  await mkdir(dirname(MANIFEST_PATH), { recursive: true });
  await writeFile(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + "\n");
}
