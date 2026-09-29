import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { Store, type AssetRecord } from '../src/core/store';
import { makeTestDirectory } from './test-data';

test('legacy origin recovery uses edit relationships and original copies without rewriting records or guessing from names', async () => {
  const store = new Store(await makeTestDirectory('media-origin-')); await store.init();
  async function legacy(patch: Partial<AssetRecord> = {}, hasOriginal = false) {
    const id = randomUUID(), record: AssetRecord = { id, originalId: id, kind: 'image', name: '同名素材.png', width: 100, height: 100, edits: { rotation: 0 }, imageFile: 'image.png', ...patch };
    const directory = store.directory('assets', id); await fs.mkdir(directory);
    if (hasOriginal) await fs.writeFile(path.join(directory, 'original.PNG'), 'original bytes');
    const file = path.join(directory, 'asset.json'), text = JSON.stringify(record); await fs.writeFile(file, text);
    const resolved = await store.asset(id); assert.equal(await fs.readFile(file, 'utf8'), text);
    return resolved;
  }
  const uploaded = await legacy({}, true); assert.equal(uploaded.origin, 'import');
  const cropped = await legacy({ originalId: uploaded.id, edits: { rotation: 0, crop: { x: 0, y: 0, width: 0.5, height: 1 } } });
  assert.equal(cropped.origin, 'crop');
  const rotated = await legacy({ originalId: uploaded.id, edits: { rotation: 90 } }); assert.equal(rotated.origin, 'rotate');
  const optimized = await legacy({ optimization: { sourceId: uploaded.id, templateId: 'natural', prompt: '自然', importedAt: new Date().toISOString() } }); assert.equal(optimized.origin, 'optimization');
  assert.equal((await legacy({ originalId: optimized.id, optimization: optimized.optimization, edits: cropped.edits })).origin, 'crop');
  assert.equal((await legacy({ kind: 'live' })).origin, 'live');
  assert.equal((await legacy({ name: '视频.mp4 · 1.00秒' })).origin, 'unknown');
  await store.updateAsset(cropped.id, { name: '重命名后.png', favorite: true });
  assert.equal((await new Store(store.root).asset(cropped.id)).origin, 'crop');
});
