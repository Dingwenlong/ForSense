import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { Store } from '../src/core/store';
import { migrateLibrary, loadLibraryDirectory } from '../src/core/library-location';
import { makeTestDirectory } from './test-data';

test('library migration copies and verifies assets, sources and drafts and persists the location without removing originals', async () => {
  const root = await makeTestDirectory('library-location-'), source = path.join(root, '原资料'), target = path.join(root, '新资料'), config = path.join(root, 'settings.json');
  const store = new Store(source); await store.init(); await fs.mkdir(target);
  const id = randomUUID(); await fs.mkdir(store.directory('assets', id));
  const bytes = Buffer.alloc(200000, 63); await fs.writeFile(path.join(store.directory('assets', id), 'image.png'), bytes);
  const asset = await store.writeAsset({ id, originalId: id, kind: 'image', name: '照片', width: 10, height: 10, imageFile: 'image.png', edits: { rotation: 0 }, origin: 'import' });
  const draft = await store.create('moments', [asset.id]); await store.save({ ...draft, caption: '中文与表情 🌊' });
  const sourceId = randomUUID(); await fs.mkdir(store.directory('sources', sourceId)); await fs.writeFile(path.join(store.directory('sources', sourceId), 'video.mp4'), bytes);
  await store.writeSource({ id: sourceId, name: '视频', width: 10, height: 10, duration: 1, frames: [0], hasAudio: false, videoFile: 'video.mp4', favorite: true });
  assert.equal(await loadLibraryDirectory(config, source), source);
  const progress: number[] = [];
  assert.equal(await migrateLibrary(store, target, config, new AbortController().signal, n => progress.push(n)), await fs.realpath(target));
  assert.equal(await loadLibraryDirectory(config, source), await fs.realpath(target));
  const next = new Store(target); await next.init();
  assert.deepEqual(await fs.readFile(await next.assetPath(id, 'image')), bytes);
  assert.equal((await next.load(draft.id)).caption, '中文与表情 🌊');
  assert.equal((await next.publicSource(sourceId)).favorite, true);
  assert.ok((await next.publicSource(sourceId)).sourcePath.startsWith(target));
  assert.deepEqual(await fs.readFile(await store.assetPath(id, 'image')), bytes);
  assert.equal(progress.at(-1), 100);
  await next.save({ ...await next.load(draft.id), caption: '新位置编辑' });
  assert.equal((await store.load(draft.id)).caption, '中文与表情 🌊');
});

test('migration rejects unsafe or occupied paths and preserves source/config on cancellation or save failure', async () => {
  const root = await makeTestDirectory('library-location-failure-'), source = path.join(root, 'old'), config = path.join(root, 'settings.json');
  const store = new Store(source); await store.init(); await store.create('moments');
  await fs.writeFile(config, JSON.stringify({ version: 1, libraryDirectory: source }));
  const before = await fs.readFile(config, 'utf8'), target = path.join(root, 'target'); await fs.mkdir(target);
  await fs.writeFile(path.join(target, 'keep.txt'), 'retain');
  await assert.rejects(migrateLibrary(store, target, config, new AbortController().signal, () => {}), /空文件夹/);
  assert.equal(await fs.readFile(path.join(target, 'keep.txt'), 'utf8'), 'retain');
  const nested = path.join(source, 'nested'); await fs.mkdir(nested);
  await assert.rejects(migrateLibrary(store, nested, config, new AbortController().signal, () => {}), /不能包含/);
  await assert.rejects(migrateLibrary(store, root, config, new AbortController().signal, () => {}), /不能包含/);
  const cancelTarget = path.join(root, 'cancel'); await fs.mkdir(cancelTarget); const abort = new AbortController();
  await assert.rejects(migrateLibrary(store, cancelTarget, config, abort.signal, () => abort.abort()), /取消/);
  assert.deepEqual(await fs.readdir(cancelTarget), []); assert.equal(await fs.readFile(config, 'utf8'), before);
  const failTarget = path.join(root, 'fail'); await fs.mkdir(failTarget); const blocked = path.join(root, 'blocked'); await fs.writeFile(blocked, 'not a directory');
  await assert.rejects(migrateLibrary(store, failTarget, path.join(blocked, 'settings.json'), new AbortController().signal, () => {}));
  assert.deepEqual(await fs.readdir(failTarget), []); assert.equal((await store.list()).drafts.length, 1);
  await fs.writeFile(config, JSON.stringify({ version: 1, libraryDirectory: path.join(root, 'missing') }));
  await assert.rejects(loadLibraryDirectory(config, source));
  await fs.writeFile(config, before);
});

test('failed atomic settings commit retains the active library and clears only the copied files', async () => {
  const root = await makeTestDirectory('library-location-commit-'), source = path.join(root, 'old'), target = path.join(root, 'new'), config = path.join(root, 'settings.json');
  const store = new Store(source); await store.init(); await store.create('moments'); await fs.mkdir(target);
  const text = JSON.stringify({ version: 1, libraryDirectory: source }); await fs.writeFile(config, text);
  const originalRename = fs.rename;
  fs.rename = async (from, to) => { if (String(to) === config) throw Object.assign(new Error('simulated full disk'), { code: 'ENOSPC' }); return originalRename(from, to); };
  try { await assert.rejects(migrateLibrary(store, target, config, new AbortController().signal, () => {}), /full disk/); }
  finally { fs.rename = originalRename; }
  assert.equal(await fs.readFile(config, 'utf8'), text); assert.equal(await loadLibraryDirectory(config, source), await fs.realpath(source));
  assert.deepEqual(await fs.readdir(target), []); assert.equal((await store.list()).drafts.length, 1);
});
