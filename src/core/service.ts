import { promises as fs, createWriteStream } from 'node:fs';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import { ZipFile } from 'yazl';
import { z } from 'zod';
import type { ExportJob, JobKind, Edits } from '../shared/types';
import { Store, editsSchema, uuid, type AssetRecord } from './store';
import { inside, availablePath, messageOf, safeName } from './io';
import { type Tools, probe, runProcess, transcode, checkCancelled, Cancelled } from './process';
import { appleJPEG, appleMOV, androidMotionPhoto, newLiveIdentifier } from './live-photo';

type Report = (progress: number, message?: string) => void;
const listPaths = z.array(z.string().min(1).max(32767)).min(1).max(200);
const imageExtensions = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const videoExtensions = new Set(['.mp4', '.mov']);
function filters(edits: Edits, width: number, height: number) {
  const list: string[] = [];
  if (edits.rotation === 90) list.push('transpose=1');
  if (edits.rotation === 180) list.push('hflip', 'vflip');
  if (edits.rotation === 270) list.push('transpose=2');
  if (edits.rotation === 90 || edits.rotation === 270) [width, height] = [height, width];
  if (edits.crop) {
    const c = edits.crop, x = Math.round(c.x * width), y = Math.round(c.y * height);
    list.push(`crop=${Math.max(2, Math.min(width - x, Math.round(c.width * width)))}:${Math.max(2, Math.min(height - y, Math.round(c.height * height)))}:${x}:${y}:exact=1`);
  }
  list.push('setsar=1'); return list;
}
export class MediaService {
  private jobs = new Map<string, { info: ExportJob; controller: AbortController }>();
  private queue = Promise.resolve();
  readonly exported = new Set<string>();
  constructor(readonly store: Store, readonly tools: Tools, private publish: (job: ExportJob) => void) {}
  start(id: string, kind: JobKind, payload: unknown) {
    uuid.parse(id); z.enum(['images', 'video', 'frame', 'live', 'edit', 'export']).parse(kind);
    if (this.jobs.has(id)) throw new Error('任务已存在');
    const titles: Record<JobKind, string> = { images: '导入图片', video: '准备视频', frame: '截取画面', live: '制作实况', edit: '处理图片', export: '导出素材包' };
    const entry = { info: { id, kind, title: titles[kind], status: 'queued', progress: 0, message: '等待处理' } as ExportJob, controller: new AbortController() };
    this.jobs.set(id, entry);
    this.publish({ ...entry.info });
    this.queue = this.queue.catch(() => {}).then(async () => {
      const report: Report = (progress, message) => { entry.info.progress = Math.round(progress * 100); if (message) entry.info.message = message; this.publish({ ...entry.info }); };
      try {
        checkCancelled(entry.controller.signal); entry.info.status = 'running'; report(0, '正在处理');
        entry.info.result = await this.execute(kind, payload, entry.controller.signal, report);
        entry.info.status = 'done'; report(1, '已完成');
      } catch (error) {
        entry.info.status = error instanceof Cancelled ? 'cancelled' : 'error';
        entry.info.error = error instanceof z.ZodError ? '输入参数无效，请检查后重试' : messageOf(error);
        entry.info.message = entry.info.error; this.publish({ ...entry.info });
      } finally {
        if (this.jobs.size > 40) for (const [key, old] of this.jobs) if (!['queued', 'running'].includes(old.info.status) && key !== id) this.jobs.delete(key);
      }
    });
  }
  cancel(id: string) { this.jobs.get(uuid.parse(id))?.controller.abort(); }
  active() { return [...this.jobs.values()].some(j => ['queued', 'running'].includes(j.info.status)); }
  cancelAll() { for (const job of this.jobs.values()) job.controller.abort(); }
  async waitForIdle() { await this.queue; }
  async execute(kind: JobKind, payload: unknown, signal: AbortSignal, report: Report): Promise<unknown> {
    switch (kind) {
      case 'images': return this.importImages(listPaths.parse(payload), signal, report);
      case 'video': return this.importVideo(z.string().min(1).parse(payload), signal, report);
      case 'frame': { const p = z.object({ sourceId: uuid, time: z.number().nonnegative() }).parse(payload); return this.frame(p.sourceId, p.time, signal, report); }
      case 'live': { const p = z.object({ sourceId: uuid, start: z.number().nonnegative(), end: z.number().positive(), cover: z.number().nonnegative(), mute: z.boolean() }).parse(payload); return this.live(p, signal, report); }
      case 'edit': { const p = z.object({ id: uuid, edits: editsSchema }).parse(payload); return this.edit(p.id, p.edits, signal, report); }
      case 'export': return this.export(z.object({ draftId: uuid, directory: z.string().min(1), format: z.enum(['folder', 'zip']), targets: z.array(z.enum(['apple', 'android'])).max(2) }).parse(payload), signal, report);
    }
  }
  private async makeAsset(operation: (id: string, directory: string) => Promise<AssetRecord>, signal: AbortSignal) {
    const id = randomUUID(), directory = this.store.directory('assets', id);
    await fs.mkdir(directory, { recursive: true });
    try { const record = await operation(id, directory); checkCancelled(signal); return await this.store.writeAsset(record); }
    catch (error) { await fs.rm(directory, { recursive: true, force: true }); throw error; }
  }
  async importImages(paths: string[], signal: AbortSignal, report: Report) {
    const result = [];
    try {
      for (const [n, file] of paths.entries()) {
        checkCancelled(signal);
        if (!imageExtensions.has(path.extname(file).toLowerCase())) throw new Error('图片支持 JPG、PNG 和 WebP');
        const item = await this.makeAsset(async (id, dir) => {
          const original = 'original' + path.extname(file).toLowerCase();
          await fs.copyFile(file, path.join(dir, original));
          await transcode(this.tools, ['-i', path.join(dir, original), '-frames:v', '1', '-vf', 'setsar=1', '-update', '1', path.join(dir, 'image.png')], 0, signal, () => {});
          const p = await probe(this.tools, path.join(dir, 'image.png'), signal);
          return { id, name: path.basename(file), kind: 'image', width: p.width, height: p.height, originalId: id, edits: { rotation: 0 }, imageFile: 'image.png' };
        }, signal);
        result.push(item); report((n + 1) / paths.length, `已导入 ${n + 1} / ${paths.length} 张图片`);
      }
      return result;
    } catch (error) {
      for (const item of result) await fs.rm(this.store.directory('assets', item.id), { recursive: true, force: true });
      throw error;
    }
  }
  async importVideo(file: string, signal: AbortSignal, report: Report) {
    if (!videoExtensions.has(path.extname(file).toLowerCase())) throw new Error('视频支持 MP4 和 MOV');
    const p = await probe(this.tools, file, signal);
    if (!['h264', 'hevc'].includes(p.codec)) throw new Error('首版支持 H.264 和 H.265 编码的视频');
    if (!Number.isFinite(p.duration) || p.duration <= 0) throw new Error('无法读取视频时长');
    const id = randomUUID(), dir = this.store.directory('sources', id);
    await fs.mkdir(dir, { recursive: true });
    try {
      const copiedSource = path.join(dir, 'original' + path.extname(file).toLowerCase());
      await fs.copyFile(file, copiedSource);
      const color = p.hdr ? 'zscale=t=linear:npl=100,format=gbrpf32le,tonemap=tonemap=hable:desat=0,zscale=p=bt709:t=bt709:m=bt709:r=tv,' : '';
      await transcode(this.tools, ['-i', copiedSource, '-map', '0:v:0', '-map', '0:a:0?', '-vf', color + 'scale=trunc(iw/2)*2:trunc(ih/2)*2,setsar=1,setpts=PTS-STARTPTS', '-af', 'asetpts=PTS-STARTPTS', '-fps_mode', 'vfr', '-c:v', 'libx264', '-preset', 'fast', '-crf', '18', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-metadata:s:v:0', 'rotate=0', '-movflags', '+faststart', path.join(dir, 'video.mp4')], p.duration, signal, n => report(n * 0.9, '正在准备可逐帧预览的视频'));
      const normalized = await probe(this.tools, path.join(dir, 'video.mp4'), signal);
      const rawFrames = JSON.parse(await runProcess(this.tools.ffprobe, ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'frame=best_effort_timestamp_time', '-of', 'json', path.join(dir, 'video.mp4')], signal));
      const frames = rawFrames.frames.map((f: { best_effort_timestamp_time: string }) => Number(f.best_effort_timestamp_time)).filter((t: number) => Number.isFinite(t) && t >= 0);
      if (!frames.length) throw new Error('未读取到有效视频帧');
      checkCancelled(signal);
      return await this.store.writeSource({ id, name: path.basename(file), videoFile: 'video.mp4', duration: normalized.duration, width: normalized.width, height: normalized.height, hasAudio: normalized.audio, frames });
    } catch (error) { await fs.rm(dir, { recursive: true, force: true }); throw error; }
  }
  async frame(sourceId: string, time: number, signal: AbortSignal, report: Report) {
    const source = await this.store.source(sourceId);
    const frameTime = source.frames.reduce((a, b) => Math.abs(b - time) < Math.abs(a - time) ? b : a);
    return this.makeAsset(async (id, dir) => {
      await transcode(this.tools, ['-i', await this.store.sourcePath(sourceId), '-ss', frameTime.toFixed(6), '-frames:v', '1', '-update', '1', path.join(dir, 'image.png')], 0, signal, () => {});
      report(1, '已截取画面');
      return { id, kind: 'image', name: `${source.name} · ${frameTime.toFixed(2)}秒`, width: source.width, height: source.height, originalId: id, edits: { rotation: 0 }, imageFile: 'image.png' };
    }, signal);
  }
  async live(p: { sourceId: string; start: number; end: number; cover: number; mute: boolean }, signal: AbortSignal, report: Report) {
    const source = await this.store.source(p.sourceId);
    if (p.end <= p.start || p.end - p.start > 3.001 || p.end > source.duration + 0.01 || p.cover < p.start || p.cover >= p.end) throw new Error('片段须在视频内、最长 3 秒，封面须在片段内');
    return this.makeAsset(async (id, dir) => {
      const args = ['-i', await this.store.sourcePath(p.sourceId), '-ss', p.start.toFixed(6), '-t', (p.end - p.start).toFixed(6), '-map', '0:v:0'];
      if (!p.mute) args.push('-map', '0:a:0?');
      args.push('-vf', 'fps=30,scale=trunc(iw/2)*2:trunc(ih/2)*2,setsar=1', '-c:v', 'libx264', '-preset', 'fast', '-crf', '18', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k');
      if (p.mute) args.push('-an');
      args.push('-movflags', '+faststart', path.join(dir, 'video.mp4'));
      await transcode(this.tools, args, p.end - p.start, signal, n => report(n * 0.85, '正在生成实况片段'));
      const meta = await probe(this.tools, path.join(dir, 'video.mp4'), signal);
      const cover = Math.max(0, Math.min(Math.round((p.cover - p.start) * 30) / 30, Math.floor(Math.max(0, meta.duration * 30 - 1)) / 30));
      await transcode(this.tools, ['-i', path.join(dir, 'video.mp4'), '-ss', cover.toFixed(6), '-frames:v', '1', '-q:v', '2', '-update', '1', path.join(dir, 'image.jpg')], 0, signal, () => {});
      return { id, kind: 'live', name: `${source.name} · 实况`, width: meta.width, height: meta.height, duration: meta.duration, coverTime: cover, originalId: id, edits: { rotation: 0 }, imageFile: 'image.jpg', videoFile: 'video.mp4' };
    }, signal);
  }
  async edit(assetId: string, edits: Edits, signal: AbortSignal, report: Report) {
    const current = await this.store.asset(assetId), original = await this.store.asset(current.originalId);
    if (!edits.crop && edits.rotation === 0) return this.store.publicAsset(original);
    return this.makeAsset(async (id, dir) => {
      const filter = filters(edits, original.width, original.height);
      let imageFile = 'image.png', videoFile: string | undefined;
      if (original.kind === 'live') {
        videoFile = 'video.mp4'; imageFile = 'image.jpg';
        await transcode(this.tools, ['-i', await this.store.assetPath(original.id, 'video'), '-vf', [...filter, 'scale=trunc(iw/2)*2:trunc(ih/2)*2'].join(','), '-c:v', 'libx264', '-crf', '18', '-preset', 'fast', '-pix_fmt', 'yuv420p', '-c:a', 'copy', '-movflags', '+faststart', path.join(dir, videoFile)], original.duration || 3, signal, n => report(n * 0.9));
        await transcode(this.tools, ['-i', path.join(dir, videoFile), '-ss', (original.coverTime || 0).toFixed(6), '-frames:v', '1', '-q:v', '2', '-update', '1', path.join(dir, imageFile)], 0, signal, () => {});
      } else await transcode(this.tools, ['-i', await this.store.assetPath(original.id, 'image'), '-vf', filter.join(','), '-frames:v', '1', '-update', '1', path.join(dir, imageFile)], 0, signal, () => {});
      const meta = await probe(this.tools, path.join(dir, imageFile), signal);
      return { ...original, id, originalId: original.id, edits, width: meta.width, height: meta.height, imageFile, videoFile };
    }, signal);
  }
  async export(options: { draftId: string; directory: string; format: 'folder' | 'zip'; targets: ('apple' | 'android')[] }, signal: AbortSignal, report: Report) {
    const draft = await this.store.load(options.draftId);
    if (!draft.items.length && !draft.caption.trim()) throw new Error('请先添加图片或文案');
    if (draft.items.some(i => i.kind === 'live') && !options.targets.length) throw new Error('请选择实况导出格式');
    const parent = path.resolve(options.directory);
    if (!(await fs.stat(parent)).isDirectory()) throw new Error('请选择有效的导出文件夹');
    const targets = [...new Set(options.targets)];
    const temp = inside(parent, `.social-copy-${randomUUID()}`);
    await fs.mkdir(temp);
    let zipTemporary: string | undefined;
    try {
      const manifest: { order: number; kind: string; files: string[] }[] = [];
      for (const [n, item] of draft.items.entries()) {
        checkCancelled(signal); const record = await this.store.asset(item.id), seq = String(n + 1).padStart(3, '0');
        const files: string[] = [];
        if (record.kind === 'image') {
          const name = seq + '.png'; await fs.copyFile(await this.store.assetPath(item.id, 'image'), inside(temp, name)); files.push(name);
        } else {
          const jpg = await fs.readFile(await this.store.assetPath(item.id, 'image'));
          const mp4Path = await this.store.assetPath(item.id, 'video');
          const mp4 = await fs.readFile(mp4Path);
          if (targets.includes('apple')) {
            await fs.mkdir(inside(temp, 'iPhone'), { recursive: true });
            const raw = inside(temp, `.${seq}.mov`);
            await transcode(this.tools, ['-i', mp4Path, '-map', '0', '-c', 'copy', '-f', 'mov', raw], record.duration || 3, signal, () => {});
            const identifier = newLiveIdentifier();
            const imageName = `iPhone/${seq}.jpg`, videoName = `iPhone/${seq}.mov`;
            await fs.writeFile(inside(temp, imageName), appleJPEG(jpg, identifier));
            await fs.writeFile(inside(temp, videoName), appleMOV(await fs.readFile(raw), identifier, record.coverTime || 0));
            await fs.unlink(raw); files.push(imageName, videoName);
          }
          if (targets.includes('android')) {
            await fs.mkdir(inside(temp, 'Android'), { recursive: true });
            const name = `Android/${seq}MP.jpg`;
            await fs.writeFile(inside(temp, name), androidMotionPhoto(jpg, mp4, record.coverTime || 0)); files.push(name);
          }
        }
        manifest.push({ order: n + 1, kind: record.kind, files }); report((n + 1) / Math.max(1, draft.items.length) * 0.8, `正在导出 ${n + 1} / ${draft.items.length} 个素材`);
      }
      await fs.writeFile(inside(temp, '文案.txt'), draft.caption, 'utf8');
      const instructions = ['片语 · 发布素材包', '', '按文件名前的三位序号选择素材；文案保存在「文案.txt」。', '普通图片位于本目录，实况文件位于所选设备目录。按序号合并选择，不要重复选择实况封面与视频。', '',
        ...(targets.includes('apple') ? ['iPhone：使用 PhotoSync Windows Companion 和 iPhone 端 PhotoSync，一起传输同名 JPG 与 MOV，写入苹果相册。第三方工具需单独安装，部分功能可能收费。', '参考：https://www.photosync-app.com/support/release-notes/photosync-companion-3-0-7-for-windows-released', '不要分别另存封面和视频，也不要使用会压缩图片或删除元数据的传输方式。', '苹果真机兼容性：待验证。请在相册确认 LIVE 标识及长按播放。', ''] : []),
        ...(targets.includes('android') ? ['安卓：把以 MP.jpg 结尾的完整文件复制到 DCIM/Camera，通过 Google Photos 等兼容 Motion Photo 的相册打开。', '保留 MP.jpg 文件名和全部文件字节；不同厂商原生相册支持情况不同。', '安卓真机兼容性：待验证。', ''] : []),
        '素材在手机相册中的识别与社交平台是否接受实况是两项不同能力，请在发布前检查。'].join('\r\n');
      await fs.writeFile(inside(temp, '导入说明.txt'), instructions, 'utf8');
      const hashes = [];
      for (const entry of manifest) for (const name of entry.files) hashes.push({ file: name, sha256: createHash('sha256').update(await fs.readFile(inside(temp, name))).digest('hex') });
      await fs.writeFile(inside(temp, '素材清单.json'), JSON.stringify({ version: 1, platform: draft.platform, items: manifest, hashes, deviceVerification: 'pending' }, null, 2), 'utf8');
      checkCancelled(signal);
      const destination = await availablePath(parent, safeName(draft.title), options.format === 'zip' ? '.zip' : '');
      if (options.format === 'zip') {
        zipTemporary = inside(parent, `.social-copy-${randomUUID()}.zip.tmp`);
        const zip = new ZipFile();
        const add = async (dir: string, base = '') => {
          for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
            const relative = base + entry.name;
            if (entry.isDirectory()) await add(path.join(dir, entry.name), relative + '/');
            else zip.addFile(path.join(dir, entry.name), relative, { compress: !/\.(png|jpg|mp4|mov)$/i.test(entry.name) });
          }
        };
        await add(temp); const output = createWriteStream(zipTemporary, { flags: 'wx' });
        const completion = pipeline(zip.outputStream, output, { signal }); zip.end();
        try { await completion; } catch (error) { checkCancelled(signal); throw error; }
        checkCancelled(signal); await fs.rename(zipTemporary, destination); zipTemporary = undefined;
      } else await fs.rename(temp, destination);
      this.exported.add(destination); report(1, '素材包已导出');
      return { path: destination, count: draft.items.length };
    } finally {
      await fs.rm(temp, { recursive: true, force: true });
      if (zipTemporary) await fs.rm(zipTemporary, { force: true });
    }
  }
}
