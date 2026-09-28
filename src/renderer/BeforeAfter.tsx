import { useState } from 'react';

export function BeforeAfter({ before, after, ratio = '4 / 3', label = '图片' }: { before: string; after: string; ratio?: string; label?: string }) {
  const [position, setPosition] = useState(50), [mode, setMode] = useState<'side' | 'slider'>('side');
  return <div className="before-after">
    <div className="controls compare-modes" aria-label={`${label}对比方式`}>
      <button aria-pressed={mode === 'side'} onClick={() => setMode('side')}>并排对比</button>
      <button aria-pressed={mode === 'slider'} onClick={() => setMode('slider')}>滑动对比</button>
    </div>
    {mode === 'side' ? <div className="compare-pair">
      <figure><div style={{ aspectRatio: ratio }}><img src={before} alt={`${label}优化前`}/></div><figcaption>优化前</figcaption></figure>
      <figure><div style={{ aspectRatio: ratio }}><img src={after} alt={`${label}优化后`}/></div><figcaption>优化后</figcaption></figure>
    </div> : <>
      <div className="compare-slider" style={{ aspectRatio: ratio }}>
        <img src={after} alt={`${label}优化后`}/>
        <img className="compare-original" style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }} src={before} alt={`${label}优化前`}/>
        <span className="compare-divider" style={{ left: `${position}%` }} aria-hidden="true"/>
        <span className="compare-label compare-label-before">优化前</span><span className="compare-label compare-label-after">优化后</span>
      </div>
      <label className="compare-range">拖动查看原图 / 结果
        <input type="range" aria-label={`${label}对比位置`} min="0" max="100" value={position} onChange={e => setPosition(Number(e.target.value))}/>
      </label>
    </>}
  </div>;
}
