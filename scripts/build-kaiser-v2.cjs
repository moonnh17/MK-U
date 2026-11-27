// 마기카이저 전체 다시 그리기 (v2): 힉스필드(GPT Image 2.6, 투명 2×2 칸 4프레임)로 그린
// scripts/art-src/kaiser-v2/<단계>_<동작>.png 에서 본체 시트 4장(enemy_magi_kaiser, _phase1~3)을 만든다.
// 1단계는 구속 틀 안, 2단계는 깔끔한 본래 모습, 3단계는 갈라지고 번개가 튀는 불안정한 모습.
//
// 칸 나누기: 2048px 그림을 반으로 자르되, 옆 칸에서 넘어온 조각(칸 테두리에 닿은 작은 덩어리)은 지운다.
// 크기: 단계마다 대기 첫 칸의 가로·세로 중 큰 쪽이 fit(게임 px)이 되는 배율 하나를 그 단계 모든 동작에 쓴다.
// 위치: 원본 칸 안의 위치를 그대로 옮긴다(원본 칸 가운데 → 시트 칸 가운데, 그 그림의 가장 낮은 발 → 칸 바닥).
// 동작 이름은 bosses.json poses가 쓰는 이름 그대로, 프레임 수가 바뀐 동작은 원래 길이(초)를 지키도록 fps를 맞췄다.
// 실행: node scripts/build-kaiser-v2.cjs (art.json의 네 항목만 바꾼다). build-art 끝에서도 다시 돈다.
const fs = require('fs');
const path = require('path');
const k = require('./pngkit.cjs');

const REPO = path.resolve(__dirname, '..');
const SRC = path.join(REPO, 'scripts/art-src/kaiser-v2');
const OUT = path.join(REPO, 'public/assets/mku');
const DENSITY = 2;
const OUTLINE = [255, 36, 36];
const GLOW_CUT = 110;
/** 옆 칸에서 넘어온 조각으로 볼 크기 (본체 대비) */
const BLEED_MAX = 0.04;

/** [그림, 칸 번호들, fps, 반복] */
const P2 = {
  idle: ['p2_idle_a', [0, 1, 2, 3], 7],
  move: ['p2_move', [0, 1, 2, 3], 8],
  transition: ['p1_transition', [0, 1, 2, 3], 2.67, false],
  punchWindup: ['p2_punch', [0, 1], 1.82, false],
  punchStrike: ['p2_punch', [2, 3], 6.67, false],
  laser: ['p2_laser', [0, 1, 2, 3], 8, false],
  dashStart: ['p2_dashStart', [0, 1, 2, 3], 3, false],
  dash: ['p2_dash', [0, 1], 10],
  dashEnd: ['p2_dash', [2, 3], 6, false],
  missile: ['p2_missile', [0, 1, 2, 3], 6, false],
  cross: ['p2_cross', [0, 1, 2, 3], 8, false],
};
const P3 = {
  idle: ['p3_idle', [0, 1, 2, 3], 8],
  move: ['p3_move', [0, 1, 2, 3], 8],
  transition: ['p2_transition', [0, 1, 2, 3], 3.2, false],
  command: ['p3_command', [0, 1, 2, 3], 5],
  punchWindup: ['p3_punch', [0, 1], 1.82, false],
  punchStrike: ['p3_punch', [2, 3], 6.67, false],
  laser: ['p3_laser', [0, 1, 2, 3], 8, false],
  dashStart: ['p3_dashStart', [0, 1, 2, 3], 3, false],
  dash: ['p3_dash', [0, 1], 10],
  dashEnd: ['p3_dash', [2, 3], 6, false],
  missile: ['p3_missile', [0, 1, 2, 3], 6, false],
  cross: ['p3_cross', [0, 1, 2, 3], 8, false],
};
/** 시트 → [동작들, fit(게임 px)] */
const SHEETS = {
  enemy_magi_kaiser: [{ idle: ['p2_idle_a', [0, 1, 2, 3], 4], move: ['p2_move', [0, 1, 2, 3], 6] }, 99],
  enemy_magi_kaiser_phase1: [{ idle: ['p1_idle', [0, 1, 2, 3], 7] }, 99],
  enemy_magi_kaiser_phase2: [P2, 99],
  enemy_magi_kaiser_phase3: [P3, 105],
};

const cache = new Map();
/** 원본 한 장 → 칸 4개 {img, bx,by,bw,bh(칸 안 그림 상자), cw,ch} 와 그 장의 바닥선 */
function cells(file, src = SRC) {
  const ck = `${src}/${file}`;
  if (cache.has(ck)) return cache.get(ck);
  const im = k.read(path.join(src, `${file}.png`));
  const hw = Math.floor(im.w / 2), hh = Math.floor(im.h / 2);
  const list = [[0, 0], [hw, 0], [0, hh], [hw, hh]].map(([x, y]) => {
    const q = k.crop(im, x, y, hw, hh);
    for (let i = 3; i < q.px.length; i += 4) if (q.px[i] < GLOW_CUT) q.px[i] = 0;
    const comps = k.components(q, 0);
    const main = comps.reduce((p, c) => (c.area > p.area ? c : p));
    for (const c of comps) {
      if (c === main || c.area > main.area * BLEED_MAX) continue;
      if (c.x0 === 0 || c.y0 === 0 || c.x1 === hw - 1 || c.y1 === hh - 1) for (const p of c.pts) q.px[p * 4 + 3] = 0;
    }
    const b = k.bbox(q, 0);
    return { img: q, b, cw: hw, ch: hh };
  });
  const base = Math.max(...list.map((c) => c.b.y + c.b.h));
  const out = { list, base };
  cache.set(ck, out);
  return out;
}

/** 칸 안의 그림에 1px 테두리 (다른 적 시트와 같은 모양) */
function outline(c) {
  const on = (x, y) => x >= 0 && y >= 0 && x < c.w && y < c.h && c.px[(y * c.w + x) * 4 + 3] > 0;
  const marks = [];
  for (let y = 0; y < c.h; y++) for (let x = 0; x < c.w; x++) if (!on(x, y) && (on(x - 1, y) || on(x + 1, y) || on(x, y - 1) || on(x, y + 1))) marks.push((y * c.w + x) * 4);
  for (const o of marks) {
    c.px[o] = OUTLINE[0];
    c.px[o + 1] = OUTLINE[1];
    c.px[o + 2] = OUTLINE[2];
    c.px[o + 3] = 255;
  }
  return c;
}

/** 시트 한 장. src: 원본 폴더 (다른 보스도 같은 방식으로 쓴다), 동작 값 [그림, 칸들, fps, 반복, 거꾸로] */
function buildSheet(key, anims, fit, src = SRC, withOutline = true) {
  const idle = cells(anims.idle[0], src).list[anims.idle[1][0]].b;
  const s = (fit * DENSITY) / Math.max(idle.w, idle.h);
  // 프레임마다 칸 가운데·바닥선 기준 상대 위치 (줄인 뒤 px)
  const items = [];
  for (const [name, [file, idx, fps, loop]] of Object.entries(anims)) {
    const { list, base } = cells(file, src);
    for (const i of idx) {
      const c = list[i];
      const r = k.resize(k.crop(c.img, c.b.x, c.b.y, c.b.w, c.b.h), Math.max(1, Math.round(c.b.w * s)), Math.max(1, Math.round(c.b.h * s)), 0.5);
      items.push({ name, fps, loop, r, dx: (c.b.x - c.cw / 2) * s, dy: (c.b.y - base) * s });
    }
  }
  // 칸 크기: 모든 프레임이 들어가는 가운데 대칭 폭, 바닥선 위 높이 (+ 테두리 여백)
  const half = Math.ceil(Math.max(...items.map((it) => Math.max(-it.dx, it.dx + it.r.w)))) + 1;
  const up = Math.ceil(Math.max(...items.map((it) => -it.dy))) + 1;
  const down = Math.ceil(Math.max(0, ...items.map((it) => it.dy + it.r.h))) + 1;
  const even = (v) => Math.ceil(v / DENSITY) * DENSITY;
  const fw = even(half * 2), fh = even(up + down);
  const frames = items.map((it) => {
    const c = k.blank(fw, fh);
    k.paste(c, it.r, Math.round(fw / 2 + it.dx), Math.round(up + it.dy));
    return withOutline ? outline(c) : c;
  });
  const animOut = {};
  let at = 0;
  for (const it of items) {
    const a = animOut[it.name];
    if (a) a.to = at;
    else animOut[it.name] = { from: at, to: at, fps: it.fps, ...(it.loop === false ? { loop: false } : {}) };
    at++;
  }
  const per = Math.max(1, Math.floor(4096 / fw));
  const rows = Math.ceil(frames.length / per);
  const sheet = k.blank(Math.min(per, frames.length) * fw, rows * fh);
  frames.forEach((f, i) => k.paste(sheet, f, (i % per) * fw, Math.floor(i / per) * fh));
  k.write(path.join(OUT, `${key}.png`), sheet);
  return { file: `mku/${key}.png`, frameWidth: fw, frameHeight: fh, frames: frames.length, density: DENSITY, anims: animOut };
}

function buildKaiserV2() {
  const out = {};
  for (const [key, [anims, fit]] of Object.entries(SHEETS)) out[key] = buildSheet(key, anims, fit);
  return out;
}

module.exports = { buildKaiserV2, buildSheet };

if (require.main === module) {
  const artPath = path.join(REPO, 'src/data/art.json');
  const art = JSON.parse(fs.readFileSync(artPath, 'utf8'));
  const built = buildKaiserV2();
  Object.assign(art.sprites, built);
  fs.writeFileSync(artPath, JSON.stringify(art, null, 2) + '\n');
  console.log(Object.entries(built).map(([key, v]) => `${key} ${v.frameWidth}×${v.frameHeight} ×${v.frames}`).join('\n'));
}
