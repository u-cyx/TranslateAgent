const $ = (id) => document.getElementById(id);
const toast = (msg, err = false) => {
  const t = $('toast');
  t.textContent = msg; t.className = 'toast show' + (err ? ' err' : '');
  setTimeout(() => (t.className = 'toast'), 2500);
};

let chatHistory = [];
let chatStreaming = false;
let chatId = 0;

function switchView(name) {
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.view === name));
  document.querySelectorAll('.view').forEach((v) => v.classList.toggle('active', v.id === 'view-' + name));
}
document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => switchView(t.dataset.view)));

async function loadConfig() {
  const cfg = await window.agent.getConfig();
  $('cfgBase').value = cfg.apiBase || '';
  $('cfgKey').value = '';
  $('cfgKey').placeholder = cfg.apiKey ? `${cfg.apiKey}（已保存，留空则不修改）` : 'sk-...';
  if (cfg.model) {
    const sel = $('cfgModel');
    if (![...sel.options].some((o) => o.value === cfg.model)) sel.append(new Option(cfg.model, cfg.model));
    sel.value = cfg.model;
  }
  const wd = cfg.wordDifficulty || '高考';
  $('cfgWordDiff').value = wd;
  $('wordDiff').value = wd;
  updateStatus(cfg.apiBase && cfg.apiKey && cfg.model);
}
function updateStatus(ok) {
  const b = $('statusBadge');
  b.textContent = ok ? '就绪' : '未配置';
  b.className = 'badge' + (ok ? ' ok' : '');
}

$('btnProbe').addEventListener('click', async () => {
  const apiBase = $('cfgBase').value.trim();
  const apiKey = $('cfgKey').value.trim() || undefined;
  if (!apiBase) return toast('请先填写 API 地址', true);
  const btn = $('btnProbe'); btn.disabled = true; btn.textContent = '探测中…';
  try {
    const r = await window.agent.probeModels({ apiBase, apiKey });
    if (r.error) throw new Error(r.error);
    const sel = $('cfgModel'); sel.innerHTML = '';
    r.models.forEach((m) => sel.append(new Option(m, m)));
    if (!r.models.length) sel.append(new Option('（未获取到模型）', ''));
    toast(`已获取 ${r.models.length} 个模型`);
  } catch (e) { toast(e.message, true); }
  finally { btn.disabled = false; btn.textContent = '探测模型'; }
});

$('btnSave').addEventListener('click', async () => {
  const r = await window.agent.saveConfig({
    apiBase: $('cfgBase').value.trim() || undefined,
    apiKey: $('cfgKey').value.trim() || undefined,
    model: $('cfgModel').value || undefined,
    wordDifficulty: $('cfgWordDiff').value || undefined,
  });
  if (r.error) return toast(r.error, true);
  toast('配置已保存'); await loadConfig();
});

$('btnTranslate').addEventListener('click', async () => {
  const text = $('srcText').value.trim();
  if (!text) return toast('请输入原文', true);
  $('trLoading').style.display = ''; $('outText').textContent = '';
  const r = await window.agent.translate({ text, target: $('targetLang').value });
  $('trLoading').style.display = 'none';
  if (r.error) return toast(r.error, true);
  $('outText').textContent = r.translation;
  window.agent.addHistory({ type: 'translate', data: { input: text.slice(0, 500), output: r.translation.slice(0, 500) } });
});

$('btnSwap').addEventListener('click', () => { const s = $('srcText').value; $('srcText').value = $('outText').textContent; $('outText').textContent = s; });
$('btnClearTr').addEventListener('click', () => { $('srcText').value = ''; $('outText').textContent = ''; });

let wordId = 0;
let wordBusy = false;

async function doWord() {
  const w = $('wordInput').value.trim();
  if (!w) return toast('请输入要查询的单词', true);
  const cfg = await window.agent.getConfig();
  if (!cfg.model) { toast('请先在设置中配置 API 和模型', true); switchView('settings'); return; }
  wordBusy = true; $('btnWord').disabled = true;
  const out = $('wordOut');
  const diff = $('wordDiff').value;

  wordId++;
  const local = await window.agent.wordLocal({ word: w });
  if (local && local.result) {
    out.textContent = local.result + '\n\n--- AI 拓展生成中（近义词/派生词/搭配/例句）… ---\n';
    out._text = out.textContent;
    out.setAttribute('data-wid', wordId);
    await window.agent.streamWord({ id: wordId, word: w, difficulty: diff, localMeaning: local.result });
    return;
  }

  out.innerHTML = '<span class="spin"></span> 本地词典未收录，调用 AI 完整查询中…';
  out._text = '';
  out.setAttribute('data-wid', wordId);
  await window.agent.streamWord({ id: wordId, word: w, difficulty: diff });
}

window.agent.onWordDelta((d) => {
  if (d.id !== wordId) return;
  const el = $('wordOut');
  if (el.getAttribute('data-wid') != d.id) return;
  if (!el._text) { el._text = ''; el.textContent = ''; }
  el._text += d.delta;
  el.textContent = el._text;
  el.scrollTop = el.scrollHeight;
});
window.agent.onWordDone((d) => {
  if (d.id !== wordId) return;
  wordBusy = false; $('btnWord').disabled = false;
  const el = $('wordOut');
  if (el && !el._text) el.textContent = '（空回复）';
  const w = $('wordInput').value.trim();
  if (w) window.agent.addHistory({ type: 'word', data: { word: w } });
});
window.agent.onWordError((d) => {
  if (d.id !== wordId) return;
  wordBusy = false; $('btnWord').disabled = false;
  const el = $('wordOut');
  if (el) el.textContent = '错误：' + d.error;
});

$('btnWord').addEventListener('click', doWord);
$('wordInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); doWord(); } });
$('btnClearWord').addEventListener('click', () => { $('wordInput').value = ''; $('wordOut').innerHTML = '<span style="color:var(--muted)">输入单词后回车，将显示详细释义、近义词、派生词、例句等…</span>'; });
$('wordDiff').addEventListener('change', async () => { await window.agent.saveConfig({ wordDifficulty: $('wordDiff').value }); $('cfgWordDiff').value = $('wordDiff').value; });

function addMsg(role, text) {
  const log = $('chatLog');
  const d = document.createElement('div');
  d.className = 'msg ' + role; d.textContent = text;
  log.appendChild(d); log.scrollTop = log.scrollHeight;
  return d;
}

window.agent.onDelta((d) => {
  if (d.id !== chatId) return;
  const el = document.querySelector(`[data-cid="${d.id}"]`);
  if (!el) return;
  el._text += d.delta; el.textContent = el._text;
  $('chatLog').scrollTop = $('chatLog').scrollHeight;
});
window.agent.onDone((d) => {
  if (d.id !== chatId) return;
  chatStreaming = false; $('btnSend').disabled = false;
  const el = document.querySelector(`[data-cid="${d.id}"]`);
  if (el && !el._text) el.textContent = '（空回复）';
  if (el && el._text) {
    chatHistory.push({ role: 'assistant', content: el._text });
    const lastUser = chatHistory.filter(m => m.role === 'user').pop();
    if (lastUser) window.agent.addHistory({ type: 'chat', data: { preview: lastUser.content.slice(0, 80) + ' → ' + el._text.slice(0, 80) } });
  }
});
window.agent.onError((d) => {
  if (d.id !== chatId) return;
  chatStreaming = false; $('btnSend').disabled = false;
  const el = document.querySelector(`[data-cid="${d.id}"]`);
  if (el) el.textContent = '错误：' + d.error;
});

async function sendChat() {
  if (chatStreaming) return;
  const text = $('chatInput').value.trim();
  if (!text) return;
  const cfg = await window.agent.getConfig();
  if (!cfg.model) { toast('请先在设置中配置 API 和模型', true); switchView('settings'); return; }
  chatStreaming = true; $('btnSend').disabled = true;
  addMsg('user', text); chatHistory.push({ role: 'user', content: text }); $('chatInput').value = '';
  chatId++;
  const el = addMsg('assistant', ''); el.setAttribute('data-cid', chatId); el._text = '';
  await window.agent.streamChat({ id: chatId, messages: chatHistory });
}

$('btnSend').addEventListener('click', sendChat);
$('chatInput').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat(); } });
$('btnClearChat').addEventListener('click', () => { chatHistory = []; $('chatLog').innerHTML = ''; addMsg('system', '对话已清空。'); });

$('btnFavWord').addEventListener('click', async () => {
  const w = $('wordInput').value.trim();
  if (!w) return toast('请先输入单词', true);
  const chk = await window.agent.favCheck({ word: w });
  if (chk.fav) { await window.agent.favRemove({ word: w }); toast('已取消收藏: ' + w); }
  else { await window.agent.favAdd({ word: w }); toast('已收藏: ' + w); }
  updateFavBtn(w);
});

async function updateFavBtn(w) {
  if (!w) { $('btnFavWord').textContent = '★ 收藏'; return; }
  const chk = await window.agent.favCheck({ word: w });
  $('btnFavWord').textContent = chk.fav ? '★ 已收藏' : '★ 收藏';
}

$('wordInput').addEventListener('input', () => { updateFavBtn($('wordInput').value.trim()); });

async function loadFavs() {
  const list = await window.agent.favList();
  $('favCount').textContent = list.length + ' 词';
  const el = $('favList');
  if (!list.length) { el.innerHTML = '<span style="color:var(--muted);padding:20px">单词本为空。查词时点击 ★ 收藏 按钮添加。</span>'; return; }
  el.innerHTML = '';
  list.slice().reverse().forEach((f) => {
    const d = document.createElement('div');
    d.style.cssText = 'display:flex;align-items:center;gap:10px;padding:10px 12px;border-bottom:1px solid var(--border)';
    const dt = new Date(f.time);
    const ts = (dt.getMonth()+1) + '/' + dt.getDate();
    d.innerHTML = '<span style="font-size:16px;width:30px;text-align:center">★</span>' +
      '<span style="font-size:15px;font-weight:600;min-width:120px">' + escapeHtml(f.word) + '</span>' +
      '<span style="color:var(--muted);font-size:12px;flex:1">' + escapeHtml(f.note || '') + '</span>' +
      '<span style="color:var(--muted);font-size:11px">' + ts + '</span>' +
      '<button class="btn sm" data-fav-del="' + encodeURIComponent(f.word) + '">删除</button>' +
      '<button class="btn sm" data-fav-query="' + encodeURIComponent(f.word) + '">查询</button>';
    el.appendChild(d);
  });
  el.querySelectorAll('[data-fav-del]').forEach((b) => b.addEventListener('click', async () => {
    await window.agent.favRemove({ word: decodeURIComponent(b.getAttribute('data-fav-del')) });
    loadFavs();
  }));
  el.querySelectorAll('[data-fav-query]').forEach((b) => b.addEventListener('click', () => {
    const w = decodeURIComponent(b.getAttribute('data-fav-query'));
    switchView('word');
    $('wordInput').value = w;
    doWord();
  }));
}

$('btnExportFav').addEventListener('click', async () => {
  const list = await window.agent.favList();
  if (!list.length) return toast('单词本为空', true);
  const text = list.map((f) => f.word + (f.note ? '\t' + f.note : '')).join('\n');
  const blob = new Blob([text], { type: 'text/plain' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'favorites.txt';
  a.click();
  toast('已导出 ' + list.length + ' 词');
});

function fmtTime(t) {
  const d = new Date(t);
  return (d.getMonth()+1) + '/' + d.getDate() + ' ' + d.getHours() + ':' + String(d.getMinutes()).padStart(2, '0');
}

async function loadHistory() {
  const filter = $('histFilter').value;
  const list = await window.agent.readHistory(filter ? { filter } : {});
  const el = $('histList');
  if (!list.length) { el.innerHTML = '<span style="color:var(--muted);padding:20px">暂无历史记录。</span>'; return; }
  el.innerHTML = '';
  list.slice().reverse().forEach((e) => {
    const d = document.createElement('div');
    d.style.cssText = 'padding:10px 12px;border-bottom:1px solid var(--border);cursor:pointer';
    const icon = { translate: '🌐', word: '📖', chat: '💬' }[e.type] || '•';
    let preview = '';
    if (e.type === 'translate') preview = e.data.input + ' → ' + e.data.output;
    else if (e.type === 'word') preview = e.data.word;
    else if (e.type === 'chat') preview = e.data.preview;
    d.innerHTML = '<span style="color:var(--muted);font-size:11px">' + fmtTime(e.time) + '</span> ' +
      '<span style="font-size:13px">' + icon + ' ' + escapeHtml(preview.slice(0, 80)) + '</span>';
    d.addEventListener('click', () => {
      if (e.type === 'word') { switchView('word'); $('wordInput').value = e.data.word; doWord(); }
      else if (e.type === 'translate') { switchView('translate'); $('srcText').value = e.data.input; }
    });
    el.appendChild(d);
  });
}

$('histFilter').addEventListener('change', loadHistory);
$('btnClearHist').addEventListener('click', async () => {
  if (!confirm('确定清空所有历史记录？')) return;
  await window.agent.clearHistory();
  loadHistory();
  toast('历史已清空');
});

document.querySelectorAll('.tab').forEach((t) => {
  t.addEventListener('click', () => {
    if (t.dataset.view === 'favs') loadFavs();
    if (t.dataset.view === 'history') loadHistory();
  });
});

function escapeHtml(s) { return String(s).replace(/&/g,'&').replace(/</g,'<').replace(/>/g,'>'); }

loadConfig();
addMsg('system', '欢迎使用 Translate Agent。在「设置」中配置 API 后即可开始翻译或对话。');
