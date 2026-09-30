import { useEffect, useState } from 'react';
import type { LibraryProgress } from '../shared/types';
import { BackButton } from './BackButton';
import { errorText } from './hooks';

export function SettingsPage({ busy, back, currentDirectory, changeDirectory }: {
  busy: boolean; back: () => void; currentDirectory: string; changeDirectory: (directory: string) => Promise<void>;
}) {
  const [directory, setDirectory] = useState(''), [progress, setProgress] = useState<LibraryProgress | null>(null);
  const [error, setError] = useState(''), [saving, setSaving] = useState(false), [message, setMessage] = useState('');
  useEffect(() => window.desktop.onLibraryProgress(setProgress), []);
  return <section className="page-content settings-page" aria-label="设置">
    <header className="page-heading"><BackButton disabled={busy || saving} onClick={back}/><h1>设置</h1></header>
    <h2>素材库位置</h2>
    <p className="destination-path">当前目录：{currentDirectory || '正在读取…'}</p>
    <p>图片、视频和草稿共同保存在这里。更换位置会复制并校验现有资料，成功后立即切换；旧目录保留。</p>
    <div className="controls"><button disabled={busy || saving} onClick={() => {
      setError(''); setMessage('');
      void window.desktop.pickLibraryDirectory().then(value => { if (value) setDirectory(value); }).catch(e => setError(errorText(e)));
    }}>选择文件夹</button></div>
    {directory && <p className="destination-path">新目录：{directory}</p>}
    <p>请选择空文件夹。复制期间可取消，取消或失败时继续使用原目录。</p>
    <div className="controls"><button disabled={busy || saving || !directory || directory === currentDirectory} onClick={async () => {
      setError(''); setMessage(''); setProgress({ percent: 0, message: '正在检查素材库…' }); setSaving(true);
      try { await changeDirectory(directory); setDirectory(''); setMessage('已切换到新素材库，旧目录保留。'); }
      catch (e) { setError(errorText(e)); }
      finally { setSaving(false); setProgress(null); }
    }}>应用新位置</button>{saving && <button onClick={() => void window.desktop.cancelLibraryChange().catch(e => setError(errorText(e)))}>取消迁移</button>}</div>
    {saving && progress && <div role="status"><p>{progress.message}</p><progress aria-label="素材库迁移进度" value={progress.percent} max="100"/></div>}
    {error && <p role="alert">{error}</p>}{message && <p role="status">{message}</p>}
  </section>;
}
