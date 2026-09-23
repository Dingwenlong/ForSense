import { useEffect, useRef, useState } from 'react';
import type { Draft, MediaAsset } from '../shared/types';
import { Preview } from './Preview';

type EditorTab = 'caption' | 'media';

export function WorkbenchPage({ draft, busy, change, importFiles, openVideo, reorder, edit, duplicate, remove, rejectVideoDrop, copy, exportPackage }: {
  draft: Draft; busy: boolean; change: (patch: Partial<Draft>) => void;
  importFiles: (paths?: string[]) => void; openVideo: () => void; reorder: (from: number, to: number) => void;
  edit: (asset: MediaAsset) => void; duplicate: () => void; remove: () => void;
  rejectVideoDrop: () => void; copy: () => void; exportPackage: () => void;
}) {
  const [tab, setTab] = useState<EditorTab>('caption');
  const dragged = useRef<number | null>(null);
  useEffect(() => { setTab('caption'); }, [draft.id]);

  function handleFiles(files: FileList) {
    if (busy || !files.length) return;
    const paths = window.desktop.pathsForFiles(Array.from(files));
    if (paths.some(p => /\.(mov|mp4)$/i.test(p))) { rejectVideoDrop(); return; }
    importFiles(paths);
  }

  return <section className="workbench-page" aria-label="预览工作台"
    onDragOver={event => { if (event.dataTransfer.types.includes('Files')) event.preventDefault(); }}
    onDrop={event => { if (!event.dataTransfer.files.length) return; event.preventDefault(); handleFiles(event.dataTransfer.files); }}>
    <aside className="workbench-editor" aria-label="编辑工具">
      <div className="workbench-editor-head">
        <h2>编辑内容</h2>
        <label className="field-label">草稿标题
          <input aria-label="草稿标题" value={draft.title} disabled={busy} maxLength={120}
            onChange={event => change({ title: event.target.value })}
            onBlur={() => { if (!draft.title.trim()) change({ title: '未命名草稿' }); }}/>
        </label>
        <fieldset className="platform-choice"><legend>发布平台</legend><div className="controls">
          <button aria-pressed={draft.platform === 'moments'} disabled={busy} onClick={() => change({ platform: 'moments' })}>朋友圈</button>
          <button aria-pressed={draft.platform === 'douyin'} disabled={busy} onClick={() => change({ platform: 'douyin' })}>抖音图文</button>
        </div></fieldset>
        <div className="controls editor-tabs" role="tablist" aria-label="编辑内容">
          <button role="tab" aria-selected={tab === 'caption'} aria-controls="caption-editor" onClick={() => setTab('caption')}>文案</button>
          <button role="tab" aria-selected={tab === 'media'} aria-controls="media-editor" onClick={() => setTab('media')}>图片（{draft.items.length}）</button>
        </div>
      </div>
      <div className="workbench-editor-scroll">
        {tab === 'caption' ? <section id="caption-editor" role="tabpanel" aria-label="文案编辑">
          <label htmlFor="caption-input">发布文案</label>
          <textarea id="caption-input" className="caption-input" aria-label="发布文案" placeholder="输入发布文案" rows={12}
            value={draft.caption} disabled={busy} maxLength={100000} onChange={event => change({ caption: event.target.value })}/>
          <div className="controls"><span>{Array.from(draft.caption).length.toLocaleString()} 字</span>
            <button disabled={!draft.caption} onClick={copy}>复制文案</button></div>
          <p>输入内容后，右侧预览立即更新。</p>
        </section> : <section id="media-editor" role="tabpanel" aria-label="图片编辑">
          <div className="controls"><button disabled={busy} onClick={() => importFiles()}>添加图片</button>
            <button disabled={busy} onClick={openVideo}>从视频取材</button></div>
          {draft.items.length ? <div className="asset-list">
            {draft.items.map((asset, index) => <article className="asset-card" key={asset.id} draggable={!busy} tabIndex={0}
              aria-label={`第 ${index + 1} 张图片：${asset.name}，Alt 加上下方向键可排序`}
              onKeyDown={event => { if (busy || !event.altKey) return; const to = event.key === 'ArrowUp' ? index - 1 : event.key === 'ArrowDown' ? index + 1 : index; if (to !== index && to >= 0 && to < draft.items.length) { event.preventDefault(); reorder(index, to); } }}
              onDragStart={() => { dragged.current = index; }} onDragOver={event => event.preventDefault()}
              onDrop={event => { if (dragged.current !== null) { event.stopPropagation(); event.preventDefault(); reorder(dragged.current, index); dragged.current = null; } }}
              onDragEnd={() => { dragged.current = null; }}>
              <img src={asset.imageUrl} alt={asset.name}/>
              <div className="asset-details"><strong>第 {index + 1} 张</strong> · {asset.width} × {asset.height}
                {asset.kind === 'live' && <span className="asset-live"> · 实况</span>}
              </div>
            </article>)}
          </div> : <button className="empty-dropzone" disabled={busy} onClick={() => importFiles()}>点击选择或拖入图片（JPG / PNG / WebP）</button>}
          <p>在右侧预览拖动图片排序，单击图片编辑；键盘可在左侧素材上按 Alt + ↑ / ↓ 排序。</p>
        </section>}
      </div>
      <details className="draft-operations"><summary>草稿操作</summary><div className="controls">
        <button disabled={busy} onClick={duplicate}>复制草稿</button><button disabled={busy} onClick={remove}>删除草稿</button>
      </div></details>
    </aside>
    <div className="workbench-preview" aria-label="实时预览">
      <div className="workbench-preview-head"><div><h1>实时预览</h1><span>{draft.items.length} 张图片 · {Array.from(draft.caption).length} 字</span></div>
        <button disabled={busy || (!draft.items.length && !draft.caption.trim())} onClick={exportPackage}>导出素材包</button>
      </div>
      <div className="workbench-preview-scroll"><Preview draft={draft} busy={busy} onEdit={edit} onReorder={reorder}/></div>
    </div>
  </section>;
}
