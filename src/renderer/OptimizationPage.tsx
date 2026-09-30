import { useEffect, useRef, useState } from 'react';
import type { MediaAsset } from '../shared/types';
import { promptTemplates, optimizationExamples } from '../shared/prompt-templates';
import { BackButton } from './BackButton';
import { BeforeAfter } from './BeforeAfter';

export interface OptimizationSession { source: MediaAsset | null; result: MediaAsset | null; templateId: string; prompt: string }
export const emptyOptimizationSession: OptimizationSession = { source: null, result: null, templateId: promptTemplates[0].id, prompt: promptTemplates[0].prompt };
export function OptimizationPage({ back, session, setSession, busy, selectImage, importImage, copyImage, copyPrompt, importResult, useResult, canUseResult }: {
  back: () => void; session: OptimizationSession; setSession: (value: OptimizationSession) => void; busy: boolean;
  selectImage: () => void; importImage: () => void; copyImage: (id: string) => void; copyPrompt: (prompt: string) => void;
  importResult: () => void; useResult: () => void; canUseResult: boolean;
}) {
  const [tab, setTab] = useState<'work' | 'examples'>('work');
  const root = useRef<HTMLElement>(null);
  useEffect(() => { root.current?.closest('.page-body')?.scrollTo(0, 0); }, [tab]);
  const template = promptTemplates.find(t => t.id === session.templateId) || promptTemplates[0];
  const chooseTemplate = (id: string) => {
    const next = promptTemplates.find(t => t.id === id)!;
    setSession({ ...session, templateId: id, prompt: next.prompt, result: null }); setTab('work');
  };
  return <section ref={root} className="page-content optimization-page" aria-label="AI 图片优化">
    <header className="page-heading"><BackButton disabled={busy} onClick={back}/><h1>AI 图片优化</h1></header>
    <p>复制图片和提示词，在你使用的 AI 工具中编辑，再将结果导入这里。全程手动操作，无需在片语配置账号或密钥。</p>
    <div className="controls optimization-tabs" aria-label="图片优化视图">
      <button aria-pressed={tab === 'work'} onClick={() => setTab('work')}>优化图片</button>
      <button aria-pressed={tab === 'examples'} onClick={() => setTab('examples')}>前后对比案例</button>
    </div>
    {tab === 'examples' ? <>
      <p>以下原图为 AI 生成的演示素材，优化图由图像编辑模型使用对应模板实际编辑得到。案例仅作参考，实际效果取决于图片、工具与模型。</p>
      <div className="example-grid">{optimizationExamples.map(example => <article className="optimization-example" key={example.id}>
        <h2>{example.title}</h2>
        <BeforeAfter before={example.before} after={example.after} ratio={example.ratio} label={example.id === 'product' ? '商品案例' : '美食案例'}/>
        <p>{example.description}</p>
        <details><summary>查看此案例使用的提示词</summary><p className="example-prompt">{promptTemplates.find(t => t.id === example.templateId)!.prompt}</p></details>
        <div className="controls"><button disabled={busy} onClick={() => chooseTemplate(example.templateId)}>使用此模板</button><button onClick={() => copyPrompt(promptTemplates.find(t => t.id === example.templateId)!.prompt)}>复制案例提示词</button></div>
      </article>)}</div>
    </> : <>
      <div className="optimization-editor optimization-compact">
        <section>
          <h2>原图</h2>
          <div className="controls"><button disabled={busy} onClick={selectImage}>{session.source ? '更换原图' : '选择原图'}</button><button disabled={busy} onClick={importImage}>导入原图</button></div>
          {session.source ? <><img className="optimization-input" src={session.source.imageUrl} alt="待复制的原图"/><p>{session.source.name} · {session.source.width} × {session.source.height}</p></> : <p className="optimization-empty">选择一张图片开始</p>}
          <button disabled={busy || !session.source} onClick={() => { if (session.source) copyImage(session.source.id); }}>复制原图</button>
        </section>
        <section>
          <h2>提示词</h2>
          <label className="controls">模板 <select aria-label="优化模板" disabled={busy} value={session.templateId} onChange={event => chooseTemplate(event.target.value)}>
            {[...new Set(promptTemplates.map(t => t.category))].map(category => <optgroup key={category} label={category}>{promptTemplates.filter(t => t.category === category).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</optgroup>)}
          </select></label>
          {template.requirements && <p className="template-requirements">{template.requirements}</p>}
          <label className="prompt-label">可按需要修改<textarea aria-label="优化提示词" disabled={busy} maxLength={10000} value={session.prompt} onChange={event => setSession({ ...session, prompt: event.target.value })}/></label>
          <div className="controls"><button disabled={busy || !session.prompt.trim()} onClick={() => copyPrompt(session.prompt)}>复制提示词</button><span>{session.prompt.length} / 10000 字符</span></div>
          <p className="muted">先复制图片并粘贴，再复制提示词并粘贴到你使用的 AI 工具。</p>
        </section>
      </div>
        <section className="optimization-result">
          <div className="controls"><h2>优化结果</h2><button disabled={busy || !session.source || !session.prompt.trim()} onClick={importResult}>{session.result ? '导入另一版结果' : '导入优化结果'}</button></div>
          {session.result && session.source ? <>
            <BeforeAfter key={session.result.id} before={session.source.imageUrl} after={session.result.imageUrl} ratio={`${session.source.width} / ${session.source.height}`} label="我的图片"/>
            <p>已另存到素材库：{session.result.name}。原图保留。</p>
            <div className="controls"><button disabled={busy} onClick={() => copyImage(session.result!.id)}>复制优化图</button><button disabled={busy || !canUseResult} onClick={useResult}>将结果加入当前草稿</button></div>
            {!canUseResult && <p>打开一份草稿后，可从素材库选择此结果；已在草稿中的素材不会重复添加。</p>}
          </> : <p>在外部 AI 工具保存结果后，选择该图片，即可并排或滑动对比。新结果单独保存，不覆盖原图。</p>}
        </section>
    </>}
  </section>;
}
