const fs = require('fs');
const path = require('path');
const os = require('os');

const CONFIG_DIR = path.join(os.homedir(), '.translate-agent');
const CONFIG_PATH = path.join(CONFIG_DIR, 'config.json');

let _dictPath = null;
let _dictData = null;
let _dictChecked = false;

function findDictionary() {
  if (_dictChecked) return _dictPath;
  _dictChecked = true;
  if (global.__DICT_DATA__) { _dictData = global.__DICT_DATA__; return 'embedded'; }
  const exeDir = path.dirname(process.execPath);
  const candidates = [
    path.join(exeDir, 'words.json'),
    path.join(exeDir, 'dictionary', 'words.json'),
  ];
  if (typeof process !== 'undefined' && process.resourcesPath) {
    candidates.push(path.join(process.resourcesPath, 'app', 'words.json'));
    candidates.push(path.join(process.resourcesPath, 'app', 'dictionary', 'words.json'));
  }
  if (__dirname && fs.existsSync(__dirname)) {
    candidates.push(path.join(__dirname, 'dictionary', 'words.json'));
    candidates.push(path.join(__dirname, '..', 'dictionary', 'words.json'));
    candidates.push(path.join(__dirname, 'words.json'));
  }
  for (const p of candidates) {
    if (fs.existsSync(p)) { _dictPath = p; return p; }
  }
  return null;
}

function searchLocalWord(word) {
  const dictPath = findDictionary();
  if (!dictPath) return null;
  try {
    if (!_dictData) {
      const raw = fs.readFileSync(dictPath, 'utf8');
      _dictData = JSON.parse(raw);
    }
    const key = word.toLowerCase().trim();
    const entry = _dictData[key];
    if (!entry) return null;
    let phonetic, trans;
    if (Array.isArray(entry)) {
      if (entry.length >= 2) { phonetic = entry[0]; trans = entry[1]; }
      else { phonetic = ''; trans = entry[0]; }
    } else {
      phonetic = entry.p || ''; trans = entry.t || '';
    }
    if (!trans) return null;
    const isChinese = /[\u4e00-\u9fff]/.test(word);
    let result;
    if (isChinese) {
      result = '【本地词典】\n' +
        `【释义】${trans}\n` +
        (phonetic ? `【音标】${phonetic}\n` : '');
    } else {
      result = '【本地词典】\n' +
        `【单词】${word}\n` +
        (phonetic ? `【音标】/${phonetic}/\n` : '') +
        `【释义】${trans.replace(/;/g, '\n')}\n`;
    }
    return result;
  } catch { return null; }
}

function getExeDir() {
  const exeName = path.basename(process.execPath).toLowerCase();
  if (exeName.includes('node') || exeName.includes('electron')) return __dirname;
  return path.dirname(process.execPath);
}

function getDataDir() {
  if (process.env.TA_DATA_DIR) return process.env.TA_DATA_DIR;
  return path.join(getExeDir(), 'data');
}

const HISTORY_PATH = () => path.join(getDataDir(), 'history.json');
const FAVORITES_PATH = () => path.join(getDataDir(), 'favorites.json');
const HISTORY_MAX_BYTES = 30 * 1048576;

function readJson(p, fallback) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return fallback; }
}

function addHistory(type, data) {
  try {
    const dir = getDataDir();
    fs.mkdirSync(dir, { recursive: true });
    const p = HISTORY_PATH();
    const list = readJson(p, []);
    list.push({ type, ...data, time: Date.now() });
    let json = JSON.stringify(list);
    while (Buffer.byteLength(json, 'utf8') > HISTORY_MAX_BYTES && list.length > 1) {
      list.shift();
      json = JSON.stringify(list);
    }
    fs.writeFileSync(p, json, 'utf8');
  } catch {}
}

function readHistory(filter) {
  const list = readJson(HISTORY_PATH(), []);
  if (!filter) return list;
  return list.filter((e) => e.type === filter);
}

function clearHistory() {
  try { fs.writeFileSync(HISTORY_PATH(), '[]', 'utf8'); } catch {}
}

function readFavorites() {
  return readJson(FAVORITES_PATH(), []);
}

function addFavorite(word, note) {
  try {
    const dir = getDataDir();
    fs.mkdirSync(dir, { recursive: true });
    const p = FAVORITES_PATH();
    const list = readJson(p, []);
    if (!list.find((e) => e.word === word)) {
      list.push({ word, note: note || '', time: Date.now() });
      fs.writeFileSync(p, JSON.stringify(list), 'utf8');
    }
  } catch {}
}

function removeFavorite(word) {
  try {
    const p = FAVORITES_PATH();
    const list = readJson(p, []);
    const filtered = list.filter((e) => e.word !== word);
    fs.writeFileSync(p, JSON.stringify(filtered), 'utf8');
  } catch {}
}

function isFavorite(word) {
  const list = readJson(FAVORITES_PATH(), []);
  return list.some((e) => e.word === word);
}

const LANGUAGES = [
  { id: 'auto', name: '自动中英互转' },
  { id: '中文', name: '中文' },
  { id: 'English', name: 'English' },
  { id: '日本語', name: '日本語' },
  { id: '한국어', name: '한국어' },
  { id: 'Français', name: 'Français' },
  { id: 'Deutsch', name: 'Deutsch' },
  { id: 'Español', name: 'Español' },
  { id: 'Русский', name: 'Русский' },
  { id: 'Português', name: 'Português' },
  { id: 'Italiano', name: 'Italiano' },
  { id: 'العربية', name: 'العربية' },
  { id: 'हिन्दी', name: 'हिन्दी' },
  { id: 'ไทย', name: 'ไทย' },
  { id: 'Tiếng Việt', name: 'Tiếng Việt' },
];

const DIFFICULTIES = [
  { id: '初中', name: '初中' },
  { id: '高中', name: '高中' },
  { id: '高考', name: '高考' },
  { id: '四级', name: '四级 (CET-4)' },
  { id: '六级', name: '六级 (CET-6)' },
  { id: '考研', name: '考研' },
  { id: '专四', name: '专四 (TEM-4)' },
  { id: '专八', name: '专八 (TEM-8)' },
  { id: '雅思', name: '雅思 (IELTS)' },
  { id: '托福', name: '托福 (TOEFL)' },
  { id: 'GRE', name: 'GRE' },
];

function defaultConfig() {
  return { apiBase: '', apiKey: '', model: '', target: 'auto', wordDifficulty: '高考' };
}

function resolveTarget(target, text) {
  if (target && target !== 'auto') return target;
  return /[\u4e00-\u9fff]/.test(text) ? 'English' : '中文';
}

function readConfig() {
  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
    return { ...defaultConfig(), ...JSON.parse(raw) };
  } catch {
    return defaultConfig();
  }
}

function writeConfig(cfg) {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  const cur = readConfig();
  const next = { ...defaultConfig(), ...cur, ...cfg };
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(next, null, 2), 'utf-8');
  return next;
}

function maskKey(k) {
  if (!k) return '';
  return k.length > 8 ? k.slice(0, 4) + '****' + k.slice(-4) : '****';
}

function trimBase(b) {
  if (!b) return '';
  return b.replace(/\/+$/, '');
}

function modelsUrl(apiBase) {
  const base = trimBase(apiBase);
  return base.endsWith('/v1') ? `${base}/models` : `${base}/v1/models`;
}

function chatUrl(apiBase) {
  const base = trimBase(apiBase);
  return base.endsWith('/v1') ? `${base}/chat/completions` : `${base}/v1/chat/completions`;
}

async function probeModels(apiBase, apiKey) {
  if (!apiBase) throw new Error('API 地址为空');
  if (!apiKey) throw new Error('API Key 为空');
  const r = await fetch(modelsUrl(apiBase), {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!r.ok) {
    const t = await r.text().catch(() => '');
    throw new Error(`探测失败 (${r.status}): ${t.slice(0, 200)}`);
  }
  const j = await r.json();
  const list = (j.data || j.models || []).map((m) => m.id || m.name).filter(Boolean);
  return list;
}

function buildTranslateMessages(text, target) {
  const sys =
    `You are a professional translation engine. Translate the user's text into ${target}. ` +
    `Return ONLY the translated text, without explanations, notes, or quotation marks. ` +
    `Preserve formatting, code blocks, and placeholders.`;
  return [
    { role: 'system', content: sys },
    { role: 'user', content: text },
  ];
}

async function translate(text, target, cfg) {
  const c = cfg || readConfig();
  if (!c.apiBase || !c.apiKey || !c.model) throw new Error('请先配置 API（运行 tran setup）');
  const t = resolveTarget(target, text);
  const r = await fetch(chatUrl(c.apiBase), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${c.apiKey}` },
    body: JSON.stringify({ model: c.model, messages: buildTranslateMessages(text, t), stream: false }),
  });
  if (!r.ok) {
    const t = await r.text().catch(() => '');
    throw new Error(`请求失败 (${r.status}): ${t.slice(0, 300)}`);
  }
  const j = await r.json();
  return (j.choices?.[0]?.message?.content || '').trim();
}

function buildWordMessages(word, difficulty, localMeaning) {
  const isChinese = /[\u4e00-\u9fff]/.test(word);
  const base = `You are a professional English-Chinese vocabulary learning engine, as comprehensive as Baidu Translate.\n` +
    `Respond in Chinese (keep English words/sentences in English).\n` +
    `Difficulty level: ${difficulty} — tailor the example sentences' complexity and vocabulary depth to this level.\n`;
  let sys;
  if (localMeaning) {
    sys = base +
      `The dictionary already provides the basic definition below. Do NOT repeat the definition or phonetic. ` +
      `Your job is to provide ONLY the expansion sections, using the exact headers shown.\n\n` +
      `--- Dictionary entry (known) ---\n${localMeaning}\n--- end ---\n\n` +
      (isChinese
        ? `Output EXACTLY in this format:\n` +
          `【对应英文】<all common English translations, each with a note on usage context>\n\n` +
          `【各种表达】<various ways to express this in English: formal / informal / written / spoken / slang, each with example phrase>\n\n` +
          `【用法区别】<brief comparison of when to use each expression>\n\n` +
          `【近义表达】<synonyms/related expressions with nuance distinction>\n\n` +
          `【例句】<2 example sentences at ${difficulty} level, English + Chinese translation>\n\n` +
          `【相关短语】<common related phrases/idioms>`
        : `Output EXACTLY in this format:\n` +
          `【近义词】<synonyms with a brief distinction of nuance>\n\n` +
          `【反义词】<antonyms>\n\n` +
          `【派生词】<derivatives: word family with parts of speech, e.g. paper→paperless/papery/paperwork>\n\n` +
          `【常用搭配】<common collocations / phrases>\n\n` +
          `【例句】<2 example sentences at ${difficulty} level, English + Chinese translation>\n\n` +
          `【助记】<a mnemonic tip to help remember this word>`);
  } else {
    sys = base +
      `Explain the given word thoroughly.\n\n` +
      (isChinese
        ? `The input is a Chinese word/phrase. Output EXACTLY in this format:\n` +
          `【释义】<brief Chinese explanation of the word>\n\n` +
          `【对应英文】<all common English translations, each with a note on usage context>\n\n` +
          `【各种表达】<various ways to express this in English: formal / informal / written / spoken / slang, each with example phrase>\n\n` +
          `【用法区别】<brief comparison of when to use each expression>\n\n` +
          `【近义表达】<synonyms/related expressions with nuance distinction>\n\n` +
          `【例句】<2 example sentences at ${difficulty} level, English + Chinese translation>\n\n` +
          `【相关短语】<common related phrases/idioms>`
        : `The input is an English word/phrase. Output EXACTLY in this format:\n` +
          `【单词】<the word>\n\n` +
          `【音标】<IPA pronunciation, e.g. /ˈpeɪpər/>\n\n` +
          `【词性】<part(s) of speech: n. / v. / adj. / adv. etc.>\n\n` +
          `【释义】<numbered list of ALL common meanings in Chinese, grouped by part of speech>\n\n` +
          `【近义词】<synonyms with a brief distinction of nuance>\n\n` +
          `【反义词】<antonyms>\n\n` +
          `【派生词】<derivatives: word family with parts of speech, e.g. paper→paperless/papery/paperwork>\n\n` +
          `【常用搭配】<common collocations / phrases>\n\n` +
          `【例句】<2 example sentences at ${difficulty} level, English + Chinese translation>\n\n` +
          `【助记】<a mnemonic tip to help remember this word>`);
  }
  sys += `\n\nIMPORTANT: Separate EVERY section with a blank line for readability. Be accurate, comprehensive, and professional. Use the exact section headers shown above. Do not add a preamble or closing remark.`;
  return [
    { role: 'system', content: sys },
    { role: 'user', content: word },
  ];
}

async function word(text, difficulty, localMeaning, cfg) {
  const c = cfg || readConfig();
  if (!c.apiBase || !c.apiKey || !c.model) throw new Error('请先配置 API（运行 word setup 或 tran setup）');
  const diff = difficulty || c.wordDifficulty || '高考';
  const r = await fetch(chatUrl(c.apiBase), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${c.apiKey}` },
    body: JSON.stringify({ model: c.model, messages: buildWordMessages(text, diff, localMeaning), stream: false }),
  });
  if (!r.ok) {
    const t = await r.text().catch(() => '');
    throw new Error(`请求失败 (${r.status}): ${t.slice(0, 300)}`);
  }
  const j = await r.json();
  return (j.choices?.[0]?.message?.content || '').trim();
}

async function* streamChat(messages, cfg, signal) {
  const c = cfg || readConfig();
  if (!c.apiBase || !c.apiKey || !c.model) throw new Error('请先配置 API');
  const r = await fetch(chatUrl(c.apiBase), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${c.apiKey}` },
    body: JSON.stringify({ model: c.model, messages, stream: true }),
    signal,
  });
  if (!r.ok) {
    const t = await r.text().catch(() => '');
    throw new Error(`请求失败 (${r.status}): ${t.slice(0, 300)}`);
  }
  const reader = r.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (signal && signal.aborted) { try { await reader.cancel(); } catch {} return; }
    buf += dec.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop();
    for (const line of lines) {
      const t = line.trim();
      if (!t.startsWith('data:')) continue;
      const d = t.slice(5).trim();
      if (d === '[DONE]') return;
      try {
        const j = JSON.parse(d);
        const delta = j.choices?.[0]?.delta?.content || '';
        if (delta) yield delta;
      } catch {}
    }
  }
}

module.exports = {
  CONFIG_PATH,
  LANGUAGES,
  DIFFICULTIES,
  readConfig,
  writeConfig,
  maskKey,
  probeModels,
  translate,
  resolveTarget,
  buildWordMessages,
  word,
  searchLocalWord,
  streamChat,
  getDataDir,
  addHistory,
  readHistory,
  clearHistory,
  readFavorites,
  addFavorite,
  removeFavorite,
  isFavorite,
};
