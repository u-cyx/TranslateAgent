const fs = require('fs');
const readline = require('readline');

function parseCSVLine(line) {
  const parts = [];
  let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
    else if (ch === '"') { inQ = !inQ; }
    else if (ch === ',' && !inQ) { parts.push(cur); cur = ''; }
    else cur += ch;
  }
  parts.push(cur);
  return { word: parts[0], phonetic: parts[1], definition: parts[2], translation: parts[3], pos: parts[4], collins: parts[5], oxford: parts[6], tag: parts[7], bnc: parts[8], frq: parts[9] };
}

const rl = readline.createInterface({ input: fs.createReadStream('D:/work/dictionary/ecdict.csv', 'utf8') });
const words = [];
let first = true;
let debugPaper = false;

rl.on('line', (line) => {
  if (first) { first = false; return; }
  const c = parseCSVLine(line);
  if (!c.word || !c.translation) return;
  const collins = parseInt(c.collins) || 0;
  const bnc = parseInt(c.bnc) || 99999;
  const frq = parseInt(c.frq) || 99999;
  if (collins <= 0 && bnc >= 99999 && frq >= 99999 && !c.oxford) return;
  const t = c.translation.replace(/\\n/g, ';').replace(/"/g, '').trim();
  const w = c.word.toLowerCase().trim();
  if (w === 'paper' || w === 'hello') {
    console.log('DEBUG:', w, 'collins=', collins, 'bnc=', bnc, 'frq=', frq, 'score=', collins * 100000 - bnc - frq);
  }
  words.push({ w, p: (c.phonetic || '').trim(), ps: (c.pos || '').trim(), t, f: collins * 100000 - bnc - frq });
});

rl.on('close', () => {
  console.log('total words loaded:', words.length);
  words.sort((a, b) => b.f - a.f);
  const top = words.slice(0, 50000);
  const out = {};
  for (const w of top) {
    if (!out[w.w]) {
      if (w.p) out[w.w] = [w.p, w.t];
      else out[w.w] = [w.t];
    }
  }
  console.log('unique in top 50k:', Object.keys(out).length);
  console.log('paper in out:', 'paper' in out);
  console.log('hello in out:', 'hello' in out);
  fs.writeFileSync('D:/work/dictionary/words.json', JSON.stringify(out), 'utf8');
  const sz = fs.statSync('D:/work/dictionary/words.json').size;
  console.log('words.json:', (sz / 1048576).toFixed(2), 'MB');
  const v8 = require('v8');
  fs.writeFileSync('D:/work/dictionary/words.bin', v8.serialize(out));
  const bsz = fs.statSync('D:/work/dictionary/words.bin').size;
  console.log('words.bin:', (bsz / 1048576).toFixed(2), 'MB');
  const t0 = Date.now();
  JSON.parse(fs.readFileSync('D:/work/dictionary/words.json', 'utf8'));
  const t1 = Date.now();
  v8.deserialize(fs.readFileSync('D:/work/dictionary/words.bin'));
  const t2 = Date.now();
  console.log('JSON.parse:', (t1 - t0) + 'ms, v8.deserialize:', (t2 - t1) + 'ms');
});
