'use strict';

/**
 * 擦掉 installerSidebar.bmp 里烙死的「安装 / 默认路径」两行文字。
 *
 * 为什么需要：
 * `installerSidebar.bmp` 最初是从设计稿截图缩放来的，底部那两行
 * 「安装」和「D:\StarlightMusic」是**画在像素里**的。于是：
 *   - 用户在安装目录页改成C:\Starlight\StarlightMusic，左下角仍显示 D:\StarlightMusic；
 *   - MUI 标准完成页、卸载器也共用这张图，同样显示这个写死路径。
 * 静态位图永远拿不到真实 $INSTDIR，只能从图上拿掉，改由
 * build/installer.nsh 里的 nsDialogs label 动态绘制。
 *
 * 用法：
 *   node scripts/sidebar-erase-install-path.js            # 原地改写 build/installerSidebar.bmp
 *   node scripts/sidebar-erase-install-path.js --check    # 只检查是否还有残留墨色，不写文件
 *
 * 幂等：擦完再跑一次不会有任何像素变化（区域已经干净）。
 */

const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '..');
const TARGET = path.join(REPO, 'build', 'installerSidebar.bmp');

/**
 * 擦除区（位图 164x314 坐标系，左上角为原点）。
 * 实测内容块（阈值 sum(RGB) < 430）：
 *   「安装」          y=240..249  x=33..50
 *   「D:\StarlightMusic」 y=260..267  x=34..112
 * 四周各留6~7px 余量吃掉抗锯齿边。
 */
const ERASE = { x0: 26, y0: 234, x1: 125, y1: 272 };

/** 取背景采样列：必须在擦除区左侧，且该y 段内没有任何墨色。 */
const SAMPLE_X0 = 2;
const SAMPLE_X1 = 25;

/** 判定"墨色"：背景约 (254,253,252)≈759，明显暗于此。 */
const INK_THRESHOLD = 430;

function decodeBmp(buf) {
  if (buf.length < 54 || buf[0] !== 0x42 || buf[1] !== 0x4d) {
    throw new Error('不是 BMP 文件（缺少 BM 签名）');
  }
  const width = buf.readInt32LE(18);
  const rawHeight = buf.readInt32LE(22);
  const height = Math.abs(rawHeight);
  const bpp = buf.readUInt16LE(28);
  if (bpp !== 24) throw new Error('只支持 24bpp BMP，当前 ' + bpp);

  const dataOffset = buf.readUInt32LE(10);
  const rowSize = Math.ceil((width * 3) / 4) * 4;
  const rgb = Buffer.alloc(width * height * 3);

  for (let fy = 0; fy < height; fy++) {
    // height > 0 = bottom-up，磁盘第0 行是图像最后一行
    const srcY = rawHeight > 0 ? height - 1 - fy : fy;
    let src = dataOffset + srcY * rowSize;
    let dst = fy * width * 3;
    for (let x = 0; x < width; x++) {
      rgb[dst++] = buf[src + 2];
      rgb[dst++] = buf[src + 1];
      rgb[dst++] = buf[src];
      src += 3;
    }
  }
  return { width, height, rgb };
}

function encodeBmp(rgb, width, height) {
  const rowSize = Math.ceil((width * 3) / 4) * 4;
  const dataOffset = 14 + 40;
  const buf = Buffer.alloc(dataOffset + rowSize * height);

  buf.write('BM', 0, 'ascii');
  buf.writeUInt32LE(buf.length, 2);
  buf.writeUInt32LE(0, 6);
  buf.writeUInt32LE(dataOffset, 10);

  buf.writeUInt32LE(40, 14);
  buf.writeInt32LE(width, 18);
  buf.writeInt32LE(height, 22); // 正数 = bottom-up
  buf.writeUInt16LE(1, 26);
  buf.writeUInt16LE(24, 28);
  buf.writeUInt32LE(0, 30);
  buf.writeUInt32LE(rowSize * height, 34);
  buf.writeInt32LE(2835, 38);
  buf.writeInt32LE(2835, 42);
  buf.writeUInt32LE(0, 46);
  buf.writeUInt32LE(0, 50);

  for (let y = 0; y < height; y++) {
    const srcRow = (height - 1 - y) * width * 3;
    let dst = dataOffset + y * rowSize;
    for (let x = 0; x < width; x++) {
      buf[dst++] = rgb[srcRow + x * 3 + 2];
      buf[dst++] = rgb[srcRow + x * 3 + 1];
      buf[dst++] = rgb[srcRow + x * 3];
    }
  }
  return buf;
}

/** 逐行统计"墨色"像素，返回残留的行列范围。 */
function findInk(img, x0, y0, x1, y1) {
  let minX = Infinity, maxX = -1, minY = Infinity, maxY = -1, count = 0;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const i = (y * img.width + x) * 3;
      if (img.rgb[i] + img.rgb[i + 1] + img.rgb[i + 2] < INK_THRESHOLD) {
        count++;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  return { count, minX, maxX, minY, maxY };
}

function main() {
  const checkOnly = process.argv.includes('--check');
  if (!fs.existsSync(TARGET)) throw new Error('找不到 ' + TARGET);

  const original = fs.readFileSync(TARGET);
  const img = decodeBmp(original);

  if (img.width !== 164 || img.height !== 314) {
    throw new Error('尺寸应为 164x314，实际 ' + img.width + 'x' + img.height);
  }

  const before = findInk(img, ERASE.x0, ERASE.y0, ERASE.x1, ERASE.y1);
  console.log(
    '擦除区 x=' + ERASE.x0 + '..' + ERASE.x1 + ' y=' + ERASE.y0 + '..' + ERASE.y1 +
      '：墨色像素 ' + before.count + ' 个' +
      (before.count ? '（x=' + before.minX + '..' + before.maxX + ' y=' + before.minY + '..' + before.maxY + '）' : '')
  );

  if (before.count === 0) {
    console.log('✅ 区域已干净，无需改写' + (checkOnly ? '' : '（文件未变动）'));
    return;
  }
  if (checkOnly) {
    console.log('❌ --check 失败：位图里仍有写死的路径文字');
    process.exit(1);
  }

  // 逐行用左侧干净列的均值回填 —— 保留垂直方向的渐变，
  // 水平方向本来就近乎均匀（实测整幅 R 值只在 252..255 之间浮动）。
  let filled = 0;
  for (let y = ERASE.y0; y <= ERASE.y1; y++) {
    let r = 0, g = 0, bl = 0;
    for (let x = SAMPLE_X0; x <= SAMPLE_X1; x++) {
      const i = (y * img.width + x) * 3;
      r += img.rgb[i];
      g += img.rgb[i + 1];
      bl += img.rgb[i + 2];
    }
    const n = SAMPLE_X1 - SAMPLE_X0 + 1;
    const pr = Math.round(r / n), pg = Math.round(g / n), pb = Math.round(bl / n);
    for (let x = ERASE.x0; x <= ERASE.x1; x++) {
      const i = (y * img.width + x) * 3;
      img.rgb[i] = pr;
      img.rgb[i + 1] = pg;
      img.rgb[i + 2] = pb;
      filled++;
    }
  }

  const out = encodeBmp(img.rgb, img.width, img.height);

  // 自检：写出的 BMP 反解后必须与内存像素逐字节一致（抓行序/通道序写反）
  const back = decodeBmp(out);
  if (!back.rgb.equals(img.rgb)) {
    throw new Error('自检失败：BMP 像素与写入前不一致');
  }
  const after = findInk(back, ERASE.x0, ERASE.y0, ERASE.x1, ERASE.y1);
  if (after.count !== 0) {
    throw new Error('自检失败：擦除后仍有 ' + after.count + ' 个墨色像素');
  }

  fs.writeFileSync(TARGET, out);
  console.log(
    '✅ 已擦除 ' + before.count + ' 个墨色像素，回填 ' + filled + ' 个 → ' +
      path.relative(REPO, TARGET) + '（' + out.length + 'B，像素自检通过）'
  );
  console.log('   下一步：build/installer.nsh 里用 nsDialogs label 动态显示真实 $INSTDIR');
}

main();