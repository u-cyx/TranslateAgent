'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { spawnSync } = require('child_process');

const ROOT = __dirname;
const DIST = path.join(ROOT, 'dist');
const NODE = process.execPath;
const POSTJECT = path.join(ROOT, 'node_modules', 'postject', 'dist', 'cli.js');
const ESBUILD = path.join(ROOT, 'node_modules', 'esbuild', 'bin', 'esbuild');
const RCEDIT = path.join(ROOT, 'node_modules', 'electron-winstaller', 'vendor', 'rcedit.exe');
const ICO = path.join(ROOT, 'translate.ico');
const ELECTRON_DIST = path.join(ROOT, 'node_modules', 'electron', 'dist');
const FUSE = 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2';
const MAGIC = Buffer.from('TRLADATA', 'ascii');
const target = process.argv[2] || 'all';

function rm(p) { try { fs.rmSync(p, { recursive: true, force: true }); } catch {} }
function run(cmd, args, opts) {
  console.log('$ ' + cmd + ' ' + args.join(' '));
  const r = spawnSync(cmd, args, { stdio: 'inherit', shell: false, ...opts });
  if (r.status !== 0) throw new Error('command failed: ' + cmd + ' ' + args.join(' '));
}
function setIcon(exe) {
  if (!fs.existsSync(RCEDIT) || !fs.existsSync(ICO)) { console.log('  (skip icon)'); return; }
  run(RCEDIT, [exe, '--set-icon', ICO]);
}
function setSubsystem(exe, sub) {
  // 直接修改 PE header 的 Subsystem 字段：2=GUI(无控制台), 3=Console
  const val = sub === 'windows' || sub === 2 ? 2 : 3;
  const fd = fs.openSync(exe, 'r+');
  const buf = Buffer.alloc(4);
  fs.readSync(fd, buf, 0, 4, 0x3C);
  const peOff = buf.readUInt32LE(0);
  const subBuf = Buffer.alloc(2);
  subBuf.writeUInt16LE(val, 0);
  fs.writeSync(fd, subBuf, 0, 2, peOff + 92);
  fs.closeSync(fd);
}
function seaBundle(entry, outExe) {
  const dir = path.dirname(entry);
  const cfgPath = path.join(dir, 'sea-config.json');
  fs.writeFileSync(cfgPath, JSON.stringify({ main: path.basename(entry), output: 'sea-prep.blob', disableExperimentalSEAWarning: true }));
  run(NODE, ['--experimental-sea-config', cfgPath], { cwd: dir });
  const blob = path.join(dir, 'sea-prep.blob');
  if (!fs.existsSync(blob)) throw new Error('SEA blob not created');
  fs.copyFileSync(NODE, outExe);
  setIcon(outExe);
  run(NODE, [POSTJECT, outExe, 'NODE_SEA_BLOB', blob, '--sentinel-fuse', FUSE]);
  rm(blob); rm(cfgPath);
}
function dirSize(d) { let t = 0; for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); t += e.isDirectory() ? dirSize(p) : fs.statSync(p).size; } return t; }

function buildCmd() {
  console.log('[cmd] Building tran.exe ...');
  fs.mkdirSync(DIST, { recursive: true });
  run(NODE, [ESBUILD, 'cli.js', '--bundle', '--platform=node', '--format=cjs',
    '--outfile=dist/cli.bundle.cjs', '--external:fs', '--external:path', '--external:os', '--external:readline'], { cwd: ROOT });
  seaBundle(path.join(DIST, 'cli.bundle.cjs'), path.join(DIST, 'tran.exe'));
  rm(path.join(DIST, 'cli.bundle.cjs'));
  console.log('  -> tran.exe (' + (fs.statSync(path.join(DIST, 'tran.exe')).size / 1048576).toFixed(1) + ' MB)');
}

function buildWord() {
  console.log('[word] Building word.exe ...');
  fs.mkdirSync(DIST, { recursive: true });
  run(NODE, [ESBUILD, 'word-entry.js', '--bundle', '--platform=node', '--format=cjs',
    '--outfile=dist/word.bundle.cjs', '--external:fs', '--external:path', '--external:os', '--external:readline'], { cwd: ROOT });
  seaBundle(path.join(DIST, 'word.bundle.cjs'), path.join(DIST, 'word.exe'));
  rm(path.join(DIST, 'word.bundle.cjs'));
  console.log('  -> word.exe (' + (fs.statSync(path.join(DIST, 'word.exe')).size / 1048576).toFixed(1) + ' MB)');
}

const LAUNCHER = `'use strict';
const fs=require('fs'),path=require('path'),os=require('os'),zlib=require('zlib'),{spawn}=require('child_process');
const exe=process.execPath,data=fs.readFileSync(exe);
const tail=data.subarray(-12);
if(tail.subarray(0,8).toString('ascii')!=='TRLADATA'){console.error('bad archive');process.exit(1);}
const glen=tail.readUInt32LE(8);
const gstart=data.length-12-glen;
const archive=zlib.gunzipSync(data.subarray(gstart,gstart+glen));
const dir=path.join(os.tmpdir(),'translate_agent_gui_'+process.pid);
fs.mkdirSync(dir,{recursive:true});
let off=0;
while(off<archive.length){
  const pl=archive.readUInt32BE(off);off+=4;
  if(pl===0)break;
  const fp=archive.subarray(off,off+pl).toString('utf8');off+=pl;
  const dl=archive.readUInt32BE(off);off+=4;
  const fd=archive.subarray(off,off+dl);off+=dl;
  const full=path.join(dir,fp);
  fs.mkdirSync(path.dirname(full),{recursive:true});
  fs.writeFileSync(full,fd);
}
const gui=path.join(dir,'translate_gui.exe');
const dataDir=path.join(path.dirname(process.execPath),'data');
fs.mkdirSync(dataDir,{recursive:true});
const child=spawn(gui,['--no-sandbox','--disable-gpu'],{stdio:'ignore',cwd:dir,env:Object.assign({},process.env,{TA_DATA_DIR:dataDir})});
child.on('exit',function(){try{fs.rmSync(dir,{recursive:true,force:true});}catch(e){}process.exit(0);});
child.on('error',function(){try{fs.rmSync(dir,{recursive:true,force:true});}catch(e){}console.error('launch failed');process.exit(1);});
`;

function buildGui() {
  console.log('[gui] Building translate_gui.exe (Electron) ...');
  fs.mkdirSync(DIST, { recursive: true });

  // 1. 组装 Electron 应用目录
  const appDir = path.join(DIST, 'translate_gui_app');
  rm(appDir);
  console.log('  copying electron dist...');
  fs.cpSync(ELECTRON_DIST, appDir, { recursive: true });
  fs.renameSync(path.join(appDir, 'electron.exe'), path.join(appDir, 'translate_gui.exe'));
  rm(path.join(appDir, 'resources', 'default_app.asar'));
  for (const junk of ['LICENSES.chromium.html', 'LICENSE', 'dxcompiler.dll', 'dxil.dll']) {
    rm(path.join(appDir, junk));
  }
  // 精简 locales
  const loc = path.join(appDir, 'locales');
  if (fs.existsSync(loc)) for (const f of fs.readdirSync(loc)) if (!['en-US.pak', 'zh-CN.pak'].includes(f)) fs.unlinkSync(path.join(loc, f));
  // 创建 resources/app/
  const codeDir = path.join(appDir, 'resources', 'app');
  fs.mkdirSync(codeDir, { recursive: true });
  fs.writeFileSync(path.join(codeDir, 'package.json'), JSON.stringify({ name: 'translate-agent', version: '1.0.0', main: 'gui/main.js' }, null, 2));
  fs.copyFileSync(path.join(ROOT, 'lib.js'), path.join(codeDir, 'lib.js'));
  fs.cpSync(path.join(ROOT, 'gui'), path.join(codeDir, 'gui'), { recursive: true });
  if (fs.existsSync(path.join(ROOT, 'dictionary', 'words.json'))) {
    fs.copyFileSync(path.join(ROOT, 'dictionary', 'words.json'), path.join(codeDir, 'words.json'));
    console.log('  dictionary embedded');
  }
  // 设置 exe 图标
  setIcon(path.join(appDir, 'translate_gui.exe'));
  console.log('  app size: ' + (dirSize(appDir) / 1048576).toFixed(1) + ' MB');

  // 2. 创建归档
  console.log('  creating archive...');
  const files = [];
  (function walk(d, r) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); const rp = r ? r + '/' + e.name : e.name; if (e.isDirectory()) walk(p, rp); else files.push(rp); } })(appDir, '');
  const chunks = [];
  for (const rp of files) { const buf = fs.readFileSync(path.join(appDir, rp)); const pb = Buffer.from(rp, 'utf8'); const pl = Buffer.alloc(4); pl.writeUInt32BE(pb.length, 0); const dl = Buffer.alloc(4); dl.writeUInt32BE(buf.length, 0); chunks.push(pl, pb, dl, buf); }
  chunks.push(Buffer.alloc(4));
  const archive = Buffer.concat(chunks);
  rm(appDir);

  // 3. gzip 压缩
  console.log('  compressing...');
  const compressed = zlib.gzipSync(archive, { level: 1 });
  console.log('  compressed: ' + (compressed.length / 1048576).toFixed(1) + ' MB');

  // 4. SEA 打包 launcher
  const entry = path.join(DIST, 'gui-launcher.cjs');
  fs.writeFileSync(entry, LAUNCHER);
  const guiExe = path.join(DIST, 'translate_gui.exe');
  seaBundle(entry, guiExe);
  rm(entry);

  // 5. 追加 gzip 数据
  console.log('  appending archive...');
  const tail = Buffer.alloc(12);
  MAGIC.copy(tail, 0);
  tail.writeUInt32LE(compressed.length, 8);
  fs.appendFileSync(guiExe, Buffer.concat([compressed, tail]));

  // 6. 设为 GUI 子系统（关闭控制台窗口）
  console.log('  setting windows subsystem...');
  setSubsystem(guiExe, 'windows');

  console.log('  -> translate_gui.exe (' + (fs.statSync(guiExe).size / 1048576).toFixed(1) + ' MB)');
}

function buildHta() {
  console.log('[hta] Building translate_gui_hta.exe ...');
  fs.mkdirSync(DIST, { recursive: true });
  const hta = fs.readFileSync(path.join(ROOT, 'gui', 'app.hta'), 'utf8');
  const icoB64 = fs.existsSync(ICO) ? fs.readFileSync(ICO).toString('base64') : '';
  const entry = path.join(DIST, 'hta-launcher.cjs');
  fs.writeFileSync(entry, "'use strict';\\nconst HTA=" + JSON.stringify(hta) + ";\\nconst ICO_DATA=" + JSON.stringify(icoB64) + ";\\n" +
    "const fs=require('fs'),path=require('path'),os=require('os'),{spawn}=require('child_process');\\n" +
    "const d=path.join(os.tmpdir(),'translate_agent_'+process.pid);fs.mkdirSync(d,{recursive:true});\\n" +
    "fs.writeFileSync(path.join(d,'app.hta'),HTA,'utf8');fs.writeFileSync(path.join(d,'app.ico'),Buffer.from(ICO_DATA,'base64'));\\n" +
    "const c=spawn('mshta.exe',[path.join(d,'app.hta')],{stdio:'ignore'});\\n" +
    "c.on('exit',function(){try{fs.rmSync(d,{recursive:true,force:true});}catch(e){}process.exit(0);});\\n" +
    "c.on('error',function(){try{fs.rmSync(d,{recursive:true,force:true});}catch(e){}console.error('mshta failed');process.exit(1);});");
  seaBundle(entry, path.join(DIST, 'translate_gui_hta.exe'));
  rm(entry);
  console.log('  -> translate_gui_hta.exe (' + (fs.statSync(path.join(DIST, 'translate_gui_hta.exe')).size / 1048576).toFixed(1) + ' MB)');
}

try {
  if (target === 'cmd' || target === 'tran' || target === 'all') buildCmd();
  if (target === 'word' || target === 'all') buildWord();
  if (target === 'gui' || target === 'all') buildGui();
  if (target === 'hta') buildHta();
  console.log('\\nDone. Output in dist/:');
  for (const f of fs.readdirSync(DIST)) if (f.endsWith('.exe')) console.log('  dist/' + f + '  (' + (fs.statSync(path.join(DIST, f)).size / 1048576).toFixed(1) + ' MB)');
} catch (e) {
  console.error('\\nBuild error:', e.message);
  process.exit(1);
}
