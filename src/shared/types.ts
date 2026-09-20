export type Platform = 'moments' | 'douyin';
export interface Crop { x: number; y: number; width: number; height: number }
export interface Edits { rotation: 0 | 90 | 180 | 270; crop?: Crop }
export interface MediaAsset {
  id: string; kind: 'image' | 'live'; name: string; width: number; height: number;
  imageUrl: string; videoUrl?: string; duration?: number; coverTime?: number;
  originalId: string; edits: Edits;
}
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
export type JobKind = 'images' | 'video' | 'frame' | 'live' | 'edit' | 'export';
export interface ExportJob {
  id: string; kind: JobKind; title: string; status: 'queued' | 'running' | 'done' | 'error' | 'cancelled';
  progress: number; message: string; result?: unknown; error?: string;
}
export interface DesktopAPI {
  listDrafts(): Promise<{ drafts: Draft[]; warnings: string[] }>;
  createDraft(platform: Platform): Promise<Draft>;
  saveDraft(draft: Draft): Promise<Draft>;
  duplicateDraft(id: string): Promise<Draft>;
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
