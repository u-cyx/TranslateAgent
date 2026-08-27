const { contextBridge, ipcRenderer } = require('electron');
let deltaCb = null, doneCb = null, errorCb = null;
let wordDeltaCb = null, wordDoneCb = null, wordErrorCb = null;
ipcRenderer.on('chat:delta', (_e, d) => deltaCb && deltaCb(d));
ipcRenderer.on('chat:done', (_e, d) => doneCb && doneCb(d));
ipcRenderer.on('chat:error', (_e, d) => errorCb && errorCb(d));
ipcRenderer.on('word:delta', (_e, d) => wordDeltaCb && wordDeltaCb(d));
ipcRenderer.on('word:done', (_e, d) => wordDoneCb && wordDoneCb(d));
ipcRenderer.on('word:error', (_e, d) => wordErrorCb && wordErrorCb(d));
contextBridge.exposeInMainWorld('agent', {
  getConfig: () => ipcRenderer.invoke('config:get'),
  saveConfig: (b) => ipcRenderer.invoke('config:save', b),
  probeModels: (b) => ipcRenderer.invoke('models:probe', b),
  translate: (b) => ipcRenderer.invoke('translate', b),
  streamChat: (b) => ipcRenderer.invoke('chat:stream', b),
  streamWord: (b) => ipcRenderer.invoke('word:stream', b),
  wordLocal: (b) => ipcRenderer.invoke('word:local', b),
  addHistory: (b) => ipcRenderer.invoke('history:add', b),
  readHistory: (b) => ipcRenderer.invoke('history:read', b),
  clearHistory: () => ipcRenderer.invoke('history:clear'),
  favList: () => ipcRenderer.invoke('fav:list'),
  favAdd: (b) => ipcRenderer.invoke('fav:add', b),
  favRemove: (b) => ipcRenderer.invoke('fav:remove', b),
  favCheck: (b) => ipcRenderer.invoke('fav:check', b),
  onDelta: (fn) => (deltaCb = fn),
  onDone: (fn) => (doneCb = fn),
  onError: (fn) => (errorCb = fn),
  onWordDelta: (fn) => (wordDeltaCb = fn),
  onWordDone: (fn) => (wordDoneCb = fn),
  onWordError: (fn) => (wordErrorCb = fn),
});
