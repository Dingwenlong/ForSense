import { useEffect, useRef, useState } from 'react';
import type { Draft, MediaAsset, VideoSource } from '../shared/types';
import { useJobs, errorText } from './hooks';
import { Modal } from './Modal';
import { CropEditor } from './CropEditor';
import { VideoTool } from './VideoTool';
import { LibraryPage } from './pages';
import { WorkbenchPage } from './WorkbenchPage';

export function App() {
  const [drafts, setDrafts] = useState<Draft[]>([]), [draft, setDraft] = useState<Draft | null>(null), [page, setPage] = useState<'library' | 'workbench'>('library'), [filter, setFilter] = useState<'all' | 'moments' | 'douyin'>('all'), [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false), [loading, setLoading] = useState(true), [saveStatus, setSaveStatus] = useState('已保存');
  const [notice, setNotice] = useState<{ text: string; error?: boolean; retry?: () => void } | null>(null);
  const [cropAsset, setCropAsset] = useState<MediaAsset | null>(null), [videoOpen, setVideoOpen] = useState(false), [videoSource, setVideoSource] = useState<VideoSource | null>(null);
  const [exportOpen, setExportOpen] = useState(false), [exportDirectory, setExportDirectory] = useState(''), [exportFormat, setExportFormat] = useState<'folder' | 'zip'>('folder'), [targets, setTargets] = useState<('apple' | 'android')[]>(['apple', 'android']);
  const [exportResult, setExportResult] = useState<string | null>(null), [about, setAbout] = useState(false), [deleteConfirm, setDeleteConfirm] = useState(false);
  const [info, setInfo] = useState<{ version: string; dataDirectory: string; compatibility: string } | null>(null);
  const draftRef = useRef<Draft | null>(null), timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined), revision = useRef(0), dirty = useRef(false), saveQueue = useRef<Promise<unknown>>(Promise.resolve());
  const { run, job, processing, cancel } = useJobs();
  const working = busy || processing;

  const show = (d: Draft | null) => { draftRef.current = d; setDraft(d); dirty.current = false; revision.current++; setSaveStatus('已保存'); };
  function updateList(d: Draft) { setDrafts(previous => [d, ...previous.filter(item => item.id !== d.id)].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))); }
  function change(patch: Partial<Draft>) {
    const current = draftRef.current; if (!current) return;
    const next = { ...current, ...patch, updatedAt: new Date().toISOString() };
    draftRef.current = next; setDraft(next); updateList(next); dirty.current = true; revision.current++; setSaveStatus('尚未保存');
    clearTimeout(timer.current); timer.current = setTimeout(() => { void flush().catch(error => setNotice({ text: errorText(error), error: true, retry: () => void flush().catch(error => setNotice({ text: errorText(error), error: true })) })); }, 600);
  }
  async function flush() {
    clearTimeout(timer.current);
    if (!draftRef.current || !dirty.current) { await saveQueue.current; return; }
    const snapshot = { ...draftRef.current, title: draftRef.current.title.trim() || '未命名草稿' }, savedRevision = revision.current;
    setSaveStatus('保存中…');
    const next = saveQueue.current.catch(() => {}).then(() => window.desktop.saveDraft(snapshot));
    saveQueue.current = next;
    try { await next; if (savedRevision === revision.current) { dirty.current = false; setSaveStatus('已保存'); } }
    catch (error) { setSaveStatus('保存失败'); throw error; }
  }
  const flushRef = useRef(flush); flushRef.current = flush;
  useEffect(() => {
    let active = true;
    window.desktop.listDrafts().then(async result => {
      if (!active) return;
      if (result.warnings.length) setNotice({ text: result.warnings.join('；'), error: true });
      setDrafts(result.drafts);
    }).catch(error => setNotice({ text: errorText(error), error: true })).finally(() => setLoading(false));
    void window.desktop.getInfo().then(setInfo);
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
  const select = (item: Draft) => { void perform(async () => { await flush(); show(item); setPage('workbench'); }); };
  const newDraft = (platform: Draft['platform']) => { void perform(async () => { await flush(); const next = await window.desktop.createDraft(platform); updateList(next); show(next); setQuery(''); setPage('workbench'); }); };
  const backToLibrary = () => { if (working) return; void perform(async () => { await flush(); setPage('library'); }); };
  const addItems = (items: MediaAsset[]) => { const current = draftRef.current; if (current) { if (current.items.length + items.length > 200) throw new Error('每份草稿最多整理 200 个素材，请新建草稿继续添加'); change({ items: [...current.items, ...items] }); } };
  const importFiles = (paths?: string[]) => { void perform(async () => { const selected = paths || await window.desktop.pickImages(); if (!selected.length) return; if ((draftRef.current?.items.length || 0) + selected.length > 200) throw new Error('每份草稿最多整理 200 个素材，请分成多份草稿'); const items = await run<MediaAsset[]>('images', selected); addItems(items); setNotice({ text: `已加入 ${items.length} 张图片` }); }); };
  function reorder(from: number, to: number) { if (!draft || from === to || from < 0 || to < 0 || to >= draft.items.length) return; const items = [...draft.items]; const [item] = items.splice(from, 1); items.splice(to, 0, item); change({ items }); }
  const doExport = () => { void perform(async () => {
    await flush(); if (!draftRef.current || !exportDirectory) return;
    const result = await run<{ path: string }>('export', { draftId: draftRef.current.id, directory: exportDirectory, format: exportFormat, targets }); setExportResult(result.path);
  }); };
  const hasLive = draft?.items.some(item => item.kind === 'live');
  return <div className="app-shell">
    <header className="app-header">
      <strong>片语</strong>
      {page === 'workbench' && <button disabled={working} onClick={backToLibrary}>返回草稿列表</button>}
      <span>{page === 'library' ? '草稿列表' : (draft?.title || '未命名草稿')}</span>
      <span role="status">{page === 'library' ? '本地保存' : saveStatus}</span>
      <button onClick={() => setAbout(true)}>使用与存储</button>
    </header>
    <main className="page-body">
      {loading ? <p role="status">正在加载草稿…</p> : page === 'library' || !draft ?
        <LibraryPage drafts={drafts} filter={filter} query={query} busy={working} setFilter={setFilter} setQuery={setQuery} create={newDraft} open={select}/> :
        <WorkbenchPage draft={draft} busy={working} change={change} importFiles={importFiles}
          openVideo={() => setVideoOpen(true)} reorder={reorder} edit={setCropAsset}
          rejectVideoDrop={() => setNotice({ text: '视频请通过“从视频取材”打开', error: true })}
          duplicate={() => void perform(async () => { await flush(); const next = await window.desktop.duplicateDraft(draft.id); updateList(next); show(next); })}
          remove={() => setDeleteConfirm(true)}
          copy={() => void perform(async () => { await window.desktop.copyText(draft.caption); setNotice({ text: '文案已复制，可粘贴到发布页面' }); })}
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
    {cropAsset && <CropEditor asset={cropAsset} busy={working} close={() => setCropAsset(null)} remove={() => {
      const current = draftRef.current; if (current) change({ items: current.items.filter(item => item.id !== cropAsset.id) });
      setCropAsset(null);
    }} save={edits => void perform(async () => {
      const item = await run<MediaAsset>('edit', { id: cropAsset.id, edits });
      const current = draftRef.current; if (current) change({ items: current.items.map(i => i.id === cropAsset.id ? item : i) });
      setCropAsset(null);
    })}/>}
    {videoOpen && <VideoTool source={videoSource} setSource={setVideoSource} busy={working} run={run}
      perform={action => void perform(action)} add={asset => { addItems([asset]); setNotice({ text: '素材已加入当前草稿' }); }} close={() => setVideoOpen(false)}/>}
    {exportOpen && <Modal title={exportResult ? '导出完成' : '导出发布素材包'} onClose={() => setExportOpen(false)} busy={working}>
      {exportResult ? <div className="export-success">
        <h3>素材包已保存</h3><p>图片按顺序编号，文案单独保存。</p>
        <p className="destination-path">{exportResult}</p>
        <button onClick={() => void perform(() => window.desktop.reveal(exportResult))}>打开文件位置</button>
        {hasLive && <p>实况手机兼容性待验证，请先阅读包内的导入说明。</p>}
      </div> : <>
        <p>{draft?.title || '未命名草稿'} · {draft?.items.length} 个素材</p>
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
    {about && <Modal title="片语 · 使用与存储" onClose={() => setAbout(false)}>
      <ol><li>添加图片，或从视频中截取画面与实况。</li><li>调整顺序与画面，编辑发布文案。</li><li>在右侧检查效果，导出文件夹或 ZIP。</li></ol>
      <h3>本地资料库</h3>
      <p>草稿自动保存，导入素材复制到资料库。删除草稿不会删除原始文件。请在应用关闭时备份整个资料库。</p>
      <p className="destination-path">{info?.dataDirectory || '正在读取…'}</p>
      <p>iPhone 与标准安卓实况的文件结构经过程序校验，真机兼容性仍待验证。</p>
      <button onClick={() => void perform(() => window.desktop.openHelp())}>完整使用说明</button>
      <p>版本 {info?.version || '正在读取…'} · 本地桌面应用</p>
    </Modal>}
    {deleteConfirm && <Modal title="删除这份草稿？" onClose={() => setDeleteConfirm(false)} busy={working}>
      <p>将删除「{draft?.title}」的文案与素材排列，导入的原始文件不会被删除。</p>
      <footer className="modal-footer">
        <button onClick={() => setDeleteConfirm(false)} disabled={working}>保留草稿</button>
        <button disabled={working} onClick={() => void perform(async () => {
          await flush(); if (!draft) return;
          await window.desktop.deleteDraft(draft.id);
          const remaining = drafts.filter(d => d.id !== draft.id); setDrafts(remaining); show(null); setPage('library'); setDeleteConfirm(false);
        })}>删除草稿</button>
      </footer>
    </Modal>}
  </div>;
}
