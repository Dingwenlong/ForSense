import { createReadStream } from 'node:fs';
import { readFile, stat, open, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import path from 'node:path';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const yauzl = require('yauzl');
const root = path.resolve(import.meta.dirname, '..');
const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const hashFile = async (file, algorithm = 'sha256') => { const hash = createHash(algorithm); for await (const block of createReadStream(file)) hash.update(block); return hash.digest('hex'); };
const portable = path.join(root, `out/make/zip/win32/x64/SocialCopyStudio-win32-x64-${pkg.version}.zip`);
const installerDir = path.join(root, 'out/make/squirrel.windows/x64');
const installer = path.join(installerDir, 'SocialCopyStudio-Setup.exe');
const nupkg = path.join(installerDir, `SocialCopyStudio-${pkg.version}-full.nupkg`);
const records = [];
for (const file of [installer, portable, nupkg]) records.push({ file: path.relative(root, file).replaceAll('\\', '/'), bytes: (await stat(file)).size, sha256: await hashFile(file) });
const header = Buffer.alloc(2), handle = await open(installer); try { await handle.read(header, 0, 2, 0); } finally { await handle.close(); }
assert.equal(header.toString(), 'MZ');
const releases = (await readFile(path.join(installerDir, 'RELEASES'), 'utf8')).trim().split(/\s+/);
assert.equal(releases[0].toLowerCase(), await hashFile(nupkg, 'sha1'));
assert.equal(Number(releases[2]), (await stat(nupkg)).size);
const needed = ['SocialCopyStudio.exe', 'resources/app.asar', 'resources/media/ffmpeg.exe', 'resources/media/ffprobe.exe', 'resources/licenses/FFmpeg-COPYING.txt', 'resources/licenses/THIRD_PARTY_NOTICES.md', 'resources/使用说明.md'];
const packaged = path.join(root, 'out/SocialCopyStudio-win32-x64');
const checked = [];
await new Promise((resolve, reject) => {
  yauzl.open(portable, { lazyEntries: true }, (error, zip) => {
    if (error) return reject(error);
    zip.on('error', reject);
    zip.on('end', resolve);
    zip.on('entry', entry => {
      if (!needed.includes(entry.fileName)) { zip.readEntry(); return; }
      zip.openReadStream(entry, async (error, stream) => {
        if (error) return reject(error);
        try {
          const hash = createHash('sha256'); for await (const block of stream) hash.update(block);
          assert.equal(hash.digest('hex'), await hashFile(path.join(packaged, entry.fileName)));
          checked.push(entry.fileName); zip.readEntry();
        } catch (error) { zip.close(); reject(error); }
      });
    });
    zip.readEntry();
  });
});
assert.deepEqual(checked.sort(), needed.sort());
const output = path.join(root, 'output/verification'); await mkdir(output, { recursive: true });
await writeFile(path.join(output, 'delivery-checks.json'), JSON.stringify({ version: pkg.version, records, verifiedPortableEntries: checked, squirrelReleaseHashVerified: true }, null, 2));
console.log(JSON.stringify({ version: pkg.version, files: records.map(r => ({ name: path.basename(r.file), MB: Math.round(r.bytes / 1048576) })), verifiedPortableEntries: checked.length, squirrelReleaseHashVerified: true }, null, 2));
