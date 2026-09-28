export type Platform = 'moments' | 'douyin';
export const MAX_DRAFTS = 10;
export interface Crop { x: number; y: number; width: number; height: number }
export interface Edits { rotation: 0 | 90 | 180 | 270; crop?: Crop }
export interface MediaAsset {
  id: string; kind: 'image' | 'live'; name: string; width: number; height: number;
  imageUrl: string; videoUrl?: string; duration?: number; coverTime?: number;
  originalId: string; edits: Edits;
  createdAt?: string; favorite?: boolean; archived?: boolean;
  optimization?: { sourceId: string; templateId: string; prompt: string; importedAt: string };
}
export interface LibraryAsset extends MediaAsset { usedBy: string[] }
export interface LibrarySnapshot { assets: LibraryAsset[]; videos: Omit<VideoSource, 'frames'>[]; warnings: string[] }
export interface AssetUpdate { name?: string; favorite?: boolean; archived?: boolean }
export interface Draft {
  version: 1; id: string; title: string; platform: Platform; caption: string;
  items: MediaAsset[]; createdAt: string; updatedAt: string;
}
export interface VideoSource {
  id: string; name: string; videoUrl: string; duration: number; width: number; height: number;
  frames: number[]; hasAudio: boolean;
}
export interface LiveClip { sourceId: string; start: number; end: number; cover: number; mute: boolean }
export interface ExportOptions { draftId: string; directory: string; format: 'folder' | 'zip'; targets: ('apple' | 'android')[] }
export type JobKind = 'images' | 'video' | 'frame' | 'live' | 'edit' | 'export' | 'optimization';
export interface ExportJob {
  id: string; kind: JobKind; title: string; status: 'queued' | 'running' | 'done' | 'error' | 'cancelled';
  progress: number; message: string; result?: unknown; error?: string;
}
export interface DesktopAPI {
  listLibrary(): Promise<LibrarySnapshot>;
  updateAsset(id: string, patch: AssetUpdate): Promise<MediaAsset>;
  getAsset(id: string): Promise<MediaAsset>;
  getVideo(id: string): Promise<VideoSource>;
  copyImage(id: string): Promise<void>;
  listDrafts(): Promise<{ drafts: Draft[]; warnings: string[] }>;
  createDraft(platform: Platform): Promise<Draft>;
  saveDraft(draft: Draft): Promise<Draft>;
  saveDraftAs(id: string, title: string): Promise<Draft>;
  deleteDraft(id: string): Promise<void>;
  pickImages(): Promise<string[]>;
  pickVideo(): Promise<string | null>;
  pickDirectory(): Promise<string | null>;
  pathsForFiles(files: File[]): string[];
  startJob(id: string, kind: JobKind, payload: unknown): Promise<void>;
  cancelJob(id: string): Promise<void>;
  onJob(callback: (job: ExportJob) => void): () => void;
  copyText(text: string): Promise<void>;
  reveal(path: string): Promise<void>;
  openHelp(): Promise<void>;
  getInfo(): Promise<{ version: string; dataDirectory: string; compatibility: string }>;
  onClose(callback: () => void): () => void;
  closeReady(): Promise<void>;
}
declare global { interface Window { desktop: DesktopAPI } }
