import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { DEFAULT_PREVIEW, DEVICE_PRESETS, PREVIEW_LIMITS, clampPreviewSize, type PreviewSettings } from '../shared/preview-settings';

export function PreviewSizeControls({ settings, onChange, disabled }: { settings: PreviewSettings; onChange: (next: PreviewSettings) => void; disabled: boolean }) {
  const [fields, setFields] = useState({ width: String(settings.width), height: String(settings.height) });
  useEffect(() => { setFields({ width: String(settings.width), height: String(settings.height) }); }, [settings.width, settings.height]);
  function update(axis: 'width' | 'height', text: string, commit: boolean) {
    setFields(previous => ({ ...previous, [axis]: text }));
    const value = Number(text), limits = PREVIEW_LIMITS[axis];
    if (!commit && (!text.trim() || !Number.isFinite(value) || value < limits.min || value > limits.max)) return;
    const size = text.trim() && Number.isFinite(value) ? clampPreviewSize(value, axis) : settings[axis];
    setFields(previous => ({ ...previous, [axis]: String(size) }));
    if (size !== settings[axis]) onChange({ ...settings, preset: 'custom', [axis]: size });
  }
  return <div className="preview-size-controls" aria-label="预览尺寸设置">
    <label>机型 <select aria-label="预览机型" disabled={disabled} value={settings.preset}
      title="机型仅设置预览尺寸，不模拟系统界面" onChange={event => {
        const preset = DEVICE_PRESETS.find(p => p.id === event.target.value);
        onChange(preset ? { preset: preset.id, width: preset.width, height: preset.height } : { ...settings, preset: 'custom' });
      }}>
      <option value="custom">自定义</option>
      {DEVICE_PRESETS.map(p => <option key={p.id} value={p.id}>{p.name} · {p.width} × {p.height}</option>)}
    </select></label>
    {(['width', 'height'] as const).map((axis, index) => <label key={axis}>{index ? '高' : '宽'}
      <input aria-label={`预览${index ? '高度' : '宽度'}`} type="number" inputMode="numeric" disabled={disabled}
        min={PREVIEW_LIMITS[axis].min} max={PREVIEW_LIMITS[axis].max} step="1" value={fields[axis]}
        onChange={event => update(axis, event.target.value, false)} onBlur={event => update(axis, event.target.value, true)}
        onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); update(axis, event.currentTarget.value, true); } }}/>
    </label>)}
    <span title="预览逻辑像素，原始素材尺寸不变">px</span>
    <button disabled={disabled} onClick={() => onChange({ ...DEFAULT_PREVIEW })}>重置尺寸</button>
  </div>;
}

export function PreviewViewport({ settings, onChange, busy, children }: { settings: PreviewSettings; onChange: (next: PreviewSettings) => void; busy: boolean; children: ReactNode }) {
  const element = useRef<HTMLDivElement>(null);
  const current = useRef({ settings, onChange, busy }); current.current = { settings, onChange, busy };
  useEffect(() => {
    const box = element.current; if (!box) return;
    let frame = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const state = current.current;
        const rect = box.getBoundingClientRect(), width = Math.round(rect.width), height = Math.round(rect.height);
        if (!state.busy && width > 0 && height > 0 && (width !== state.settings.width || height !== state.settings.height))
          state.onChange({ preset: 'custom', width: clampPreviewSize(width, 'width'), height: clampPreviewSize(height, 'height') });
      });
    });
    observer.observe(box, { box: 'border-box' });
    return () => { observer.disconnect(); cancelAnimationFrame(frame); };
  }, []);
  return <div ref={element} className="preview-viewport" aria-label="可调整大小的预览区域"
    style={{ width: settings.width, height: settings.height, minWidth: PREVIEW_LIMITS.width.min, maxWidth: PREVIEW_LIMITS.width.max,
      minHeight: PREVIEW_LIMITS.height.min, maxHeight: PREVIEW_LIMITS.height.max, resize: busy ? 'none' : 'both' }}>{children}</div>;
}
