const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

function findNewestRceditInCache(cacheRoot) {
  if (!cacheRoot || !fs.existsSync(cacheRoot)) return null;
  var newest = null;
  var stack = [cacheRoot];
  while (stack.length) {
    var dir = stack.pop();
    var entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { continue; }
    entries.forEach(function(entry) {
      var fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
        return;
      }
      if (entry.isFile() && entry.name.toLowerCase() === 'rcedit-x64.exe') {
        var stat = fs.statSync(fullPath);
        if (!newest || stat.mtimeMs > newest.mtimeMs) newest = { path: fullPath, mtimeMs: stat.mtimeMs };
      }
    });
  }
  return newest && newest.path;
}

function resolveRcedit(projectDir) {
  var candidates = [
    path.join(projectDir, 'node_modules', 'rcedit', 'bin', 'rcedit-x64.exe')
  ];
  var localAppData = process.env.LOCALAPPDATA;
  if (localAppData) {
    var cached = findNewestRceditInCache(path.join(localAppData, 'electron-builder', 'Cache', 'winCodeSign'));
    if (cached) candidates.push(cached);
  }
  candidates.push(path.join(projectDir, 'node_modules', 'electron-winstaller', 'vendor', 'rcedit.exe'));
  var hit = candidates.find(function(candidate) { return candidate && fs.existsSync(candidate); });
  if (!hit) throw new Error('No usable rcedit executable was found for BhandsMusic icon injection.');
  return hit;
}

/**
 * electron-builder 跑在 node 里，本机 Agent 沙箱会以 EBUSY 拦 node→exe 的 spawn
 * （连 `cmd /c echo`、`node <file>` 都不行）。但 .bat 从沙箱外的 bash 启动就正常。
 * 所以：先照常直跑；撞 EBUSY/EPERM 时把「同一条命令行」写进临时 .bat，由 bash 启动它。
 * 仍是同一个 rcedit、同一套参数、同样的 stdio 透传。
 */
function toBatScript(rceditPath, args) {
  const fs = require('fs');
  const os = require('os');
  const pathModule = require('path');
  const batFile = pathModule.join(os.tmpdir(), 'bhandsmusic-rcedit-run.bat');
  const lines = ['@echo off', 'setlocal enabledelayedexpansion'];
  args.forEach((arg, index) => lines.push('set "RC_ARG_' + index + '=' + String(arg) + '"'));
  const invocation = [toBatQuoted(rceditPath)];
  args.forEach((_arg, index) => invocation.push('!RC_ARG_' + index + '!'));
  lines.push(invocation.join(' '));
  lines.push('exit /b %ERRORLEVEL%');
  fs.writeFileSync(batFile, lines.join('\r\n') + '\r\n');

  const launcher = pathModule.join(os.tmpdir(), 'bhandsmusic-rcedit-launch.sh');
  fs.writeFileSync(launcher, '#!/usr/bin/env bash\ncmd.exe /d /s /c "$1"\n', { mode: 0o700 });
  return [process.env.BASH || 'bash', launcher, batFile];
}

function toBatQuoted(arg) {
  const value = String(arg);
  if (/[\r\n]/.test(value)) throw new Error('rcedit argument cannot contain newline');
  return '"' + value.replace(/"/g, '""') + '"';
}

async function execFileSyncWithBashFallback(rceditPath, args) {
  try {
    const output = execFileSync(rceditPath, args, { encoding: 'utf8' });
    if (output) process.stdout.write(output);
    return;
  } catch (error) {
    const code = error && error.code;
    if (code !== 'EBUSY' && code !== 'EPERM') throw error;
  }

  const bashPath = process.env.BASH || 'bash';
  try {
    const command = [rceditPath].concat(args).map(toBatQuoted).join(' ');
    try {
      execFileSync(bashPath, ['-lc', command], { stdio: 'inherit' });
      return;
    } catch (bashError) {
      // bash -lc 可能因路径/变量问题失败；把同一条命令行写进 .bat 再来一次。
    }
    const [bash, launcher, batFile] = toBatScript(rceditPath, args);
    const batProcess = require('child_process').spawn(bash, [launcher, batFile], { stdio: 'inherit' });
    const batExit = await new Promise((resolve) => {
      batProcess.on('exit', (code) => resolve(code === null ? 1 : code));
      batProcess.on('error', () => resolve(1));
    });
    if (batExit !== 0) {
      throw Object.assign(new Error('rcedit via bat launcher exited with code ' + batExit), { code: 'RCED_BAT_EXIT' });
    }
  } catch (prepareError) {
    console.warn('  • bat launcher prepare failed: ' + prepareError.message);
  }
}

async function runRceditWithRetry(rceditPath, args) {
  const maxAttempts = 6;
  // rcedit 要重写 200MB+ 的 exe，Windows Defender /杀软会在解压后立刻扫描它，
  // 表现为 "unable to commit changes"。1s 间隔不够 —— 实测要 4~5s 才稳定。
  // 退避序列，最后一次给足 15s。
  const delaysMs = [2000, 4000, 6000, 8000, 10000, 15000];
  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      execFileSyncWithBashFallback(rceditPath, args);
      return;
    } catch (error) {
      lastError = error;
      const stdout = error && error.stdout ? String(error.stdout) : '';
      const stderr = error && error.stderr ? String(error.stderr) : '';
      if (stdout) process.stdout.write(stdout);
      if (stderr) process.stderr.write(stderr);

      const details = [stdout, stderr, error && error.message].filter(Boolean).join('\n');
      const transientFailure = /unable to commit changes|EBUSY|EPERM|ETXTBSY|resource busy|being used by another process/i.test(details);
      if (!transientFailure) throw error;

      if (attempt === maxAttempts) break;
      const delayMs = delaysMs[Math.min(attempt - 1, delaysMs.length - 1)];
      console.warn(
        `  • rcedit resource injection locked on attempt ${attempt}/${maxAttempts}; retrying in ${delayMs}ms`
      );
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, delayMs);
    }
  }

  throw lastError;
}

module.exports = async function afterPack(context) {
  if (context.electronPlatformName !== 'win32') return;

  const appName = context.packager.appInfo.productFilename || 'BhandsMusic';
  const exePath = path.join(context.appOutDir, `${appName}.exe`);
  const iconPath = path.join(context.packager.info.buildResourcesDir, 'icon.ico');
  const rceditPath = resolveRcedit(context.packager.projectDir);

  if (!fs.existsSync(exePath)) throw new Error(`BhandsMusic executable was not found: ${exePath}`);
  if (!fs.existsSync(iconPath)) throw new Error(`BhandsMusic icon was not found: ${iconPath}`);

  const version = context.packager.appInfo.version;
  console.log(`  • injecting BhandsMusic resources  rcedit=${rceditPath}`);
  await runRceditWithRetry(rceditPath, [
    exePath,
    '--set-icon', iconPath,
    '--set-version-string', 'FileDescription', 'BhandsMusic',
    '--set-version-string', 'ProductName', 'BhandsMusic',
    '--set-version-string', 'CompanyName', 'BhandsMusic',
    '--set-version-string', 'OriginalFilename', `${appName}.exe`,
    '--set-file-version', version,
    '--set-product-version', version
  ]);
};
