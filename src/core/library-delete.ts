import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Store } from './store';
import { atomicJSON, inside } from './io';

const selection = z.array(z.object({ kind: z.enum(['asset', 'video']), id: z.string().uuid() }).strict()).min(1).max(10000);
const manifestSchema = z.object({ version: z.literal(1), items: selection });

async function restore(root: string, staging: string) {
  const manifest = manifestSchema.parse(JSON.parse(await fs.readFile(path.join(staging, 'manifest.json'), 'utf8')));
  for (const item of manifest.items) {
    const type = item.kind === 'asset' ? 'assets' : 'sources';
    const from = inside(staging, type, item.id), to = inside(root, type, item.id);
    const stat = await fs.lstat(from).catch((e: NodeJS.ErrnoException) => { if (e.code !== 'ENOENT') throw e; });
    if (!stat) continue;
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('删除恢复目录无效');
    if (await fs.lstat(to).then(() => true, (e: NodeJS.ErrnoException) => { if (e.code !== 'ENOENT') throw e; return false; })) throw new Error('删除恢复遇到同名素材，文件已保留');
    await fs.rename(from, to);
  }
  for (const type of ['assets', 'sources']) await fs.rmdir(path.join(staging, type)).catch((e: NodeJS.ErrnoException) => { if (e.code !== 'ENOENT') throw e; });
  await fs.unlink(path.join(staging, 'manifest.json'));
  await fs.rmdir(staging);
}

export async function recoverLibraryDeletes(root: string) {
  for (const entry of await fs.readdir(inside(root, 'temporary'), { withFileTypes: true })) {
    if (!entry.isDirectory() || !/^delete-[0-9a-f-]{36}$/.test(entry.name)) continue;
    const staging = inside(root, 'temporary', entry.name);
    // A crash before writing the journal cannot have moved any media.
    if (!(await fs.readdir(staging)).length) { await fs.rmdir(staging); continue; }
    await restore(root, staging);
  }
}

export async function deleteLibraryItems(store: Store, input: unknown, trash: (directory: string) => Promise<void>) {
  const items = [...new Map(selection.parse(input).map(item => [`${item.kind}:${item.id}`, item])).values()];
  const library = await store.library();
  if (library.warnings.length) throw new Error('部分资料无法读取，暂时不能确认引用关系，请修复后再删除');
  const selected = new Set(items.filter(item => item.kind === 'asset').map(item => item.id));
  for (const asset of library.assets) {
    if (selected.has(asset.id) && asset.usedBy.length) throw new Error(`「${asset.name}」仍用于草稿，请先从草稿移除`);
    if (!selected.has(asset.id) && (selected.has(asset.originalId) || asset.optimization && selected.has(asset.optimization.sourceId))) throw new Error(`「${asset.name}」仍引用所选原图，请同时选择关联素材或保留原图`);
  }
  for (const item of items) {
    if (!(item.kind === 'asset' ? library.assets : library.videos).some(a => a.id === item.id)) throw new Error('所选素材已不存在，请刷新素材库');
    const stat = await fs.lstat(store.directory(item.kind === 'asset' ? 'assets' : 'sources', item.id));
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('素材目录无效');
  }
  const staging = inside(store.root, 'temporary', `delete-${randomUUID()}`);
  await fs.mkdir(staging);
  await atomicJSON(path.join(staging, 'manifest.json'), { version: 1, items });
  try {
    for (const item of items) {
      const type = item.kind === 'asset' ? 'assets' : 'sources';
      await fs.mkdir(path.join(staging, type), { recursive: true });
      await fs.rename(store.directory(type, item.id), inside(staging, type, item.id));
    }
    await trash(staging);
  } catch (error) {
    try { await restore(store.root, staging); }
    catch { throw new Error('删除未完成，部分文件等待恢复；请重启应用恢复后再操作'); }
    throw error;
  }
  return { count: items.length };
}
