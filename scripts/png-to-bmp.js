'use strict';

/**
 * PNG -> 24bpp BMP 转换器（零依赖，只用内置 zlib）。
 *
 * 为什么需要：MUI/NSIS 的 installerHeader / installerSidebar 只认**真 BMP**。
 * 把 PNG 改个 `.bmp` 扩展名，electron-builder 不会报错、makensis 也不会报错，
 * 但运行时 `LoadImage` 失败 → 安装器/卸载器顶部横幅**静默空白**。
 * `build/installerHeader.bmp` 与 `build/installerSidebar.bmp` 就踩过这个坑
 * （两个文件头是 `89 50 4E 47` = PNG 签名）。
 *
 * 用法：
 *   node scripts/png-to-bmp.js --check <文件...>       # 只校验是不是真 BMP
 *   node scripts/png-to-bmp.js <输入.png> [输出.bmp]   # 转换（省略输出则原地覆盖）
 *
 * 只支持 8-bit 非隔行 PNG（colorType 2 = RGB / 6 = RGBA / 0 = 灰度）；
 * RGBA 会先合成到白底（MUI 横幅是白底，直接丢 alpha 会发黑）。
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function isPng(buf) {
  return buf.length > 8 && buf.slice(0, 8).equals(PNG_SIGNATURE);
}

function isBmp(buf) {
  return buf.length > 54 && buf[0] === 0x42 && buf[1] === 0x4d;
}

/** 读 BMP 头（只用于自检输出）。 */
function bmpInfo(buf) {
  return {
    width: buf.readInt32LE(18),
    height: buf.readInt32LE(22),
    bpp: buf.readUInt16LE(28),
    bytes: buf.length
  };
}

/** 解析 PNG 的 IHDR + IDAT，返回 { width, height, rgb }（rgb 为 RGB 三元组）。 */
function decodePng(buf) {
  if (!isPng(buf)) throw new Error('不是 PNG 文件（缺少 89 50 4E 47 签名）');

  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlace = 0;
  const idat = [];

  while (offset + 8 <= buf.length) {
    const length = buf.readUInt32BE(offset);
    const type = buf.slice(offset + 4, offset + 8).toString('ascii');
    const data = buf.slice(offset + 8, offset + 8 + length);

    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') {
      break;
    }
    offset += 12 + length; // length + type(4) + data + crc(4)
  }

  if (!width || !height) throw new Error('PNG 缺少有效的 IHDR');
  if (bitDepth !== 8) throw new Error('只支持 8-bit PNG，当前 bitDepth=' + bitDepth);
  if (interlace !== 0) throw new Error('不支持隔行（Adam7）PNG');
  if (colorType !== 2 && colorType !== 6 && colorType !== 0) {
    throw new Error('只支持 colorType 0/2/6，当前 colorType=' + colorType);
  }

  const channels = colorType === 2 ? 3 : colorType === 6 ? 4 : 1;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const pixels = unfilter(raw, width, height, channels);

  // 统一转成 RGB（RGBA 合成到白底，灰度三通道复制）
  const rgb = Buffer.alloc(width * height * 3);
  for (let i = 0, p = 0, q = 0; i < width * height; i++, p += channels, q += 3) {
    if (channels === 1) {
      rgb[q] = rgb[q + 1] = rgb[q + 2] = pixels[p];
    } else if (channels === 3) {
      rgb[q] = pixels[p];
      rgb[q + 1] = pixels[p + 1];
      rgb[q + 2] = pixels[p + 2];
    } else {
      const a = pixels[p + 3] / 255;
      rgb[q] = Math.round(pixels[p] * a + 255 * (1 - a));
      rgb[q + 1] = Math.round(pixels[p + 1] * a + 255 * (1 - a));
      rgb[q + 2] = Math.round(pixels[p + 2] * a + 255 * (1 - a));
    }
  }

  return { width, height, rgb };
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

/** 还原 PNG 扫描线滤波，返回去滤波后的原始通道字节。 */
function unfilter(raw, width, height, channels) {
  const stride = width * channels;
  const out = Buffer.alloc(stride * height);
  let pos = 0;

  for (let y = 0; y < height; y++) {
    const filter = raw[pos++];
    const rowStart = y * stride;
    const prevStart = (y - 1) * stride;

    for (let x = 0; x < stride; x++) {
      const rawByte = raw[pos++];
      const a = x >= channels ? out[rowStart + x - channels] : 0;
      const b = y > 0 ? out[prevStart + x] : 0;
      const c = x >= channels && y > 0 ? out[prevStart + x - channels] : 0;
      let value;
      switch (filter) {
        case 0: value = rawByte; break;
        case 1: value = rawByte + a; break;
        case 2: value = rawByte + b; break;
        case 3: value = rawByte + ((a + b) >> 1); break;
        case 4: value = rawByte + paeth(a, b, c); break;
        default: throw new Error('未知 PNG 滤波类型 ' + filter + '（第 ' + y + ' 行）');
      }
      out[rowStart + x] = value & 0xff;
    }
  }
  return out;
}

/** 面积平均缩放（缩小图质量最好；只支持缩小与等比附近的放大）。 */
function resizeAreaAvg(rgb, srcW, srcH, dstW, dstH) {
  const out = Buffer.alloc(dstW * dstH * 3);
  for (let dy = 0; dy < dstH; dy++) {
    const y0 = Math.floor((dy * srcH) / dstH);
    const y1 = Math.max(y0 + 1, Math.ceil(((dy + 1) * srcH) / dstH));
    for (let dx = 0; dx < dstW; dx++) {
      const x0 = Math.floor((dx * srcW) / dstW);
      const x1 = Math.max(x0 + 1, Math.ceil(((dx + 1) * srcW) / dstW));
      let r = 0;
      let g = 0;
      let b = 0;
      let n = 0;
      for (let sy = y0; sy < y1 && sy < srcH; sy++) {
        for (let sx = x0; sx < x1 && sx < srcW; sx++) {
          const i = (sy * srcW + sx) * 3;
          r += rgb[i];
          g += rgb[i + 1];
          b += rgb[i + 2];
          n++;
        }
      }
      const o = (dy * dstW + dx) * 3;
      out[o] = Math.round(r / n);
      out[o + 1] = Math.round(g / n);
      out[o + 2] = Math.round(b / n);
    }
  }
  return out;
}

/** 写 24bpp BMP（bottom-up，行按 4 字节对齐）。 */
function encodeBmp(rgb, width, height) {
  const rowSize = Math.ceil((width * 3) / 4) * 4;
  const pixelBytes = rowSize * height;
  const dataOffset = 14 + 40;
  const buf = Buffer.alloc(dataOffset + pixelBytes);

  buf.write('BM', 0, 'ascii');
  buf.writeUInt32LE(buf.length, 2);
  buf.writeUInt32LE(0, 6);
  buf.writeUInt32LE(dataOffset, 10);

  buf.writeUInt32LE(40, 14);       // BITMAPINFOHEADER
  buf.writeInt32LE(width, 18);
  buf.writeInt32LE(height, 22);    // 正数 = bottom-up
  buf.writeUInt16LE(1, 26);        // planes
  buf.writeUInt16LE(24, 28);       // bpp
  buf.writeUInt32LE(0, 30);        // BI_RGB
  buf.writeUInt32LE(pixelBytes, 34);
  buf.writeInt32LE(2835, 38);      // 72 DPI
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

/** 反解 BMP 像素（仅用于自检：确认写出来的 BMP 与源 PNG 逐像素一致）。 */
function decodeBmpRgb(buf) {
  if (!isBmp(buf)) throw new Error('不是 BMP');
  const width = buf.readInt32LE(18);
  const rawHeight = buf.readInt32LE(22);
  const height = Math.abs(rawHeight);
  const bpp = buf.readUInt16LE(28);
  if (bpp !== 24) throw new Error('自检只支持 24bpp BMP，当前 ' + bpp);
  const dataOffset = buf.readUInt32LE(10);
  const rowSize = Math.ceil((width * 3) / 4) * 4;
  const rgb = Buffer.alloc(width * height * 3);

  for (let y = 0; y < height; y++) {
    const srcY = rawHeight > 0 ? height - 1 - y : y;
    let src = dataOffset + srcY * rowSize;
    let dst = y * width * 3;
    for (let x = 0; x < width; x++) {
      rgb[dst++] = buf[src + 2];
      rgb[dst++] = buf[src + 1];
      rgb[dst++] = buf[src];
      src += 3;
    }
  }
  return { width, height, rgb };
}

function main() {
  const argv = process.argv.slice(2);

  // --resize WxH：转换前先缩放（MUI 的 installerHeader 要 150x57、installerSidebar 要 164x314）
  let resize = null;
  const args = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--resize') {
      const m = /^(\d+)x(\d+)$/.exec(argv[++i] || '');
      if (!m) {
        console.log('--resize 的格式应为 宽x高，例如 --resize 164x314');
        process.exit(1);
      }
      resize = { w: Number(m[1]), h: Number(m[2]) };
    } else {
      args.push(argv[i]);
    }
  }

  if (!args.length) {
    console.log('用法：');
    console.log('  node scripts/png-to-bmp.js --check <文件...>');
    console.log('  node scripts/png-to-bmp.js <输入.png> [输出.bmp] [--resize 宽x高]');
    process.exit(1);
  }

  if (args[0] === '--check') {
    const files = args.slice(1);
    if (!files.length) {
      console.log('--check 需要至少一个文件');
      process.exit(1);
    }
    let bad = 0;
    for (const f of files) {
      const abs = path.resolve(process.cwd(), f);
      const buf = fs.readFileSync(abs);
      const bmp = isBmp(buf);
      const png = isPng(buf);
      const mark = bmp ? '✅ BMP' : png ? '❌ PNG（假 BMP！MUI 会静默忽略）' : '❌ 未知格式';
      const extra = bmp ? '  ' + JSON.stringify(bmpInfo(buf)) : '';
      console.log(mark + '  ' + path.relative(process.cwd(), abs) + extra);
      if (!bmp) bad++;
    }
    process.exit(bad ? 1 : 0);
  }

  const input = path.resolve(process.cwd(), args[0]);
  const output = args[1] ? path.resolve(process.cwd(), args[1]) : input;

  const src = fs.readFileSync(input);
  const decoded = decodePng(src);
  let { width, height, rgb } = decoded;
  const srcSize = width + 'x' + height;

  if (resize && (resize.w !== width || resize.h !== height)) {
    rgb = resizeAreaAvg(rgb, width, height, resize.w, resize.h);
    width = resize.w;
    height = resize.h;
  }

  const bmp = encodeBmp(rgb, width, height);

  // 自检：反解刚写出来的 BMP，必须与源像素逐字节一致（能抓住行序/通道序写反）
  const back = decodeBmpRgb(bmp);
  if (back.width !== width || back.height !== height) {
    throw new Error('自检失败：BMP 尺寸 ' + back.width + 'x' + back.height + ' 与源 ' + width + 'x' + height + ' 不一致');
  }
  if (!back.rgb.equals(rgb)) {
    throw new Error('自检失败：BMP 像素与源 PNG 不一致');
  }

  fs.writeFileSync(output, bmp);
  console.log(
    '✅ ' + path.relative(process.cwd(), input) + ' -> ' + path.relative(process.cwd(), output) +
      '  ' + srcSize + (resize ? ' → ' + width + 'x' + height : '') + ' 24bpp  ' + bmp.length + 'B（像素自检通过）'
  );
}

main();
