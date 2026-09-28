import type { Draft, MediaAsset } from '../shared/types';
import { Preview } from './Preview';

export function WorkbenchPage({ draft, busy, canSaveAs, change, importFiles, addImages, openVideo, reorder, edit, saveAs, rejectVideoDrop, copy, exportPackage }: {
  draft: Draft; busy: boolean; canSaveAs: boolean; change: (patch: Partial<Draft>) => void;
  importFiles: (paths?: string[]) => void; addImages: () => void; openVideo: () => void; reorder: (from: number, to: number) => void;
  edit: (asset: MediaAsset) => void; saveAs: () => void;
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
      <div className="platform-control" role="group" aria-label="预览平台">
        <span>预览平台</span><span>微信</span>
        <button type="button" role="switch" aria-label="抖音预览" aria-checked={draft.platform === 'douyin'} disabled={busy} className="platform-switch"
          onClick={() => change({ platform: draft.platform === 'moments' ? 'douyin' : 'moments' })}><span aria-hidden="true"/></button>
        <span>抖音</span>
      </div>
      <button disabled={busy} onClick={openVideo}>从视频取材</button>
      <button disabled={!draft.caption} onClick={copy}>复制文案</button>
      <button disabled={busy || !canSaveAs} title={canSaveAs ? undefined : '草稿已达 10 份上限，请先在列表删除不需要的草稿'} onClick={saveAs}>另存草稿</button>
      <button disabled={busy || (!draft.items.length && !draft.caption.trim())} onClick={exportPackage}>导出素材包</button>
    </div>
    <div className="workbench-preview" aria-label="实时预览">
      <div className="workbench-preview-head"><h1>实时预览</h1><span>{draft.items.length} 张图片 · {Array.from(draft.caption).length} 字</span></div>
      <div className="workbench-preview-scroll"><Preview draft={draft} busy={busy} onEdit={edit} onReorder={reorder}
        onAddImages={addImages} onCaptionChange={caption => change({ caption })}/></div>
    </div>
  </section>;
}
