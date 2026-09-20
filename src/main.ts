import { app, BrowserWindow, ipcMain, dialog, protocol, net, clipboard, shell, Menu } from 'electron';
import started from 'electron-squirrel-startup';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { promises as fs } from 'node:fs';
import { z } from 'zod';
import { Store, uuid } from './core/store';
import { MediaService } from './core/service';
import { messageOf } from './core/io';
import type { JobKind } from './shared/types';

declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string;
declare const MAIN_WINDOW_VITE_NAME: string;
if (started) app.quit();
if (process.env.SOCIAL_COPY_DATA_DIRECTORY) app.setPath('userData', path.resolve(process.env.SOCIAL_COPY_DATA_DIRECTORY));
app.setName('SocialCopyStudio');
app.setAppUserModelId('SocialCopyStudio');
protocol.registerSchemesAsPrivileged([{ scheme: 'media', privileges: { standard: true, secure: true, stream: true, supportFetchAPI: true } }]);
let window: BrowserWindow | null = null;
let service: MediaService;
let readyToClose = false;
const ownsLock = app.requestSingleInstanceLock();
if (!ownsLock) app.quit();
app.on('second-instance', () => { window?.restore(); window?.focus(); });

function register(name: string, handler: (...args: any[]) => unknown) {
  ipcMain.handle(name, async (event, ...args) => {
    if (!window || event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame) throw new Error('无效的应用请求');
    try { return await handler(...args); }
    catch (error) { throw new Error(error instanceof z.ZodError ? '输入参数无效' : messageOf(error)); }
  });
}
if (ownsLock && !started) app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);
  const root = path.join(app.getPath('userData'), 'library');
  const store = new Store(root); await store.init();
  const mediaRoot = app.isPackaged ? path.join(process.resourcesPath, 'media') : path.join(app.getAppPath(), 'resources/media');
  service = new MediaService(store, { ffmpeg: path.join(mediaRoot, 'ffmpeg.exe'), ffprobe: path.join(mediaRoot, 'ffprobe.exe') }, job => {
    if (window && !window.isDestroyed()) window.webContents.send('jobs:update', job);
  });
  protocol.handle('media', async request => {
    try {
      const url = new URL(request.url), parts = url.pathname.split('/').filter(Boolean);
      if (parts.length !== 2 || !['asset', 'source'].includes(url.hostname)) return new Response('Not found', { status: 404 });
      const [id, role] = parts; uuid.parse(id);
      const file = url.hostname === 'asset' ? await store.assetPath(id, role) : role === 'video' ? await store.sourcePath(id) : '';
      if (!file) return new Response('Not found', { status: 404 });
      return net.fetch(pathToFileURL(file).href, { headers: request.headers });
    } catch { return new Response('Not found', { status: 404 }); }
  });
  const approvedDirectories = new Set<string>();
  register('drafts:list', () => store.list());
  register('drafts:create', platform => store.create(platform));
  register('drafts:save', draft => store.save(draft));
  register('drafts:duplicate', id => store.duplicate(uuid.parse(id)));
  register('drafts:delete', id => store.remove(uuid.parse(id)));
  register('dialog:images', async () => (await dialog.showOpenDialog(window!, { title: '选择图片', properties: ['openFile', 'multiSelections'], filters: [{ name: '图片', extensions: ['jpg', 'jpeg', 'png', 'webp'] }] })).filePaths);
  register('dialog:video', async () => (await dialog.showOpenDialog(window!, { title: '选择视频', properties: ['openFile'], filters: [{ name: '视频', extensions: ['mp4', 'mov'] }] })).filePaths[0] || null);
  register('dialog:directory', async () => {
    const result = await dialog.showOpenDialog(window!, { title: '选择导出位置', properties: ['openDirectory', 'createDirectory'] });
    const directory = result.filePaths[0]; if (directory) approvedDirectories.add(path.resolve(directory)); return directory || null;
  });
  register('jobs:start', (id: string, kind: JobKind, payload: unknown) => {
    if (kind === 'export') { const p = z.object({ directory: z.string() }).parse(payload); if (!approvedDirectories.has(path.resolve(p.directory))) throw new Error('请通过“选择位置”指定导出文件夹'); }
    service.start(id, kind, payload);
  });
  register('jobs:cancel', id => service.cancel(id));
  register('clipboard:write', value => clipboard.writeText(z.string().max(100000).parse(value)));
  register('shell:reveal', file => { if (!service.exported.has(file)) throw new Error('只能打开本次导出的素材位置'); shell.showItemInFolder(file); });
  register('help:open', async () => {
    const help = app.isPackaged ? path.join(process.resourcesPath, '使用说明.md') : path.join(app.getAppPath(), 'docs/使用说明.md');
    const error = await shell.openPath(help); if (error) throw new Error('无法打开使用说明，请在安装目录中查看');
  });
  register('app:info', () => ({ version: app.getVersion(), dataDirectory: root, compatibility: 'iPhone / Android 真机兼容性待验证' }));
  register('app:close-ready', async () => { service.cancelAll(); await service.waitForIdle(); readyToClose = true; window?.close(); });
  window = new BrowserWindow({ width: 1440, height: 930, minWidth: 1080, minHeight: 720, backgroundColor: '#f6f5f0', title: '片语 · 图文工作台', icon: app.isPackaged ? path.join(process.resourcesPath, 'icon.ico') : path.join(app.getAppPath(), 'resources/icon.ico'), show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false, webSecurity: true } });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', event => event.preventDefault());
  window.webContents.session.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
  window.on('close', event => {
    if (readyToClose) return;
    event.preventDefault();
    if (service.active()) {
      const result = dialog.showMessageBoxSync(window!, { type: 'question', title: '退出片语', message: '还有任务正在处理。退出将取消未完成任务。', buttons: ['继续处理', '保存草稿并退出'], defaultId: 0, cancelId: 0 });
      if (result === 0) return;
    }
    window!.webContents.send('app:closing');
  });
  window.once('ready-to-show', () => window?.show());
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) await window.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  else await window.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`));
}).catch(error => { dialog.showErrorBox('片语启动失败', messageOf(error)); app.quit(); });
app.on('window-all-closed', () => { service?.cancelAll(); app.quit(); });
