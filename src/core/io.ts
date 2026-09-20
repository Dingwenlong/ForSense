import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export async function atomicJSON(file: string, data: unknown) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temporary = path.join(path.dirname(file), `.${randomUUID()}.tmp`);
  try {
    const handle = await fs.open(temporary, 'wx');
    try { await handle.writeFile(JSON.stringify(data, null, 2), 'utf8'); await handle.sync(); }
    finally { await handle.close(); }
    await fs.rename(temporary, file);
  } finally { await fs.rm(temporary, { force: true }); }
}
export function inside(root: string, ...parts: string[]) {
  const target = path.resolve(root, ...parts);
  const relative = path.relative(path.resolve(root), target);
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('文件路径超出工作区');
  return target;
}
export function safeName(name: string) {
  const cleaned = name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/[. ]+$/g, '').trim().slice(0, 70);
  return !cleaned || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i.test(cleaned) ? '图文素材' : cleaned;
}
export async function availablePath(parent: string, base: string, extension = '') {
  for (let i = 0; i < 10000; i++) {
    const candidate = inside(parent, safeName(base) + (i ? ` (${i + 1})` : '') + extension);
    try { await fs.access(candidate); } catch { return candidate; }
  }
  throw new Error('同名导出文件过多，请更换名称');
}
export function messageOf(error: unknown) {
  const code = (error as NodeJS.ErrnoException)?.code;
  if (code === 'ENOSPC') return '磁盘空间不足，请清理空间或选择其他位置';
  if (code === 'EACCES' || code === 'EPERM') return '没有写入权限，或文件正在被其他程序占用';
  if (code === 'ENOENT') return '文件不存在，请重新选择文件或保存位置';
  return error instanceof Error ? error.message : '操作失败，请重试';
}
