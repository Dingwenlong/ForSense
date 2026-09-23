import { useEffect, useState } from 'react';
import type { Draft, MediaAsset } from '../shared/types';
import { Modal } from './Modal';
import { DouyinPreview } from './DouyinPreview';
import { WechatPreview } from './WechatPreview';

export function Preview({ draft, busy, onEdit, onReorder }: { draft: Draft; busy: boolean; onEdit: (asset: MediaAsset) => void; onReorder: (from: number, to: number) => void }) {
  const [index, setIndex] = useState(0), [view, setView] = useState<MediaAsset | null>(null), [playing, setPlaying] = useState(false);
  useEffect(() => { setIndex(0); setPlaying(false); }, [draft.id, draft.platform]);
  const safeIndex = Math.min(index, Math.max(0, draft.items.length - 1));
  const current = draft.items[safeIndex];
  useEffect(() => { setPlaying(false); }, [current?.id]);
  function next(n: number) { setIndex(Math.max(0, Math.min(draft.items.length - 1, safeIndex + n))); }
  return <>
    <div className="layout-sheet" aria-label="图文排版预览">
      {draft.platform === 'moments' ? <WechatPreview draft={draft} busy={busy} onEdit={onEdit} onReorder={onReorder} onPlay={setView}/>
        : <DouyinPreview draft={draft} busy={busy} current={current} index={safeIndex} playing={playing} setPlaying={setPlaying} onEdit={onEdit}
            onReorder={(from, to) => { onReorder(from, to); setIndex(to); }} next={next}/>}
    </div>
    <p className="preview-note">{draft.platform === 'moments' ? '单击图片编辑 · 按住图片拖到目标位置调整顺序' : '单击图片编辑 · 按住图片左右拖动或拖到进度条调整顺序'}</p>
    {view && <Modal title={view.kind === 'live' ? '实况预览' : '图片预览'} onClose={() => setView(null)} wide>
      <div className="lightbox">{view.videoUrl ? <video src={view.videoUrl} poster={view.imageUrl} controls loop autoPlay/> : <img src={view.imageUrl} alt={view.name}/>}</div><div className="modal-footnote">{view.width} × {view.height}{view.kind === 'live' && ` · ${view.duration?.toFixed(2)} 秒实况`}</div>
    </Modal>}
  </>;
}
