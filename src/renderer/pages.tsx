import { useRef } from 'react';
import type { Draft, Platform } from '../shared/types';

export function LibraryPage({ drafts, filter, query, busy, setFilter, setQuery, open, remove }: {
  drafts: Draft[]; filter: 'all' | Platform; query: string; busy: boolean;
  setFilter: (value: 'all' | Platform) => void; setQuery: (value: string) => void;
  open: (draft: Draft) => void; remove: (draft: Draft) => void;
}) {
  const search = useRef<HTMLInputElement>(null);
  const keywords = query.trim().toLowerCase().split(/\s+/u).filter(Boolean);
  const visible = drafts.filter(d => (filter === 'all' || d.platform === filter) &&
    keywords.every(word => `${d.title} ${d.caption}`.toLowerCase().includes(word)));
  return <section className="page-content library-page" aria-label="草稿列表">
    <h1>我的草稿</h1>
    <div className="draft-search" role="search" aria-label="查找草稿">
      <select aria-label="添加平台标签" value="" onChange={e => { setFilter(e.target.value as Platform); search.current?.focus(); }}>
        <option value="" disabled>＋ 标签</option><option value="moments">微信</option><option value="douyin">抖音</option>
      </select>
      {filter !== 'all' && <span className="draft-search-tag">{filter === 'moments' ? '微信' : '抖音'}
        <button aria-label={`移除${filter === 'moments' ? '微信' : '抖音'}标签`} onClick={() => { setFilter('all'); search.current?.focus(); }}>×</button>
      </span>}
      <input ref={search} aria-label="搜索草稿" value={query} placeholder="搜索标题或文案，可先选择平台标签" onChange={e => setQuery(e.target.value)}
        onKeyDown={e => { if (e.key === 'Backspace' && !query && filter !== 'all' && !e.nativeEvent.isComposing) { e.preventDefault(); setFilter('all'); } }}/>
      {(query || filter !== 'all') && <button className="draft-search-clear" aria-label="清空搜索" onClick={() => { setQuery(''); setFilter('all'); search.current?.focus(); }}>×</button>}
    </div>
    <div className="library-list">
      {visible.map(item => <article key={item.id} className="library-card"><button className="library-card-open" disabled={busy} onClick={() => open(item)}>
        {item.items[0] && <img src={item.items[0].imageUrl} alt=""/>}
        <span><strong>{item.title || '未命名草稿'}</strong><br/>
          最近预览：{item.platform === 'moments' ? '微信' : '抖音'} · {item.items.length} 张素材 ·
          {' '}{new Date(item.updatedAt).toLocaleDateString('zh-CN')}
        </span>
        <span aria-hidden="true">打开</span>
      </button><button disabled={busy} aria-label={`删除草稿 ${item.title || '未命名草稿'}`} onClick={() => remove(item)}>删除</button></article>)}
      {!visible.length && <p>{query || filter !== 'all' ? '没有匹配的草稿，试试更换标签或关键词。' : '还没有草稿，点击“新建草稿”开始。'}</p>}
    </div>
  </section>;
}
