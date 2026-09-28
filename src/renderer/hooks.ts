import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import type { ExportJob, JobKind } from '../shared/types';
export function useJobs() {
  const [job, setJob] = useState<ExportJob | null>(null);
  const pending = useRef(new Map<string, { resolve: (value: unknown) => void; reject: (error: Error) => void }>());
  useEffect(() => window.desktop.onJob(info => {
    setJob(info); const promise = pending.current.get(info.id);
    if (!promise) return;
    if (info.status === 'done') { pending.current.delete(info.id); promise.resolve(info.result); }
    if (info.status === 'error' || info.status === 'cancelled') { pending.current.delete(info.id); promise.reject(new Error(info.error || info.message)); }
  }), []);
  function run<T>(kind: JobKind, payload: unknown): Promise<T> {
    const id = crypto.randomUUID();
    return new Promise<T>((resolve, reject) => {
      pending.current.set(id, { resolve: value => resolve(value as T), reject });
      window.desktop.startJob(id, kind, payload).catch(error => { pending.current.delete(id); reject(error); });
    });
  }
  const processing = !!job && ['running', 'queued'].includes(job.status);
  return { run, job, processing, cancel: () => job && window.desktop.cancelJob(job.id) };
}
export const timeLabel = (time: number) => `${Math.floor(time / 60).toString().padStart(2, '0')}:${(time % 60).toFixed(2).padStart(5, '0')}`;
export function errorText(error: unknown) { return (error instanceof Error ? error.message : '操作失败，请重试').replace(/^Error invoking remote method '[^']+': Error: /, ''); }

export function useTextareaHeight(ref: RefObject<HTMLTextAreaElement | null>, value: string, minHeight: number, active = true) {
  useLayoutEffect(() => {
    const field = ref.current; if (!field || !active) return;
    const resize = () => {
      // Pin the current width while measuring: collapsing height may temporarily remove the parent's scrollbar.
      const previousWidth = field.style.width;
      field.style.width = `${field.getBoundingClientRect().width}px`;
      field.style.height = 'auto';
      field.style.height = `${Math.max(minHeight, field.scrollHeight)}px`;
      field.style.width = previousWidth;
    };
    let width = field.clientWidth, frame = 0;
    resize();
    const observer = new ResizeObserver(() => {
      if (field.clientWidth !== width) {
        width = field.clientWidth; cancelAnimationFrame(frame); frame = requestAnimationFrame(resize);
      }
    });
    observer.observe(field);
    return () => { observer.disconnect(); cancelAnimationFrame(frame); };
  }, [ref, value, minHeight, active]);
}
