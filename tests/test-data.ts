import { promises as fs } from 'node:fs';
import path from 'node:path';

export async function makeTestDirectory(prefix: string) {
  const directory = path.resolve('output/test-data');
  await fs.mkdir(directory, { recursive: true });
  return fs.mkdtemp(path.join(directory, prefix));
}
