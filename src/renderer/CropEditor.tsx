import { useEffect, useRef, useState } from 'react';
import { RotateCw, Undo2, Check } from 'lucide-react';
import type { Edits, MediaAsset, Crop } from '../shared/types';
import { Modal } from './Modal';
export function CropEditor({ asset, busy, save, close }: { asset: MediaAsset; busy: boolean; save: (edits: Edits) => void; close: () => void }) {
  const [edits, setEdits] = useState<Edits>(asset.edits), [dimensions, setDimensions] = useState({ width: asset.width, height: asset.height });
  const canvas = useRef<HTMLCanvasElement>(null), container = useRef<HTMLDivElement>(null), drag = useRef<{ x: number; y: number; crop: Crop } | null>(null);
  const crop = edits.crop || { x: 0, y: 0, width: 1, height: 1 };
  useEffect(() => {
    const image = new Image(); image.onload = () => {
      const c = canvas.current; if (!c) return;
      const swapped = edits.rotation === 90 || edits.rotation === 270;
      c.width = swapped ? image.height : image.width; c.height = swapped ? image.width : image.height;
      setDimensions({ width: c.width, height: c.height });
      const ctx = c.getContext('2d')!; ctx.translate(c.width / 2, c.height / 2); ctx.rotate(edits.rotation * Math.PI / 180); ctx.drawImage(image, -image.width / 2, -image.height / 2);
    }; image.src = `media://asset/${asset.originalId}/image`;
  }, [asset.originalId, edits.rotation]);
  function setCrop(next: Crop) { setEdits({ ...edits, crop: next }); }
  function ratio(value: number | null) {
    if (!value) { setEdits({ ...edits, crop: undefined }); return; }
    const r = dimensions.width / dimensions.height;
    const width = value < r ? value / r : 1, height = value < r ? 1 : r / value;
    setCrop({ x: (1 - width) / 2, y: (1 - height) / 2, width, height });
  }
  return <Modal title="调整画面" eyebrow="IMAGE EDITOR" onClose={close} busy={busy}>
    <div className="crop-stage"><div ref={container} className="crop-canvas" style={{ width: Math.min(600, 330 * dimensions.width / dimensions.height), aspectRatio: `${dimensions.width}/${dimensions.height}` }}>
      <canvas ref={canvas}/><div className="crop-selection" style={{ left: `${crop.x * 100}%`, top: `${crop.y * 100}%`, width: `${crop.width * 100}%`, height: `${crop.height * 100}%` }}
        onPointerDown={e => { if (busy) return; e.currentTarget.setPointerCapture(e.pointerId); drag.current = { x: e.clientX, y: e.clientY, crop }; }}
        onPointerMove={e => { if (!drag.current || !container.current) return; const rect = container.current.getBoundingClientRect(); const old = drag.current; setCrop({ ...old.crop, x: Math.max(0, Math.min(1 - old.crop.width, old.crop.x + (e.clientX - old.x) / rect.width)), y: Math.max(0, Math.min(1 - old.crop.height, old.crop.y + (e.clientY - old.y) / rect.height)) }); }}
        onPointerUp={() => drag.current = null} onLostPointerCapture={() => drag.current = null}><i/><i/></div>
    </div></div>
    <div className="crop-settings"><div className="button-row"><button className="secondary" disabled={busy} onClick={() => setEdits({ rotation: ((edits.rotation + 90) % 360) as Edits['rotation'] })}><RotateCw size={15}/>旋转 90°</button><button className="text-button" disabled={busy} onClick={() => setEdits({ rotation: 0 })}><Undo2 size={14}/>恢复原图</button></div>
      <span className="field-label">裁切比例</span><div className="ratio-options">{[['完整', null], ['1:1', 1], ['3:4', 0.75], ['4:3', 4 / 3], ['9:16', 9 / 16]].map(([label, r]) => <button key={label} className="ratio-button" disabled={busy} onClick={() => ratio(r as number | null)}>{label}</button>)}</div>
      <div className="crop-sliders">{(['width', 'height'] as const).map((key, i) => <label key={key}>{i ? '高度' : '宽度'}<input aria-label={`裁切${i ? '高度' : '宽度'}`} disabled={busy} type="range" min="0.1" max="1" step="0.01" value={crop[key]} onChange={e => { const next = { ...crop, [key]: Number(e.target.value) }; next.x = Math.min(next.x, 1 - next.width); next.y = Math.min(next.y, 1 - next.height); setCrop(next); }}/><span>{Math.round(crop[key] * 100)}%</span></label>)}</div>
      <p className="muted small">拖动画面中的选区调整位置，原始素材会保留。实况的封面与动态画面同步裁切。</p>
    </div><footer className="modal-footer"><button className="secondary" disabled={busy} onClick={close}>取消</button><button className="primary" disabled={busy} onClick={() => save(edits)}><Check size={16}/>{busy ? '正在处理…' : '应用调整'}</button></footer>
  </Modal>;
}
