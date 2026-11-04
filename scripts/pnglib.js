// 零依赖 PNG 编码 + 时钟图标绘制（网页 PWA 与安卓启动图标共用）
// 几何全部用归一化坐标 [0,1]，任意分辨率等比渲染
import { deflateSync } from 'node:zlib';

// ---------- PNG 编码 ----------
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

export function encodePNG(width, height, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------- 图标几何（归一化坐标） ----------
function distToSeg(px, py, ax, ay, bx, by) {
  const abx = bx - ax;
  const aby = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * abx + (py - ay) * aby) / (abx * abx + aby * aby)));
  return Math.hypot(px - (ax + abx * t), py - (ay + aby * t));
}

const GRAD = { from: [79, 110, 247], to: [124, 77, 255] }; // #4F6EF7 -> #7C4DFF

function bgGradient(v) {
  const t = Math.min(1, Math.max(0, v));
  return [
    Math.round(GRAD.from[0] + (GRAD.to[0] - GRAD.from[0]) * t),
    Math.round(GRAD.from[1] + (GRAD.to[1] - GRAD.from[1]) * t),
    Math.round(GRAD.from[2] + (GRAD.to[2] - GRAD.from[2]) * t),
  ];
}

function whiteClock(u, v, cx, cy, ringR, ringW, handW, minuteLen, hourLen, dotR) {
  const d = Math.hypot(u - cx, v - cy);
  if (Math.abs(d - ringR) <= ringW / 2) return true;
  const ang = Math.PI / 3; // 10:10 经典指针角度
  const mTip = [cx + Math.sin(ang) * minuteLen, cy - Math.cos(ang) * minuteLen];
  const hTip = [cx - Math.sin(ang) * hourLen, cy - Math.cos(ang) * hourLen];
  if (distToSeg(u, v, cx, cy, mTip[0], mTip[1]) <= handW) return true;
  if (distToSeg(u, v, cx, cy, hTip[0], hTip[1]) <= handW) return true;
  return d <= dotR;
}

// style:
//  rounded    渐变圆角方块 + 白钟（PWA 图标）
//  maskable   渐变全出血方块 + 缩小的白钟（PWA maskable / iOS）
//  gradient   渐变全出血方块 + 常规白钟（安卓自适应图标背景层）
//  foreground 透明底 + 白钟（安卓自适应图标前景层，需留在安全区内）
function sampleIcon(u, v, style) {
  if (style === 'foreground') {
    const hit = whiteClock(u, v, 0.5, 0.52, 0.2, 0.044, 0.032, 0.125, 0.095, 0.026);
    return hit ? [255, 255, 255, 255] : [0, 0, 0, 0];
  }
  const base = bgGradient(v);
  if (style === 'rounded') {
    const rad = 0.225;
    const nx = Math.max(rad, Math.min(1 - rad, u));
    const ny = Math.max(rad, Math.min(1 - rad, v));
    if (Math.hypot(u - nx, v - ny) > rad) return [0, 0, 0, 0];
  }
  const shrink = style === 'maskable' ? 0.72 : 1;
  const hit = whiteClock(
    u,
    v,
    0.5,
    0.523 * (style === 'maskable' ? 0.97 : 1),
    0.293 * shrink,
    0.0664 * shrink,
    0.0508 * shrink,
    0.186 * shrink,
    0.141 * shrink,
    0.039 * shrink
  );
  return hit ? [255, 255, 255, 255] : [...base, 255];
}

// 渲染一张 sizePx × sizePx 图标（3x3 超采样抗锯齿）
export function renderIcon(sizePx, style) {
  const SS = 3;
  const rgba = Buffer.alloc(sizePx * sizePx * 4);
  for (let py = 0; py < sizePx; py++) {
    for (let px = 0; px < sizePx; px++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const u = (px + (sx + 0.5) / SS) / sizePx;
          const v = (py + (sy + 0.5) / SS) / sizePx;
          const c = sampleIcon(u, v, style);
          r += c[0];
          g += c[1];
          b += c[2];
          a += c[3];
        }
      }
      const n = SS * SS;
      const i = (py * sizePx + px) * 4;
      rgba[i] = Math.round(r / n);
      rgba[i + 1] = Math.round(g / n);
      rgba[i + 2] = Math.round(b / n);
      rgba[i + 3] = Math.round(a / n);
    }
  }
  return rgba;
}
