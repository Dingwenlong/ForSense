import { useLayoutEffect, useRef, useState } from 'react';
import type { Draft, MediaAsset } from '../shared/types';
import { acceptsPreviewDrag, beginPreviewDrag, previewDragSource } from './previewDrag';

function SettingIcon({ kind }: { kind: 'location' | 'mention' | 'audience' }) {
  if (kind === 'mention') return <span className="wechat-proof__at" aria-hidden="true">@</span>;
  return <svg aria-hidden="true" width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    {kind === 'location' ? <><path d="M19 10c0 5-7 12-7 12S5 15 5 10a7 7 0 0 1 14 0Z"/><circle cx="12" cy="10" r="2.4"/></>
      : <><circle cx="12" cy="8" r="3.5"/><path d="M5 21v-1.5a7 7 0 0 1 14 0V21H5Z"/></>}
  </svg>;
}

export function WechatPreview({ draft, busy, onEdit, onReorder, onPlay, onAddImages, onCaptionChange }: {
  draft: Draft; busy: boolean; onEdit: (asset: MediaAsset) => void;
  onReorder: (from: number, to: number) => void; onPlay: (asset: MediaAsset) => void;
  onAddImages: () => void; onCaptionChange: (caption: string) => void;
}) {
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const suppressClick = useRef(false);
  const captionRef = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const field = captionRef.current; if (!field) return;
    field.style.height = 'auto'; field.style.height = `${Math.max(152, field.scrollHeight)}px`;
  }, [draft.caption]);
  return <div className="wechat-proof" aria-label="微信朋友圈发表排版预览">
    <div className="wechat-proof__header" aria-label="发表栏示意">
      <span>取消</span><span className="wechat-proof__publish">发表</span>
    </div>
    <textarea ref={captionRef} className="layout-caption wechat-proof__caption" aria-label="发布文案"
      value={draft.caption} placeholder="这一刻的想法…" disabled={busy} maxLength={100000}
      onChange={event => onCaptionChange(event.target.value)}/>
    <div className="wechat-proof__photos" aria-label="朋友圈图片九宫格">
      <div className="wechat-proof__grid">
        {draft.items.slice(0, 9).map((item, position) => <div key={item.id} className="wechat-proof__tile">
          <button className={`preview-image wechat-proof__photo ${dropIndex === position ? 'drop-target' : ''}`}
            draggable={!busy} disabled={busy} aria-label={`编辑第 ${position + 1} 张：${item.name}`}
            onClick={() => { if (!suppressClick.current) onEdit(item); }}
            onKeyDown={event => {
              if (busy || !event.altKey) return;
              const offset = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : event.key === 'ArrowUp' ? -3 : event.key === 'ArrowDown' ? 3 : 0;
              const target = position + offset;
              if (offset && target >= 0 && target < draft.items.length) { event.preventDefault(); onReorder(position, target); }
            }}
            onDragStart={event => { suppressClick.current = true; beginPreviewDrag(event, item.id); }}
            onDragEnd={() => { setDropIndex(null); window.setTimeout(() => { suppressClick.current = false; }, 0); }}
            onDragOver={event => { if (busy || !acceptsPreviewDrag(event)) return; event.preventDefault(); event.dataTransfer.dropEffect = 'move'; setDropIndex(position); }}
            onDragLeave={() => setDropIndex(null)}
            onDrop={event => { if (busy) return; const from = previewDragSource(event, draft); if (from < 0) return; event.preventDefault(); event.stopPropagation(); setDropIndex(null); if (from !== position) onReorder(from, position); }}>
            <img src={item.imageUrl} alt={item.name} draggable={false}/>
          </button>
          {item.kind === 'live' && <button className="wechat-proof__live" onClick={() => onPlay(item)} aria-label={`播放第 ${position + 1} 张实况`}>实况 ▶</button>}
        </div>)}
        {draft.items.length < 9 && <button className="wechat-proof__add" onClick={onAddImages} disabled={busy} aria-label="添加图片">＋<small>添加图片</small></button>}
      </div>
      {draft.items.length >= 9 && <button className="wechat-proof__add-below" onClick={onAddImages} disabled={busy}>＋ 添加图片</button>}
      {draft.items.length > 9 && <p className="wechat-proof__overflow">九宫格预览前 9 张；草稿共 {draft.items.length} 张，导出保留全部素材。</p>}
    </div>
    <div className="wechat-proof__settings" aria-label="发布设置示意">
      <div className="wechat-proof__setting"><SettingIcon kind="location"/><span>所在位置</span><span className="wechat-proof__setting-value">微信中设置</span><span aria-hidden="true">›</span></div>
      <div className="wechat-proof__setting"><SettingIcon kind="mention"/><span>提醒谁看</span><span className="wechat-proof__setting-value">微信中设置</span><span aria-hidden="true">›</span></div>
      <div className="wechat-proof__setting"><SettingIcon kind="audience"/><span>谁可以看</span><span className="wechat-proof__setting-value">微信中设置</span><span aria-hidden="true">›</span></div>
    </div>
    <p className="wechat-proof__note">仅供排版参考；发表与设置需在微信中完成</p>
  </div>;
}
