import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { Store } from '../src/core/store';
import { MediaService } from '../src/core/service';
import { runProcess, probe } from '../src/core/process';
import { messageOf } from '../src/core/io';
import type { MediaAsset, VideoSource } from '../src/shared/types';

const tools = { ffmpeg: path.resolve('resources/media/ffmpeg.exe'), ffprobe: path.resolve('resources/media/ffprobe.exe') };
test('VFR timestamps, rotated HEVC without audio, short clip, muted output and cancellation', { timeout: 120000 }, async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'social-copy-formats-'));
  const signal = new AbortController().signal, report = () => {};
  const store = new Store(path.join(root, 'library')); await store.init();
  const service = new MediaService(store, tools, () => {});
  try {
    const vfr = path.join(root, '可变帧率.mp4');
    await runProcess(tools.ffmpeg, ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=160x120:rate=30:duration=1', '-vf', "select='if(lt(t,0.5),1,not(mod(n,2)))'", '-fps_mode', 'vfr', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', vfr], signal);
    const source = await service.execute('video', vfr, signal, report) as VideoSource;
    assert.equal(source.hasAudio, false);
    const differences = new Set(source.frames.slice(1).map((t, i) => Math.round((t - source.frames[i]) * 1000)));
    assert.ok(differences.has(33) && differences.has(67));
    const chosen = source.frames[18];
    const frame = await service.execute('frame', { sourceId: source.id, time: chosen }, signal, report) as MediaAsset;
    const reference = path.join(root, 'reference.png');
    await runProcess(tools.ffmpeg, ['-v', 'error', '-i', await store.sourcePath(source.id), '-vf', 'select=eq(n\\,18)', '-frames:v', '1', '-update', '1', reference], signal);
    assert.deepEqual(await fs.readFile(await store.assetPath(frame.id, 'image')), await fs.readFile(reference));
    const shortLive = await service.execute('live', { sourceId: source.id, start: 0, end: source.duration, cover: 0.4, mute: true }, signal, report) as MediaAsset;
    assert.ok(shortLive.duration! < 1.1); assert.equal((await probe(tools, await store.assetPath(shortLive.id, 'video'), signal)).audio, false);
    const hevc = path.join(root, 'hevc.mp4'), rotated = path.join(root, 'rotated.mov');
    await runProcess(tools.ffmpeg, ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=160x240:rate=24:duration=0.8', '-c:v', 'libx265', '-preset', 'ultrafast', '-x265-params', 'log-level=error', '-tag:v', 'hvc1', hevc], signal);
    await runProcess(tools.ffmpeg, ['-v', 'error', '-display_rotation:v:0', '90', '-i', hevc, '-c', 'copy', rotated], signal);
    const inputRotation = JSON.parse(await runProcess(tools.ffprobe, ['-v', 'error', '-show_entries', 'stream_side_data=rotation', '-of', 'json', rotated], signal));
    assert.equal(Math.abs(inputRotation.streams[0].side_data_list[0].rotation), 90);
    const portrait = await service.execute('video', rotated, signal, report) as VideoSource;
    assert.equal(portrait.width, 240); assert.equal(portrait.height, 160); assert.equal(portrait.hasAudio, false);
    const cancelled = new AbortController();
    const before = await fs.readdir(path.join(store.root, 'sources'));
    await assert.rejects(service.execute('video', vfr, cancelled.signal, progress => { if (progress > 0) cancelled.abort(); }), /取消/);
    assert.deepEqual(await fs.readdir(path.join(store.root, 'sources')), before);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});
test('failed atomic save retains last saved draft and cleans staging file', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'social-copy-save-'));
  const store = new Store(root); await store.init();
  const draft = await store.create('douyin');
  const realRename = fs.rename;
  try {
    fs.rename = async (source, destination) => {
      if (String(destination) === store.draftFile(draft.id)) throw Object.assign(new Error('No space left'), { code: 'ENOSPC' });
      return realRename(source, destination);
    };
    await assert.rejects(store.save({ ...draft, caption: '不能丢失原有版本' }), /No space/);
    assert.equal((await store.load(draft.id)).caption, '');
    assert.deepEqual(await fs.readdir(path.join(root, 'drafts')), [`${draft.id}.json`]);
    assert.match(messageOf({ code: 'ENOSPC' }), /磁盘空间不足/);
  } finally { fs.rename = realRename; await fs.rm(root, { recursive: true, force: true }); }
});
