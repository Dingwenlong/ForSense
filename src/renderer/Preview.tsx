import { useEffect, useState } from 'react';
import type { Draft, MediaAsset } from '../shared/types';
import { Modal } from './Modal';
import { DouyinPreview } from './DouyinPreview';
import { WechatPreview } from './WechatPreview';

export function Preview({ draft }: { draft: Draft }) {
  const [index, setIndex] = useState(0), [view, setView] = useState<MediaAsset | null>(null), [playing, setPlaying] = useState(false);
  useEffect(() => { setIndex(0); setPlaying(false); }, [draft.id, draft.platform]);
  const safeIndex = Math.min(index, Math.max(0, draft.items.length - 1));
  const current = draft.items[safeIndex];
  useEffect(() => { setPlaying(false); }, [current?.id]);
  function next(n: number) { setIndex(Math.max(0, Math.min(draft.items.length - 1, safeIndex + n))); }
  return <>
    <div className="layout-sheet" aria-label="图文排版预览">
      {draft.platform === 'moments' ? <WechatPreview draft={draft} onView={setView}/>
        : <DouyinPreview draft={draft} current={current} index={safeIndex} playing={playing} setPlaying={setPlaying} onView={setView} next={next}/>}
    </div>
    <p className="preview-note">点图放大 · 图片与文案独立保存</p>
    {view && <Modal title={view.kind === 'live' ? '实况预览' : '图片预览'} onClose={() => setView(null)} wide>
      <div className="lightbox">{view.videoUrl ? <video src={view.videoUrl} poster={view.imageUrl} controls loop autoPlay/> : <img src={view.imageUrl} alt={view.name}/>}</div><div className="modal-footnote">{view.width} × {view.height}{view.kind === 'live' && ` · ${view.duration?.toFixed(2)} 秒实况`}</div>
    </Modal>}
  </>;
}
