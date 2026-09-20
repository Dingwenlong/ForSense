import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { Store } from '../src/core/store';
import { MediaService } from '../src/core/service';
import { runProcess, probe } from '../src/core/process';
import { readBoxes } from '../src/core/live-photo';
import { safeName, inside } from '../src/core/io';
import type { MediaAsset, VideoSource } from '../src/shared/types';
import { ExifTool } from 'exiftool-vendored';

const tools = { ffmpeg: path.resolve('resources/media/ffmpeg.exe'), ffprobe: path.resolve('resources/media/ffprobe.exe') };
test('Windows media pipeline: frame, paired Live Photo, Motion Photo, edits, persistence and export', { timeout: 120000 }, async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'social-copy-test-'));
  const abort = new AbortController(), signal = abort.signal;
  const report = () => {};
  try {
    const input = path.join(root, '中文 视频.mp4');
    await runProcess(tools.ffmpeg, ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=320x240:rate=30:duration=4', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=4', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', input], signal);
    const store = new Store(path.join(root, 'library')); await store.init();
    const service = new MediaService(store, tools, () => {});
    const source = await service.execute('video', input, signal, report) as VideoSource;
    assert.equal(source.frames.length, 120); assert.equal(source.hasAudio, true);
    const frame = await service.execute('frame', { sourceId: source.id, time: 1 }, signal, report) as MediaAsset;
    assert.equal(frame.width, 320); assert.equal(frame.height, 240);
    const live = await service.execute('live', { sourceId: source.id, start: 0.5, end: 3.5, cover: 2, mute: false }, signal, report) as MediaAsset;
    assert.ok(live.duration! <= 3.05); assert.equal(live.coverTime, 1.5);
    const edited = await service.execute('edit', { id: frame.id, edits: { rotation: 90, crop: { x: 0, y: 0, width: 0.5, height: 1 } } }, signal, report) as MediaAsset;
    assert.equal(edited.width, 120); assert.equal(edited.height, 320);
    const draft = await store.create('moments'); draft.title = '我的周末'; draft.caption = '海边散步 🌊\n第二行'; draft.items = [edited, live]; await store.save(draft);
    const loaded = await new Store(store.root).load(draft.id); assert.equal(loaded.caption, draft.caption); assert.deepEqual(loaded.items.map(i => i.id), [edited.id, live.id]);
    const exported = await service.execute('export', { draftId: draft.id, directory: root, format: 'folder', targets: ['apple', 'android'] }, signal, report) as { path: string };
    assert.deepEqual(await fs.readFile(path.join(exported.path, '001.png')), await fs.readFile(await store.assetPath(edited.id, 'image')));
    assert.equal(await fs.readFile(path.join(exported.path, '文案.txt'), 'utf8'), draft.caption);
    const movPath = path.join(exported.path, 'iPhone/002.mov');
    const mov = await fs.readFile(movPath), jpeg = await fs.readFile(path.join(exported.path, 'iPhone/002.jpg'));
    assert.ok(readBoxes(mov).some(b => b.type === 'moov'));
    const identifier = mov.toString('ascii').match(/[A-F0-9]{8}(-[A-F0-9]{4}){3}-[A-F0-9]{12}/)?.[0];
    assert.ok(identifier); assert.ok(jpeg.includes(Buffer.from(identifier)));
    const inspector = new ExifTool({ maxProcs: 1 });
    try {
      const tags = await inspector.read(path.join(exported.path, 'iPhone/002.jpg'));
      assert.equal(tags.ContentIdentifier, identifier);
      const androidTags = await inspector.read(path.join(exported.path, 'Android/002MP.jpg'));
      assert.equal(androidTags.MotionPhoto, 1);
      assert.equal(androidTags.MotionPhotoPresentationTimestampUs, 1500000);
    } finally { await inspector.end(); }
    const details = JSON.parse(await runProcess(tools.ffprobe, ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', movPath], signal));
    assert.equal(details.format.tags['com.apple.quicktime.content.identifier'], identifier);
    assert.ok(details.streams.some((s: { codec_tag_string: string }) => s.codec_tag_string === 'mebx'));
    const timed = JSON.parse(await runProcess(tools.ffprobe, ['-v', 'error', '-select_streams', 'd:0', '-show_packets', '-show_entries', 'packet=pts_time', '-of', 'json', movPath], signal));
    assert.equal(Number(timed.packets[0].pts_time), live.coverTime);
    await runProcess(tools.ffmpeg, ['-v', 'error', '-i', movPath, '-map', '0:v:0', '-map', '0:a:0', '-f', 'null', '-'], signal);
    const android = await fs.readFile(path.join(exported.path, 'Android/002MP.jpg'));
    const length = Number(android.toString('utf8').match(/Item:Semantic="MotionPhoto" Item:Length="(\d+)"/)?.[1]);
    assert.ok(length > 0); assert.equal(android.subarray(android.length - length + 4, android.length - length + 8).toString(), 'ftyp');
    const zip = await service.execute('export', { draftId: draft.id, directory: root, format: 'zip', targets: ['android'] }, signal, report) as { path: string };
    assert.equal((await fs.readFile(zip.path)).subarray(0, 2).toString(), 'PK');
    const duplicate = await store.duplicate(draft.id); assert.notEqual(duplicate.id, draft.id); assert.equal(duplicate.items.length, 2);
    await assert.rejects(service.execute('live', { sourceId: source.id, start: 0, end: 4, cover: 1, mute: true }, signal, report));
    const cancelled = new AbortController(); cancelled.abort();
    await assert.rejects(service.execute('images', [input], cancelled.signal, report), /取消/);
    const bad = path.join(root, '坏图.png'); await fs.writeFile(bad, 'broken');
    await assert.rejects(service.execute('images', [bad], signal, report));
    await assert.rejects(service.execute('export', { draftId: draft.id, directory: path.join(root, 'missing'), format: 'folder', targets: ['apple'] }, signal, report));
    assert.equal((await fs.readdir(root)).filter(n => n.startsWith('.social-copy-')).length, 0);
    assert.equal((await probe(tools, await store.assetPath(live.id, 'video'), signal)).audio, true);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});
test('path and filename boundaries', () => {
  assert.throws(() => inside('C:/safe', '../secret'));
  assert.equal(safeName('CON'), '图文素材');
  assert.equal(safeName('海边:日记?'), '海边_日记_');
});
