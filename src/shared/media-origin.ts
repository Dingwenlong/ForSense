import type { MediaAsset, MediaOrigin } from './types';
export const ORIGIN_LABELS: Record<MediaOrigin, string> = {
  import: '用户导入', crop: '裁剪生成', rotate: '旋转生成', edit: '编辑生成',
  'video-frame': '视频截图', live: '视频实况', optimization: '优化结果', unknown: '来源待确认',
};
export function metadataOrigin(asset: Pick<MediaAsset, 'id' | 'originalId' | 'edits' | 'kind' | 'optimization' | 'origin'>): MediaOrigin {
  if (asset.origin && asset.origin !== 'unknown' && Object.hasOwn(ORIGIN_LABELS, asset.origin)) return asset.origin;
  if (asset.originalId !== asset.id) return asset.edits?.crop ? 'crop' : asset.edits?.rotation ? 'rotate' : 'edit';
  if (asset.optimization) return 'optimization';
  if (asset.kind === 'live') return 'live';
  return 'unknown';
}
export function originLabel(origin?: MediaOrigin) { return ORIGIN_LABELS[origin || 'unknown'] || ORIGIN_LABELS.unknown; }
