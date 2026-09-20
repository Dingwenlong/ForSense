import { contextBridge, ipcRenderer, webUtils } from 'electron';
import type { DesktopAPI, ExportJob } from './shared/types';
const api: DesktopAPI = {
  listDrafts: () => ipcRenderer.invoke('drafts:list'),
  createDraft: platform => ipcRenderer.invoke('drafts:create', platform),
  saveDraft: draft => ipcRenderer.invoke('drafts:save', draft),
  duplicateDraft: id => ipcRenderer.invoke('drafts:duplicate', id),
  deleteDraft: id => ipcRenderer.invoke('drafts:delete', id),
  pickImages: () => ipcRenderer.invoke('dialog:images'),
  pickVideo: () => ipcRenderer.invoke('dialog:video'),
  pickDirectory: () => ipcRenderer.invoke('dialog:directory'),
  pathsForFiles: files => files.map(file => webUtils.getPathForFile(file)),
  startJob: (id, kind, payload) => ipcRenderer.invoke('jobs:start', id, kind, payload),
  cancelJob: id => ipcRenderer.invoke('jobs:cancel', id),
  onJob: callback => { const handler = (_: unknown, job: ExportJob) => callback(job); ipcRenderer.on('jobs:update', handler); return () => ipcRenderer.removeListener('jobs:update', handler); },
  copyText: text => ipcRenderer.invoke('clipboard:write', text),
  reveal: path => ipcRenderer.invoke('shell:reveal', path),
  openHelp: () => ipcRenderer.invoke('help:open'),
  getInfo: () => ipcRenderer.invoke('app:info'),
  onClose: callback => { ipcRenderer.on('app:closing', callback); return () => ipcRenderer.removeListener('app:closing', callback); },
  closeReady: () => ipcRenderer.invoke('app:close-ready'),
};
contextBridge.exposeInMainWorld('desktop', api);
