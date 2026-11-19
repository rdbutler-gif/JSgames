// Re-encode the textures inside a GLB as JPEG at a smaller size (uses ffmpeg on PATH).
// node tools/glb-texture.mjs <in.glb> <out.glb> [size=1024] [quality 2-31, lower is better=4]
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const [,, inPath, outPath, size = '1024', q = '4'] = process.argv;
const b = readFileSync(inPath);
const jsonLen = b.readUInt32LE(12);
const json = JSON.parse(b.subarray(20, 20 + jsonLen).toString());
const binStart = 20 + jsonLen + 8;
const bin = b.subarray(binStart, binStart + b.readUInt32LE(20 + jsonLen));
const dir = mkdtempSync(join(tmpdir(), 'glbtex-'));

const imageViews = new Map();
(json.images || []).forEach((img, i) => {
  if (img.bufferView === undefined) return;
  const v = json.bufferViews[img.bufferView];
  const src = join(dir, `i${i}.png`), dst = join(dir, `i${i}.jpg`);
  writeFileSync(src, bin.subarray(v.byteOffset || 0, (v.byteOffset || 0) + v.byteLength));
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', src, '-vf', `scale=${size}:${size}:flags=lanczos`, '-q:v', q, dst]);
  imageViews.set(img.bufferView, readFileSync(dst));
  img.mimeType = 'image/jpeg';
});

// Rebuild the binary chunk with every buffer view 4-byte aligned.
const parts = [];
let off = 0;
json.bufferViews.forEach((v, i) => {
  const data = imageViews.get(i) || bin.subarray(v.byteOffset || 0, (v.byteOffset || 0) + v.byteLength);
  const pad = (4 - (off % 4)) % 4;
  if (pad) { parts.push(Buffer.alloc(pad)); off += pad; }
  v.byteOffset = off; v.byteLength = data.length;
  parts.push(data); off += data.length;
});
const tail = (4 - (off % 4)) % 4; if (tail) parts.push(Buffer.alloc(tail));
const newBin = Buffer.concat(parts);
json.buffers[0].byteLength = newBin.length;
let js = Buffer.from(JSON.stringify(json));
js = Buffer.concat([js, Buffer.alloc((4 - (js.length % 4)) % 4, 0x20)]);
const header = Buffer.alloc(12); header.writeUInt32LE(0x46546c67, 0); header.writeUInt32LE(2, 4);
const jh = Buffer.alloc(8); jh.writeUInt32LE(js.length, 0); jh.writeUInt32LE(0x4e4f534a, 4);
const bh = Buffer.alloc(8); bh.writeUInt32LE(newBin.length, 0); bh.writeUInt32LE(0x004e4942, 4);
const out = Buffer.concat([header, jh, js, bh, newBin]);
out.writeUInt32LE(out.length, 8);
writeFileSync(outPath, out);
console.log(`${inPath}: ${b.length} -> ${out.length} bytes`);
