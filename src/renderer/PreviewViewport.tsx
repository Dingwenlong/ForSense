import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { DEFAULT_PREVIEW, DEVICE_PRESETS, PREVIEW_LIMITS, clampPreviewSize, fitPreviewSettings, type PreviewSettings, type PreviewBounds } from '../shared/preview-settings';

export function PreviewSizeControls({ settings, bounds, onChange, disabled }: { settings: PreviewSettings; bounds: PreviewBounds; onChange: (next: PreviewSettings) => void; disabled: boolean }) {
  const applied = fitPreviewSettings(settings, bounds);
  const [fields, setFields] = useState({ width: String(applied.width), height: String(applied.height) });
  const [open, setOpen] = useState(false), [focused, setFocused] = useState(0);
  const root = useRef<HTMLDivElement>(null), trigger = useRef<HTMLButtonElement>(null), choices = useRef<(HTMLButtonElement | null)[]>([]);
  const panelId = useId();
  const options = [
    { id: 'default', name: '默认尺寸', width: DEFAULT_PREVIEW.width, height: DEFAULT_PREVIEW.height },
    ...DEVICE_PRESETS,
    { id: 'custom', name: '自定义', width: applied.width, height: applied.height },
  ];
  const selected = Math.max(0, options.findIndex(option => option.id === settings.preset));
  const label = (option: typeof options[number]) => { const size = fitPreviewSettings({ ...option, preset: option.id }, bounds); return `${size.width} × ${size.height} · ${option.name}`; };
  useEffect(() => { setFields({ width: String(applied.width), height: String(applied.height) }); }, [applied.width, applied.height, open]);
  useEffect(() => { if (disabled) setOpen(false); }, [disabled]);
  useEffect(() => { setFocused(selected); }, [selected]);
  useEffect(() => {
    if (!open) return;
    choices.current[selected]?.focus();
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setOpen(false); trigger.current?.focus(); } };
    document.addEventListener('pointerdown', outside, true); document.addEventListener('keydown', escape, true);
    return () => { document.removeEventListener('pointerdown', outside, true); document.removeEventListener('keydown', escape, true); };
  }, [open]);
  function update(axis: 'width' | 'height', text: string, commit: boolean) {
    setFields(previous => ({ ...previous, [axis]: text }));
    const value = Number(text), min = Math.min(PREVIEW_LIMITS[axis].min, bounds[axis]), max = bounds[axis];
    if (!commit && (!text.trim() || !Number.isFinite(value) || value < min || value > max)) return;
    const size = text.trim() && Number.isFinite(value) ? Math.min(max, clampPreviewSize(value, axis)) : applied[axis];
    setFields(previous => ({ ...previous, [axis]: String(size) }));
    if (size !== applied[axis]) onChange({ ...applied, preset: 'custom', [axis]: size });
  }
  return <div ref={root} className="preview-size-controls" onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false); }}>
    <div className="preview-size-fields">
      {(['width', 'height'] as const).map((axis, index) => <label className="preview-dimension" key={axis}>
        <span>{index ? '高' : '宽'}</span>
        <input aria-label={`预览${index ? '高度' : '宽度'}`} title={`预览${index ? '高度' : '宽度'}（最大 ${bounds[axis]} px）`}
          type="number" inputMode="numeric" disabled={disabled} min={Math.min(PREVIEW_LIMITS[axis].min, bounds[axis])} max={bounds[axis]} step="1" value={fields[axis]}
          onChange={event => update(axis, event.target.value, false)} onBlur={event => update(axis, event.target.value, true)}
          onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); update(axis, event.currentTarget.value, true); } }}/>
      </label>)}
      <span aria-hidden="true">·</span>
    </div>
    <button ref={trigger} className="preview-size-trigger" type="button" disabled={disabled} aria-label="预览尺寸与机型" aria-haspopup="listbox" aria-expanded={open} aria-controls={`${panelId}-options`}
      title="设置预览尺寸与机型" onClick={() => setOpen(value => !value)} onKeyDown={event => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setOpen(true); }
      }}>
      <span>{options[selected].name}</span>
      <svg aria-hidden="true" width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor"><path d="m2 4 4 4 4-4"/></svg>
    </button>
    {open && <div id={panelId} className="preview-size-panel" role="group" aria-label="预览尺寸设置">
      <div id={`${panelId}-options`} role="listbox" aria-label="预览机型" onKeyDown={event => {
        const index = event.key === 'ArrowDown' ? (focused + 1) % options.length : event.key === 'ArrowUp' ? (focused - 1 + options.length) % options.length : event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1 : -1;
        if (index >= 0) { event.preventDefault(); setFocused(index); choices.current[index]?.focus(); }
      }}>
        {options.map((option, index) => <button key={option.id} ref={element => { choices.current[index] = element; }} type="button" role="option"
          aria-label={label(option)} aria-selected={settings.preset === option.id} tabIndex={focused === index ? 0 : -1} onFocus={() => setFocused(index)}
          onClick={() => { onChange({ preset: option.id, width: option.width, height: option.height }); setOpen(false); trigger.current?.focus(); }}>
          {label(option)}
        </button>)}
      </div>
    </div>}
  </div>;
}

export function PreviewViewport({ settings, bounds, onChange, busy, children }: { settings: PreviewSettings; bounds: PreviewBounds; onChange: (next: PreviewSettings) => void; busy: boolean; children: ReactNode }) {
  const element = useRef<HTMLDivElement>(null);
  const current = useRef({ settings, onChange, busy }); current.current = { settings, onChange, busy };
  useLayoutEffect(() => {
    const box = element.current; if (!box) return;
    // Native resizing already changes the inline size; rewriting that same size can interrupt its drag.
    if (Math.round(box.getBoundingClientRect().width) !== settings.width) box.style.width = `${settings.width}px`;
    if (Math.round(box.getBoundingClientRect().height) !== settings.height) box.style.height = `${settings.height}px`;
  }, [settings.width, settings.height]);
  useEffect(() => {
    const box = element.current; if (!box) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const observer = new ResizeObserver(() => {
      clearTimeout(timer);
      // Let the browser finish its native resize before React synchronizes the size.
      timer = setTimeout(() => {
        const state = current.current;
        const rect = box.getBoundingClientRect(), width = Math.round(rect.width), height = Math.round(rect.height);
        if (!state.busy && width > 0 && height > 0 && (width !== state.settings.width || height !== state.settings.height))
          state.onChange({ preset: 'custom', width: clampPreviewSize(width, 'width'), height: clampPreviewSize(height, 'height') });
      }, 120);
    });
    observer.observe(box, { box: 'border-box' });
    return () => { observer.disconnect(); clearTimeout(timer); };
  }, []);
  return <div ref={element} className="preview-viewport" aria-label="可调整大小的预览区域"
    style={{ minWidth: Math.min(PREVIEW_LIMITS.width.min, bounds.width), maxWidth: bounds.width,
      minHeight: Math.min(PREVIEW_LIMITS.height.min, bounds.height), maxHeight: bounds.height, resize: busy ? 'none' : 'both' }}>{children}</div>;
}
