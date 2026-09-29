import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import electron from 'electron';

const root = path.resolve(import.meta.dirname, '..');
const tests = readdirSync(path.join(root, 'tests')).filter(file => file.endsWith('.test.ts')).sort().map(file => path.join(root, 'tests', file));
// Match the desktop application's Node runtime; do not change the parent process environment.
const result = spawnSync(electron, ['--import', 'tsx', '--test', '--test-concurrency=1', ...tests], {
  cwd: root, env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, stdio: 'inherit', windowsHide: true,
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
