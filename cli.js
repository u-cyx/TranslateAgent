#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { readConfig, writeConfig, maskKey, probeModels, translate, addHistory, readHistory, LANGUAGES } = require('./lib');

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
    console.log('现在可以翻译: tran "hello world"');
  } finally {
    rl.close();
  }
}

function status() {
  const cfg = readConfig();
  const cur = (LANGUAGES.find((l) => l.id === cfg.target) || { name: cfg.target || 'auto' }).name;
  console.log('\nTranslate Agent 配置');
  console.log('  配置文件  :', path.join(require('os').homedir(), '.translate-agent', 'config.json'));
  console.log('  API 地址  :', cfg.apiBase || '(未设置)');
  console.log('  API Key   :', maskKey(cfg.apiKey) || '(未设置)');
  console.log('  模型      :', cfg.model || '(未设置)');
  console.log('  翻译方向  :', cur);
  if (!cfg.apiBase || !cfg.apiKey || !cfg.model) {
    console.log('\n未完成配置，请运行: tran setup\n');
  } else {
    console.log('\n状态: 就绪\n');
  }
}

function list() {
  const cfg = readConfig();
  console.log('\n支持的语言:');
  LANGUAGES.forEach((l, i) => {
    const mark = l.id === cfg.target ? ' <== 当前' : '';
    console.log(`  [${i}] ${l.name}${mark}`);
  });
  console.log('\n使用 tran change 切换目标语言\n');
}

async function change() {
  const cfg = readConfig();
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    console.log('\n支持的语言:');
    LANGUAGES.forEach((l, i) => {
      const mark = l.id === cfg.target ? ' <== 当前' : '';
      console.log(`  [${i}] ${l.name}${mark}`);
    });
    let sel = (await ask(rl, '\n输入序号选择目标语言: ')).trim();
    if (!sel) { console.log('已取消'); return; }
    const idx = parseInt(sel, 10);
    if (isNaN(idx) || idx < 0 || idx >= LANGUAGES.length) {
      console.log('编号无效');
      return;
    }
    writeConfig({ target: LANGUAGES[idx].id });
    console.log(`\n已切换为: ${LANGUAGES[idx].name}`);
  } finally {
    rl.close();
  }
}

function help() {
  console.log(`
Translate Agent CLI

用法:
  tran "hello world"            翻译文本（默认中英互转）
  tran "你好世界"               自动检测：中文→English
  tran mode                     进入持续翻译模式（Ctrl+C 退出）
  tran list                     查看支持语言
  tran change                   切换目标语言（输入序号）
  tran history                  查看翻译历史
  tran setup                    配置 API
  tran status                   查看配置
  tran -h                       帮助

选项:
  -o, --out <路径>      将译文写入文件
`);
}

async function readStdin() {
  return new Promise((res) => {
    let buf = '';
    process.stdin.setEncoding('utf-8');
    process.stdin.on('data', (c) => (buf += c));
    process.stdin.on('end', () => res(buf));
    if (process.stdin.isTTY) res('');
  });
}

async function doTranslate(src, out) {
  src = (src || '').trim();
  if (!src) { console.log('无内容可翻译'); process.exit(1); }
  const cfg = readConfig();
  if (!cfg.apiBase || !cfg.apiKey || !cfg.model) {
    console.error('翻译失败: 请先配置 API');
    console.error('运行 tran setup 进行配置');
    process.exit(1);
  }
  process.stdout.write('翻译中... \r');
  try {
    const result = await translate(src, cfg.target || 'auto');
    process.stdout.write('            \r');
    if (out) {
      fs.writeFileSync(out, result, 'utf-8');
      console.log(`已写入 ${out}`);
    } else {
      process.stdout.write(result + '\n');
    }
    addHistory('translate', { input: src.slice(0, 500), output: result.slice(0, 500) });
  } catch (e) {
    process.stdout.write('            \r');
    console.error('翻译失败:', e.message);
    process.exit(1);
  }
}

function history() {
  const list = readHistory('translate');
  if (!list.length) { console.log('\n暂无翻译历史。\n'); return; }
  console.log('\n=== 翻译历史 (最近 ' + Math.min(list.length, 30) + ' 条) ===\n');
  const recent = list.slice(-30).reverse();
  recent.forEach((e) => {
    const d = new Date(e.time);
    const ts = d.getMonth() + 1 + '/' + d.getDate() + ' ' + d.getHours() + ':' + String(d.getMinutes()).padStart(2, '0');
    console.log('  ' + ts + '  ' + e.input.slice(0, 40) + ' → ' + e.output.slice(0, 40));
  });
  console.log('');
}

async function tranMode() {
  console.log('\n=== 翻译模式 (Translate Mode) ===');
  console.log('直接输入文本即可翻译，Ctrl+C 退出。\n');
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
      try { await doTranslate(text, ''); }
      catch (e) { console.error('错误:', e.message); }
      ask();
    });
  };
  ask();
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.length === 0) { if (process.stdin.isTTY) { help(); return; } }
  const first = argv[0];
  if (first === '-h' || first === '--help') return help();
  if (first === 'setup') return setup();
  if (first === 'status') return status();
  if (first === 'list') return list();
  if (first === 'change') return change();
  if (first === 'history') return history();
  if (first === 'mode') return tranMode();

  let out = '';
  let textArgs = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-o' || a === '--out') out = argv[++i];
    else textArgs.push(a);
  }
  const text = textArgs.join(' ');
  if (text) return doTranslate(text, out);
  if (!process.stdin.isTTY) {
    const src = await readStdin();
    return doTranslate(src, out);
  }
  help();
}

main().catch((e) => { console.error('错误:', e.message); process.exit(1); });
