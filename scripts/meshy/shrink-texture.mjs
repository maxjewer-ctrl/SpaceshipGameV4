// Meshy exports bake their albedo at 4096x4096 PNG, which lands a single
// character at ~25MB -- most of it one texture. This rewrites a .glb in place-ish
// (to a new path), downscaling every embedded image and re-encoding it as JPEG.
//
//   node scripts/meshy/shrink-texture.mjs <in.glb> <out.glb> [maxSize=2048] [quality=88]
//
// JPEG is safe for these: Meshy's material is OPAQUE (no alphaMode), so the
// PNG's alpha channel is dead weight. If a future asset needs alpha, keep PNG
// and just resize -- pass quality=0 to do that.
import { readFileSync, writeFileSync } from "node:fs";
import sharp from "sharp";

const [, , inPath, outPath, maxArg, qualityArg] = process.argv;
if (!inPath || !outPath) {
  console.error("usage: shrink-texture.mjs <in.glb> <out.glb> [maxSize] [quality]");
  process.exit(1);
}
const MAX = Number(maxArg ?? 2048);
const QUALITY = Number(qualityArg ?? 88);

const glb = readFileSync(inPath);
if (glb.readUInt32LE(0) !== 0x46546c67) throw new Error(`${inPath} is not a GLB`);

// GLB: 12-byte header, then chunks of [u32 length][u32 type][data].
const jsonLen = glb.readUInt32LE(12);
const json = JSON.parse(glb.subarray(20, 20 + jsonLen).toString("utf8"));
const binStart = 20 + jsonLen + 8; // skip the BIN chunk's own length+type
const bin = glb.subarray(binStart, binStart + glb.readUInt32LE(20 + jsonLen));

// Re-encode each image, keyed by the bufferView it lives in.
const replaced = new Map();
for (const image of json.images ?? []) {
  if (image.bufferView === undefined) continue;
  const view = json.bufferViews[image.bufferView];
  const src = bin.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength);
  const meta = await sharp(src).metadata();
  const pipeline = sharp(src).resize(MAX, MAX, { fit: "inside", withoutEnlargement: true });
  const out = QUALITY > 0
    ? await pipeline.jpeg({ quality: QUALITY, mozjpeg: true }).toBuffer()
    : await pipeline.png({ compressionLevel: 9 }).toBuffer();
  if (QUALITY > 0) image.mimeType = "image/jpeg";
  replaced.set(image.bufferView, out);
  console.log(
    `  ${image.name ?? "image"}: ${meta.width}x${meta.height} ${meta.format} ` +
    `${(view.byteLength / 1048576).toFixed(1)}MB -> ${Math.min(MAX, meta.width)}px ` +
    `${QUALITY > 0 ? "jpeg" : "png"} ${(out.length / 1048576).toFixed(2)}MB`,
  );
}
if (!replaced.size) console.log("  (no embedded images)");

// Rebuild the binary chunk: same bufferView order, new offsets, 4-byte aligned.
const chunks = [];
let offset = 0;
json.bufferViews.forEach((view, i) => {
  const data = replaced.get(i)
    ?? bin.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength);
  const pad = (4 - (offset % 4)) % 4;
  if (pad) { chunks.push(Buffer.alloc(pad)); offset += pad; }
  view.byteOffset = offset;
  view.byteLength = data.length;
  chunks.push(data);
  offset += data.length;
});
const newBin = Buffer.concat(chunks);
json.buffers[0].byteLength = newBin.length;
delete json.buffers[0].uri; // GLB buffer 0 is the BIN chunk; it must stay uri-less

const pad = (buf, byte) => {
  const extra = (4 - (buf.length % 4)) % 4;
  return extra ? Buffer.concat([buf, Buffer.alloc(extra, byte)]) : buf;
};
const jsonChunk = pad(Buffer.from(JSON.stringify(json), "utf8"), 0x20); // spaces
const binChunk = pad(newBin, 0x00);

const header = Buffer.alloc(12);
header.writeUInt32LE(0x46546c67, 0); // "glTF"
header.writeUInt32LE(2, 4);
header.writeUInt32LE(12 + 8 + jsonChunk.length + 8 + binChunk.length, 8);

const chunkHeader = (len, type) => {
  const b = Buffer.alloc(8);
  b.writeUInt32LE(len, 0);
  b.writeUInt32LE(type, 4);
  return b;
};

writeFileSync(outPath, Buffer.concat([
  header,
  chunkHeader(jsonChunk.length, 0x4e4f534a), // JSON
  jsonChunk,
  chunkHeader(binChunk.length, 0x004e4942), // BIN
  binChunk,
]));

console.log(
  `${inPath} ${(glb.length / 1048576).toFixed(1)}MB -> ` +
  `${outPath} ${(binChunk.length / 1048576 + jsonChunk.length / 1048576).toFixed(2)}MB`,
);
