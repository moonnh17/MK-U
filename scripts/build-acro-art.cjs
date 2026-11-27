// 7-5 아크로 학파 연구원 미모사: 힉스필드(GPT Image 2.6) 원본 scripts/art-src/acro-mimosa → 게임 그림.
// 원본 참조: MKU-Boss-Sprites-v174/08_미모사_40분/06_정체공개_전용/원본/body-cutout.webp (ref.png)
// - enemy_acro_mimosa: 대기·순간이동(사라짐/나타남)·명령·공간 베기·합·3페이즈(살의) 한 시트 (build-kaiser-v2의 시트 만들기)
// - acro_red_floor: 3페이즈 무너진 붉은 공간 바닥(이어 붙는 무늬), story_acro_full: 정체 공개 대화 전신 그림 (portrait.png는 보관만)
// - item_debuff_*: 헥타르·아크로 미모사 디버프 아이템 아이콘 (3×3 칸, 마지막 칸 비움)
// 실행: node scripts/build-acro-art.cjs (art.json 항목만 바꾼다). build-art 끝에서도 다시 돈다.
const fs = require('fs');
const path = require('path');
const k = require('./pngkit.cjs');
const { buildSheet } = require('./build-kaiser-v2.cjs');

const REPO = path.resolve(__dirname, '..');
const SRC = path.join(REPO, 'scripts/art-src/acro-mimosa');
const OUT = path.join(REPO, 'public/assets/mku');
/** 대기 첫 칸 키(게임 px) — 플레이어(26px)보다 조금 큰 사람 크기 */
const FIT = 34;
const ANIMS = {
  idle: ['idle', [0, 1, 2, 3], 5],
  vanish: ['teleport', [0, 1, 2, 3], 14, false],
  appear: ['teleport', [3, 2, 1, 0], 14, false],
  command: ['command', [0, 1, 2, 3], 7, false],
  slash: ['slash', [0, 1, 2, 3], 10, false],
  clash: ['clash', [0, 1, 2, 3], 12, false],
  rage: ['p3_idle', [0, 1, 2, 3], 8],
};
const SNAKE = (s) => s.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
const ICONS = {
  icons_hectar: ['mimStickyJelly', 'mimDraftPatch', 'mimSwollenBattery', 'mimToyCuffs', 'mimDecafCoffee', 'mimObserveSticker', 'mimBrokenCalc', 'mimEmptyWallet'],
  icons_acro: ['acroCrimsonBrand', 'acroSeveredThread', 'acroCrackedHourglass', 'acroRustedKey', 'acroAshRibbon', 'acroWetLetter', 'acroCrimsonEye', 'acroBrokenMirror'],
};
const ICON_PX = 64;

/** 정사각 칸 안 그림을 여백 조금 두고 size×size에 맞춘다 */
function fitSquare(img, size, pad = 4) {
  const b = k.bbox(img, 40);
  const c = k.crop(img, b.x, b.y, b.w, b.h);
  const s = (size - pad * 2) / Math.max(c.w, c.h);
  const r = k.resize(c, Math.max(1, Math.round(c.w * s)), Math.max(1, Math.round(c.h * s)), 0.5);
  const out = k.blank(size, size);
  k.paste(out, r, Math.round((size - r.w) / 2), Math.round((size - r.h) / 2));
  return out;
}

function buildAcroArt() {
  const out = {};
  out.enemy_acro_mimosa = buildSheet('enemy_acro_mimosa', ANIMS, FIT, SRC, false);
  // 바닥: 이어 붙는 무늬를 128px로 (게임 64px 한 장)
  const floor = k.read(path.join(SRC, 'red_floor.png'));
  k.write(path.join(OUT, 'acro_red_floor.png'), k.resize(floor, 128, 128, 0));
  out.acro_red_floor = { file: 'mku/acro_red_floor.png', frameWidth: 128, frameHeight: 128, frames: 1, density: 2 };
  // 대화창 전신 그림: 정체 공개 원본(ref.png)을 미모사 제미니 전신(551×892)과 같은 폭으로
  const full = k.read(path.join(SRC, 'ref.png'));
  const fb = k.bbox(full, 40);
  const fc = k.crop(full, fb.x, fb.y, fb.w, fb.h);
  const fw = 551, fh = Math.round((fc.h * fw) / fc.w);
  k.write(path.join(OUT, 'story_acro_full.png'), k.resize(fc, fw, fh, 0.5));
  out.story_acro_full = { file: 'mku/story_acro_full.png', frameWidth: fw, frameHeight: fh, frames: 1 };
  for (const [file, ids] of Object.entries(ICONS)) {
    const im = k.read(path.join(SRC, `${file}.png`));
    const cw = Math.floor(im.w / 3), ch = Math.floor(im.h / 3);
    ids.forEach((id, i) => {
      const key = `item_debuff_${SNAKE(id)}`;
      k.write(path.join(OUT, `${key}.png`), fitSquare(k.crop(im, (i % 3) * cw, Math.floor(i / 3) * ch, cw, ch), ICON_PX));
      out[key] = { file: `mku/${key}.png`, frameWidth: ICON_PX, frameHeight: ICON_PX, frames: 1 };
    });
  }
  return out;
}

module.exports = { buildAcroArt };

if (require.main === module) {
  const artPath = path.join(REPO, 'src/data/art.json');
  const art = JSON.parse(fs.readFileSync(artPath, 'utf8'));
  const built = buildAcroArt();
  Object.assign(art.sprites, built);
  fs.writeFileSync(artPath, JSON.stringify(art, null, 2) + '\n');
  console.log(Object.entries(built).map(([key, v]) => `${key} ${v.frameWidth}×${v.frameHeight} ×${v.frames}`).join('\n'));
}
