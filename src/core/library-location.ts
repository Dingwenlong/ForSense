import { promises as fs, createReadStream } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { Store } from './store';
import { atomicJSON, inside } from './io';

const settingsSchema = z.object({ version: z.literal(1), libraryDirectory: z.string().min(1) }).strict();
export async function loadLibraryDirectory(settingsFile: string, fallback: string) {
  let text: string;
  try { text = await fs.readFile(settingsFile, 'utf8'); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return fallback; throw error; }
  const config = settingsSchema.parse(JSON.parse(text));
  if (!path.isAbsolute(config.libraryDirectory)) throw new Error('素材库路径必须是绝对路径');
  const root = await fs.realpath(config.libraryDirectory);
  for (const name of ['assets', 'sources', 'drafts']) if (!(await fs.stat(inside(root, name))).isDirectory()) throw new Error('已配置素材库不可用，请连接对应磁盘后重试');
  return root;
}
const contains = (parent: string, child: string) => { const relative = path.relative(parent, child); return !relative || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative)); };
const check = (signal: AbortSignal) => { if (signal.aborted) throw new Error('已取消更换素材库位置'); };
async function digest(file: string, signal: AbortSignal) {
  const hash = createHash('sha256'); for await (const chunk of createReadStream(file, { signal })) { check(signal); hash.update(chunk); } return hash.digest('hex');
}
export async function migrateLibrary(store: Store, destination: string, settingsFile: string, signal: AbortSignal, progress: (percent: number, message: string) => void) {
  const source = await fs.realpath(store.root), target = await fs.realpath(destination);
  if (source.toLowerCase() === target.toLowerCase()) return source;
  if (contains(source, target) || contains(target, source)) throw new Error('新目录不能包含当前素材库，也不能位于当前素材库内');
  if (!(await fs.stat(target)).isDirectory() || (await fs.readdir(target)).length) throw new Error('请选择空文件夹，避免覆盖已有资料');
  if (contains(target, path.resolve(settingsFile))) throw new Error('不能使用应用配置目录作为素材库');
  if ((await fs.readdir(inside(source, 'temporary'))).some(name => name.startsWith('delete-'))) throw new Error('素材库有待恢复操作，请先重启应用');
  const snapshot = await store.library(); if (snapshot.warnings.length) throw new Error('现有资料有读取异常，请先修复后再迁移');
  const files: { relative: string; size: number }[] = [];
  const dirs: string[] = [];
  async function scan(relative: string) {
    const folder = inside(source, relative), stat = await fs.lstat(folder);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('素材目录不能包含链接');
    dirs.push(relative);
    for (const entry of await fs.readdir(folder, { withFileTypes: true })) {
      check(signal); const next = path.join(relative, entry.name);
      if (entry.isSymbolicLink()) throw new Error('素材库中包含链接，无法安全复制');
      if (entry.isDirectory()) await scan(next);
      else if (entry.isFile()) files.push({ relative: next, size: (await fs.stat(inside(source, next))).size });
      else throw new Error('素材库包含不支持的文件类型');
    }
  }
  for (const name of ['assets', 'sources', 'drafts']) await scan(name);
  const madeFiles: string[] = [], madeDirs: string[] = [];
  let committed = false;
  try {
    for (const relative of [...dirs, 'temporary']) { check(signal); const dir = inside(target, relative); await fs.mkdir(dir); madeDirs.push(dir); }
    const total = Math.max(1, files.reduce((sum, file) => sum + file.size, 0)); let done = 0;
    for (const [index, file] of files.entries()) {
      check(signal); const from = inside(source, file.relative), to = inside(target, file.relative);
      // Exclusive creation keeps unexpected concurrent files intact.
      const handle = await fs.open(to, 'wx'); madeFiles.push(to);
      try { for await (const chunk of createReadStream(from, { signal })) { check(signal); await handle.writeFile(chunk); } await handle.sync(); }
      finally { await handle.close(); }
      if (await digest(from, signal) !== await digest(to, signal)) throw new Error('复制校验失败，仍使用原素材库');
      done += file.size; progress(Math.min(95, Math.round(done / total * 95)), `正在复制并校验 ${index + 1} / ${files.length} 个文件`);
    }
    check(signal); const candidate = new Store(target); await candidate.init();
    const verified = await candidate.library();
    if (verified.warnings.length || verified.assets.length !== snapshot.assets.length || verified.videos.length !== snapshot.videos.length || (await candidate.list()).drafts.length !== (await store.list()).drafts.length) throw new Error('新素材库内容校验失败');
    check(signal);
    const previous = await fs.readFile(settingsFile, 'utf8').catch((error: NodeJS.ErrnoException) => { if (error.code === 'ENOENT') return null; throw error; });
    try {
      await atomicJSON(settingsFile, { version: 1, libraryDirectory: target });
      if (await loadLibraryDirectory(settingsFile, source) !== target) throw new Error('配置回读校验失败');
    } catch (error) {
      try {
        const current = await fs.readFile(settingsFile, 'utf8').catch((e: NodeJS.ErrnoException) => { if (e.code === 'ENOENT') return null; throw e; });
        if (current !== previous) {
          if (previous === null) await fs.unlink(settingsFile);
          else await atomicJSON(settingsFile, settingsSchema.parse(JSON.parse(previous)));
        }
        if (await loadLibraryDirectory(settingsFile, source) !== source) throw new Error('配置恢复校验失败');
      } catch { committed = true; throw new Error('配置恢复未完成，新旧素材均已保留，请检查设置文件后重启'); }
      throw error;
    }
    committed = true; progress(100, '素材库位置已更新'); return target;
  } catch (error) {
    if (!committed) {
      // Only remove files and empty directories created by this operation.
      for (const file of madeFiles.reverse()) await fs.unlink(file).catch(() => {});
      for (const dir of madeDirs.reverse()) await fs.rmdir(dir).catch(() => {});
    }
    if (signal.aborted) throw new Error('已取消更换素材库位置');
    throw error;
  }
}
