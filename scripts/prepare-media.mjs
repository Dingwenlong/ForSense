import { mkdir, copyFile, readFile, writeFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
const root = path.resolve(import.meta.dirname, '..');
const source = process.env.SOCIAL_COPY_FFMPEG_DIRECTORY || 'C:/Program Files/ffmpeg/bin';
await mkdir(path.join(root, 'resources/media'), { recursive: true });
await mkdir(path.join(root, 'resources/licenses'), { recursive: true });
const records = [];
for (const name of ['ffmpeg.exe', 'ffprobe.exe']) {
  const target = path.join(root, 'resources/media', name);
  await copyFile(path.join(source, name), target);
  records.push({ name, size: (await stat(target)).size, sha256: createHash('sha256').update(await readFile(target)).digest('hex') });
}
const version = execFileSync(path.join(source, 'ffmpeg.exe'), ['-version'], { encoding: 'utf8', windowsHide: true }).split(/\r?\n/).slice(0, 3).join('\n');
await writeFile(path.join(root, 'resources/media/manifest.json'), JSON.stringify({ binaries: records, version, source: 'https://www.gyan.dev/ffmpeg/builds/', upstream: 'https://ffmpeg.org/releases/' }, null, 2));
await copyFile(path.join(source, '../LICENSE'), path.join(root, 'resources/licenses/FFmpeg-COPYING.txt'));
console.log('FFmpeg and FFprobe prepared:', records.map(r => `${r.name} ${Math.round(r.size / 1048576)} MB`).join(', '));
// Original small bitmap app icon, generated from geometric shapes.
const size = 64, pixels = Buffer.alloc(size * size * 4), mask = Buffer.alloc(size * size / 8);
for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
  const round = Math.min(x, size - 1 - x) < 7 && Math.min(y, size - 1 - y) < 7;
  let c = round ? [0, 0, 0, 0] : [57, 108, 87, 255];
  if (x >= 15 && x <= 43 && y >= 13 && y <= 44) c = [132, 166, 139, 255];
  if (x >= 22 && x <= 49 && y >= 21 && y <= 52) c = [229, 241, 245, 255];
  if (x >= 28 && x <= 43 && ((y >= 29 && y <= 32) || (y >= 37 && y <= 39) || (y >= 44 && y <= 46))) c = [57, 108, 87, 255];
  const at = ((size - 1 - y) * size + x) * 4; c.forEach((n, i) => pixels[at + i] = n);
}
const dib = Buffer.alloc(40); dib.writeUInt32LE(40); dib.writeInt32LE(size, 4); dib.writeInt32LE(size * 2, 8); dib.writeUInt16LE(1, 12); dib.writeUInt16LE(32, 14); dib.writeUInt32LE(pixels.length, 20);
const header = Buffer.alloc(22); header.writeUInt16LE(1, 2); header.writeUInt16LE(1, 4); header[6] = size; header[7] = size; header.writeUInt16LE(1, 10); header.writeUInt16LE(32, 12); header.writeUInt32LE(dib.length + pixels.length + mask.length, 14); header.writeUInt32LE(22, 18);
await writeFile(path.join(root, 'resources/icon.ico'), Buffer.concat([header, dib, pixels, mask]));
