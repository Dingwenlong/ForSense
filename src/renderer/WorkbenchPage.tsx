import type { Draft, MediaAsset } from '../shared/types';
import { Preview } from './Preview';

export function WorkbenchPage({ draft, busy, change, importFiles, openVideo, reorder, edit, duplicate, remove, rejectVideoDrop, copy, exportPackage }: {
  draft: Draft; busy: boolean; change: (patch: Partial<Draft>) => void;
  importFiles: (paths?: string[]) => void; openVideo: () => void; reorder: (from: number, to: number) => void;
  edit: (asset: MediaAsset) => void; duplicate: () => void; remove: () => void;
  rejectVideoDrop: () => void; copy: () => void; exportPackage: () => void;
}) {
  function handleFiles(files: FileList) {
    if (busy || !files.length) return;
    const paths = window.desktop.pathsForFiles(Array.from(files));
    if (paths.some(p => /\.(mov|mp4)$/i.test(p))) { rejectVideoDrop(); return; }
    importFiles(paths);
  }

  return <section className="workbench-page" aria-label="预览工作台"
    onDragOver={event => { if (event.dataTransfer.types.includes('Files')) event.preventDefault(); }}
    onDrop={event => { if (!event.dataTransfer.files.length) return; event.preventDefault(); handleFiles(event.dataTransfer.files); }}>
    <div className="workbench-toolbar">
      <label>草稿标题
        <input aria-label="草稿标题" value={draft.title} disabled={busy} maxLength={120}
          onChange={event => change({ title: event.target.value })}
          onBlur={() => { if (!draft.title.trim()) change({ title: '未命名草稿' }); }}/>
      </label>
      <label>发布平台
        <select aria-label="发布平台" value={draft.platform} disabled={busy} onChange={event => change({ platform: event.target.value as Draft['platform'] })}>
          <option value="moments">朋友圈</option><option value="douyin">抖音图文</option>
        </select>
      </label>
      <button disabled={busy} onClick={openVideo}>从视频取材</button>
      <button disabled={!draft.caption} onClick={copy}>复制文案</button>
      <details className="draft-operations"><summary>草稿操作</summary><div className="controls">
        <button disabled={busy} onClick={duplicate}>复制草稿</button><button disabled={busy} onClick={remove}>删除草稿</button>
      </div></details>
      <button disabled={busy || (!draft.items.length && !draft.caption.trim())} onClick={exportPackage}>导出素材包</button>
    </div>
    <div className="workbench-preview" aria-label="实时预览">
      <div className="workbench-preview-head"><h1>实时预览</h1><span>{draft.items.length} 张图片 · {Array.from(draft.caption).length} 字</span></div>
      <div className="workbench-preview-scroll"><Preview draft={draft} busy={busy} onEdit={edit} onReorder={reorder}
        onAddImages={() => importFiles()} onCaptionChange={caption => change({ caption })}/></div>
    </div>
  </section>;
}
