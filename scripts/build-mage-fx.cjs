// 집행 의지체 소환체 이펙트: scripts/art-src/mage/fx_*.png → public/assets/mku/fx_summon_*.png + art.json 항목
//
// 원본은 배경이 투명한 5열×2줄 시트(1344×752), 줄마다 다른 이펙트 5프레임. 칸 안쪽만 잘라 초록 번짐(배경 제거 찌꺼기)을 지우고,
// 한 줄의 모든 프레임을 같은 틀(프레임 bbox 합, 가운데 맞춤)에 넣어 프레임마다 위치가 흔들리지 않게 한 뒤 긴 변을 size로 줄인다.
// build-art.cjs가 불러 쓰고, 혼자 실행하면(node scripts/build-mage-fx.cjs) art.json의 해당 항목만 바꾼다.
const fs = require('fs');
const path = require('path');
const k = require('./pngkit.cjs');

const REPO = path.resolve(__dirname, '..');
const SRC = path.join(REPO, 'scripts/art-src/mage');
const COLS = 5, ROWS = 2, INSET = 4, DENSITY = 2;

/** key: [시트, 줄, 긴 변(px, 시트 기준), fps, 반복] */
const ANIMS = {
  fx_summon_will_shot: ['fx_will_construct', 0, 28, 14, true],
  fx_summon_will_hit: ['fx_will_construct', 1, 48, 10, false],
  fx_summon_soldier_thrust: ['fx_magi_soldier', 0, 56, 16, false],
  fx_summon_soldier_burst: ['fx_magi_soldier', 1, 64, 14, false],
  fx_summon_golem_crush: ['fx_imitation_golem', 0, 96, 14, false],
  fx_summon_golem_shell: ['fx_imitation_golem', 1, 80, 10, false],
};

const sheets = new Map();
function sheet(name) {
  if (sheets.has(name)) return sheets.get(name);
  const im = k.read(path.join(SRC, `${name}.png`));
  for (let i = 0; i < im.w * im.h; i++) {
    const o = i * 4;
    // 초록이 빨강·파랑보다 뚜렷이 센 픽셀은 배경 찌꺼기 (이펙트는 보라·회색이라 초록이 없다)
    if (im.px[o + 1] - Math.max(im.px[o], im.px[o + 2]) > 30) im.px[o + 3] = 0;
  }
  sheets.set(name, im);
  return im;
}

function buildMageFx(outDir) {
  const out = {};
  for (const [key, [name, r, size, fps, loop]] of Object.entries(ANIMS)) {
    const im = sheet(name);
    const cw = im.w / COLS, ch = im.h / ROWS;
    const fs_ = Array.from({ length: COLS }, (_, c) => k.crop(im, Math.round(c * cw) + INSET, Math.round(r * ch) + INSET, Math.round(cw) - INSET * 2, Math.round(ch) - INSET * 2));
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const f of fs_) {
      const b = k.bbox(f, 20);
      if (!b || b.w <= 0) continue;
      x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + b.w); y1 = Math.max(y1, b.y + b.h);
    }
    const s = size / Math.max(x1 - x0, y1 - y0);
    const w = Math.max(DENSITY, Math.round(((x1 - x0) * s) / DENSITY) * DENSITY), h = Math.max(DENSITY, Math.round(((y1 - y0) * s) / DENSITY) * DENSITY);
    const all = fs_.map((f) => k.resize(k.crop(f, x0, y0, x1 - x0, y1 - y0), w, h, 0.3));
    // 원본의 옅게 사라지는 프레임은 줄이면 거의 비어 깜박임만 남는다: 가장 큰 프레임의 3% 미만이면 뺀다
    const ink = all.map((f) => { let n = 0; for (let i = 3; i < f.px.length; i += 4) if (f.px[i] > 0) n++; return n; });
    const frames = all.filter((_, i) => ink[i] >= Math.max(...ink) * 0.03);
    const img = k.blank(w * frames.length, h);
    frames.forEach((f, i) => k.paste(img, f, i * w, 0));
    k.write(path.join(outDir, `${key}.png`), img);
    out[key] = { file: `mku/${key}.png`, frameWidth: w, frameHeight: h, frames: frames.length, density: DENSITY, anims: { play: { from: 0, to: frames.length - 1, fps, loop } } };
  }
  return out;
}

module.exports = { buildMageFx };

if (require.main === module) {
  const artPath = path.join(REPO, 'src/data/art.json');
  const art = JSON.parse(fs.readFileSync(artPath, 'utf8'));
  const built = buildMageFx(path.join(REPO, 'public/assets/mku'));
  Object.assign(art.sprites, built);
  fs.writeFileSync(artPath, JSON.stringify(art, null, 2) + '\n');
  console.log(Object.entries(built).map(([key, v]) => `${key} ${v.frameWidth}×${v.frameHeight} ×${v.frames}`).join('\n'));
}
