'use strict';

/**
 * NSIS 安装器脚本闸门（build/installer.nsh）。
 *
 * 两道检查：
 *  ① 静态引用检查：所有 `Call X` 的目标都必须有 `Function X` 定义。
 *     这是改这个文件最容易出错的地方 —— 删了函数忘删调用点，普通 grep 和
 *     `node --check` 都查不出来，只有 makensis 编译时才炸。
 *     静态检查自带变异自检：内存里抹掉一个 Function 定义后必须报缺。
 *  ② 真实编译：用 electron-builder 缓存里的 makensis 编译 installer.nsh
 *     （补一个 StdUtils.nsh 桩），再跑负向自检 —— 故意调用不存在函数的脚本
 *     必须编译失败，否则说明这道闸门是假绿。
 *
 * ⚠️ 第 ② 步需要 Node 能启动外部进程。部分机器上安全策略会拦截
 * （spawn 直接报 EBUSY，连 cmd.exe 都起不来），此时第 ② 步标为 skipped
 * 并明确打印原因，绝不伪装成通过。
 *
 * 用法：npm run probe:nsis
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const REPO = path.resolve(__dirname, '..');
const INSTALLER_NSH = path.join(REPO, 'build', 'installer.nsh');
const OUT_DIR = path.join(REPO, 'scripts', 'out');
const STUB_DIR = path.join(OUT_DIR, 'nsis-probe-include');

const LOCAL_APP_DATA = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
const CACHE_ROOT = path.join(LOCAL_APP_DATA, 'electron-builder', 'Cache');

const fails = [];
const skipped = [];

/** `--keep` 保留生成的探针脚本，便于本机用 bash 手动编译。 */
const KEEP = process.argv.includes('--keep');
const POSITIVE_NSI = path.join(OUT_DIR, 'nsis-syntax-probe.nsi');
const NEGATIVE_NSI = path.join(OUT_DIR, 'nsis-syntax-probe-negative.nsi');
const POSITIVE_EXE = path.join(OUT_DIR, 'nsis-syntax-probe.exe');
const NEGATIVE_EXE = path.join(OUT_DIR, 'nsis-syntax-probe-negative.exe');
const TEMP_FILES = [POSITIVE_NSI, NEGATIVE_NSI, POSITIVE_EXE, NEGATIVE_EXE];
/** 探针脚本必须带 BOM，否则 makensis 按 ACP 解析，中文直接报 Bad text encoding。 */
const BOM = '\uFEFF';

function assert(name, expected, actual) {
  const ok = expected === actual;
  console.log((ok ? '  \u2705 ' : '  \u274c ') + name + (ok ? '' : '（期望 ' + expected + '，实际 ' + actual + '）'));
  if (!ok) fails.push(name);
}

/* ------------------------------------------------------------------ *
 * ① 静态引用检查
 * ------------------------------------------------------------------ */

/** 去掉 NSIS 行内注释（`;` 之后）。Call 行通常不含字符串，直接截断足够。 */
function stripComment(line) {
  const idx = line.indexOf(';');
  return idx === -1 ? line : line.slice(0, idx);
}

/**
 * 收集 `Function X` 定义与 `Call X` 引用。
 * 不区分 `!ifdef BUILD_UNINSTALLER` 分支 —— 宽松策略只会少报不会误报。
 */
function scanCalls(src) {
  const defined = new Set();
  const called = [];
  src.split(/\r?\n/).forEach((rawLine, i) => {
    const line = stripComment(rawLine);
    const def = /^\s*Function\s+([^\s]+)\s*$/i.exec(line);
    if (def) defined.add(def[1].toLowerCase());
    const call = /^\s*Call\s+([^\s]+)/i.exec(line);
    if (call) called.push({ name: call[1], line: i + 1 });
  });
  return { defined, called };
}

/**
 * MUI2 / electron-builder 模板提供的函数：不在 installer.nsh 里定义，但运行时存在。
 * 静态检查时排除，否则「切全窗口模式」这类调用 MUI 内部函数的写法会误报。
 */
const EXTERNAL_FUNCTIONS = ['muipageloadfullwindow', 'muipageunloadfullwindow'];

function missingCallTargets(src) {
  const { defined, called } = scanCalls(src);
  return called.filter(
    (c) => !defined.has(c.name.toLowerCase()) && !EXTERNAL_FUNCTIONS.includes(c.name.toLowerCase())
  );
}

function checkStatic() {
  console.log('[1] 静态：每个 Call 的目标都要有 Function 定义');
  const src = fs.readFileSync(INSTALLER_NSH, 'utf8');
  const missing = missingCallTargets(src);
  assert('没有指向未定义函数的 Call', 0, missing.length);
  for (const m of missing) console.log('     installer.nsh:' + m.line + ' Call ' + m.name + ' —— 找不到对应的 Function');

  console.log('\n[2] 静态自检：抹掉一个 Function 定义后必须报缺（防止检查假绿）');
  const mutated = src.replace(/^Function BhandsMusicNormalizeInstallDir\s*$/m, '');
  assert('变异生效（定义确实被抹掉）', true, mutated !== src);
  const mutatedMissing = missingCallTargets(mutated);
  assert(
    '变异后报出 BhandsMusicNormalizeInstallDir 缺失',
    true,
    mutatedMissing.some((m) => m.name.toLowerCase() === 'bhandsmusicnormalizeinstalldir')
  );
}

/* ------------------------------------------------------------------ *
 * ③ 安装器图片资源
 * ------------------------------------------------------------------ */

/**
 * MUI 的 installerHeader / installerSidebar 只认**真 BMP**。
 * 把 PNG 改个 .bmp 扩展名：electron-builder 不报错、makensis 不报错，
 * 但运行时 LoadImage 失败 → 安装器/卸载器横幅**静默空白**。
 * （2026-10-14 实测踩过：两个文件头都是 89 50 4E 47。）
 */
const BITMAP_ASSETS = [
  { rel: 'build/installerHeader.bmp', w: 150, h: 57 },
  { rel: 'build/installerSidebar.bmp', w: 164, h: 314 }
];

function checkBitmaps() {
  console.log('[3] 资源：MUI 横幅必须是真 24bpp BMP');
  for (const asset of BITMAP_ASSETS) {
    const abs = path.join(REPO, asset.rel);
    if (!fs.existsSync(abs)) {
      assert(asset.rel + ' 存在', true, false);
      continue;
    }
    const buf = fs.readFileSync(abs);
    const isBmp = buf.length > 54 && buf[0] === 0x42 && buf[1] === 0x4d;
    assert(asset.rel + ' 是真 BMP', true, isBmp);
    if (!isBmp) {
      const isPng = buf.length > 8 && buf[0] === 0x89 && buf[1] === 0x50;
      console.log(
        '     文件头是 ' +
          (isPng ? 'PNG 签名' : '未知格式') +
          '，MUI 会静默忽略 → 横幅空白。用 node scripts/png-to-bmp.js 转换。'
      );
      continue;
    }
    assert(asset.rel + ' 是 24bpp', 24, buf.readUInt16LE(28));
    assert(
      asset.rel + ' 尺寸为 ' + asset.w + 'x' + asset.h,
      true,
      buf.readInt32LE(18) === asset.w && Math.abs(buf.readInt32LE(22)) === asset.h
    );
  }
}

/* ------------------------------------------------------------------ *
 * ④ 真实编译
 * ------------------------------------------------------------------ */

/**
 * 在 electron-builder 缓存里找 makensis.exe 候选。
 * 只认 `.../Bin/makensis.exe`：分发包根目录那份同名但 spawn 后直接失败。
 * 缓存里通常有多个解包副本，某个可能被杀软占用，所以返回全部候选逐个探测。
 */
function findMakensisCandidates() {
  if (!fs.existsSync(CACHE_ROOT)) return [];
  const found = [];
  const stack = [CACHE_ROOT];
  while (stack.length) {
    const cur = stack.pop();
    let items = [];
    try {
      items = fs.readdirSync(cur, { withFileTypes: true });
    } catch (e) {
      continue;
    }
    for (const it of items) {
      const full = path.join(cur, it.name);
      if (it.isDirectory()) stack.push(full);
      else if (it.name === 'makensis.exe' && path.basename(path.dirname(full)) === 'Bin') {
        found.push({ path: full, mtimeMs: fs.statSync(full).mtimeMs });
      }
    }
  }
  found.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return found.map((f) => f.path);
}

function runMakensis(makensis, nsiPath) {
  const r = spawnSync(makensis, [nsiPath], { encoding: 'utf8' });
  return {
    status: r.status,
    error: r.error ? String(r.error.code || r.error.message || r.error) : '',
    output: String(r.stdout || '') + String(r.stderr || '')
  };
}

/** 逐个探测候选，返回第一个 `makensis -VERSION` 能正常返回的。 */
function pickMakensis(candidates) {
  const errors = [];
  for (const candidate of candidates) {
    const r = spawnSync(candidate, ['-VERSION'], { encoding: 'utf8' });
    if (r.status === 0) return { path: candidate, errors };
    errors.push(candidate + ' -> ' + (r.error ? String(r.error.code || r.error.message || r.error) : 'exit ' + r.status));
  }
  return { path: null, errors };
}

function findPluginDir() {
  if (!fs.existsSync(CACHE_ROOT)) return null;
  for (const entry of fs.readdirSync(CACHE_ROOT)) {
    if (!/^nsis-resources-/.test(entry)) continue;
    const base = path.join(CACHE_ROOT, entry);
    for (const sub of fs.readdirSync(base)) {
      const dir = path.join(base, sub, 'plugins', 'x86-unicode');
      if (fs.existsSync(dir)) return dir;
    }
  }
  return null;
}

function winPath(p) {
  return p.replace(/\//g, '\\');
}

/**
 * 生成探针脚本：只 include build/installer.nsh，不插任何页面。
 *
 * ⚠️ 必须写成 UTF-8 **带 BOM**。NSIS 用主脚本的 BOM 决定整个编译的 codepage：
 * 没有 BOM 时 makensis 按系统 ACP(GBK) 读，installer.nsh 里的中文会直接报
 * "Bad text encoding"。electron-builder 生成的主 nsi 也是带 BOM 的，这里保持一致。
 */
function buildProbeSource(outExe, extraSectionBody) {
  const pluginDir = findPluginDir();
  const lines = [
    '; generated by scripts/probe-nsis-syntax.js -- do not edit',
    'Unicode true',
    '',
    'OutFile "' + winPath(outExe) + '"',
    '!addincludedir "' + winPath(STUB_DIR) + '"'
  ];
  if (pluginDir) lines.push('!addplugindir /x86-unicode "' + winPath(pluginDir) + '"');
  lines.push(
    '',
    '; electron-builder 在 include installer.nsh 之前注入的定义与变量',
    '!define APP_GUID "com.bhandsmusic.desktop"',
    '!define UNINSTALL_APP_KEY "bhandsmusic-probe-uninstall-key"',
    '!define PRODUCT_FILENAME "BhandsMusic"',
    '!define MUI_WELCOMEFINISHPAGE_BITMAP "' + winPath(path.join(REPO, 'build', 'installerSidebar.bmp')) + '"',
    '',
    '!include "MUI2.nsh"',
    '',
    'Var isForceCurrentInstall',
    'Var launchLink',
    'Var appExe',
    '',
    '!include "' + winPath(INSTALLER_NSH) + '"',
    '',
    '; 模拟 electron-builder assistedInstaller.nsh 的页面展开顺序。',
    '; muiPageLoadFullWindow / muiPageUnloadFullWindow 不是普通函数，',
    '; 它们由 MUI_PAGE_FINISH 等宏在预处理阶段生成，必须展开 MUI 页面宏才能验证引用。',
    '!insertmacro customWelcomePage',
    '!insertmacro customPageAfterChangeDir',
    '!define HIDE_RUN_AFTER_FINISH',
    '!insertmacro customFinishPage',
    '',
    'Section "probe"',
    extraSectionBody,
    'SectionEnd',
    ''
  );
  return lines.join('\r\n');
}

function checkCompile() {
  // 先把探针脚本写出来 —— 即使本机 makensis 跑不起来，也能用 bash 手动编译它。
  fs.mkdirSync(STUB_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(STUB_DIR, 'StdUtils.nsh'),
    '; Probe-only stub: installer.nsh only uses ${StdUtils.*} inside macro bodies\r\n; that this probe never expands, so an empty stub is enough.\r\n'
  );
  fs.writeFileSync(POSITIVE_NSI, BOM + buildProbeSource(POSITIVE_EXE, ''), 'utf8');
  fs.writeFileSync(
    NEGATIVE_NSI,
    BOM + buildProbeSource(NEGATIVE_EXE, '  Call BhandsMusicProbeDefinitelyMissingFunction'),
    'utf8'
  );

  const picked = pickMakensis(findMakensisCandidates());

  if (!picked.path) {
    console.log('[4] 编译：⚠️ 跳过（没有可用的 makensis）');
    console.log('     缓存位置：' + CACHE_ROOT);
    for (const e of picked.errors) console.log('     - ' + e);
    if (picked.errors.some((e) => /EBUSY|EPERM|EACCES/i.test(e))) {
      console.log('     原因看起来是「本机不允许 Node 启动外部进程」（安全策略/杀软拦截），不是脚本问题。');
    } else if (!picked.errors.length) {
      console.log('     先跑一次 npm run build:win 让 electron-builder 下载 NSIS 工具链，或装 NSIS 后重试。');
    }
    console.log('     想手动编译的话，加 --keep 重新跑一次，再用 bash 执行：');
    console.log('       makensis.exe scripts/out/nsis-syntax-probe.nsi');
    skipped.push('makensis-compile');
    return;
  }

  console.log('[4] 编译：build/installer.nsh 必须能通过 makensis');
  console.log('     makensis: ' + picked.path);

  const pos = runMakensis(picked.path, POSITIVE_NSI);
  assert('makensis 退出码为 0', 0, pos.status);
  assert('输出里没有 Error', false, /^Error/im.test(pos.output));
  if (pos.status !== 0) {
    if (pos.error) console.log('     进程错误：' + pos.error);
    console.log(
      pos.output
        .split('\n')
        .filter((l) => /error|resolving/i.test(l))
        .slice(0, 20)
        .join('\n')
    );
  }

  console.log('\n[5] 编译自检：故意调用不存在的函数必须编译失败（防止闸门假绿）');
  const neg = runMakensis(picked.path, NEGATIVE_NSI);
  assert('负向脚本退出码非 0', true, neg.status !== 0);
  assert(
    '负向脚本报出未定义函数',
    true,
    /resolving install function .*BhandsMusicProbeDefinitelyMissingFunction/i.test(neg.output)
  );
}

function main() {
  console.log('== NSIS 安装器脚本闸门（build/installer.nsh）==\n');

  assert('build/installer.nsh 存在', true, fs.existsSync(INSTALLER_NSH));
  if (fails.length) return finish();

  try {
    checkStatic();
    console.log('');
    checkBitmaps();
    console.log('');
    checkCompile();
  } finally {
    if (KEEP) {
      console.log('\n（--keep：已保留生成的探针脚本与桩文件）');
      console.log('   正向：' + POSITIVE_NSI);
      console.log('   负向：' + NEGATIVE_NSI);
    } else {
      for (const f of TEMP_FILES) {
        try { fs.rmSync(f, { force: true }); } catch (e) { /* 忽略 */ }
      }
      try { fs.rmSync(STUB_DIR, { recursive: true, force: true }); } catch (e) { /* 忽略 */ }
      const leftover = TEMP_FILES.filter((f) => fs.existsSync(f));
      assert('探针清理：临时产物已删除', 0, leftover.length);
    }
  }

  finish();
}

function finish() {
  const verdict = fails.length ? 'fail' : 'pass';
  console.log('\n' + (fails.length ? '\u274c 失败 ' + fails.length + ' 项: ' + fails.join(' | ') : '\u2705 全部通过'));
  if (skipped.length) console.log('\u26a0\ufe0f  已跳过：' + skipped.join(', '));
  console.log('RESULT ' + JSON.stringify({ verdict: verdict, skipped: skipped, fails: fails }));
  process.exit(fails.length ? 1 : 0);
}

main();
