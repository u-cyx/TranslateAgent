const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { readConfig, writeConfig, maskKey, probeModels, translate, streamChat, buildWordMessages, word, searchLocalWord, addHistory, readHistory, clearHistory, readFavorites, addFavorite, removeFavorite, isFavorite } = require('../lib');

let win;

function createWindow() {
  win = new BrowserWindow({
    width: 1000,
    height: 680,
    minWidth: 720,
    minHeight: 500,
    title: 'Translate Agent',
    icon: path.join(__dirname, 'app.ico'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, 'index.html'));
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

ipcMain.handle('config:get', () => { const c = readConfig(); return { ...c, apiKey: maskKey(c.apiKey) }; });
ipcMain.handle('config:save', (_e, body) => {
  const cur = readConfig();
  writeConfig({ apiBase: body.apiBase ?? cur.apiBase, apiKey: body.apiKey ?? cur.apiKey, model: body.model ?? cur.model, target: body.target ?? cur.target, wordDifficulty: body.wordDifficulty ?? cur.wordDifficulty });
  return { ok: true };
});
ipcMain.handle('models:probe', async (_e, body) => {
  try { const cur = readConfig(); const models = await probeModels(body.apiBase ?? cur.apiBase, body.apiKey ?? cur.apiKey); return { models }; }
  catch (e) { return { error: e.message }; }
});
ipcMain.handle('translate', async (_e, body) => {
  try { return { translation: await translate(body.text, body.target) }; }
  catch (e) { return { error: e.message }; }
});
ipcMain.handle('chat:stream', async (e, body) => {
  try {
    for await (const delta of streamChat(body.messages)) {
      if (win && !win.isDestroyed()) win.webContents.send('chat:delta', { id: body.id, delta });
    }
    if (win && !win.isDestroyed()) win.webContents.send('chat:done', { id: body.id });
  } catch (err) {
    if (win && !win.isDestroyed()) win.webContents.send('chat:error', { id: body.id, error: err.message });
  }
});
ipcMain.handle('word:local', (_e, body) => {
  return { result: searchLocalWord(body.word) };
});
let wordAbort = null;
ipcMain.handle('word:stream', async (e, body) => {
  if (wordAbort) { wordAbort.abort(); }
  wordAbort = new AbortController();
  const sig = wordAbort.signal;
  try {
    const cfg = readConfig();
    const messages = buildWordMessages(body.word, cfg.wordDifficulty || '高考', body.localMeaning || null);
    for await (const delta of streamChat(messages, null, sig)) {
      if (sig.aborted) return;
      if (win && !win.isDestroyed()) win.webContents.send('word:delta', { id: body.id, delta });
    }
    if (win && !win.isDestroyed()) win.webContents.send('word:done', { id: body.id });
  } catch (err) {
    if (err.name === 'AbortError') return;
    if (win && !win.isDestroyed()) win.webContents.send('word:error', { id: body.id, error: err.message });
  }
});
ipcMain.handle('history:add', (_e, body) => { addHistory(body.type, body.data); return { ok: true }; });
ipcMain.handle('history:read', (_e, body) => { return readHistory(body && body.filter); });
ipcMain.handle('history:clear', () => { clearHistory(); return { ok: true }; });
ipcMain.handle('fav:list', () => { return readFavorites(); });
ipcMain.handle('fav:add', (_e, body) => { addFavorite(body.word, body.note); return { ok: true }; });
ipcMain.handle('fav:remove', (_e, body) => { removeFavorite(body.word); return { ok: true }; });
ipcMain.handle('fav:check', (_e, body) => { return { fav: isFavorite(body.word) }; });
