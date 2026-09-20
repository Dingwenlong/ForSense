import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Images, Radio } from 'lucide-react';
import type { Draft, MediaAsset } from '../shared/types';
import { Modal } from './Modal';

export function Preview({ draft }: { draft: Draft }) {
  const [index, setIndex] = useState(0), [view, setView] = useState<MediaAsset | null>(null), [playing, setPlaying] = useState(false);
  useEffect(() => { setIndex(0); setPlaying(false); }, [draft.id, draft.platform]);
  const safeIndex = Math.min(index, Math.max(0, draft.items.length - 1));
  const current = draft.items[safeIndex];
  useEffect(() => { setPlaying(false); }, [current?.id]);
  function next(n: number) { setIndex((safeIndex + n + draft.items.length) % draft.items.length); }
  const caption = <section className="layout-caption-block"><div className="layout-block-label">文案</div><p className={`layout-caption ${!draft.caption ? 'layout-placeholder-copy' : ''}`}>{draft.caption || '写下文案后，在这里查看完整排版。'}</p></section>;
  const empty = <div className="layout-empty"><Images size={30} strokeWidth={1.3}/><span>添加图片，开始整理画面</span></div>;
  return <>
    <div className="layout-sheet" aria-label="图文排版预览">
      {draft.platform === 'moments' ? <>
        {caption}
        <section className="layout-images-block"><div className="layout-block-label">图片<span>{draft.items.length ? `${draft.items.length} 张 · 按发布顺序` : ''}</span></div>
          {draft.items.length ? <div className={`layout-grid count-${Math.min(draft.items.length, 9)}`}>{draft.items.map(item => <button key={item.id} className="preview-image" onClick={() => setView(item)} aria-label={`查看 ${item.name}`}><img src={item.imageUrl} alt={item.name}/>{item.kind === 'live' && <span className="tiny-live"><Radio size={10}/> LIVE</span>}</button>)}</div> : empty}
        </section>
      </> : <>
        <section className="layout-images-block"><div className="layout-block-label">图片<span>{draft.items.length ? '按发布顺序' : ''}</span></div>
          {current ? <><div className="layout-image-stage">
            {playing && current.videoUrl ? <video src={current.videoUrl} autoPlay loop controls playsInline/> : <button className="layout-large-image" aria-label={`查看 ${current.name}`} onClick={() => setView(current)}><img src={current.imageUrl} alt={current.name}/></button>}
          </div><div className="layout-carousel"><button className="icon-button" aria-label="上一张" disabled={draft.items.length < 2} onClick={() => next(-1)}><ChevronLeft size={16}/></button><span className="image-counter">{safeIndex + 1} / {draft.items.length}</span><button className="icon-button" aria-label="下一张" disabled={draft.items.length < 2} onClick={() => next(1)}><ChevronRight size={16}/></button></div>
          {current.kind === 'live' && <button className="text-button layout-live-button" onClick={() => setPlaying(!playing)}><Radio size={13}/>{playing ? '查看封面' : '播放实况'}</button>}
          </> : empty}
        </section>
        {caption}
      </>}
    </div>
    <p className="preview-note">点图放大 · 图片与文案独立保存</p>
    {view && <Modal title={view.kind === 'live' ? '实况预览' : '图片预览'} onClose={() => setView(null)} wide>
      <div className="lightbox">{view.videoUrl ? <video src={view.videoUrl} poster={view.imageUrl} controls loop autoPlay/> : <img src={view.imageUrl} alt={view.name}/>}</div><div className="modal-footnote">{view.width} × {view.height}{view.kind === 'live' && ` · ${view.duration?.toFixed(2)} 秒实况`}</div>
    </Modal>}
  </>;
}
