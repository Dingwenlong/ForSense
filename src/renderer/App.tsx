import { useEffect, useRef, useState } from 'react';
import type { Draft, MediaAsset, VideoSource } from '../shared/types';
import { useJobs, errorText } from './hooks';
import { Preview } from './Preview';
import { Modal } from './Modal';
import { CropEditor } from './CropEditor';
import { VideoTool } from './VideoTool';

export function App() {
  const [drafts, setDrafts] = useState<Draft[]>([]), [draft, setDraft] = useState<Draft | null>(null), [filter, setFilter] = useState('all'), [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false), [loading, setLoading] = useState(true), [saveStatus, setSaveStatus] = useState('已保存');
  const [notice, setNotice] = useState<{ text: string; error?: boolean; retry?: () => void } | null>(null);
  const [cropAsset, setCropAsset] = useState<MediaAsset | null>(null), [videoOpen, setVideoOpen] = useState(false), [videoSource, setVideoSource] = useState<VideoSource | null>(null);
  const [exportOpen, setExportOpen] = useState(false), [exportDirectory, setExportDirectory] = useState(''), [exportFormat, setExportFormat] = useState<'folder' | 'zip'>('folder'), [targets, setTargets] = useState<('apple' | 'android')[]>(['apple', 'android']);
  const [exportResult, setExportResult] = useState<string | null>(null), [about, setAbout] = useState(false), [deleteConfirm, setDeleteConfirm] = useState(false), [dragging, setDragging] = useState(false);
  const [info, setInfo] = useState<{ version: string; dataDirectory: string; compatibility: string } | null>(null);
  const draftRef = useRef<Draft | null>(null), timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined), revision = useRef(0), dirty = useRef(false), saveQueue = useRef<Promise<unknown>>(Promise.resolve()), dragged = useRef<number | null>(null);
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
      if (result.drafts.length) { setDrafts(result.drafts); show(result.drafts[0]); }
      else { const first = await window.desktop.createDraft('moments'); if (active) { setDrafts([first]); show(first); } }
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
  const select = (item: Draft) => { void perform(async () => { await flush(); show(item); }); };
  const newDraft = () => { void perform(async () => { await flush(); const next = await window.desktop.createDraft(filter === 'douyin' ? 'douyin' : 'moments'); updateList(next); show(next); setQuery(''); }); };
  const addItems = (items: MediaAsset[]) => { const current = draftRef.current; if (current) { if (current.items.length + items.length > 200) throw new Error('每份草稿最多整理 200 个素材，请新建草稿继续添加'); change({ items: [...current.items, ...items] }); } };
  const importFiles = (paths?: string[]) => { void perform(async () => { const selected = paths || await window.desktop.pickImages(); if (!selected.length) return; if ((draftRef.current?.items.length || 0) + selected.length > 200) throw new Error('每份草稿最多整理 200 个素材，请分成多份草稿'); const items = await run<MediaAsset[]>('images', selected); addItems(items); setNotice({ text: `已加入 ${items.length} 张图片` }); }); };
  function reorder(from: number, to: number) { if (!draft || from === to || from < 0 || to < 0 || to >= draft.items.length) return; const items = [...draft.items]; const [item] = items.splice(from, 1); items.splice(to, 0, item); change({ items }); }
  const doExport = () => { void perform(async () => {
    await flush(); if (!draftRef.current || !exportDirectory) return;
    const result = await run<{ path: string }>('export', { draftId: draftRef.current.id, directory: exportDirectory, format: exportFormat, targets }); setExportResult(result.path);
  }); };
  const filtered = drafts.filter(d => (filter === 'all' || d.platform === filter) && `${d.title} ${d.caption}`.toLowerCase().includes(query.toLowerCase()));
  const hasLive = draft?.items.some(item => item.kind === 'live');
  return <div className="app-shell">
    <aside className="sidebar">
      <h1>片语</h1>
      <button onClick={newDraft} disabled={working || loading}>新建图文</button>
      <fieldset className="platform-nav">
        <legend>草稿分类</legend>
        {([['all', '全部草稿'], ['moments', '朋友圈'], ['douyin', '抖音图文']] as const).map(([value, label]) =>
          <button key={value} aria-pressed={filter === value} onClick={() => setFilter(value)}>
            {label}（{drafts.filter(d => value === 'all' || d.platform === value).length}）
          </button>
        )}
      </fieldset>
      <div className="draft-section">
        <label className="field-label">搜索草稿
          <input aria-label="搜索草稿" placeholder="标题或文案" value={query} onChange={e => setQuery(e.target.value)}/>
        </label>
        {query && <button onClick={() => setQuery('')}>清空搜索</button>}
        <p>草稿列表（{filtered.length}）</p>
        <div className="draft-list">
          {filtered.map(item => <button key={item.id} className="draft-card" aria-pressed={draft?.id === item.id} onClick={() => select(item)} disabled={working}>
            {item.items[0] && <img className="draft-thumb" src={item.items[0].imageUrl} alt=""/>}
            <span><strong>{item.title || '未命名草稿'}</strong><br/>
              {item.platform === 'moments' ? '朋友圈' : '抖音'} · {item.items.length} 张素材<br/>
              {new Date(item.updatedAt).toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' })}
            </span>
          </button>)}
          {!filtered.length && <p>{query ? '没有匹配的草稿' : '没有草稿'}</p>}
        </div>
      </div>
      <div className="sidebar-bottom"><p>本地保存</p><button onClick={() => setAbout(true)}>使用与存储</button></div>
    </aside>
    <main className="main-workspace">
      <header className="workspace-header">
        <span>{draft?.platform === 'douyin' ? '抖音图文' : '朋友圈图文'}</span>
        <span role="status">{saveStatus}</span>
      </header>
      {draft ? <div className="editor-preview-layout">
        <section className="editor">
          <h2>编辑草稿</h2>
          <label className="field-label">草稿标题
            <input aria-label="草稿标题" value={draft.title} disabled={working} maxLength={120}
              onChange={e => change({ title: e.target.value })}
              onBlur={() => { if (!draftRef.current?.title.trim()) change({ title: '未命名草稿' }); }}/>
          </label>
          <div className="controls">
            <button disabled={working} onClick={() => void perform(async () => { await flush(); const next = await window.desktop.duplicateDraft(draft.id); updateList(next); show(next); })}>复制草稿</button>
            <button disabled={working} onClick={() => setDeleteConfirm(true)}>删除草稿</button>
          </div>
          <fieldset className="platform-choice">
            <legend>发布平台</legend>
            <div className="controls">
              <button aria-pressed={draft.platform === 'moments'} disabled={working} onClick={() => change({ platform: 'moments' })}>朋友圈</button>
              <button aria-pressed={draft.platform === 'douyin'} disabled={working} onClick={() => change({ platform: 'douyin' })}>抖音图文</button>
            </div>
          </fieldset>
          <section>
            <h2>图片素材（{draft.items.length}）</h2>
            <div className="controls">
              <button disabled={working} onClick={() => setVideoOpen(true)}>从视频取材</button>
              <button disabled={working} onClick={() => importFiles()}>添加图片</button>
            </div>
            <div className="asset-dropzone" data-drag-over={dragging}
              onDragOver={e => { e.preventDefault(); if (e.dataTransfer.types.includes('Files') && !working) setDragging(true); }}
              onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false); }}
              onDrop={e => {
                e.preventDefault(); setDragging(false);
                if (working || !e.dataTransfer.files.length) return;
                const paths = window.desktop.pathsForFiles(Array.from(e.dataTransfer.files));
                if (paths.some(p => /\.(mov|mp4)$/i.test(p))) { setNotice({ text: '视频请通过“从视频取材”打开', error: true }); return; }
                importFiles(paths);
              }}>
              {draft.items.length ? <div className="asset-grid">
                {draft.items.map((asset, index) => <article className="asset-card" key={asset.id} draggable={!working}
                  onDragStart={() => dragged.current = index} onDragOver={e => e.preventDefault()}
                  onDrop={e => { if (dragged.current !== null) { e.stopPropagation(); e.preventDefault(); reorder(dragged.current, index); dragged.current = null; } }}
                  onDragEnd={() => dragged.current = null}>
                  <img src={asset.imageUrl} alt={asset.name}/>
                  <div>第 {index + 1} 张 · {asset.width} × {asset.height} {asset.kind === 'live' && <span className="asset-live">实况</span>}</div>
                  <div className="controls">
                    <button aria-label={'前移第 ' + (index + 1) + ' 张'} disabled={working || index === 0} onClick={() => reorder(index, index - 1)}>前移</button>
                    <button aria-label={'后移第 ' + (index + 1) + ' 张'} disabled={working || index === draft.items.length - 1} onClick={() => reorder(index, index + 1)}>后移</button>
                    <button aria-label={'编辑第 ' + (index + 1) + ' 张图片'} disabled={working} onClick={() => setCropAsset(asset)}>裁切 / 旋转</button>
                    <button aria-label={'移除第 ' + (index + 1) + ' 张图片'} disabled={working} onClick={() => change({ items: draft.items.filter(i => i.id !== asset.id) })}>移除</button>
                  </div>
                </article>)}
                <button className="add-more" onClick={() => importFiles()} disabled={working}>继续添加</button>
              </div> : <button className="empty-dropzone" disabled={working} onClick={() => importFiles()}>点击选择或拖入图片（JPG / PNG / WebP）</button>}
            </div>
            <p>可拖动或使用前移、后移按钮调整顺序。裁切与旋转保留原图。</p>
          </section>
          <section>
            <h2>发布文案</h2>
            <textarea className="caption-input" aria-label="发布文案" placeholder="输入发布文案" rows={7}
              value={draft.caption} disabled={working} maxLength={100000} onChange={e => change({ caption: e.target.value })}/>
            <div className="controls">
              <span>{Array.from(draft.caption).length.toLocaleString()} 字</span>
              <button disabled={!draft.caption} onClick={() => void perform(async () => { await window.desktop.copyText(draft.caption); setNotice({ text: '文案已复制，可粘贴到发布页面' }); })}>复制文案</button>
            </div>
            <p>文案与图片独立保存。</p>
          </section>
        </section>
        <aside className="preview-panel">
          <h2>图文排版预览</h2>
          <div className="preview-scroll"><Preview draft={draft}/></div>
          <div className="export-bar">
            <p>{draft.items.length} 个素材 · {Array.from(draft.caption).length} 字</p>
            <button disabled={working || (!draft.items.length && !draft.caption.trim())} onClick={() => { setExportOpen(true); setExportResult(null); }}>导出素材包</button>
          </div>
        </aside>
      </div> : <div className="workspace-empty">
        {loading ? <p role="status">正在加载草稿…</p> : <><p>没有打开的草稿。</p><button onClick={newDraft}>新建图文</button></>}
      </div>}
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
    {cropAsset && <CropEditor asset={cropAsset} busy={working} close={() => setCropAsset(null)} save={edits => void perform(async () => {
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
          const remaining = drafts.filter(d => d.id !== draft.id); setDrafts(remaining); show(remaining[0] || null); setDeleteConfirm(false);
        })}>删除草稿</button>
      </footer>
    </Modal>}
  </div>;
}
