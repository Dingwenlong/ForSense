export interface PreviewSettings { preset: string; width: number; height: number }
export const PREVIEW_LIMITS = { width: { min: 240, max: 1440 }, height: { min: 320, max: 1600 } };
export const DEFAULT_PREVIEW: PreviewSettings = { preset: 'custom', width: 520, height: 780 };
export const PREVIEW_STORAGE_KEY = 'social-copy-preview-v1';

// CSS viewport sizes, from Chromium DevTools' device presets. These are not physical screen pixels.
export const DEVICE_PRESETS = [
  { id: 'iphone-se', name: 'iPhone SE', width: 375, height: 667 },
  { id: 'iphone-14-pro', name: 'iPhone 14 Pro', width: 393, height: 852 },
  { id: 'iphone-14-pro-max', name: 'iPhone 14 Pro Max', width: 430, height: 932 },
  { id: 'pixel-7', name: 'Pixel 7', width: 412, height: 915 },
  { id: 'galaxy-s8-plus', name: 'Galaxy S8+', width: 360, height: 740 },
] as const;

export function clampPreviewSize(value: number, axis: 'width' | 'height'): number {
  if (!Number.isFinite(value)) return DEFAULT_PREVIEW[axis];
  return Math.max(PREVIEW_LIMITS[axis].min, Math.min(PREVIEW_LIMITS[axis].max, Math.round(value)));
}

export function normalizePreviewSettings(input: unknown): PreviewSettings {
  const data = input && typeof input === 'object' ? input as Record<string, unknown> : {};
  const width = clampPreviewSize(typeof data.width === 'number' ? data.width : DEFAULT_PREVIEW.width, 'width');
  const height = clampPreviewSize(typeof data.height === 'number' ? data.height : DEFAULT_PREVIEW.height, 'height');
  const preset = DEVICE_PRESETS.find(p => p.id === data.preset && p.width === width && p.height === height);
  return { preset: preset?.id || 'custom', width, height };
}
