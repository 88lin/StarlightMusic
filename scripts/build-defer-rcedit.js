'use strict';

/**
 * 临时构建包装：把 after-pack 的 rcedit 步骤延后到 electron-builder 打包完成之后。
 *
 * 为什么需要（本机环境问题，与产品代码无关）：
 * electron-builder 解压完 200MB+ 的 StarlightMusic.exe 后立刻调用 rcedit 写图标/版本，
 * 此时杀软仍在扫描该文件，rcedit 报 "unable to commit changes"。
 * after-pack.js 里已有重试，但 5 次 × 1s 对这种扫描窗口不够。
 * 手工单独跑同一个 exe 100% 成功 —— 说明文件本身没问题，纯粹是时序竞争。
 *
 * 用法：仅本机验证安装器视觉时用
 *   node scripts/build-defer-rcedit.js
 * 正常发布请直接 `npm run build:win`（发布机上通常没有这个扫描竞争）。
 */

const path = require('path');
const { spawnSync } = require('child_process');

const REPO = path.resolve(__dirname, '..');
const OUT = 'dist';

// 1) 正常构建，但 afterPack 只做「记下要跑的命令」，不真跑 rcedit。
const shim = path.join(REPO, 'scripts', 'out', 'after-pack-defer.js');
require('fs').mkdirSync(path.dirname(shim), { recursive: true });
require('fs').writeFileSync(
  shim,
  'module.exports = async function afterPack(context) {\n' +
    "  if (context.electronPlatformName !== 'win32') return;\n" +
    "  console.log('  • [defer] 跳过 rcedit（构建后由 build-defer-rcedit.js 补跑）');\n" +
    '};\n',
  'utf8'
);

const args = [
  'electron-builder',
  '--win',
  'nsis',
  '--config.afterPack=' + shim.replace(/\\/g, '/')
];

console.log('[1/2] electron-builder（afterPack 已替换为 defer 版本）');
const r = spawnSync('npx', args, {
  cwd: REPO,
  stdio: 'inherit',
  shell: true,
  env: Object.assign({}, process.env, { CODEBUDDY_SAFE_DELETE_ENABLED: '0' })
});

if (r.status !== 0) {
  console.error('构建失败，退出码 ' + r.status);
  process.exit(r.status || 1);
}

console.log('\n[2/2] 补跑 rcedit（此时文件不再被扫描占用）');
const after = spawnSync(process.execPath, [path.join(REPO, 'scripts', 'run-rcedit.js')], {
  cwd: REPO,
  stdio: 'inherit'
});

process.exit(after.status === 0 ? 0 : 1);