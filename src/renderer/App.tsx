import { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpRight, Check, CheckCircle2, ChevronRight, Copy, Download, FileText, Film, FolderOpen, GripVertical, ImagePlus, Images, Leaf, LoaderCircle, MessageCircle, MoreHorizontal, Music2, Plus, Radio, Search, Settings2, ShieldCheck, Sparkles, Trash2, X, Crop as CropIcon } from 'lucide-react';
import type { Draft, MediaAsset, Edits, VideoSource } from '../shared/types';
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
    <aside className="sidebar"><div className="brand"><div className="brand-mark"><Leaf size={25} strokeWidth={1.6}/></div><div><strong>片语</strong><span>把日常，整理成分享</span></div></div>
      <button className="primary new-draft" onClick={newDraft} disabled={working || loading}><Plus size={17}/>新建图文<span>＋</span></button>
      <div className="nav-label">我的工作台</div><nav className="platform-nav" aria-label="草稿分类">{[['all', '全部草稿', FileText], ['moments', '朋友圈', MessageCircle], ['douyin', '抖音图文', Music2]].map(([value, label, Icon]) => {
        const I = Icon as typeof FileText; return <button key={value as string} className={filter === value ? 'active' : ''} onClick={() => setFilter(value as string)}><I size={17}/><span>{label as string}</span><small>{drafts.filter(d => value === 'all' || d.platform === value).length}</small></button>;
      })}</nav>
      <div className="draft-section"><div className="nav-label">最近的灵感<span>{filtered.length}</span></div><div className="search"><Search size={15}/><input aria-label="搜索草稿" placeholder="搜索标题或文案" value={query} onChange={e => setQuery(e.target.value)}/>{query && <button className="icon-button small-icon" aria-label="清空搜索" onClick={() => setQuery('')}><X size={12}/></button>}</div>
        <div className="draft-list">{filtered.map(item => <button key={item.id} className={`draft-card ${draft?.id === item.id ? 'selected' : ''}`} onClick={() => select(item)} disabled={working}>
          <div className="draft-thumb">{item.items[0] ? <img src={item.items[0].imageUrl} alt=""/> : <FileText size={21} strokeWidth={1.3}/>}</div><div><strong>{item.title || '未命名草稿'}</strong><span>{item.platform === 'moments' ? '朋友圈' : '抖音'} · {item.items.length} 张素材</span><small>{new Date(item.updatedAt).toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' })}</small></div>
        </button>)}{!filtered.length && <div className="search-empty">{query ? '还没有匹配的草稿' : '这里还没有草稿'}<button className="text-button" onClick={newDraft} disabled={working}>写下新的灵感<ChevronRight size={13}/></button></div>}</div>
      </div><div className="sidebar-bottom"><div className="local-status"><span className="status-dot"/><span>本地保存 · 只属于你</span></div><button className="sidebar-help" onClick={() => setAbout(true)}><Settings2 size={16}/>使用与存储<ArrowUpRight size={14}/></button></div>
    </aside>
    <main className="main-workspace"><header className="workspace-header"><div className="breadcrumb">我的工作台<ChevronRight size={14}/><span>{draft?.platform === 'douyin' ? '抖音图文' : '朋友圈图文'}</span></div><div className={`save-indicator ${saveStatus === '保存失败' ? 'danger-text' : ''}`}>{saveStatus === '保存中…' ? <LoaderCircle className="spin" size={13}/> : <Check size={14}/>}<span>{saveStatus}</span></div></header>
    {draft ? <div className="editor-preview-layout"><section className="editor"><div className="editor-heading"><div className="eyebrow">A LITTLE STORY, READY TO SHARE</div><div className="title-line"><input aria-label="草稿标题" value={draft.title} disabled={working} maxLength={120} onChange={e => change({ title: e.target.value })} onBlur={() => { if (!draftRef.current?.title.trim()) change({ title: '未命名草稿' }); }}/><div className="title-actions"><button className="icon-button" aria-label="复制草稿" title="复制草稿" disabled={working} onClick={() => void perform(async () => { await flush(); const next = await window.desktop.duplicateDraft(draft.id); updateList(next); show(next); })}><Copy size={16}/></button><button className="icon-button" aria-label="删除草稿" title="删除草稿" disabled={working} onClick={() => setDeleteConfirm(true)}><Trash2 size={16}/></button></div></div><p>选好照片，写下想说的话。剩下的交给预览。</p></div>
      <div className="platform-choice"><span>发布到</span><div className="segmented"><button className={draft.platform === 'moments' ? 'active' : ''} disabled={working} onClick={() => change({ platform: 'moments' })}><MessageCircle size={15}/>朋友圈</button><button className={draft.platform === 'douyin' ? 'active' : ''} disabled={working} onClick={() => change({ platform: 'douyin' })}><Music2 size={15}/>抖音图文</button></div></div>
      <section className="asset-section"><div className="section-title"><div><span className="section-number">01</span><h2>整理画面</h2><span className="count-tag">{draft.items.length}</span></div><div className="button-row"><button className="text-button video-entry" disabled={working} onClick={() => setVideoOpen(true)}><Film size={15}/>从视频取材</button><button className="secondary compact" disabled={working} onClick={() => importFiles()}><Plus size={15}/>添加图片</button></div></div>
        <div className={`asset-dropzone ${dragging ? 'drag-over' : ''}`} onDragOver={e => { e.preventDefault(); if (e.dataTransfer.types.includes('Files') && !working) setDragging(true); }} onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false); }} onDrop={e => { e.preventDefault(); setDragging(false); if (working || !e.dataTransfer.files.length) return; const paths = window.desktop.pathsForFiles(Array.from(e.dataTransfer.files)); if (paths.some(p => /\.(mov|mp4)$/i.test(p))) { setNotice({ text: '视频请通过“从视频取材”打开', error: true }); return; } importFiles(paths); }}>
        {draft.items.length ? <div className="asset-grid">{draft.items.map((asset, index) => <article className="asset-card" key={asset.id} draggable={!working} onDragStart={() => dragged.current = index} onDragOver={e => e.preventDefault()} onDrop={e => { if (dragged.current !== null) { e.stopPropagation(); e.preventDefault(); reorder(dragged.current, index); dragged.current = null; } }} onDragEnd={() => dragged.current = null}>
          <div className="asset-picture"><img src={asset.imageUrl} alt={asset.name}/><span className="asset-order">{String(index + 1).padStart(2, '0')}</span>{asset.kind === 'live' && <span className="asset-live"><Radio size={11}/>LIVE</span>}<button className="remove-asset" aria-label={`移除第 ${index + 1} 张图片`} disabled={working} onClick={() => change({ items: draft.items.filter(i => i.id !== asset.id) })}><X size={13}/></button></div>
          <div className="asset-toolbar"><GripVertical size={13} className="drag-grip"/><span>{asset.width} × {asset.height}</span><button title="向前移动" aria-label={`前移第 ${index + 1} 张`} disabled={working || index === 0} onClick={() => reorder(index, index - 1)}><ArrowUp size={13}/></button><button title="向后移动" aria-label={`后移第 ${index + 1} 张`} disabled={working || index === draft.items.length - 1} onClick={() => reorder(index, index + 1)}><ArrowDown size={13}/></button><button aria-label={`编辑第 ${index + 1} 张图片`} title="裁切与旋转" disabled={working} onClick={() => setCropAsset(asset)}><CropIcon size={14}/></button></div>
        </article>)}<button className="add-tile" onClick={() => importFiles()} disabled={working}><Plus size={23}/><span>继续添加</span></button></div>
          : <button className="empty-dropzone" disabled={working} onClick={() => importFiles()}><div className="empty-image-stack"><div/><Images size={33} strokeWidth={1.3}/></div><strong>把照片放进来，故事就开始了</strong><span>拖放图片到这里，或点击选择文件</span><small>JPG · PNG · WebP</small></button>}
        </div><div className="section-hint"><GripVertical size={13}/><span>拖动调整顺序，裁切与旋转会保留原图。</span></div>
      </section>
      <section className="caption-section"><div className="section-title"><div><span className="section-number">02</span><h2>写下片语</h2></div><button className="text-button" disabled={!draft.caption} onClick={() => void perform(async () => { await window.desktop.copyText(draft.caption); setNotice({ text: '文案已复制，可粘贴到发布页面' }); })}><Copy size={14}/>复制文案</button></div><div className="caption-box"><textarea aria-label="发布文案" placeholder={'这一刻，有什么想说的？\n\n记录心情、分享故事，也可以加上你喜欢的话题。'} value={draft.caption} disabled={working} maxLength={100000} onChange={e => change({ caption: e.target.value })}/><footer><span>文案与图片独立保存</span><span>{Array.from(draft.caption).length.toLocaleString()} 字</span></footer></div></section>
      <div className="editor-bottom"><ShieldCheck size={15}/><span>素材在这台电脑上处理，安心创作。</span></div>
    </section><aside className="preview-panel"><div className="preview-heading"><div><span className="section-number">03</span><h2>图文排版预览</h2></div><span className="preview-live-dot">实时预览</span></div><div className="preview-scroll"><Preview draft={draft}/></div><div className="export-bar"><div><strong>{draft.items.length} 个素材<span> · </span>{Array.from(draft.caption).length} 字</strong><small>按预览顺序，打包好每一次分享</small></div><button className="primary full-width export-button" disabled={working || (!draft.items.length && !draft.caption.trim())} onClick={() => { setExportOpen(true); setExportResult(null); }}><Download size={17}/>导出素材包<ArrowUpRight size={16}/></button></div></aside></div>
    : <div className="workspace-empty">{loading ? <LoaderCircle className="spin" size={30}/> : <><Leaf size={44}/><h1>从一篇图文开始</h1><p>把照片与文案整理好，再分享给在意的人。</p><button className="primary" onClick={newDraft}><Plus size={17}/>新建图文</button></>}</div>}
    </main>
    {notice && <div role="status" className={`toast ${notice.error ? 'error-toast' : ''}`}><span>{notice.error ? <Radio size={17}/> : <CheckCircle2 size={17}/>}</span><p>{notice.text}</p>{notice.retry && <button className="text-button" disabled={working} onClick={notice.retry}>重试</button>}<button className="icon-button" aria-label="关闭提示" onClick={() => setNotice(null)}><X size={16}/></button></div>}
    {job && processing && <div className="job-panel" role="status"><div><LoaderCircle className="spin" size={17}/><strong>{job.title}</strong><span>{job.progress}%</span><button className="text-button" onClick={() => void cancel()}>取消</button></div><progress max="100" value={job.progress}/><small>{job.message}</small></div>}
    {cropAsset && <CropEditor asset={cropAsset} busy={working} close={() => setCropAsset(null)} save={edits => void perform(async () => { const item = await run<MediaAsset>('edit', { id: cropAsset.id, edits }); const current = draftRef.current; if (current) change({ items: current.items.map(i => i.id === cropAsset.id ? item : i) }); setCropAsset(null); })}/>}
    {videoOpen && <VideoTool source={videoSource} setSource={setVideoSource} busy={working} run={run} perform={action => void perform(action)} add={asset => { addItems([asset]); setNotice({ text: '素材已加入当前草稿' }); }} close={() => setVideoOpen(false)}/>}
    {exportOpen && <Modal title={exportResult ? '这一篇，已经整理好了' : '导出发布素材包'} eyebrow="READY TO SHARE" onClose={() => setExportOpen(false)} busy={working}>
      {exportResult ? <div className="export-success"><div className="success-seal"><Check size={32}/></div><h3>素材包已保存</h3><p>图片按顺序编号，文案单独保存。<br/>传到手机后，就可以继续发布了。</p><div className="destination-path">{exportResult}</div><button className="primary" onClick={() => void perform(() => window.desktop.reveal(exportResult))}><FolderOpen size={17}/>打开文件位置</button>{hasLive && <p className="small muted">实况手机兼容性待验证，请先阅读包内的导入说明。</p>}</div>
        : <><div className="export-content"><div className="export-summary"><div className="feature-icon"><Images size={25}/></div><div><strong>{draft?.title || '未命名草稿'}</strong><p>{draft?.items.length} 个素材 · 独立文案 · 按序编号</p></div></div><label className="field-label">保存位置</label><div className="directory-picker"><span className={!exportDirectory ? 'muted' : ''}>{exportDirectory || '选择一个存放素材的文件夹'}</span><button className="secondary" disabled={working} onClick={() => void perform(async () => { const directory = await window.desktop.pickDirectory(); if (directory) setExportDirectory(directory); })}><FolderOpen size={15}/>选择位置</button></div><label className="field-label">导出方式</label><div className="export-format-options"><button disabled={working} className={exportFormat === 'folder' ? 'selected' : ''} onClick={() => setExportFormat('folder')}><FolderOpen size={21}/><strong>素材文件夹</strong><span>方便查看与选择图片</span></button><button disabled={working} className={exportFormat === 'zip' ? 'selected' : ''} onClick={() => setExportFormat('zip')}><Download size={21}/><strong>ZIP 压缩包</strong><span>方便整体传输与归档</span></button></div>
          {hasLive && <><label className="field-label">实况目标设备</label><div className="button-row">{([['apple', 'iPhone 实况'], ['android', '标准安卓实况']] as const).map(([target, label]) => <label className="checkbox-label" key={target}><input type="checkbox" disabled={working} checked={targets.includes(target)} onChange={e => setTargets(e.target.checked ? [...targets, target] : targets.filter(t => t !== target))}/>{label}</label>)}</div><p className="notice-box">手机相册兼容性待真机验证。iPhone 需用支持配对文件的工具导入；标准安卓格式需兼容的相册。素材包内附具体指引。</p></>}
          <p className="small muted">同名文件会自动另存，已有素材不会被覆盖。</p></div><footer className="modal-footer"><button className="secondary" disabled={working} onClick={() => setExportOpen(false)}>取消</button><button className="primary" disabled={working || !exportDirectory || (!!hasLive && !targets.length)} onClick={doExport}><Download size={16}/>{working ? '正在导出…' : '开始导出'}</button></footer></>}
    </Modal>}
    {about && <Modal title="片语 · 使用与存储" eyebrow="YOUR PRIVATE WORKSPACE" onClose={() => setAbout(false)}><div className="about-content"><p>整理配图与独立文案，在预览中确认效果，再把素材带到手机发布。</p><ol><li>添加图片，或从视频中截取画面与实况。</li><li>调整顺序与画面，编辑发布文案。</li><li>在右侧检查效果，导出文件夹或 ZIP。</li></ol><h3>本地资料库</h3><p>草稿自动保存，导入素材复制到资料库。删除草稿不会删除原始文件。请在应用关闭时备份整个资料库。</p><div className="destination-path">{info?.dataDirectory || '正在读取…'}</div><p className="notice-box">iPhone 与标准安卓实况的文件结构经过程序校验，真机兼容性仍待验证。第三方平台是否接受实况，请在手机上确认。</p><button className="secondary" onClick={() => void perform(() => window.desktop.openHelp())}><FileText size={16}/>完整使用说明</button><div className="about-version">版本 {info?.version || '0.1.0'} · 本地桌面应用</div></div></Modal>}
    {deleteConfirm && <Modal title="删除这份草稿？" onClose={() => setDeleteConfirm(false)} busy={working}><div className="export-content"><p>将删除「{draft?.title}」的文案与素材排列，导入的原始文件不会被删除。</p></div><footer className="modal-footer"><button className="secondary" onClick={() => setDeleteConfirm(false)} disabled={working}>保留草稿</button><button className="danger-button" disabled={working} onClick={() => void perform(async () => { await flush(); if (!draft) return; await window.desktop.deleteDraft(draft.id); const remaining = drafts.filter(d => d.id !== draft.id); setDrafts(remaining); show(remaining[0] || null); setDeleteConfirm(false); })}><Trash2 size={15}/>删除草稿</button></footer></Modal>}
  </div>;
}
