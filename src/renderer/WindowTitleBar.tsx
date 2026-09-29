import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { DesktopWindowState, WindowAction } from '../shared/types';
import { useModalActive } from './modalState';
import { errorText } from './hooks';

export function WindowTitleBar({ children, onError }: { children: ReactNode; onError: (message: string) => void }) {
  const [state, setState] = useState<DesktopWindowState>({ maximized: false, focused: true });
  const modalActive = useModalActive(), report = useRef(onError); report.current = onError;
  useEffect(() => {
    let active = true, receivedEvent = false;
    const off = window.desktop.onWindowState(next => { receivedEvent = true; if (active) setState(next); });
    void window.desktop.getWindowState().then(next => { if (active && !receivedEvent) setState(next); }).catch(error => { if (active) report.current(errorText(error)); });
    return () => { active = false; off(); };
  }, []);
  const act = (action: WindowAction) => void window.desktop.windowAction(action).catch(error => report.current(errorText(error)));
  return <header className={`app-header custom-titlebar${state.focused ? '' : ' is-inactive'}`} aria-label="应用窗体栏">
    <div className="titlebar-page-actions" inert={modalActive}>{children}</div>
    <div className="window-controls" role="group" aria-label="窗口控制">
      <button type="button" aria-label="最小化窗口" onClick={() => act('minimize')}><svg aria-hidden="true" width="12" height="12" viewBox="0 0 12 12"><path d="M1 6h10" fill="none" stroke="currentColor"/></svg></button>
      <button type="button" aria-label={state.maximized ? '还原窗口' : '最大化窗口'} onClick={() => act('toggle-maximize')}>
        <svg aria-hidden="true" width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor">{state.maximized ? <><path d="M4 1h7v7H9M4 3V1"/><rect x="1" y="4" width="7" height="7"/></> : <rect x="1.5" y="1.5" width="9" height="9"/>}</svg>
      </button>
      <button type="button" className="window-close" aria-label="关闭窗口" onClick={() => act('close')}><svg aria-hidden="true" width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.2"><path d="m1.5 1.5 9 9m0-9-9 9"/></svg></button>
    </div>
  </header>;
}
