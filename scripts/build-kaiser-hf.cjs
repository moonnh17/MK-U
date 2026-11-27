// 마기카이저 동작 손질: 원본에서 잘리거나(돌진 시작·명령) 몸이 작게 그려진(미사일·교차) 동작을
// 힉스필드(GPT Image 2.6, 투명 2×2 칸 4프레임, scripts/art-src/kaiser-hf/<단계>_<동작>.png)로 다시 그린 프레임으로 바꾼다.
//
// 원본 스프라이트 폴더 없이도 돌도록, 만들어진 시트(public/assets/mku/enemy_magi_kaiser_phase2·3.png)를 처음 한 번
// scripts/art-src/kaiser-hf/base/에 보관하고, 늘 그 보관본에서 다시 만든다(여러 번 돌려도 같은 결과).
// 칸마다 빛 번짐(알파 110 미만)을 지우고, 대기 첫 칸의 몸 높이 × heightK로 줄여 대기 몸과 같은 바닥·가운데에 놓은 뒤
// 시트의 다른 프레임처럼 1px 붉은 테두리를 두른다. fps·반복은 원래 동작 그대로.
// 실행: node scripts/build-kaiser-hf.cjs (art.json의 두 항목만 바꾼다). build-art가 시트를 다시 만들면 이것도 다시 돌린다.
const fs = require('fs');
const path = require('path');
const k = require('./pngkit.cjs');

const REPO = path.resolve(__dirname, '..');
const SRC = path.join(REPO, 'scripts/art-src/kaiser-hf');
const BASE = path.join(SRC, 'base');
const OUT = path.join(REPO, 'public/assets/mku');
const OUTLINE = [255, 36, 36];
const GLOW_CUT = 110;
/** 시트 → 바꿀 동작: [원본 그림, 몸 높이 배율] */
const SHEETS = {
  enemy_magi_kaiser_phase2: { dashStart: ['p2_dashStart', 0.92], missile: ['p2_missile', 1], cross: ['p2_cross', 1] },
  enemy_magi_kaiser_phase3: { dashStart: ['p3_dashStart', 0.92], missile: ['p3_missile', 1], cross: ['p3_cross', 1], command: ['p3_command', 1] },
};

function quadrants(file) {
  const im = k.read(path.join(SRC, `${file}.png`));
  const hw = Math.floor(im.w / 2), hh = Math.floor(im.h / 2);
  return [[0, 0], [hw, 0], [0, hh], [hw, hh]].map(([x, y]) => {
    const q = k.crop(im, x, y, hw, hh);
    for (let i = 3; i < q.px.length; i += 4) if (q.px[i] < GLOW_CUT) q.px[i] = 0;
    const b = k.bbox(q, 0);
    return k.crop(q, b.x, b.y, b.w, b.h);
  });
}

/** 칸 안의 그림에 1px 테두리 (시트의 다른 프레임과 같은 모양) */
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

/** 이펙트 한 장: key: [파일, 화면 폭 px, 알파 기준] */
const SINGLES = { fx_kz_lock: ['lock', 40, 0.4], fx_kz_shard: ['shard', 12, 0.35] };

function buildKaiserHf(art) {
  fs.mkdirSync(BASE, { recursive: true });
  const out = {};
  for (const [key, [file, w, cut]] of Object.entries(SINGLES)) {
    const im = k.read(path.join(SRC, `${file}.png`));
    const b = k.bbox(im, 40);
    const c = k.crop(im, b.x, b.y, b.w, b.h);
    const fw = w * 2;
    const fh = Math.max(1, Math.round((c.h * fw) / c.w));
    k.write(path.join(OUT, `${key}.png`), k.resize(c, fw, fh, cut));
    out[key] = { file: `mku/${key}.png`, frameWidth: fw, frameHeight: fh, frames: 1, density: 2 };
  }
  for (const [key, replace] of Object.entries(SHEETS)) {
    const basePng = path.join(BASE, `${key}.png`);
    const baseJson = path.join(BASE, `${key}.json`);
    if (!fs.existsSync(basePng)) {
      fs.copyFileSync(path.join(OUT, `${key}.png`), basePng);
      fs.writeFileSync(baseJson, JSON.stringify(art.sprites[key], null, 2) + '\n');
    }
    const s = JSON.parse(fs.readFileSync(baseJson, 'utf8'));
    const im = k.read(basePng);
    const per = Math.floor(im.w / s.frameWidth);
    const cell = (i) => k.crop(im, (i % per) * s.frameWidth, Math.floor(i / per) * s.frameHeight, s.frameWidth, s.frameHeight);
    // 대기 첫 칸(테두리 1px 포함)의 몸
    const idle = cell(s.anims.idle.from);
    const rb = k.bbox(idle, 40);
    const frames = [];
    const anims = {};
    for (const [name, a] of Object.entries(s.anims)) {
      let list;
      if (replace[name]) {
        const [file, hk] = replace[name];
        const qs = quadrants(file);
        const hs = qs.map((f) => f.h).sort((x, y) => x - y);
        const sc = ((rb.h - 2) * hk) / hs[Math.floor(hs.length / 2)];
        list = qs.map((f) => {
          // 칸을 넘으면(팔을 든 명령 자세 등) 비율을 지킨 채 칸에 맞춘다
          const fit = Math.min(1, (s.frameWidth - 2) / (f.w * sc), (s.frameHeight - 2) / (f.h * sc));
          const r = k.resize(f, Math.max(1, Math.round(f.w * sc * fit)), Math.max(1, Math.round(f.h * sc * fit)), 0.5);
          const c = k.blank(s.frameWidth, s.frameHeight);
          const x = Math.max(1, Math.min(s.frameWidth - r.w - 1, Math.round(rb.x + rb.w / 2 - r.w / 2)));
          const y = Math.max(1, rb.y + rb.h - 1 - r.h);
          k.paste(c, r, x, y);
          return outline(c);
        });
      } else {
        list = Array.from({ length: a.to - a.from + 1 }, (_, j) => cell(a.from + j));
      }
      anims[name] = { ...a, from: frames.length, to: frames.length + list.length - 1 };
      frames.push(...list);
    }
    const rows = Math.ceil(frames.length / per);
    const sheet = k.blank(per * s.frameWidth, rows * s.frameHeight);
    frames.forEach((f, i) => k.paste(sheet, f, (i % per) * s.frameWidth, Math.floor(i / per) * s.frameHeight));
    k.write(path.join(OUT, `${key}.png`), sheet);
    out[key] = { ...s, frames: frames.length, anims };
  }
  return out;
}

module.exports = { buildKaiserHf };

if (require.main === module) {
  const artPath = path.join(REPO, 'src/data/art.json');
  const art = JSON.parse(fs.readFileSync(artPath, 'utf8'));
  const built = buildKaiserHf(art);
  Object.assign(art.sprites, built);
  fs.writeFileSync(artPath, JSON.stringify(art, null, 2) + '\n');
  console.log(Object.entries(built).map(([key, v]) => `${key} ${v.frameWidth}×${v.frameHeight} ×${v.frames}`).join('\n'));
}
