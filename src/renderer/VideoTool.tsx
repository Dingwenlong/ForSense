import { useEffect, useRef, useState } from 'react';
import { Camera, Clapperboard, Film, Play, Radio, StepBack, StepForward, Volume2, Upload } from 'lucide-react';
import type { MediaAsset, VideoSource, JobKind } from '../shared/types';
import { Modal } from './Modal';
import { timeLabel } from './hooks';
export function VideoTool({ source, setSource, busy, run, perform, add, close }: {
  source: VideoSource | null; setSource: (s: VideoSource) => void; busy: boolean;
  run: <T>(kind: JobKind, payload: unknown) => Promise<T>; perform: (action: () => Promise<void>) => void;
  add: (asset: MediaAsset) => void; close: () => void;
}) {
  const [mode, setMode] = useState<'frame' | 'live'>('frame'), [time, setTime] = useState(0), [start, setStart] = useState(0), [end, setEnd] = useState(3), [cover, setCover] = useState(1.5), [mute, setMute] = useState(false), [added, setAdded] = useState(0);
  const video = useRef<HTMLVideoElement>(null), playingClip = useRef(false);
  useEffect(() => { setTime(0); setStart(0); setEnd(Math.min(source?.duration || 3, 3)); setCover(Math.min(source?.duration || 3, 3) / 2); }, [source?.id]);
  const lastFrame = source?.frames[source.frames.length - 1] || 0;
  function seek(t: number) { if (!source) return; const near = source.frames.reduce((a, b) => Math.abs(b - t) < Math.abs(a - t) ? b : a); setTime(near); if (video.current) { video.current.pause(); video.current.currentTime = near; } playingClip.current = false; }
  function step(direction: number) {
    if (!source) return;
    const index = source.frames.reduce((best, value, i) => Math.abs(value - time) < Math.abs(source.frames[best] - time) ? i : best, 0);
    seek(source.frames[Math.max(0, Math.min(source.frames.length - 1, index + direction))]);
  }
  function changeRange(s: number, e: number) {
    if (!source) return;
    s = Math.max(0, Math.min(s, source.duration - 0.04)); e = Math.min(source.duration, Math.max(s + 0.04, Math.min(e, s + 3)));
    setStart(s); setEnd(e); setCover(Math.min(e - 0.034, Math.max(s, cover)));
  }
  const pick = () => perform(async () => { const file = await window.desktop.pickVideo(); if (file) setSource(await run<VideoSource>('video', file)); });
  const take = () => perform(async () => { if (!source) return; const item = await run<MediaAsset>('frame', { sourceId: source.id, time }); add(item); setAdded(n => n + 1); });
  const makeLive = () => perform(async () => { if (!source) return; const item = await run<MediaAsset>('live', { sourceId: source.id, start, end, cover, mute }); add(item); setAdded(n => n + 1); });
  return <Modal title="从视频里，留住一个瞬间" eyebrow="VIDEO STUDIO" onClose={close} busy={busy} wide>
    <div className="video-workspace"><section className="video-view">
      <div className="video-source-label"><Film size={15}/><span>{source?.name || '视频素材'}</span><button className="text-button" onClick={pick} disabled={busy}>{source ? '更换视频' : '选择视频'}</button></div>
      <div className="video-screen">{source ? <video ref={video} src={source.videoUrl} controls muted={mute} onTimeUpdate={e => {
        const v = e.currentTarget;
        if (playingClip.current && v.currentTime >= end) { v.pause(); v.currentTime = start; playingClip.current = false; }
        setTime(v.currentTime);
      }}/> : <button className="video-empty" onClick={pick} disabled={busy}><Clapperboard size={42} strokeWidth={1.2}/><strong>选一个值得回看的片段</strong><span>MP4 / MOV · H.264 / H.265</span><span className="secondary"><Upload size={15}/>选择视频</span></button>}</div>
      <div className="timeline"><input aria-label="视频时间轴" type="range" min="0" max={lastFrame || 1} step="0.001" value={Math.min(time, lastFrame)} disabled={!source || busy} onChange={e => seek(Number(e.target.value))}/><div className="timeline-labels"><span>{timeLabel(time)}</span><span>{timeLabel(source?.duration || 0)}</span></div></div>
      <div className="frame-controls"><button className="secondary" disabled={!source || busy} onClick={() => step(-1)}><StepBack size={15}/>上一帧</button><span>精确选择画面</span><button className="secondary" disabled={!source || busy} onClick={() => step(1)}>下一帧<StepForward size={15}/></button></div>
    </section><aside className="video-options"><div className="segmented"><button className={mode === 'frame' ? 'active' : ''} onClick={() => setMode('frame')}><Camera size={15}/>截取图片</button><button className={mode === 'live' ? 'active' : ''} onClick={() => setMode('live')}><Radio size={15}/>制作实况</button></div>
      {mode === 'frame' ? <div className="video-mode-content"><div className="feature-icon"><Camera size={25}/></div><h3>把这一帧，加入图文</h3><p className="muted">拖动时间轴找到画面，用逐帧按钮微调。截图会直接加入当前草稿。</p><div className="video-stat"><span>当前画面</span><strong>{timeLabel(time)}</strong></div><div className="video-stat"><span>画面尺寸</span><strong>{source ? `${source.width} × ${source.height}` : '—'}</strong></div><button className="primary full-width" disabled={!source || busy} onClick={take}><Camera size={16}/>截取并加入草稿</button></div>
        : <div className="video-mode-content"><p className="muted small">截取最长 3 秒，留住画面里的动作与声音。</p><label className="field-label">开始时间（秒）<input type="number" aria-label="实况开始时间" min="0" max={Math.max(0, (source?.duration || 0) - 0.04)} step="0.01" value={start.toFixed(2)} disabled={!source || busy} onChange={e => changeRange(Number(e.target.value), Number(e.target.value) + end - start)}/></label><label className="field-label">结束时间（秒）<input type="number" aria-label="实况结束时间" min={start + 0.04} max={Math.min(source?.duration || 3, start + 3)} step="0.01" value={end.toFixed(2)} disabled={!source || busy} onChange={e => changeRange(start, Number(e.target.value))}/></label>
          <button className="text-button" disabled={!source || busy} onClick={() => changeRange(time, Math.min(source!.duration, time + 3))}>从当前画面开始</button>
          <label className="field-label">封面位置 · {timeLabel(cover)}<input aria-label="实况封面时间" type="range" min={start} max={Math.max(start, end - 0.034)} step="0.001" value={cover} disabled={!source || busy} onChange={e => { const value = Number(e.target.value); setCover(value); seek(value); }}/></label>
          <label className="checkbox-label"><input type="checkbox" checked={!mute} onChange={e => setMute(!e.target.checked)} disabled={busy || !source?.hasAudio}/><Volume2 size={15}/>{source?.hasAudio ? '保留原声' : '原视频没有声音'}</label>
          <button className="secondary full-width" disabled={!source || busy} onClick={() => { if (!video.current) return; video.current.currentTime = start; playingClip.current = true; void video.current.play(); }}><Play size={15}/>预览 {(end - start).toFixed(2)} 秒片段</button>
          <button className="primary full-width" disabled={!source || busy || end <= start} onClick={makeLive}><Radio size={16}/>制作并加入草稿</button>
          <p className="small muted">导出时选择 iPhone 或标准安卓格式。手机相册兼容性待真机验证。</p>
        </div>}
    </aside></div><footer className="modal-footer"><span className="muted small">{added ? `已加入 ${added} 个素材，可继续取材` : '视频在本机处理，原始文件保留'}</span><button className="secondary" disabled={busy} onClick={close}>返回图文</button></footer>
  </Modal>;
}
