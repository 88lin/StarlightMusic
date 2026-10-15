'use strict';

/**
 * 单独给 dist\win-unpacked\BhandsMusic.exe 注入图标与版本信息。
 * 由 scripts/build-defer-rcedit.js 在 electron-builder 打包完成后调用。
 *
 * 与 build/after-pack.js 的区别：那个在「刚解压完」时跑，会撞上杀软扫描；
 * 这个在打包全部结束后跑，文件已落定，手工实测 100% 成功。
 */

const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(REPO, 'package.json'), 'utf8'));

const appDir = path.join(REPO, 'dist', 'win-unpacked');
const exePath = path.join(appDir, 'BhandsMusic.exe');
const iconPath = path.join(REPO, 'build', 'icon.ico');
const rcedit = path.join(REPO, 'node_modules', 'rcedit', 'bin', 'rcedit-x64.exe');

for (const [label, p] of [['exe', exePath], ['icon', iconPath], ['rcedit', rcedit]]) {
  if (!fs.existsSync(p)) throw new Error(label + ' 不存在: ' + p);
}

const { execFileSync } = require('child_process');
const version = pkg.version;

execFileSync(
  rcedit,
  [
    exePath,
    '--set-icon', iconPath,
    '--set-version-string', 'FileDescription', pkg.productName,
    '--set-version-string', 'ProductName', pkg.productName,
    '--set-version-string', 'CompanyName', pkg.productName,
    '--set-version-string', 'OriginalFilename', 'BhandsMusic.exe',
    '--set-file-version', version,
    '--set-product-version', version
  ],
  { encoding: 'utf8', stdio: ['ignore', 'inherit', 'inherit'] }
);

console.log('✅ rcedit 完成：' + path.relative(REPO, exePath) + ' v' + version);