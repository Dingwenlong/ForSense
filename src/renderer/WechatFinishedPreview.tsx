import { useLayoutEffect, useRef, useState } from 'react';
import type { Draft, MediaAsset } from '../shared/types';

export function WechatFinishedPreview({ draft, busy, onView }: { draft: Draft; busy: boolean; onView: (asset: MediaAsset) => void }) {
  const [expanded, setExpanded] = useState(false), [overflows, setOverflows] = useState(false);
  const caption = useRef<HTMLParagraphElement>(null);
  useLayoutEffect(() => { setExpanded(false); }, [draft.caption]);
  useLayoutEffect(() => {
    const node = caption.current; if (!node) return;
    const measure = () => setOverflows(node.scrollHeight > parseFloat(getComputedStyle(node).lineHeight) * 6 + 1);
    measure(); const observer = new ResizeObserver(measure); observer.observe(node);
    return () => observer.disconnect();
  }, [draft.caption]);
  const items = draft.items.slice(0, 9), single = items.length === 1;
  const grid = single ? ` moments-finished__images--single${items[0].height > items[0].width ? ' moments-finished__images--portrait' : ''}` : items.length === 4 ? ' moments-finished__images--four' : '';
  return <section className="moments-finished" aria-label="微信朋友圈成品预览">
    <header className="moments-finished__header">
      <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="m15 4-8 8 8 8"/></svg>
      <strong>朋友圈</strong>
      <svg aria-hidden="true" width="25" height="25" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M3 6h5l2-3h4l2 3h5v15H3Z"/><circle cx="12" cy="13" r="4"/></svg>
    </header>
    {!draft.caption.trim() && !items.length ? <p className="moments-finished__empty">添加文案或图片后即可查看成品效果</p> : <article className="moments-finished__post">
      <div className="moments-finished__avatar" aria-label="示意头像">我</div>
      <div className="moments-finished__content">
        <strong className="moments-finished__name">我的图文</strong>
        {draft.caption.trim() && <>
          <p ref={caption} className={`moments-finished__caption${expanded ? ' is-expanded' : ''}`}>{draft.caption}</p>
          {overflows && <button className="moments-finished__expand" aria-expanded={expanded} onClick={() => setExpanded(value => !value)}>{expanded ? '收起' : '全文'}</button>}
        </>}
        {!!items.length && <div className={`moments-finished__images${grid}`} aria-label="发布后图片排布">
          {items.map((item, index) => <button key={item.id} className="moments-finished__image" disabled={busy} aria-label={`${item.kind === 'live' ? '播放实况' : '查看图片'} ${index + 1}：${item.name}`}
            style={single ? { aspectRatio: `${item.width} / ${item.height}` } : undefined} onClick={() => onView(item)}>
            <img src={item.imageUrl} alt={item.name} draggable={false}/>
            {item.kind === 'live' && <span className="moments-finished__live" aria-hidden="true">实况 ▶</span>}
          </button>)}
        </div>}
        <div className="moments-finished__meta"><span>刚刚</span><span className="moments-finished__more" aria-hidden="true">••</span></div>
      </div>
    </article>}
    {draft.items.length > 9 && <p className="moments-finished__overflow">成品预览展示前 9 张；草稿共 {draft.items.length} 张，导出保留全部素材。</p>}
  </section>;
}
