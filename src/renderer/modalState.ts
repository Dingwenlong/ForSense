import { useSyncExternalStore } from 'react';
const listeners = new Set<() => void>();
let openCount = 0;
const publish = () => { for (const listener of listeners) listener(); };
export function registerModal() {
  openCount++; publish(); let released = false;
  return () => { if (released) return; released = true; openCount--; publish(); };
}
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export function useModalActive() { return useSyncExternalStore(subscribe, () => openCount > 0); }
