import { mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '..');
const destination = path.join(root, 'resources/licenses'); await mkdir(destination, { recursive: true });
for (const name of ['react', 'react-dom', 'scheduler', 'lucide-react', 'zod', 'yazl', 'yazl/node_modules/buffer-crc32', 'electron-squirrel-startup', 'electron-squirrel-startup/node_modules/debug', 'electron-squirrel-startup/node_modules/ms', '@fontsource-variable/noto-sans-sc']) {
  const dir = path.join(root, 'node_modules', name);
  const files = (await readdir(dir)).filter(file => /^(LICENSE|COPYING|OFL)([.-]|$)/i.test(file));
  if (!files.length) throw new Error(`License not found for ${name}`);
  for (const file of files) await writeFile(path.join(destination, name.replaceAll('/', '-') + '-' + file.replaceAll('.', '-') + '.txt'), await readFile(path.join(dir, file)));
}
console.log('Third-party license texts collected.');
