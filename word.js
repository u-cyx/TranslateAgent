#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { readConfig, writeConfig, maskKey, probeModels, buildWordMessages, searchLocalWord, streamChat, addHistory, readHistory, readFavorites, addFavorite, removeFavorite, isFavorite, DIFFICULTIES } = require('./lib');

function ask(rl, q) {
  return new Promise((res) => rl.question(q, res));
}

async function setup() {
  console.log('\n=== Translate Agent 配置 ===\n');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    const cur = readConfig();
    let apiBase = (await ask(rl, `API 地址 [${cur.apiBase || 'https://api.deepseek.com'}]: `)).trim();
    if (!apiBase) apiBase = cur.apiBase || 'https://api.deepseek.com';
    let apiKey = (await ask(rl, `API Key ${cur.apiKey ? '[' + maskKey(cur.apiKey) + ' 留空保留]' : ''}: `)).trim();
    if (!apiKey) apiKey = cur.apiKey;

    console.log('\n正在探测可用模型...');
    let models;
    try {
      models = await probeModels(apiBase, apiKey);
    } catch (e) {
      console.log('探测失败:', e.message);
      const manual = (await ask(rl, '手动输入模型名 (留空取消): ')).trim();
      if (!manual) return;
      writeConfig({ apiBase, apiKey, model: manual });
      console.log(`\n已保存，模型: ${manual}`);
      return;
    }
    if (!models.length) {
      console.log('未获取到模型');
      const manual = (await ask(rl, '手动输入模型名 (留空取消): ')).trim();
      if (!manual) return;
      writeConfig({ apiBase, apiKey, model: manual });
      console.log(`\n已保存，模型: ${manual}`);
      return;
    }
    console.log('\n可用模型:');
    models.forEach((m, i) => console.log(`  [${i}] ${m}`));
    let sel = (await ask(rl, `\n选择编号 (默认 0): `)).trim();
    if (!sel) sel = '0';
    const idx = parseInt(sel, 10);
    if (isNaN(idx) || idx < 0 || idx >= models.length) {
      console.log('编号无效');
      return;
    }
    writeConfig({ apiBase, apiKey, model: models[idx] });
    console.log(`\n配置完成！模型: ${models[idx]}`);
    console.log('现在可以查词: word paper');
  } finally {
    rl.close();
  }
}

function status() {
  const cfg = readConfig();
  const curD = (DIFFICULTIES.find((d) => d.id === cfg.wordDifficulty) || { name: cfg.wordDifficulty }).name;
  console.log('\nTranslate Agent 配置');
  console.log('  配置文件  :', path.join(require('os').homedir(), '.translate-agent', 'config.json'));
  console.log('  API 地址  :', cfg.apiBase || '(未设置)');
  console.log('  API Key   :', maskKey(cfg.apiKey) || '(未设置)');
  console.log('  模型      :', cfg.model || '(未设置)');
  console.log('  单词难度  :', curD);
  if (!cfg.apiBase || !cfg.apiKey || !cfg.model) {
    console.log('\n未完成配置，请运行: word setup\n');
  } else {
    console.log('\n状态: 就绪\n');
  }
}

function list() {
  const cfg = readConfig();
  console.log('\n单词难度等级:');
  DIFFICULTIES.forEach((d, i) => {
    const mark = d.id === cfg.wordDifficulty ? ' <== 当前' : '';
    console.log(`  [${i}] ${d.name}${mark}`);
  });
  console.log('\n使用 word change 切换难度\n');
}

async function change() {
  const cfg = readConfig();
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    console.log('\n单词难度等级:');
    DIFFICULTIES.forEach((d, i) => {
      const mark = d.id === cfg.wordDifficulty ? ' <== 当前' : '';
      console.log(`  [${i}] ${d.name}${mark}`);
    });
    let sel = (await ask(rl, '\n输入序号选择难度: ')).trim();
    if (!sel) { console.log('已取消'); return; }
    const idx = parseInt(sel, 10);
    if (isNaN(idx) || idx < 0 || idx >= DIFFICULTIES.length) {
      console.log('编号无效');
      return;
    }
    writeConfig({ wordDifficulty: DIFFICULTIES[idx].id });
    console.log(`\n已切换为: ${DIFFICULTIES[idx].name}`);
  } finally {
    rl.close();
  }
}

function help() {
  console.log(`
Translate Agent 单词模式 (Word Mode)

用法:
  word paper                   查询英文单词详解（本地词典+AI拓展）
  word 你好                    查询中文对应的英文表达
  word mode                    进入持续查词模式（直接输入单词，Ctrl+C 退出）
  word list                    查看难度等级
  word change                  切换难度（输入序号）
  word fav <单词> [备注]       收藏/取消收藏单词
  word favs                    查看单词本
  word history                 查看查词历史
  word setup                   配置 API
  word status                  查看配置
  word -h                      帮助

数据存储在 exe 同目录的 data/ 文件夹下。
配置与 tran / translate_gui 共享，配一次通用。
`);
}

async function doWord(text) {
  text = (text || '').trim();
  if (!text) { console.log('请输入要查询的单词'); process.exit(1); }

  const cfg = readConfig();
  if (!cfg.apiBase || !cfg.apiKey || !cfg.model) {
    console.error('查词失败: 请先配置 API');
    console.error('运行 word setup 进行配置');
    process.exit(1);
  }

  const local = searchLocalWord(text);
  const diff = cfg.wordDifficulty || '高考';

  if (local) {
    process.stdout.write('\n' + local + '\n');
    process.stdout.write('\n--- AI 拓展生成中 ---\n');
  } else {
    process.stdout.write('\n（本地词典未收录，AI 完整查询中）\n\n');
  }

  try {
    const messages = buildWordMessages(text, diff, local);
    for await (const delta of streamChat(messages)) {
      process.stdout.write(delta);
    }
    process.stdout.write('\n\n');
    addHistory('word', { word: text, local: !!local });
  } catch (e) {
    process.stdout.write('\n\n查词失败: ' + e.message + '\n');
    process.exit(1);
  }
}

function favs() {
  const list = readFavorites();
  if (!list.length) { console.log('\n单词本为空。使用 word fav <单词> 收藏单词。\n'); return; }
  console.log('\n=== 单词本 (' + list.length + ' 词) ===\n');
  list.forEach((f, i) => {
    const star = isFavorite(f.word) ? '★' : '';
    console.log('  [' + i + '] ' + f.word + star + (f.note ? '  — ' + f.note : ''));
  });
  console.log('');
}

function fav(args) {
  const word = args.join(' ').trim();
  if (!word) { console.log('用法: word fav <单词> [备注]'); return; }
  const parts = word.split(/\s+/);
  const w = parts[0];
  const note = parts.slice(1).join(' ');
  if (isFavorite(w)) {
    removeFavorite(w);
    console.log('已从单词本移除: ' + w);
  } else {
    addFavorite(w, note);
    console.log('已收藏: ' + w + (note ? ' (备注: ' + note + ')' : ''));
  }
}

function history() {
  const list = readHistory('word');
  if (!list.length) { console.log('\n暂无查词历史。\n'); return; }
  console.log('\n=== 查词历史 (最近 ' + Math.min(list.length, 50) + ' 条) ===\n');
  const recent = list.slice(-50).reverse();
  recent.forEach((e) => {
    const d = new Date(e.time);
    const ts = d.getMonth() + 1 + '/' + d.getDate() + ' ' + d.getHours() + ':' + String(d.getMinutes()).padStart(2, '0');
    console.log('  ' + ts + '  ' + e.word + (e.local ? ' (本地)' : ' (AI)'));
  });
  console.log('');
}

async function wordMode() {
  console.log('\n=== 单词模式 (Word Mode) ===');
  console.log('直接输入单词即可查询，或使用: fav <词> | favs | history | change | exit');
  console.log('Ctrl+C 退出。\n');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  let closed = false;
  rl.on('close', () => { closed = true; process.exit(0); });
  const ask = () => {
    if (closed) return;
    rl.question('> ', async (text) => {
      if (closed) return;
      text = text.trim();
      if (!text) { ask(); return; }
      if (text === 'exit' || text === 'quit') { rl.close(); return; }
      try {
        const parts = text.split(/\s+/);
        const cmd = parts[0];
        if (cmd === 'fav') { fav(parts.slice(1)); }
        else if (cmd === 'favs' || cmd === 'favorites') { favs(); }
        else if (cmd === 'history') { history(); }
        else if (cmd === 'change') { await change(); }
        else if (cmd === 'list') { list(); }
        else { await doWord(text); }
      } catch (e) { console.error('错误:', e.message); }
      ask();
    });
  };
  ask();
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.length === 0) { help(); return; }
  const first = argv[0];
  if (first === '-h' || first === '--help') return help();
  if (first === 'setup') return setup();
  if (first === 'status') return status();
  if (first === 'list') return list();
  if (first === 'change') return change();
  if (first === 'favs' || first === 'favorites') return favs();
  if (first === 'fav') return fav(argv.slice(1));
  if (first === 'history') return history();
  if (first === 'mode') return wordMode();
  const text = argv.join(' ');
  return doWord(text);
}

main().catch((e) => { console.error('错误:', e.message); process.exit(1); });
