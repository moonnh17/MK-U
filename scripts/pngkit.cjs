// 의존성 없는 PNG 도구: 읽기(8비트 RGB/RGBA, 비인터레이스), 쓰기(RGBA), 자르기, 영역 평균 축소, 여백 자르기, 이어 붙이기
const fs = require('fs');
const zlib = require('zlib');

const CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc = (b) => {
  let c = 0xffffffff;
  for (const x of b) c = CRC[(c ^ x) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

function read(file) {
  const buf = fs.readFileSync(file);
  let p = 8;
  let w = 0, h = 0, ct = 0, depth = 0, inter = 0;
  const idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p);
    const type = buf.toString('ascii', p + 4, p + 8);
    const data = buf.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') {
      w = data.readUInt32BE(0); h = data.readUInt32BE(4); depth = data[8]; ct = data[9]; inter = data[12];
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    p += 12 + len;
  }
  if (depth !== 8 || inter !== 0 || (ct !== 2 && ct !== 6)) throw new Error(`지원 안 함 ${file} ct=${ct} d=${depth} i=${inter}`);
  const bpp = ct === 6 ? 4 : 3;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = w * bpp;
  const px = Buffer.alloc(w * h * 4);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)];
    const line = Buffer.from(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)));
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? line[i - bpp] : 0, b = prev[i], c = i >= bpp ? prev[i - bpp] : 0;
      let v = line[i];
      if (f === 1) v += a;
      else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      line[i] = v & 0xff;
    }
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      px[o] = line[x * bpp]; px[o + 1] = line[x * bpp + 1]; px[o + 2] = line[x * bpp + 2]; px[o + 3] = bpp === 4 ? line[x * bpp + 3] : 255;
    }
    prev = line;
  }
  return { w, h, px };
}

function chunk(type, data) {
  const l = Buffer.alloc(4); l.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
  return Buffer.concat([l, td, c]);
}

function write(file, img) {
  const { w, h, px } = img;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) px.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = 6;
  fs.writeFileSync(file, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]));
}

function blank(w, h) { return { w, h, px: Buffer.alloc(w * h * 4) }; }

function crop(img, x, y, w, h) {
  const out = blank(w, h);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const sx = x + i, sy = y + j;
    if (sx < 0 || sy < 0 || sx >= img.w || sy >= img.h) continue;
    img.px.copy(out.px, (j * w + i) * 4, (sy * img.w + sx) * 4, (sy * img.w + sx) * 4 + 4);
  }
  return out;
}

/** 영역 평균 축소 (알파 가중), 결과 알파는 alphaCut 미만이면 0, 이상이면 255로 단단하게(도트 느낌) */
function resize(img, w, h, alphaCut = 0.5) {
  const out = blank(w, h);
  const sx = img.w / w, sy = img.h / h;
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const x0 = i * sx, x1 = (i + 1) * sx, y0 = j * sy, y1 = (j + 1) * sy;
    let r = 0, g = 0, b = 0, a = 0, area = 0;
    for (let y = Math.floor(y0); y < Math.ceil(y1); y++) {
      const wy = Math.min(y + 1, y1) - Math.max(y, y0);
      for (let x = Math.floor(x0); x < Math.ceil(x1); x++) {
        const wx = Math.min(x + 1, x1) - Math.max(x, x0);
        const k = wx * wy;
        const o = (y * img.w + x) * 4;
        const al = img.px[o + 3] / 255;
        r += img.px[o] * al * k; g += img.px[o + 1] * al * k; b += img.px[o + 2] * al * k; a += al * k; area += k;
      }
    }
    const o = (j * w + i) * 4;
    const av = a / area;
    if (alphaCut === null) {
      out.px[o + 3] = Math.round(av * 255);
    } else {
      out.px[o + 3] = av >= alphaCut ? 255 : 0;
    }
    if (a > 0) { out.px[o] = Math.round(r / a); out.px[o + 1] = Math.round(g / a); out.px[o + 2] = Math.round(b / a); }
  }
  return out;
}

/** 알파 > cut 인 영역의 테두리 상자 */
function bbox(img, cut = 16) {
  let x0 = img.w, y0 = img.h, x1 = -1, y1 = -1;
  for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) {
    if (img.px[(y * img.w + x) * 4 + 3] > cut) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

function paste(dst, src, x, y) {
  for (let j = 0; j < src.h; j++) for (let i = 0; i < src.w; i++) {
    const dx = x + i, dy = y + j;
    if (dx < 0 || dy < 0 || dx >= dst.w || dy >= dst.h) continue;
    src.px.copy(dst.px, (dy * dst.w + dx) * 4, (j * src.w + i) * 4, (j * src.w + i) * 4 + 4);
  }
}

/** 좌우 뒤집기 */
function flipX(img) {
  const out = blank(img.w, img.h);
  for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) img.px.copy(out.px, (y * img.w + (img.w - 1 - x)) * 4, (y * img.w + x) * 4, (y * img.w + x) * 4 + 4);
  return out;
}

/** 시계 방향으로 deg도 돌린다 (캔버스는 잘리지 않게 넓힌다) */
function rotate(img, deg) {
  const r = (deg * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r);
  const w = Math.ceil(Math.abs(img.w * c) + Math.abs(img.h * s)), h = Math.ceil(Math.abs(img.w * s) + Math.abs(img.h * c));
  const out = blank(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dx = x - w / 2, dy = y - h / 2;
    const sx = Math.floor(dx * c + dy * s + img.w / 2), sy = Math.floor(-dx * s + dy * c + img.h / 2);
    if (sx >= 0 && sy >= 0 && sx < img.w && sy < img.h) img.px.copy(out.px, (y * w + x) * 4, (sy * img.w + sx) * 4, (sy * img.w + sx) * 4 + 4);
  }
  return out;
}

/** (x, y)에서 가장 가까운 불투명 픽셀이 속한 덩어리만 잘라낸다 (묶음 그림에서 소품 하나 꺼내기) */
function component(img, x, y, cut = 40, search = 40) {
  const on = (i, j) => i >= 0 && j >= 0 && i < img.w && j < img.h && img.px[(j * img.w + i) * 4 + 3] > cut;
  let sx = -1, sy = -1, best = Infinity;
  for (let j = y - search; j <= y + search; j++) for (let i = x - search; i <= x + search; i++) {
    const d = (i - x) ** 2 + (j - y) ** 2;
    if (d < best && on(i, j)) { best = d; sx = i; sy = j; }
  }
  if (sx < 0) throw new Error(`component 없음 ${x},${y}`);
  const seen = new Uint8Array(img.w * img.h);
  const stack = [[sx, sy]];
  seen[sy * img.w + sx] = 1;
  let x0 = sx, x1 = sx, y0 = sy, y1 = sy;
  const pts = [];
  while (stack.length) {
    const [i, j] = stack.pop();
    pts.push(i, j);
    if (i < x0) x0 = i; if (i > x1) x1 = i; if (j < y0) y0 = j; if (j > y1) y1 = j;
    for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) {
      const a = i + di, b = j + dj;
      if (on(a, b) && !seen[b * img.w + a]) { seen[b * img.w + a] = 1; stack.push([a, b]); }
    }
  }
  const out = blank(x1 - x0 + 1, y1 - y0 + 1);
  for (let p = 0; p < pts.length; p += 2) {
    const i = pts[p], j = pts[p + 1];
    img.px.copy(out.px, ((j - y0) * out.w + (i - x0)) * 4, (j * img.w + i) * 4, (j * img.w + i) * 4 + 4);
  }
  return out;
}

module.exports = { read, write, blank, crop, resize, bbox, paste, flipX, rotate, component };
