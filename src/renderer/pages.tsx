import type { MutableRefObject } from 'react';
import type { Draft, MediaAsset, Platform } from '../shared/types';
import { Preview } from './Preview';

export type WorkPage = 'library' | 'media' | 'caption' | 'review';

export function LibraryPage({ drafts, filter, query, busy, setFilter, setQuery, create, open }: {
  drafts: Draft[]; filter: 'all' | Platform; query: string; busy: boolean;
  setFilter: (value: 'all' | Platform) => void; setQuery: (value: string) => void;
  create: (platform: Platform) => void; open: (draft: Draft) => void;
}) {
  const visible = drafts.filter(d => (filter === 'all' || d.platform === filter) &&
    `${d.title} ${d.caption}`.toLowerCase().includes(query.toLowerCase()));
  return <section className="page-content library-page" aria-label="草稿列表">
    <h1>我的草稿</h1>
    <p>选择已有草稿，或先新建一篇图文。</p>
    <div className="controls">
      <button disabled={busy} onClick={() => create('moments')}>新建朋友圈图文</button>
      <button disabled={busy} onClick={() => create('douyin')}>新建抖音图文</button>
    </div>
    <fieldset>
      <legend>查找草稿</legend>
      <label>搜索标题或文案
        <input aria-label="搜索草稿" value={query} placeholder="输入关键词" onChange={e => setQuery(e.target.value)}/>
      </label>
      {query && <button onClick={() => setQuery('')}>清空搜索</button>}
      <div className="controls library-filters" aria-label="草稿分类">
        {([['all', '全部'], ['moments', '朋友圈'], ['douyin', '抖音图文']] as const).map(([value, label]) =>
          <button key={value} aria-pressed={filter === value} onClick={() => setFilter(value)}>
            {label}（{drafts.filter(d => value === 'all' || d.platform === value).length}）
          </button>
        )}
      </div>
    </fieldset>
    <h2>草稿列表（{visible.length}）</h2>
    <div className="library-list">
      {visible.map(item => <button key={item.id} className="library-card" disabled={busy} onClick={() => open(item)}>
        {item.items[0] && <img src={item.items[0].imageUrl} alt=""/>}
        <span><strong>{item.title || '未命名草稿'}</strong><br/>
          {item.platform === 'moments' ? '朋友圈' : '抖音图文'} · {item.items.length} 张素材 ·
          {' '}{new Date(item.updatedAt).toLocaleDateString('zh-CN')}
        </span>
        <span aria-hidden="true">打开</span>
      </button>)}
      {!visible.length && <p>{query ? '没有匹配的草稿。' : '还没有草稿。选择上方类型开始。'}</p>}
    </div>
  </section>;
}

export function MediaPage({ draft, busy, change, importFiles, openVideo, reorder, edit, duplicate, remove, rejectVideoDrop, dragState }: {
  draft: Draft; busy: boolean; change: (patch: Partial<Draft>) => void;
  importFiles: (paths?: string[]) => void; openVideo: () => void; reorder: (from: number, to: number) => void;
  edit: (asset: MediaAsset) => void; duplicate: () => void; remove: () => void; rejectVideoDrop: () => void;
  dragState: MutableRefObject<number | null>;
}) {
  return <section className="page-content media-page" aria-label="图片素材页">
    <h1>图片素材</h1>
    <p>先整理图片。也可以不加图片，直接继续写文案。</p>
    <label className="field-label">草稿标题
      <input aria-label="草稿标题" value={draft.title} disabled={busy} maxLength={120}
        onChange={e => change({ title: e.target.value })}
        onBlur={() => { if (!draft.title.trim()) change({ title: '未命名草稿' }); }}/>
    </label>
    <fieldset className="platform-choice"><legend>发布平台</legend><div className="controls">
      <button aria-pressed={draft.platform === 'moments'} disabled={busy} onClick={() => change({ platform: 'moments' })}>朋友圈</button>
      <button aria-pressed={draft.platform === 'douyin'} disabled={busy} onClick={() => change({ platform: 'douyin' })}>抖音图文</button>
    </div></fieldset>
    <div className="controls">
      <button disabled={busy} onClick={() => importFiles()}>添加图片</button>
      <button disabled={busy} onClick={openVideo}>从视频取材</button>
      <button disabled={busy} onClick={duplicate}>复制草稿</button>
      <button disabled={busy} onClick={remove}>删除草稿</button>
    </div>
    <h2>已选素材（{draft.items.length}）</h2>
    <div className="asset-dropzone" data-drag-over="false"
      onDragOver={e => { e.preventDefault(); if (e.dataTransfer.types.includes('Files') && !busy) e.currentTarget.dataset.dragOver = 'true'; }}
      onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) e.currentTarget.dataset.dragOver = 'false'; }}
      onDrop={e => {
        e.preventDefault(); e.currentTarget.dataset.dragOver = 'false';
        if (busy || !e.dataTransfer.files.length) return;
        const paths = window.desktop.pathsForFiles(Array.from(e.dataTransfer.files));
        if (paths.some(p => /\.(mov|mp4)$/i.test(p))) { rejectVideoDrop(); return; }
        importFiles(paths);
      }}>
      {draft.items.length ? <div className="asset-grid">
        {draft.items.map((asset, index) => <article className="asset-card" key={asset.id} draggable={!busy}
          onDragStart={() => dragState.current = index} onDragOver={e => e.preventDefault()}
          onDrop={e => { if (dragState.current !== null) { e.stopPropagation(); e.preventDefault(); reorder(dragState.current, index); dragState.current = null; } }}
          onDragEnd={() => dragState.current = null}>
          <img src={asset.imageUrl} alt={asset.name}/>
          <div>第 {index + 1} 张 · {asset.width} × {asset.height} {asset.kind === 'live' && <span className="asset-live">实况</span>}</div>
          <div className="controls">
            <button aria-label={`前移第 ${index + 1} 张`} disabled={busy || index === 0} onClick={() => reorder(index, index - 1)}>前移</button>
            <button aria-label={`后移第 ${index + 1} 张`} disabled={busy || index === draft.items.length - 1} onClick={() => reorder(index, index + 1)}>后移</button>
            <button aria-label={`编辑第 ${index + 1} 张图片`} disabled={busy} onClick={() => edit(asset)}>裁切 / 旋转</button>
            <button aria-label={`移除第 ${index + 1} 张图片`} disabled={busy} onClick={() => change({ items: draft.items.filter(i => i.id !== asset.id) })}>移除</button>
          </div>
        </article>)}
        <button className="add-more" onClick={() => importFiles()} disabled={busy}>继续添加</button>
      </div> : <button className="empty-dropzone" disabled={busy} onClick={() => importFiles()}>点击选择或拖入图片（JPG / PNG / WebP）</button>}
    </div>
    <p>可拖动或使用前移、后移按钮调整顺序；裁切与旋转保留原图。</p>
  </section>;
}

export function CaptionPage({ draft, busy, change, copy }: {
  draft: Draft; busy: boolean; change: (patch: Partial<Draft>) => void; copy: () => void;
}) {
  return <section className="page-content caption-page" aria-label="发布文案页">
    <h1>发布文案</h1>
    <p>文案单独保存，导出时会生成“文案.txt”。</p>
    <textarea className="caption-input" aria-label="发布文案" placeholder="输入发布文案" rows={14}
      value={draft.caption} disabled={busy} maxLength={100000} onChange={e => change({ caption: e.target.value })}/>
    <div className="controls">
      <span>{Array.from(draft.caption).length.toLocaleString()} 字</span>
      <button disabled={!draft.caption} onClick={copy}>复制文案</button>
    </div>
  </section>;
}

export function ReviewPage({ draft, busy, exportPackage }: { draft: Draft; busy: boolean; exportPackage: () => void }) {
  return <section className="page-content review-page" aria-label="预览导出页">
    <h1>预览与导出</h1>
    <p>{draft.items.length} 个素材 · {Array.from(draft.caption).length} 字。检查顺序和文案后导出。</p>
    <div className="review-layout">
      <div className="preview-panel"><h2>图文排版预览</h2><Preview draft={draft}/></div>
      <div className="review-actions">
        <h2>发布素材包</h2>
        <p>图片按顺序编号，文案单独保存。</p>
        <button disabled={busy || (!draft.items.length && !draft.caption.trim())} onClick={exportPackage}>导出素材包</button>
      </div>
    </div>
  </section>;
}
