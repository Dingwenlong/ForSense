import type { Draft, MediaAsset } from '../shared/types';
import { useState } from 'react';
import { Preview } from './Preview';
import { BackButton } from './BackButton';
import { PreviewSizeControls, PreviewViewport } from './PreviewViewport';
import type { PreviewSettings } from '../shared/preview-settings';

export function WorkbenchPage({ draft, busy, canSaveAs, change, importFiles, addImages, reorder, edit, remove, saveAs, rejectVideoDrop, exportPackage, back, previewSettings, setPreviewSettings }: {
  draft: Draft; busy: boolean; canSaveAs: boolean; change: (patch: Partial<Draft>) => void;
  importFiles: (paths?: string[]) => void; addImages: () => void; reorder: (from: number, to: number) => void;
  edit: (asset: MediaAsset) => void; remove: (id: string) => void; saveAs: () => void;
  rejectVideoDrop: () => void; exportPackage: () => void; back: () => void;
  previewSettings: PreviewSettings; setPreviewSettings: (next: PreviewSettings) => void;
}) {
  const [editing, setEditing] = useState(false);
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
      <BackButton disabled={busy} onClick={back}/>
      <div className="platform-control" role="group" aria-label="预览平台">
        <span>微信</span>
        <button type="button" role="switch" aria-label="抖音预览" aria-checked={draft.platform === 'douyin'} disabled={busy} className="platform-switch"
          onClick={() => change({ platform: draft.platform === 'moments' ? 'douyin' : 'moments' })}><span aria-hidden="true"/></button>
        <span>抖音</span>
      </div>
      <button disabled={busy} aria-pressed={editing} onClick={() => setEditing(value => !value)}>{editing ? '完成编辑' : '编辑模式'}</button>
      <PreviewSizeControls settings={previewSettings} onChange={setPreviewSettings} disabled={busy}/>
      <div className="workbench-actions">
        <button disabled={busy || !canSaveAs} title={canSaveAs ? undefined : '草稿已达 10 份上限，请先在列表删除不需要的草稿'} onClick={saveAs}>另存草稿</button>
        <button disabled={busy || (!draft.items.length && !draft.caption.trim())} onClick={exportPackage}>导出素材包</button>
      </div>
    </div>
    <div className="workbench-preview" aria-label="实时预览">
      <div className="workbench-preview-scroll"><PreviewViewport settings={previewSettings} onChange={setPreviewSettings} busy={busy}><Preview draft={draft} busy={busy} editing={editing} onEdit={edit}
        onRemove={id => { if (editing && !busy) remove(id); }} onReorder={(from, to) => { if (editing && !busy) reorder(from, to); }}
        onAddImages={addImages} onCaptionChange={caption => change({ caption })}/></PreviewViewport></div>
    </div>
  </section>;
}
