import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Draft, Edits, MediaAsset, Platform, VideoSource } from '../shared/types';
import { atomicJSON, inside } from './io';

export const uuid = z.string().uuid();
export const editsSchema = z.object({ rotation: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]),
  crop: z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1), width: z.number().min(0.01).max(1), height: z.number().min(0.01).max(1) })
    .refine(c => c.x + c.width <= 1.000001 && c.y + c.height <= 1.000001, '裁切范围超出画面').optional() });
export const draftInput = z.object({ version: z.literal(1), id: uuid, title: z.string().trim().min(1).max(120), platform: z.enum(['moments', 'douyin']),
  caption: z.string().max(100000), items: z.array(z.object({ id: uuid })).max(200), createdAt: z.string(), updatedAt: z.string() });
export interface AssetRecord {
  id: string; kind: 'image' | 'live'; name: string; width: number; height: number;
  originalId: string; edits: Edits; imageFile: string; videoFile?: string; duration?: number; coverTime?: number;
}
export interface SourceRecord { id: string; name: string; videoFile: string; duration: number; width: number; height: number; frames: number[]; hasAudio: boolean }

export class Store {
  private writes = new Map<string, Promise<unknown>>();
  constructor(readonly root: string) {}
  async init() { for (const name of ['drafts', 'assets', 'sources', 'temporary']) await fs.mkdir(inside(this.root, name), { recursive: true }); }
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
  async writeAsset(record: AssetRecord) { await atomicJSON(path.join(this.directory('assets', record.id), 'asset.json'), record); return this.publicAsset(record); }
  async source(id: string): Promise<SourceRecord> { return JSON.parse(await fs.readFile(path.join(this.directory('sources', id), 'source.json'), 'utf8')); }
  async writeSource(source: SourceRecord): Promise<VideoSource> {
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
  async create(platform: Platform): Promise<Draft> {
    const now = new Date().toISOString();
    const draft: Draft = { version: 1, id: randomUUID(), title: '未命名草稿', platform: z.enum(['moments', 'douyin']).parse(platform), caption: '', items: [], createdAt: now, updatedAt: now };
    await atomicJSON(this.draftFile(draft.id), draft); return draft;
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
    const draft = { ...original, id: randomUUID(), title: (original.title.slice(0, 115) + ' 副本'), createdAt: now, updatedAt: now };
    await atomicJSON(this.draftFile(draft.id), draft); return draft;
  }
  async remove(id: string) { await this.writes.get(id); await fs.unlink(this.draftFile(id)); }
}
