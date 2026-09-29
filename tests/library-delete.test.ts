import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { Store } from '../src/core/store';
import { deleteLibraryItems } from '../src/core/library-delete';
import { makeTestDirectory } from './test-data';

test('batch deletion protects references, rolls back failures and retains all files in one recycle operation', async () => {
  const root = await makeTestDirectory('library-delete-'), store = new Store(path.join(root, '库')); await store.init();
  async function asset(originalId?: string) {
    const id = randomUUID(); await fs.mkdir(store.directory('assets', id));
    await fs.writeFile(path.join(store.directory('assets', id), 'image.jpg'), 'preserved bytes');
    return store.writeAsset({ id, originalId: originalId || id, kind: 'image', name: '测试图', width: 10, height: 10, edits: { rotation: 0 }, imageFile: 'image.jpg' });
  }
  const original = await asset(), derived = await asset(original.id);
  const refs = [original, derived].map(a => ({ kind: 'asset' as const, id: a.id }));
  let calls = 0;
  const recycle = async (directory: string) => { calls++; await fs.rename(directory, path.join(root, 'recycled')); };
  await assert.rejects(deleteLibraryItems(store, [refs[0]], recycle), /仍引用/);
  const draft = await store.create('moments'); await store.save({ ...draft, items: [derived] });
  await assert.rejects(deleteLibraryItems(store, refs, recycle), /仍用于草稿/);
  assert.equal(calls, 0);
  await store.save({ ...draft, items: [] });
  await assert.rejects(deleteLibraryItems(store, refs, async () => { throw new Error('模拟回收站失败'); }), /模拟回收站失败/);
  assert.equal((await store.library()).assets.length, 2);
  assert.equal(await fs.readFile(await store.assetPath(original.id, 'image'), 'utf8'), 'preserved bytes');
  const videoId = randomUUID(); await fs.mkdir(store.directory('sources', videoId));
  await fs.writeFile(path.join(store.directory('sources', videoId), 'source.mp4'), 'video bytes');
  await store.writeSource({ id: videoId, name: 'video', videoFile: 'source.mp4', duration: 1, width: 10, height: 10, frames: [0], hasAudio: false });
  assert.deepEqual(await deleteLibraryItems(store, [...refs, refs[0], { kind: 'video', id: videoId }], recycle), { count: 3 });
  assert.equal(calls, 1); assert.equal((await store.library()).assets.length, 0); assert.equal((await store.library()).videos.length, 0);
  assert.equal(await fs.readFile(path.join(root, 'recycled', 'assets', original.id, 'image.jpg'), 'utf8'), 'preserved bytes');
  await assert.rejects(deleteLibraryItems(store, [{ kind: 'asset', id: '../outside' }], recycle));
});

test('startup restores interrupted delete transactions without replacing existing files', async () => {
  const root = await makeTestDirectory('library-delete-recover-'), store = new Store(root); await store.init();
  const id = randomUUID(), staging = path.join(root, 'temporary', `delete-${randomUUID()}`);
  await fs.mkdir(path.join(staging, 'assets', id), { recursive: true });
  await fs.writeFile(path.join(staging, 'assets', id, 'image.jpg'), 'recover me');
  await fs.writeFile(path.join(staging, 'manifest.json'), JSON.stringify({ version: 1, items: [{ kind: 'asset', id }] }));
  await fs.mkdir(store.directory('assets', id));
  await assert.rejects(new Store(root).init(), /同名素材/);
  await fs.rmdir(store.directory('assets', id));
  await new Store(root).init();
  assert.equal(await fs.readFile(path.join(store.directory('assets', id), 'image.jpg'), 'utf8'), 'recover me');
  assert.equal((await fs.readdir(path.join(root, 'temporary'))).length, 0);
});
