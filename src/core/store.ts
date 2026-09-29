import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Draft, Edits, MediaAsset, Platform, VideoSource, LibrarySnapshot } from '../shared/types';
import { MAX_DRAFTS } from '../shared/types';
import { draftName } from '../shared/draft-name';
import { atomicJSON, inside } from './io';
import { recoverLibraryDeletes } from './library-delete';

export const uuid = z.string().uuid();
export const editsSchema = z.object({ rotation: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]),
  crop: z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1), width: z.number().min(0.01).max(1), height: z.number().min(0.01).max(1) })
    .refine(c => c.x + c.width <= 1.000001 && c.y + c.height <= 1.000001, '裁切范围超出画面').optional() });
export const draftInput = z.object({ version: z.literal(1), id: uuid, platform: z.enum(['moments', 'douyin']),
  caption: z.string().max(100000), items: z.array(z.object({ id: uuid })).max(200), createdAt: z.string(), updatedAt: z.string() });
export interface AssetRecord {
  id: string; kind: 'image' | 'live'; name: string; width: number; height: number;
  originalId: string; edits: Edits; imageFile: string; videoFile?: string; duration?: number; coverTime?: number;
  createdAt?: string; favorite?: boolean; archived?: boolean; optimization?: MediaAsset['optimization'];
}
export interface SourceRecord { id: string; name: string; videoFile: string; duration: number; width: number; height: number; frames: number[]; hasAudio: boolean; favorite?: boolean; createdAt?: string }

export class Store {
  private writes = new Map<string, Promise<unknown>>();
  private additions: Promise<unknown> = Promise.resolve();
  constructor(readonly root: string) {}
  async init() { for (const name of ['drafts', 'assets', 'sources', 'temporary']) await fs.mkdir(inside(this.root, name), { recursive: true }); await recoverLibraryDeletes(this.root); }
  directory(type: 'assets' | 'sources', id: string) { return inside(this.root, type, uuid.parse(id)); }
  draftFile(id: string) { return inside(this.root, 'drafts', `${uuid.parse(id)}.json`); }
  async asset(id: string): Promise<AssetRecord> {
    const record = JSON.parse(await fs.readFile(path.join(this.directory('assets', id), 'asset.json'), 'utf8')) as AssetRecord;
    if (record.id !== id || !['image', 'live'].includes(record.kind)) throw new Error('素材记录损坏');
    for (const file of [record.imageFile, record.videoFile].filter(Boolean) as string[]) inside(this.directory('assets', id), file);
    return record;
  }
  publicAsset(record: AssetRecord): MediaAsset {
    const { imageFile, videoFile, ...asset } = record;
    return { ...asset, imageUrl: `media://asset/${record.id}/image`, videoUrl: videoFile ? `media://asset/${record.id}/video` : undefined };
  }
  async writeAsset(record: AssetRecord) {
    record = { ...record, createdAt: record.createdAt || new Date().toISOString() };
    await atomicJSON(path.join(this.directory('assets', record.id), 'asset.json'), record); return this.publicAsset(record);
  }
  async updateAsset(id: string, input: unknown) {
    uuid.parse(id);
    const patch = z.object({ name: z.string().trim().min(1).max(240).optional(), favorite: z.boolean().optional() }).strict().parse(input);
    const key = `asset:${id}`, previous = this.writes.get(key) || Promise.resolve();
    const write = previous.catch(() => {}).then(async () => {
      const record = await this.asset(id);
      const createdAt = record.createdAt || (await fs.stat(path.join(this.directory('assets', id), 'asset.json'))).birthtime.toISOString();
      return this.writeAsset({ ...record, ...patch, createdAt });
    });
    this.writes.set(key, write);
    try { return await write; } finally { if (this.writes.get(key) === write) this.writes.delete(key); }
  }
  async library(): Promise<LibrarySnapshot> {
    const { drafts, warnings } = await this.list();
    const assets: LibrarySnapshot['assets'] = [], videos: LibrarySnapshot['videos'] = [];
    for (const entry of await fs.readdir(inside(this.root, 'assets'), { withFileTypes: true })) {
      if (!entry.isDirectory() || !uuid.safeParse(entry.name).success) continue;
      try {
        const record = await this.asset(entry.name);
        const createdAt = record.createdAt || (await fs.stat(path.join(this.directory('assets', entry.name), 'asset.json'))).birthtime.toISOString();
        assets.push({ ...this.publicAsset(record), createdAt, usedBy: drafts.filter(d => d.items.some(i => i.id === record.id)).map(d => draftName(d.caption)) });
      } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') warnings.push('一份素材记录无法读取，文件仍保留。'); }
    }
    for (const entry of await fs.readdir(inside(this.root, 'sources'), { withFileTypes: true })) {
      if (!entry.isDirectory() || !uuid.safeParse(entry.name).success) continue;
      try { const { frames, ...video } = await this.publicSource(entry.name); videos.push(video); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') warnings.push('一份视频记录无法读取，文件仍保留。'); }
    }
    assets.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    return { assets, videos, warnings };
  }
  async source(id: string): Promise<SourceRecord> { return JSON.parse(await fs.readFile(path.join(this.directory('sources', id), 'source.json'), 'utf8')); }
  async updateVideo(id: string, input: unknown) {
    uuid.parse(id);
    const patch = z.object({ favorite: z.boolean() }).strict().parse(input);
    const key = `source:${id}`, previous = this.writes.get(key) || Promise.resolve();
    const write = previous.catch(() => {}).then(async () => {
      const source = await this.source(id);
      const createdAt = source.createdAt || (await fs.stat(path.join(this.directory('sources', id), 'source.json'))).birthtime.toISOString();
      return this.writeSource({ ...source, ...patch, createdAt });
    });
    this.writes.set(key, write);
    try { return await write; } finally { if (this.writes.get(key) === write) this.writes.delete(key); }
  }
  async publicSource(id: string): Promise<VideoSource> {
    const { videoFile, ...source } = await this.source(id);
    const createdAt = source.createdAt || (await fs.stat(path.join(this.directory('sources', id), 'source.json'))).birthtime.toISOString();
    return { ...source, createdAt, videoUrl: `media://source/${id}/video` };
  }
  async writeSource(source: SourceRecord): Promise<VideoSource> {
    source = { ...source, createdAt: source.createdAt || new Date().toISOString() };
    await atomicJSON(path.join(this.directory('sources', source.id), 'source.json'), source);
    const { videoFile, ...result } = source;
    return { ...result, videoUrl: `media://source/${source.id}/video` };
  }
  async assetPath(id: string, role: string) {
    if (!['image', 'video'].includes(role)) throw new Error('未知媒体类型');
    const record = await this.asset(id);
    const file = role === 'image' ? record.imageFile : record.videoFile;
    if (!file) throw new Error('素材不包含视频');
    return inside(this.directory('assets', id), file);
  }
  async sourcePath(id: string) { const record = await this.source(id); return inside(this.directory('sources', id), record.videoFile); }
  async load(id: string): Promise<Draft> {
    const data = draftInput.parse(JSON.parse(await fs.readFile(this.draftFile(id), 'utf8')));
    return { ...data, items: await Promise.all(data.items.map(async i => this.publicAsset(await this.asset(i.id)))) };
  }
  async list() {
    const warnings: string[] = [], drafts: Draft[] = [];
    for (const file of await fs.readdir(inside(this.root, 'drafts'))) {
      if (!file.endsWith('.json')) continue;
      try { drafts.push(await this.load(file.slice(0, -5))); }
      catch { warnings.push(`一份草稿无法读取，原文件仍保留：${file}`); }
    }
    drafts.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return { drafts, warnings };
  }
  async create(platform: Platform, assetIds: unknown = []): Promise<Draft> {
    const ids = z.array(uuid).max(200).refine(values => new Set(values).size === values.length, '草稿中有重复素材').parse(assetIds);
    const items = await Promise.all(ids.map(async id => this.publicAsset(await this.asset(id))));
    const now = new Date().toISOString();
    const draft: Draft = { version: 1, id: randomUUID(), platform: z.enum(['moments', 'douyin']).parse(platform), caption: '', items, createdAt: now, updatedAt: now };
    return this.addDraft(draft);
  }
  private async addDraft(draft: Draft): Promise<Draft> {
    const addition = this.additions.catch(() => {}).then(async () => {
      const files = await fs.readdir(inside(this.root, 'drafts'));
      const count = files.filter(file => file.endsWith('.json') && uuid.safeParse(file.slice(0, -5)).success).length;
      if (count >= MAX_DRAFTS) throw new Error(`最多保留 ${MAX_DRAFTS} 份草稿，请先在草稿列表删除不需要的草稿`);
      await atomicJSON(this.draftFile(draft.id), draft); return draft;
    });
    this.additions = addition;
    return addition;
  }
  async save(input: unknown): Promise<Draft> {
    const data = draftInput.parse(input);
    const previous = this.writes.get(data.id) || Promise.resolve();
    const write = previous.catch(() => {}).then(async () => {
      const current = await this.load(data.id);
      const items = await Promise.all(data.items.map(async i => this.publicAsset(await this.asset(i.id))));
      if (new Set(items.map(i => i.id)).size !== items.length) throw new Error('草稿中有重复素材');
      const result: Draft = { ...data, items, createdAt: current.createdAt, updatedAt: new Date().toISOString() };
      await atomicJSON(this.draftFile(data.id), result); return result;
    });
    this.writes.set(data.id, write);
    try { return await write; } finally { if (this.writes.get(data.id) === write) this.writes.delete(data.id); }
  }
  async duplicate(id: string) {
    await this.writes.get(id);
    const original = await this.load(id), now = new Date().toISOString();
    const draft = { ...original, id: randomUUID(), createdAt: now, updatedAt: now };
    return this.addDraft(draft);
  }
  async remove(id: string) { await this.writes.get(id); await fs.unlink(this.draftFile(id)); }
}
