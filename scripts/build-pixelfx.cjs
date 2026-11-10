// pixelfx(github.com/patch-gg/pixelfx, MIT, LICENSE는 art-src/pixelfx에) 이펙트 시트 → public/assets/mku/<key>.png + art.json 항목
//
// 원본은 pixelfx에서 `node tools/render.mjs <id> --sheet --fps 18`로 뽑은 격자 시트(PNG + JSON)를 scripts/art-src/pixelfx에 둔다.
// 18fps는 juice.fxAnim의 재생 속도다. pixelfx 1px을 게임 0.5px로 보여(density 2) 다른 고밀도 그림과 도트 크기를 맞춘다.
// 모든 프레임을 덮는 상자로 빈 여백을 잘라 가로 한 줄로 잇는다.
// build-art.cjs가 불러 쓰고, 혼자 실행하면(node scripts/build-pixelfx.cjs) art.json의 해당 항목만 바꾼다.
const fs = require('fs');
const path = require('path');
const k = require('./pngkit.cjs');

const REPO = path.resolve(__dirname, '..');
const SRC = path.join(REPO, 'scripts/art-src/pixelfx');
const DENSITY = 2;
/**
 * spriteKey → art-src/pixelfx 안의 시트 이름. 우리가 만든 이펙트의 원본 코드는 art-src/pixelfx/src(pixelfx의 src/fx/mku에 넣어 뽑는다).
 * center: 이펙트 기준점을 가운데에 두고 위아래·좌우를 같게 자른다(게임이 그림 가운데에 놓는 것). play: 'play' 애니메이션(once 한 번, loop 반복)
 */
const FX = {
  fx_death_dark: { name: 'death-dark', center: true },
  ...Object.fromEntries([1, 2, 3, 4].flatMap((t) => [
    [`fx_w_slash${t}`, { name: `w-slash${t}`, center: true, play: 'once' }],
    [`fx_w_thrust${t}`, { name: `w-thrust${t}`, play: 'once' }],
    [`fx_w_smash${t}`, { name: `w-smash${t}`, center: true, play: 'once' }],
    // 탄은 머리가 판정 가운데에 오게
    [`fx_w_bullet${t}`, { name: `w-bullet${t}`, center: true, play: 'loop' }],
    [`fx_w_orb${t}`, { name: `w-orb${t}`, center: true, play: 'loop' }],
    [`fx_w_muzzle${t}`, { name: `w-muzzle${t}`, play: 'once' }],
  ])),
  fx_w_beam3: { name: 'w-beam3', play: 'once' },
  fx_w_beam4: { name: 'w-beam4', play: 'once' },
  fx_w_flame: { name: 'w-flame', center: true, play: 'loop' },
};

function buildPixelfx(outDir) {
  const out = {};
  for (const [key, { name, center, play }] of Object.entries(FX)) {
    const meta = JSON.parse(fs.readFileSync(path.join(SRC, `${name}.json`), 'utf8')).meta.pixelfx;
    const sheet = k.read(path.join(SRC, `${name}.png`));
    const [fw, fh] = meta.frameSize;
    const frames = Array.from({ length: meta.frames }, (_, i) => k.crop(sheet, (i % meta.columns) * fw, Math.floor(i / meta.columns) * fh, fw, fh));
    let x0 = fw, y0 = fh, x1 = 0, y1 = 0;
    for (const f of frames) {
      const b = k.bbox(f, 0);
      if (!b) continue;
      x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + b.w); y1 = Math.max(y1, b.y + b.h);
    }
    if (center) {
      // 기준점에서 가장 먼 쪽만큼 양쪽을 같게
      const [ox, oy] = meta.pivot ?? meta.origin;
      const hx = Math.max(ox - x0, x1 - ox), hy = Math.max(oy - y0, y1 - oy);
      x0 = Math.max(0, ox - hx); x1 = Math.min(fw, ox + hx); y0 = Math.max(0, oy - hy); y1 = Math.min(fh, oy + hy);
    }
    // density로 나눠 떨어지게 짝수로 넓힌다
    const w = Math.ceil((x1 - x0) / DENSITY) * DENSITY, h = Math.ceil((y1 - y0) / DENSITY) * DENSITY;
    const strip = k.blank(w * frames.length, h);
    frames.forEach((f, i) => k.paste(strip, k.crop(f, x0, y0, w, h), i * w, 0));
    k.write(path.join(outDir, `${key}.png`), strip);
    out[key] = { file: `mku/${key}.png`, frameWidth: w, frameHeight: h, frames: frames.length, density: DENSITY };
    if (play) out[key].anims = { play: { from: 0, to: frames.length - 1, fps: meta.fps, loop: play === 'loop' } };
  }
  return out;
}

module.exports = { buildPixelfx };

if (require.main === module) {
  const artPath = path.join(REPO, 'src/data/art.json');
  const art = JSON.parse(fs.readFileSync(artPath, 'utf8'));
  Object.assign(art.sprites, buildPixelfx(path.join(REPO, 'public/assets/mku')));
  fs.writeFileSync(artPath, JSON.stringify(art, null, 2) + '\n');
  console.log(Object.keys(FX).map((key) => `${key} ${art.sprites[key].frameWidth}×${art.sprites[key].frameHeight} ×${art.sprites[key].frames}`).join('\n'));
}
