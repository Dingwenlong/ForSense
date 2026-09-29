import { useEffect, useRef, useState } from 'react';
import type { MediaAsset } from '../shared/types';
import { promptTemplates, optimizationExamples } from '../shared/prompt-templates';
import { BackButton } from './BackButton';
import { BeforeAfter } from './BeforeAfter';

export interface OptimizationSession { source: MediaAsset | null; result: MediaAsset | null; templateId: string; prompt: string; step: number }
export const emptyOptimizationSession: OptimizationSession = { source: null, result: null, templateId: promptTemplates[0].id, prompt: promptTemplates[0].prompt, step: 1 };
export function OptimizationPage({ back, session, setSession, busy, selectImage, importImage, copyImage, copyPrompt, importResult, useResult, canUseResult }: {
  back: () => void; session: OptimizationSession; setSession: (value: OptimizationSession) => void; busy: boolean;
  selectImage: () => void; importImage: () => void; copyImage: (id: string) => void; copyPrompt: (prompt: string) => void;
  importResult: () => void; useResult: () => void; canUseResult: boolean;
}) {
  const [tab, setTab] = useState<'work' | 'examples'>('work'), [category, setCategory] = useState('全部');
  const root = useRef<HTMLElement>(null);
  useEffect(() => { root.current?.closest('.page-body')?.scrollTo(0, 0); }, [session.step, tab]);
  const template = promptTemplates.find(t => t.id === session.templateId) || promptTemplates[0];
  const chooseTemplate = (id: string) => {
    const next = promptTemplates.find(t => t.id === id)!;
    setSession({ ...session, templateId: id, prompt: next.prompt, result: null, step: session.source ? 3 : 1 }); setTab('work');
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
      <nav className="controls optimization-steps" aria-label="图片优化步骤">
        {['选择图片', '选择模板', '复制与对比'].map((label, i) => <button key={label} disabled={busy || i > 0 && !session.source} aria-current={session.step === i + 1 ? 'step' : undefined} aria-pressed={session.step === i + 1} onClick={() => setSession({ ...session, step: i + 1 })}>{i + 1}. {label}</button>)}
      </nav>
      {session.step === 1 && <section className="optimization-source">
        <h2>选择要优化的原图</h2>
        <p>支持 JPG、PNG、WebP。导入的图片同时保存在素材库。</p>
        <div className="controls"><button disabled={busy} onClick={selectImage}>从素材库选择</button><button disabled={busy} onClick={importImage}>导入一张原图</button></div>
        {session.source && <figure><img src={session.source.imageUrl} alt="当前优化原图"/><figcaption>{session.source.name}</figcaption><button disabled={busy} onClick={() => setSession({ ...session, step: 2 })}>下一步：选择模板</button></figure>}
      </section>}
      {session.step === 2 && <section>
        <h2>选择一种优化方向</h2><p>{promptTemplates.length} 个模板，涵盖基础优化、旅行创意和氛围处理。选择后可修改完整提示词。</p>
        <label>场景 <select aria-label="提示词场景" value={category} onChange={e => setCategory(e.target.value)}>{['全部', ...new Set(promptTemplates.map(t => t.category))].map(c => <option key={c}>{c}</option>)}</select></label>
        <div className="template-grid">{promptTemplates.filter(t => category === '全部' || t.category === category).map(t => <button key={t.id} className="template-option" disabled={busy} onClick={() => chooseTemplate(t.id)}>
          <strong>{t.name}</strong><span>{t.category} · {t.description}</span>
        </button>)}</div>
      </section>}
      {session.step === 3 && session.source && <>
        <div className="optimization-editor">
          <section><h2>1. 复制图片</h2><img className="optimization-input" src={session.source.imageUrl} alt="待复制的原图"/>
            <p>{session.source.name} · {session.source.width} × {session.source.height}</p>
            <button disabled={busy} onClick={() => copyImage(session.source!.id)}>复制原图</button>
            <p className="muted">先粘贴到外部 AI 工具，确认已附上图片。</p>
          </section>
          <section><h2>2. 复制提示词</h2>
            <div className="controls"><span>模板：{template.name}</span><button disabled={busy} onClick={() => setSession({ ...session, step: 2 })}>更换模板</button></div>
            {template.requirements && <p className="template-requirements">{template.requirements}</p>}
            <label className="prompt-label">可按需要修改<textarea aria-label="优化提示词" disabled={busy} maxLength={10000} value={session.prompt} onChange={e => setSession({ ...session, prompt: e.target.value })}/></label>
            <div className="controls"><button disabled={busy || !session.prompt.trim()} onClick={() => copyPrompt(session.prompt)}>复制提示词</button><span>{session.prompt.length} / 10000 字符</span></div>
            <p className="muted">再复制并粘贴提示词。图片与文字共用剪贴板，请分别粘贴；片语不会自动发送素材。</p>
          </section>
        </div>
        <section className="optimization-result">
          <div className="controls"><h2>3. 导入结果，检查变化</h2><button disabled={busy || !session.prompt.trim()} onClick={importResult}>{session.result ? '导入另一版结果' : '导入优化结果'}</button></div>
          {session.result ? <>
            <BeforeAfter key={session.result.id} before={session.source.imageUrl} after={session.result.imageUrl} ratio={`${session.source.width} / ${session.source.height}`} label="我的图片"/>
            <p>已另存到素材库：{session.result.name}。原图保留。</p>
            <div className="controls"><button disabled={busy} onClick={() => copyImage(session.result!.id)}>复制优化图</button><button disabled={busy || !canUseResult} onClick={useResult}>将结果加入当前草稿</button></div>
            {!canUseResult && <p>打开一份草稿后，可从素材库选择此结果；已在草稿中的素材不会重复添加。</p>}
          </> : <p>在外部 AI 工具保存结果后，选择该图片，即可并排或滑动对比。新结果单独保存，不覆盖原图。</p>}
        </section>
      </>}
    </>}
  </section>;
}
