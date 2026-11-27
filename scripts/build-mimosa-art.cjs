// 오버플로우 4-5 헥타르 미모사 본체: 힉스필드(GPT Image 2.6, 투명 배경 2048px) 2×2 칸 시트 3장 → 한 줄 시트 + art.json 항목
//
// 원본 scripts/art-src/mimosa-hf/idle·swing·command.png (첨부 참조 그림 + idle을 참조로 같은 기계·자세를 맞춤).
// 칸마다 바깥 빛 번짐(낮은 알파)을 잘라 도트가 뭉개지지 않게 하고, 기계 바닥(아래 1/4 가운데)을 맞춰 흔들리지 않게 잇는다.
// build-art가 불러 쓰고, 혼자 실행하면(node scripts/build-mimosa-art.cjs) art.json의 해당 항목만 바꾼다.
const fs = require('fs');
const path = require('path');
const k = require('./pngkit.cjs');

const REPO = path.resolve(__dirname, '..');
const SRC = path.join(REPO, 'scripts/art-src/mimosa-hf');
const DENSITY = 2;
/** 기계 폭(게임 px): 누운 몸이 플레이어 키(약 24px)와 비슷하게 */
const WIDTH = 66;
/** 이 알파 아래는 빛 번짐으로 보고 지운다 */
const GLOW_CUT = 110;
/** 이름 → [원본, fps, 반복] */
const ANIMS = { idle: ['idle', 5, true], swing: ['swing', 10, false], command: ['command', 8, false] };

function quadrants(im) {
  const hw = Math.floor(im.w / 2);
  const hh = Math.floor(im.h / 2);
  return [
    [0, 0],
    [hw, 0],
    [0, hh],
    [hw, hh],
  ].map(([x, y]) => {
    const q = k.crop(im, x, y, hw, hh);
    for (let i = 3; i < q.px.length; i += 4) if (q.px[i] < GLOW_CUT) q.px[i] = 0;
    const b = k.bbox(q, 0);
    return k.crop(q, b.x, b.y, b.w, b.h);
  });
}

/** 바닥 가로 자리: 아래 1/4 불투명 픽셀의 가운데 */
function baseX(im) {
  let sum = 0;
  let n = 0;
  for (let y = Math.floor(im.h * 0.75); y < im.h; y++) for (let x = 0; x < im.w; x++) if (im.px[(y * im.w + x) * 4 + 3] > 200) {
    sum += x;
    n++;
  }
  return n ? sum / n : im.w / 2;
}

/** 패턴 그림 (힉스필드 한 장): key: [파일, 화면 폭 px, 알파 기준] */
const SINGLES = {
  fx_mim_drone: ['drone', 12, 0.4],
  fx_mim_pylon: ['pylon', 18, 0.4],
  fx_mim_cube: ['cube', 22, 0.3],
  fx_mim_beam: ['beam', 22, 0.3],
  fx_mim_reticle: ['reticle', 48, 0.35],
  fx_mim_cover: ['cover', 30, 0.4],
};

function buildMimosaArt(outDir) {
  const out = {};
  for (const [key, [file, w, cut]] of Object.entries(SINGLES)) {
    const im = k.read(path.join(SRC, `${file}.png`));
    const b = k.bbox(im, 40);
    const c = k.crop(im, b.x, b.y, b.w, b.h);
    const fw = w * DENSITY;
    const fh = Math.max(1, Math.round((c.h * fw) / c.w));
    k.write(path.join(outDir, `${key}.png`), k.resize(c, fw, fh, cut));
    out[key] = { file: `mku/${key}.png`, frameWidth: fw, frameHeight: fh, frames: 1, density: DENSITY };
  }
  const raw = Object.fromEntries(Object.entries(ANIMS).map(([name, [src]]) => [name, quadrants(k.read(path.join(SRC, `${src}.png`)))]));
  // 배율은 대기 칸 폭(중앙값) 하나로: 팔을 들면 칸이 위로 커진다
  const ws = raw.idle.map((f) => f.w).sort((a, b) => a - b);
  const s = (WIDTH * DENSITY) / ws[Math.floor(ws.length / 2)];
  const frames = [];
  const anims = {};
  for (const [name, [, fps, loop]] of Object.entries(ANIMS)) {
    const list = raw[name].map((f) => k.resize(f, Math.max(1, Math.round(f.w * s)), Math.max(1, Math.round(f.h * s)), 0.5));
    anims[name] = { from: frames.length, to: frames.length + list.length - 1, fps, ...(loop ? {} : { loop: false }) };
    frames.push(...list);
  }
  const half = Math.ceil(Math.max(...frames.map((f) => Math.max(baseX(f), f.w - baseX(f)))));
  const fw = half * 2;
  const fh = Math.max(...frames.map((f) => f.h));
  const sheet = k.blank(fw * frames.length, fh);
  frames.forEach((f, i) => k.paste(sheet, f, i * fw + Math.round(half - baseX(f)), fh - f.h));
  k.write(path.join(outDir, 'boss_mimosa.png'), sheet);
  out.boss_mimosa = { file: 'mku/boss_mimosa.png', frameWidth: fw, frameHeight: fh, frames: frames.length, density: DENSITY, anims };
  return out;
}

module.exports = { buildMimosaArt };

if (require.main === module) {
  const artPath = path.join(REPO, 'src/data/art.json');
  const art = JSON.parse(fs.readFileSync(artPath, 'utf8'));
  const built = buildMimosaArt(path.join(REPO, 'public/assets/mku'));
  Object.assign(art.sprites, built);
  fs.writeFileSync(artPath, JSON.stringify(art, null, 2) + '\n');
  console.log(Object.entries(built).map(([key, v]) => `${key} ${v.frameWidth}×${v.frameHeight} ×${v.frames}`).join('\n'));
}
