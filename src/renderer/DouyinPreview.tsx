import type { Draft, MediaAsset } from '../shared/types';

function Glyph({ kind }: { kind: 'search' | 'heart' | 'comment' | 'star' | 'share' }) {
  const common = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  return <svg aria-hidden="true" width="21" height="21" viewBox="0 0 24 24" {...common}>
    {kind === 'search' && <><circle cx="10.8" cy="10.8" r="6.7"/><path d="m16 16 5 5"/></>}
    {kind === 'heart' && <path d="M12 21s-9-5.6-9-11.2a4.8 4.8 0 0 1 9-2.2 4.8 4.8 0 0 1 9 2.2C21 15.4 12 21 12 21Z"/>}
    {kind === 'comment' && <path d="M21 11.5a8.7 8.7 0 0 1-9 8.5 10 10 0 0 1-3.1-.5L4 21l1.5-4.1A8.3 8.3 0 0 1 3 11.5 8.7 8.7 0 0 1 12 3a8.7 8.7 0 0 1 9 8.5Z"/>}
    {kind === 'star' && <path d="m12 2 3 6.7 7.2.7-5.4 4.8 1.6 7-6.4-3.7-6.4 3.7 1.6-7L1.8 9.4l7.2-.7L12 2Z"/>}
    {kind === 'share' && <><path d="M14 4h7v7"/><path d="M21 4 10 15"/><path d="M20 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h5"/></>}
  </svg>;
}

export function DouyinPreview({ draft, current, index, playing, setPlaying, onView, next }: {
  draft: Draft; current: MediaAsset | undefined; index: number; playing: boolean;
  setPlaying: (value: boolean) => void; onView: (asset: MediaAsset) => void; next: (direction: number) => void;
}) {
  const tags = [...new Set([...draft.caption.matchAll(/#[^\s#]+/gu)].map(match => match[0]))];
  const captionParts = draft.caption.split(/(#[^\s#]+)/gu);
  return <div className="douyin-proof" aria-label="抖音图文排版预览">
    <div className="douyin-proof__header" aria-label="账号信息示意">
      <span className="douyin-proof__back" aria-hidden="true">‹</span>
      <span className="douyin-proof__avatar" aria-hidden="true">我</span>
      <strong>我的图文</strong>
      <span className="douyin-proof__follow">关注</span>
      <Glyph kind="search"/>
    </div>
    <div className="douyin-proof__media" tabIndex={current ? 0 : -1} role="group" aria-label="图文图片，可使用左右方向键翻页"
      onKeyDown={event => {
        if (draft.items.length < 2) return;
        if (event.key === 'ArrowLeft') { event.preventDefault(); next(-1); }
        if (event.key === 'ArrowRight') { event.preventDefault(); next(1); }
      }}>
      {current ? <>
        {playing && current.videoUrl ? <video src={current.videoUrl} autoPlay loop controls playsInline aria-label={current.name}/>
          : <button className="douyin-proof__image" aria-label={`查看 ${current.name}`} onClick={() => onView(current)}><img src={current.imageUrl} alt={current.name}/></button>}
        <span className="image-counter douyin-proof__counter">{index + 1}/{draft.items.length}</span>
        {draft.items.length > 1 && <>
          <button className="douyin-proof__previous" aria-label="上一张" onClick={() => next(-1)} disabled={index === 0}>‹</button>
          <button className="douyin-proof__next" aria-label="下一张" onClick={() => next(1)} disabled={index === draft.items.length - 1}>›</button>
        </>}
        {current.kind === 'live' && <button className="douyin-proof__motion" onClick={() => setPlaying(!playing)}>{playing ? '暂停实况' : '播放实况'}</button>}
        <div className="douyin-proof__segments" aria-label={`第 ${index + 1} 张，共 ${draft.items.length} 张`}>
          {draft.items.length <= 18 ? draft.items.map((item, position) => <span key={item.id} className={position <= index ? 'seen' : ''}/> )
            : <progress max={draft.items.length} value={index + 1}/>}
        </div>
      </> : <p className="douyin-proof__empty">（暂无图片）</p>}
    </div>
    {tags.length > 0 && <div className="douyin-proof__topic"><strong># {tags[0].slice(1)}</strong><span>话题预览</span></div>}
    <div className="douyin-proof__copy">
      <p className="layout-caption douyin-proof__caption">
        {draft.caption ? captionParts.map((part, position) => part.startsWith('#') ?
          <span className="douyin-proof__hashtag" key={position}>{part}</span> : part) : '（暂无文案）'}
      </p>
      {tags.length > 0 && <div className="douyin-proof__related"><span>相关搜索</span><span className="douyin-proof__search-chip"><Glyph kind="search"/>{tags[0].slice(1)}</span></div>}
    </div>
    <div className="douyin-proof__footer" aria-label="互动区域示意">
      <span className="douyin-proof__reply">说点什么…</span>
      <span><Glyph kind="heart"/>点赞</span>
      <span><Glyph kind="comment"/>评论</span>
      <span><Glyph kind="star"/>收藏</span>
      <span><Glyph kind="share"/>分享</span>
    </div>
    <p className="douyin-proof__note">仅供排版参考，实际展示以抖音为准</p>
  </div>;
}
