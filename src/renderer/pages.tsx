import type { Draft, Platform } from '../shared/types';

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
