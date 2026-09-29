import { useEffect, useRef, useState } from 'react';
import type { Draft, MediaAsset, VideoSource, LibraryItemRef } from '../shared/types';
import { MAX_DRAFTS } from '../shared/types';
import { draftName } from '../shared/draft-name';
import { DEFAULT_PREVIEW, PREVIEW_STORAGE_KEY, normalizePreviewSettings } from '../shared/preview-settings';
import { useJobs, errorText } from './hooks';
import { WindowTitleBar } from './WindowTitleBar';
import { Modal } from './Modal';
import { CropEditor } from './CropEditor';
import { VideoTool } from './VideoTool';
import { LibraryPage } from './pages';
import { WorkbenchPage } from './WorkbenchPage';
import { BackButton } from './BackButton';
import { AssetBrowser } from './AssetBrowser';
import { OptimizationPage, emptyOptimizationSession, type OptimizationSession } from './OptimizationPage';

type Page = 'library' | 'workbench' | 'assets' | 'optimization';

export function App() {
  const [drafts, setDrafts] = useState<Draft[]>([]), [draft, setDraft] = useState<Draft | null>(null), [pageStack, setPageStack] = useState<Page[]>(['library']), [filter, setFilter] = useState<'all' | 'moments' | 'douyin'>('all'), [query, setQuery] = useState('');
  const page = pageStack[pageStack.length - 1];
  const [previewSettings, setPreviewSettings] = useState(() => {
    try { return normalizePreviewSettings(JSON.parse(localStorage.getItem(PREVIEW_STORAGE_KEY) || 'null')); }
    catch { return { ...DEFAULT_PREVIEW }; }
  });
  useEffect(() => { try { localStorage.setItem(PREVIEW_STORAGE_KEY, JSON.stringify(previewSettings)); } catch { /* Keep the current preview usable when preference storage is unavailable. */ } }, [previewSettings]);
  const [libraryRevision, setLibraryRevision] = useState(0), [assetPicker, setAssetPicker] = useState<'draft' | 'ai' | null>(null);
  const [assetDirectory, setAssetDirectory] = useState(''), [directoryError, setDirectoryError] = useState('');
  const [optimization, setOptimization] = useState<OptimizationSession>(emptyOptimizationSession);
  const [busy, setBusy] = useState(false), [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<{ text: string; error?: boolean; retry?: () => void } | null>(null);
  const [cropAsset, setCropAsset] = useState<MediaAsset | null>(null), [videoOpen, setVideoOpen] = useState(false), [videoSource, setVideoSource] = useState<VideoSource | null>(null);
  const [exportOpen, setExportOpen] = useState(false), [exportDirectory, setExportDirectory] = useState(''), [exportFormat, setExportFormat] = useState<'folder' | 'zip'>('folder'), [targets, setTargets] = useState<('apple' | 'android')[]>(['apple', 'android']);
  const [exportResult, setExportResult] = useState<string | null>(null), [deleteTarget, setDeleteTarget] = useState<Draft | null>(null);
  const [deleteItems, setDeleteItems] = useState<LibraryItemRef[] | null>(null);
  const draftRef = useRef<Draft | null>(null), timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined), revision = useRef(0), dirty = useRef(false), saveQueue = useRef<Promise<unknown>>(Promise.resolve());
  const pageBody = useRef<HTMLElement>(null);
  useEffect(() => { pageBody.current?.scrollTo(0, 0); }, [page]);
  const { run, job, processing, cancel } = useJobs();
  const working = busy || processing;
  useEffect(() => { if (job?.status === 'done') setLibraryRevision(n => n + 1); }, [job?.id, job?.status]);

  const show = (d: Draft | null) => { draftRef.current = d; setDraft(d); dirty.current = false; revision.current++; };
  function updateList(d: Draft) { setDrafts(previous => [d, ...previous.filter(item => item.id !== d.id)].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))); }
  function change(patch: Partial<Draft>) {
    const current = draftRef.current; if (!current) return;
    const next = { ...current, ...patch, updatedAt: new Date().toISOString() };
    draftRef.current = next; setDraft(next); updateList(next); dirty.current = true; revision.current++;
    clearTimeout(timer.current); timer.current = setTimeout(() => { void flush().catch(error => setNotice({ text: errorText(error), error: true, retry: () => void flush().catch(error => setNotice({ text: errorText(error), error: true })) })); }, 600);
  }
  async function flush() {
    clearTimeout(timer.current);
    if (!draftRef.current || !dirty.current) { await saveQueue.current; return; }
    const snapshot = { ...draftRef.current }, savedRevision = revision.current;
    const next = saveQueue.current.catch(() => {}).then(() => window.desktop.saveDraft(snapshot));
    saveQueue.current = next;
    await next; if (savedRevision === revision.current) dirty.current = false;
  }
  const flushRef = useRef(flush); flushRef.current = flush;
  useEffect(() => {
    let active = true;
    void window.desktop.getInfo().then(info => { if (active) setAssetDirectory(info.assetDirectory); }).catch(error => { if (active) setDirectoryError(errorText(error)); });
    window.desktop.listDrafts().then(async result => {
      if (!active) return;
      if (result.warnings.length) setNotice({ text: result.warnings.join('；'), error: true });
      setDrafts(result.drafts);
    }).catch(error => setNotice({ text: errorText(error), error: true })).finally(() => setLoading(false));
    const off = window.desktop.onClose(() => { void flushRef.current().then(() => window.desktop.closeReady()).catch(error => setNotice({ text: '草稿未保存，已保留窗口：' + errorText(error), error: true })); });
    return () => { active = false; off(); clearTimeout(timer.current); };
  }, []);
  useEffect(() => { if (!notice || notice.error) return; const id = setTimeout(() => setNotice(null), 6000); return () => clearTimeout(id); }, [notice]);
  async function perform(action: () => Promise<void>) {
    setBusy(true); setNotice(null);
    try { await action(); }
    catch (error) { const text = errorText(error); if (!text.includes('取消')) setNotice({ text, error: true, retry: () => void perform(action) }); }
    finally { setBusy(false); }
  }
  function openPage(next: Page) {
    setPageStack(previous => {
      const index = previous.indexOf(next);
      return index < 0 ? [...previous, next] : previous.slice(0, index + 1);
    });
  }
  const select = (item: Draft) => { void perform(async () => { await flush(); const current = (await window.desktop.listDrafts()).drafts.find(d => d.id === item.id); show(current || item); openPage('workbench'); }); };
  const newDraft = () => { void perform(async () => { await flush(); const next = await window.desktop.createDraft('moments'); updateList(next); show(next); setQuery(''); setFilter('all'); openPage('workbench'); }); };
  const goBack = () => {
    if (working || pageStack.length <= 1) return;
    void perform(async () => { await flush(); setPageStack(previous => previous.length > 1 ? previous.slice(0, -1) : previous); });
  };
  const addItems = (items: MediaAsset[]) => { const current = draftRef.current; if (current) {
    const unique = new Map(current.items.map(item => [item.id, item])); for (const item of items) unique.set(item.id, item);
    if (unique.size > 200) throw new Error('每份草稿最多整理 200 个素材，请新建草稿继续添加'); change({ items: [...unique.values()] });
  } };
  const importFiles = (paths?: string[]) => { void perform(async () => { const selected = paths || await window.desktop.pickImages(); if (!selected.length) return; if ((draftRef.current?.items.length || 0) + selected.length > 200) throw new Error('每份草稿最多整理 200 个素材，请分成多份草稿'); const items = await run<MediaAsset[]>('images', selected); addItems(items); setNotice({ text: `已加入 ${items.length} 张图片` }); }); };
  function reorder(from: number, to: number) { if (!draft || from === to || from < 0 || to < 0 || to >= draft.items.length) return; const items = [...draft.items]; const [item] = items.splice(from, 1); items.splice(to, 0, item); change({ items }); }
  const doExport = () => { void perform(async () => {
    await flush(); if (!draftRef.current || !exportDirectory) return;
    const result = await run<{ path: string }>('export', { draftId: draftRef.current.id, directory: exportDirectory, format: exportFormat, targets }); setExportResult(result.path);
  }); };
  const hasLive = draft?.items.some(item => item.kind === 'live');
  const navigate = (next: Page) => void perform(async () => { await flush(); openPage(next); });
  const copyImage = (id: string) => void perform(async () => { await window.desktop.copyImage(id); setNotice({ text: '图片已复制，请先粘贴到外部工具，再复制提示词' }); });
  const copyPrompt = (prompt: string) => void perform(async () => { await window.desktop.copyText(prompt); setNotice({ text: '提示词已复制' }); });
  const openOptimization = (asset: MediaAsset) => void perform(async () => {
    await flush();
    if (asset.optimization) {
      const original = await window.desktop.getAsset(asset.optimization.sourceId);
      setOptimization({ source: original, result: asset, templateId: asset.optimization.templateId, prompt: asset.optimization.prompt, step: 3 });
    } else setOptimization(previous => ({ ...previous, source: asset, result: null, step: 2 }));
    setAssetPicker(null); openPage('optimization');
  });
  const importToLibrary = () => void perform(async () => {
    const paths = await window.desktop.pickMaterials(); if (!paths.length) return;
    const result = await run<{ images: number; videos: number }>('materials', paths);
    setNotice({ text: `已导入 ${result.images} 张图片、${result.videos} 个视频副本` });
  });
  const importOptimizationSource = () => void perform(async () => {
    const paths = await window.desktop.pickImages(); if (!paths.length) return;
    if (paths.length !== 1) throw new Error('请一次选择一张原图');
    const [source] = await run<MediaAsset[]>('images', paths);
    setOptimization(previous => ({ ...previous, source, result: null, step: 2 })); setAssetPicker(null);
  });
  const openLibraryVideo = (id: string) => void perform(async () => {
    await flush(); setVideoSource(await window.desktop.getVideo(id)); setVideoOpen(true); setAssetPicker(null);
  });
  const selectLibraryItems = (items: MediaAsset[]) => void perform(async () => { addItems(items); setAssetPicker(null); openPage('workbench'); setNotice({ text: '素材已加入当前草稿' }); });
  const createFromLibrary = (items: MediaAsset[]) => void perform(async () => {
    if (!items.length) return;
    if (items.length > 200) throw new Error('每份草稿最多整理 200 个素材，请减少选择');
    await flush();
    const next = await window.desktop.createDraft('moments', items.map(item => item.id));
    updateList(next); show(next); setQuery(''); setFilter('all'); openPage('workbench');
    setNotice({ text: `已创建新草稿，加入 ${items.length} 个素材` });
  });
  const renderAssets = (mode: 'manage' | 'pick' | 'ai') => <AssetBrowser busy={working} refreshKey={libraryRevision} mode={mode}
    excludeIds={mode === 'pick' ? draft?.items.map(item => item.id) : []}
    canCreateDraft={drafts.length < MAX_DRAFTS}
    onImport={mode === 'ai' ? importOptimizationSource : mode === 'pick' ? () => void perform(async () => {
      const paths = await window.desktop.pickImages(); if (!paths.length) return;
      const items = await run<MediaAsset[]>('images', paths); addItems(items); setAssetPicker(null);
    }) : importToLibrary}
    onUse={mode === 'ai' ? items => { setOptimization(previous => ({ ...previous, source: items[0], result: null, step: 2 })); setAssetPicker(null); } : mode === 'manage' ? createFromLibrary : draft ? selectLibraryItems : undefined}
    onDelete={mode === 'manage' ? setDeleteItems : undefined}
    onOptimize={mode === 'manage' ? openOptimization : undefined} onVideo={openLibraryVideo} perform={action => void perform(action)}/>;
  return <div className="app-shell">
    <WindowTitleBar onError={text => setNotice({ text, error: true })}>
      <strong>片语</strong>
      <div className="window-drag-region" aria-hidden="true"/>
      {page !== 'assets' && <nav className="controls" aria-label="工作区导航">
        <button aria-pressed={page === 'optimization'} disabled={working} onClick={() => navigate('assets')}>素材库</button>
      </nav>}
    </WindowTitleBar>
    <main ref={pageBody} className="page-body">
      {loading ? <p role="status">正在加载草稿…</p> : page === 'assets' ? <section className="page-content" aria-label="素材库">
        <header className="page-heading"><BackButton disabled={working} onClick={goBack}/><h1>素材库</h1></header><p className="destination-path library-storage-path" role={directoryError ? 'alert' : undefined}>图片保存位置：{assetDirectory ? <button className="library-directory-link" disabled={working} aria-label="打开素材所在文件夹" onClick={() => void perform(() => window.desktop.openAssetDirectory())}>{assetDirectory}</button> : directoryError ? `读取失败，${directoryError}` : '正在读取…'}</p>{renderAssets('manage')}
      </section> : page === 'optimization' ? <OptimizationPage back={goBack} session={optimization} setSession={setOptimization} busy={working}
        selectImage={() => setAssetPicker('ai')} importImage={importOptimizationSource} copyImage={copyImage} copyPrompt={copyPrompt}
        canUseResult={!!draft && !!optimization.result && !draft.items.some(i => i.id === optimization.result!.id)}
        useResult={() => { if (optimization.result) selectLibraryItems([optimization.result]); }}
        importResult={() => void perform(async () => {
          if (!optimization.source) return; const paths = await window.desktop.pickImages(); if (!paths.length) return;
          if (paths.length !== 1) throw new Error('请一次选择一张优化结果');
          const result = await run<MediaAsset>('optimization', { path: paths[0], sourceId: optimization.source.id, templateId: optimization.templateId, prompt: optimization.prompt });
          setOptimization(previous => ({ ...previous, result })); setNotice({ text: '优化结果已保存到素材库，原图保留' });
        })}/> : page === 'library' || !draft ?
        <LibraryPage drafts={drafts} filter={filter} query={query} busy={working} setFilter={setFilter} setQuery={setQuery} open={select} remove={setDeleteTarget} create={newDraft}/> :
        <WorkbenchPage back={goBack} key={draft.id} draft={draft} busy={working} canSaveAs={drafts.length < MAX_DRAFTS} change={change} importFiles={importFiles} addImages={() => setAssetPicker('draft')}
          previewSettings={previewSettings} setPreviewSettings={next => setPreviewSettings(normalizePreviewSettings(next))}
          reorder={reorder} edit={setCropAsset} remove={id => { const current = draftRef.current; if (current) change({ items: current.items.filter(item => item.id !== id) }); }}
          rejectVideoDrop={() => setNotice({ text: '请先将视频导入素材库，再从素材详情中取材', error: true })}
          saveAs={() => void perform(async () => {
            await flush(); const current = draftRef.current; if (!current) return;
            const next = await window.desktop.saveDraftAs(current.id);
            updateList(next); show(next); setNotice({ text: '已另存为新草稿，原草稿保留' });
          })}
          exportPackage={() => { setExportOpen(true); setExportResult(null); }}/>
      }
    </main>
    {notice && <div role={notice.error ? 'alert' : 'status'} className="notification">
      <p>{notice.error ? '失败：' : ''}{notice.text}</p>
      {notice.retry && <button disabled={working} onClick={notice.retry}>重试</button>}
      <button onClick={() => setNotice(null)}>关闭提示</button>
    </div>}
    {job && processing && <div className="job-panel" role="status">
      <p>{job.title} · {job.progress}%</p>
      <progress aria-label="任务进度" max="100" value={job.progress}/>
      <p>{job.message}</p><button onClick={() => void cancel()}>取消任务</button>
    </div>}
    {assetPicker && <Modal title={assetPicker === 'ai' ? '选择优化原图' : '添加图片'} onClose={() => setAssetPicker(null)} busy={working} wide>{renderAssets(assetPicker === 'ai' ? 'ai' : 'pick')}</Modal>}
    {cropAsset && <CropEditor asset={cropAsset} busy={working} close={() => setCropAsset(null)} save={edits => void perform(async () => {
      const item = await run<MediaAsset>('edit', { id: cropAsset.id, edits });
      const current = draftRef.current; if (current) change({ items: current.items.map(i => i.id === cropAsset.id ? item : i) });
      setCropAsset(null);
    })}/>}
    {videoOpen && videoSource && <VideoTool source={videoSource} busy={working} run={run}
      perform={action => void perform(action)} add={() => setNotice({ text: '素材已保存到素材库' })} close={() => setVideoOpen(false)}/>}
    {exportOpen && <Modal title={exportResult ? '导出完成' : '导出发布素材包'} onClose={() => setExportOpen(false)} busy={working}>
      {exportResult ? <div className="export-success">
        <h3>素材包已保存</h3><p>图片按顺序编号，文案单独保存。</p>
        <p className="destination-path">{exportResult}</p>
        <button onClick={() => void perform(() => window.desktop.reveal(exportResult))}>打开文件位置</button>
        {hasLive && <p>实况手机兼容性待验证，请先阅读包内的导入说明。</p>}
      </div> : <>
        <p>{draftName(draft?.caption || '')} · {draft?.items.length} 个素材</p>
        <fieldset><legend>保存位置</legend>
          <p className="destination-path">{exportDirectory || '尚未选择文件夹'}</p>
          <button disabled={working} onClick={() => void perform(async () => { const directory = await window.desktop.pickDirectory(); if (directory) setExportDirectory(directory); })}>选择位置</button>
        </fieldset>
        <fieldset><legend>导出方式</legend><div className="controls">
          <button disabled={working} aria-pressed={exportFormat === 'folder'} onClick={() => setExportFormat('folder')}>素材文件夹</button>
          <button disabled={working} aria-pressed={exportFormat === 'zip'} onClick={() => setExportFormat('zip')}>ZIP 压缩包</button>
        </div></fieldset>
        {hasLive && <fieldset><legend>实况目标设备</legend><div className="controls">
          {([['apple', 'iPhone 实况'], ['android', '标准安卓实况']] as const).map(([target, label]) =>
            <label key={target}><input type="checkbox" disabled={working} checked={targets.includes(target)}
              onChange={e => setTargets(e.target.checked ? [...targets, target] : targets.filter(t => t !== target))}/>{label}</label>
          )}
        </div><p>手机相册兼容性待真机验证。iPhone 需用支持配对文件的工具导入；标准安卓格式需兼容的相册。素材包内附具体指引。</p></fieldset>}
        <p>同名文件会自动另存，已有素材不会被覆盖。</p>
        <footer className="modal-footer">
          <button disabled={working} onClick={() => setExportOpen(false)}>取消</button>
          <button disabled={working || !exportDirectory || (!!hasLive && !targets.length)} onClick={doExport}>{working ? '正在导出…' : '开始导出'}</button>
        </footer>
      </>}
    </Modal>}
    {deleteItems && <Modal title="删除所选素材？" onClose={() => setDeleteItems(null)} busy={working}>
      <p>将 {deleteItems.length} 项素材移到系统回收站。仍被草稿或其他素材引用的文件不能删除。</p>
      <footer className="modal-footer"><button disabled={working} onClick={() => void perform(async () => {
        await flush();
        const result = await window.desktop.deleteLibraryItems(deleteItems);
        setOptimization(emptyOptimizationSession); setVideoSource(null);
        setDeleteItems(null); setLibraryRevision(n => n + 1); setNotice({ text: `已将 ${result.count} 项素材移到回收站` });
      })}>移到回收站</button></footer>
    </Modal>}
    {deleteTarget && <Modal title="删除这份草稿？" onClose={() => setDeleteTarget(null)} busy={working}>
      <p>将删除「{draftName(deleteTarget.caption)}」的文案与素材排列，导入的原始文件不会被删除。</p>
      <footer className="modal-footer">
        <button onClick={() => setDeleteTarget(null)} disabled={working}>保留草稿</button>
        <button disabled={working} onClick={() => void perform(async () => {
          await flush();
          await window.desktop.deleteDraft(deleteTarget.id);
          setDrafts(previous => previous.filter(d => d.id !== deleteTarget.id));
          if (draftRef.current?.id === deleteTarget.id) show(null);
          openPage('library'); setDeleteTarget(null);
        })}>删除草稿</button>
      </footer>
    </Modal>}
  </div>;
}
