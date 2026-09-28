import { useEffect, useRef, useState } from 'react';
import type { LibrarySnapshot, MediaAsset } from '../shared/types';
import { errorText } from './hooks';

export function AssetBrowser({ busy, refreshKey, mode = 'manage', excludeIds = [], onImport, onUse, onOptimize, onVideo, perform }: {
  busy: boolean; refreshKey: number; mode?: 'manage' | 'pick' | 'ai'; excludeIds?: string[];
  onImport: () => void; onUse?: (items: MediaAsset[]) => void; onOptimize?: (asset: MediaAsset) => void;
  onVideo: (id: string) => void; perform: (action: () => Promise<void>) => void;
}) {
  const [data, setData] = useState<LibrarySnapshot>({ assets: [], videos: [], warnings: [] }), [loading, setLoading] = useState(true), [error, setError] = useState('');
  const [query, setQuery] = useState(''), [filter, setFilter] = useState('all'), [selected, setSelected] = useState<string[]>([]), [detailId, setDetailId] = useState<string | null>(null), [name, setName] = useState('');
  const [revision, setRevision] = useState(0);
  const detailRef = useRef<HTMLElement>(null);
  useEffect(() => { if (detailId) detailRef.current?.scrollIntoView({ block: 'nearest' }); }, [detailId]);
  useEffect(() => {
    let active = true; setLoading(true); setError('');
    window.desktop.listLibrary().then(result => { if (active) setData(result); }).catch(e => { if (active) setError(errorText(e)); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [refreshKey, revision]);
  const detail = data.assets.find(a => a.id === detailId);
  const visible = data.assets.filter(a => (mode !== 'ai' || a.kind === 'image') && (filter === 'archived' ? a.archived : !a.archived) &&
    (filter === 'all' || filter === 'archived' || filter === 'favorites' && a.favorite || filter === 'ai' && a.optimization || filter === a.kind) &&
    `${a.name} ${a.optimization?.prompt || ''}`.toLowerCase().includes(query.toLowerCase()));
  const eligible = selected.map(id => data.assets.find(a => a.id === id)).filter((a): a is LibrarySnapshot['assets'][number] => !!a && !a.archived && !excludeIds.includes(a.id));
  const update = (id: string, patch: Parameters<typeof window.desktop.updateAsset>[1]) => perform(async () => {
    const changed = await window.desktop.updateAsset(id, patch);
    setData(previous => ({ ...previous, assets: previous.assets.map(a => a.id === id ? { ...a, ...changed } : a) }));
    if (patch.archived) setSelected(previous => previous.filter(value => value !== id));
  });
  function inspect(id: string) { setDetailId(id); setName(data.assets.find(a => a.id === id)?.name || ''); }
  return <div className="asset-browser">
    <div className="controls asset-library-tools">
      <button disabled={busy} onClick={onImport}>从电脑导入图片</button>
      {mode === 'manage' && <button disabled={busy} onClick={() => onVideo('')}>导入视频</button>}
      <label>搜索素材 <input aria-label="搜索素材" type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="名称或优化提示词"/></label>
      <label>分类 <select aria-label="素材分类" value={filter} onChange={e => setFilter(e.target.value)}>
        <option value="all">全部图片与实况</option><option value="image">图片</option>
        {mode !== 'ai' && <option value="live">实况</option>}
        <option value="favorites">收藏</option><option value="ai">优化结果</option>
        {mode === 'manage' && <><option value="video">视频</option><option value="archived">已归档</option></>}
      </select></label>
    </div>
    {error && <p role="alert">{error} <button onClick={() => setRevision(n => n + 1)}>重新加载</button></p>}
    {data.warnings.map((warning, i) => <p role="alert" key={i}>{warning}</p>)}
    {loading ? <p role="status">正在读取素材库…</p> : filter === 'video' ? <div className="material-grid">
      {data.videos.filter(v => v.name.toLowerCase().includes(query.toLowerCase())).map(v => <article key={v.id} className="material-card">
        <video src={v.videoUrl} controls preload="metadata"/>
        <strong>{v.name}</strong><span>{v.width} × {v.height} · {v.duration.toFixed(1)} 秒</span>
        <button disabled={busy} onClick={() => onVideo(v.id)}>打开视频取材</button>
      </article>)}
      {!data.videos.length && <p>还没有视频。导入后可以多次截图或制作实况。</p>}
    </div> : <>
      <p className="asset-library-count">{visible.length} 个素材{mode === 'pick' ? ' · 勾选后加入当前草稿，已有素材不会重复添加。' : mode === 'ai' ? ' · 选择一张静态图片。' : ' · 导入图片、视频截图和优化结果都会保存在这里。'}</p>
      <div className="material-grid">
        {visible.map(asset => <article key={asset.id} className={`material-card ${detailId === asset.id ? 'material-card-active' : ''}`}>
          <button className="material-thumbnail" aria-label={`查看素材 ${asset.name}`} onClick={() => inspect(asset.id)}><img loading="lazy" src={asset.imageUrl} alt={asset.name}/></button>
          <strong title={asset.name}>{asset.name}</strong>
          <span>{asset.kind === 'live' ? '实况' : asset.optimization ? '优化结果' : '图片'} · {asset.width} × {asset.height}</span>
          <div className="controls">
            {mode === 'ai' ? <button disabled={busy} onClick={() => onUse?.([asset])}>选择此图</button> : !asset.archived && onUse && <label>
              <input type="checkbox" aria-label={`选择 ${asset.name}`} disabled={busy || excludeIds.includes(asset.id)} checked={excludeIds.includes(asset.id) || selected.includes(asset.id)} onChange={e => setSelected(e.target.checked ? [...selected, asset.id] : selected.filter(id => id !== asset.id))}/>
              {excludeIds.includes(asset.id) ? '已在草稿' : '选择'}
            </label>}
            <button disabled={busy} aria-pressed={!!asset.favorite} onClick={() => update(asset.id, { favorite: !asset.favorite })}>{asset.favorite ? '已收藏' : '收藏'}</button>
          </div>
        </article>)}
      </div>
      {!visible.length && <p className="library-empty">{query || filter !== 'all' ? '没有符合条件的素材，试试其他关键词或分类。' : '素材库是空的。点击“从电脑导入图片”开始，所有草稿都可复用。'}</p>}
    </>}
    {detail && <section ref={detailRef} className="material-detail" aria-label="素材详情">
      <div className="controls"><h3>素材详情</h3><button onClick={() => setDetailId(null)}>收起详情</button></div>
      {detail.kind === 'live' && <video className="material-live-preview" src={detail.videoUrl} controls/>}
      <p>{detail.name} · {detail.usedBy.length ? `用于：${detail.usedBy.join('、')}` : '尚未用于草稿'}</p>
      <div className="controls"><label>素材名称 <input aria-label="素材名称" maxLength={240} value={name} onChange={e => setName(e.target.value)}/></label>
        <button disabled={busy || !name.trim() || name.trim() === detail.name} onClick={() => update(detail.id, { name })}>保存名称</button>
        <button disabled={busy} onClick={() => perform(() => window.desktop.copyImage(detail.id))}>复制图片</button>
        {mode === 'manage' && detail.kind === 'image' && onOptimize && <button disabled={busy} onClick={() => onOptimize(detail)}>AI 图片优化</button>}
        {mode === 'manage' && <button disabled={busy} onClick={() => update(detail.id, { archived: !detail.archived })}>{detail.archived ? '恢复到素材库' : '归档素材'}</button>}
      </div>
      {mode === 'manage' && <p>归档仅在素材库中隐藏；草稿中的图片和原文件保留，可从“已归档”恢复。</p>}
      {detail.optimization && <p>此图由你手动导入为优化结果，已保存对应原图与提示词，可在素材库的素材详情中进入 AI 图片优化查看对比。</p>}
    </section>}
    {onUse && mode !== 'ai' && <footer className="asset-picker-footer controls">
      <span>已选 {eligible.length} 张</span><button disabled={busy || !eligible.length} onClick={() => { onUse(eligible); setSelected([]); }}>加入当前草稿</button>
      <button disabled={!selected.length} onClick={() => setSelected([])}>清空选择</button>
    </footer>}
  </div>;
}
