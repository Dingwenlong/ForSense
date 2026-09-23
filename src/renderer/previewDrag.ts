import type { DragEvent } from 'react';
import type { Draft } from '../shared/types';

const ASSET_MIME = 'application/x-social-copy-asset';

export function beginPreviewDrag(event: DragEvent<HTMLElement>, assetId: string) {
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData(ASSET_MIME, assetId);
}

export function previewDragSource(event: DragEvent<HTMLElement>, draft: Draft): number {
  if (!event.dataTransfer.types.includes(ASSET_MIME)) return -1;
  const id = event.dataTransfer.getData(ASSET_MIME);
  return draft.items.findIndex(item => item.id === id);
}

export function acceptsPreviewDrag(event: DragEvent<HTMLElement>): boolean {
  return event.dataTransfer.types.includes(ASSET_MIME);
}
