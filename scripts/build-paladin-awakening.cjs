// 성기사 각성 이펙트·아이콘: scripts/art-src/paladin-awakening/*.png → public/assets/mku/<key>.png + art.json 항목
//
// 원본은 사용자가 준 생성 그림(2752×1536): 위에 아이콘 칸, 아래에 프레임 칸이 가로로 6개씩 늘어선 초록 배경 격자.
// 칸마다 안쪽만 잘라 초록 배경을 지우고(초록 번짐은 빨강·파랑 중 큰 값으로 눌러 없앤다), 한 애니메이션의 모든 프레임을
// 같은 정사각 틀(프레임들의 bbox 합)에 넣어 위치가 흔들리지 않게 한 뒤 게임 크기로 줄인다.
// build-art.cjs가 불러 쓰고, 혼자 실행하면(node scripts/build-paladin-awakening.cjs) art.json의 해당 항목만 바꾼다.
const fs = require('fs');
const path = require('path');
const k = require('./pngkit.cjs');

const REPO = path.resolve(__dirname, '..');
const SRC = path.join(REPO, 'scripts/art-src/paladin-awakening');
const DENSITY = 2;
/** 칸 테두리·격자선을 피해 안쪽만 쓴다 */
const INSET = 12;
/** 생성 도구 워터마크(✦) 자리 (오른쪽 아래, 원본 2752×1536 기준) */
const MARK = { x: 2560, y: 1330 };

/** 프레임 줄: [y0, y1], 첫 칸 x0 ~ 마지막 칸 x1, n칸 (칸 사이 간격은 고르다고 본다) */
const row = (y0, y1, x0 = null, x1 = null, n = 6) => ({ y0, y1, x0, x1, n });
const SHEETS = {
  shield: { x0: 222, x1: 2733, rows: [row(556, 1016), row(1030, 1524)] },
  oath: { x0: 143, x1: 2739, rows: [row(506, 1004)] },
  aura: { x0: 123, x1: 2741, rows: [row(774, 1534)] },
  prayer: { x0: 17, x1: 2734, rows: [row(1004, 1530)] },
  pegasus: { x0: 154, x1: 2742, rows: [row(518, 1020), row(1030, 1532)] },
  medusa: { x0: 89, x1: 2738, rows: [row(384, 764), row(772, 1150), row(1158, 1536)] },
  smite: { x0: 129, x1: 2742, rows: [row(506, 1022)] },
};

/** key: [시트, 줄 번호들, 게임 프레임 크기, fps, 반복] */
const ANIMS = {
  skill_pShield_shieldA: ['shield', [0, 1], 80, 16, true],
  skill_pOath_oathA: ['oath', [0], 140, 14, false],
  skill_pAura_auraA: ['aura', [0], 140, 10, true],
  skill_pPrayer_prayerA: ['prayer', [0], 100, 12, false],
  skill_pSwords_swordA: ['pegasus', [0], 100, 14, false],
  skill_pSwords_pegasusA: ['pegasus', [1], 120, 12, false],
  skill_pSmite_smiteA: ['smite', [0], 140, 16, false],
  ult_judgment_medusaA: ['medusa', [0], 140, 8, false],
  ult_judgment_impactA: ['medusa', [1], 140, 12, false],
  ult_judgment_buffA: ['medusa', [2], 80, 10, true],
};

/** 아이콘 칸 [시트, x, y, w, h] → 64px */
const ICON = 64;
const ICONS = {
  icon_skill_holyBulwarkA: ['shield', 222, 6, 501, 536],
  icon_skill_oathOfRetributionA: ['oath', 143, 4, 426, 494],
  icon_skill_sanctuaryAuraA: ['aura', 123, 2, 429, 762],
  icon_skill_prayerOfRevivalA: ['prayer', 919, 6, 914, 906],
  icon_skill_holySwordsA: ['pegasus', 154, 0, 420, 508],
  icon_skill_smiteA: ['smite', 129, 4, 429, 494],
  icon_ult_divineJudgmentA: ['medusa', 88, 0, 432, 376],
};

const sheets = new Map();
function sheet(name) {
  if (sheets.has(name)) return sheets.get(name);
  const im = k.read(path.join(SRC, `${name}.png`));
  const mx = Math.round((MARK.x / 2752) * im.w), my = Math.round((MARK.y / 1536) * im.h);
  for (let y = 0; y < im.h; y++) for (let x = 0; x < im.w; x++) {
    const o = (y * im.w + x) * 4;
    const r = im.px[o], g = im.px[o + 1], b = im.px[o + 2];
    const top = Math.max(r, b);
    // 배경·격자: 어둡고 초록이 센 색. 워터마크: 오른쪽 아래의 옅은 회녹색
    if ((g - top > 8 && r + g + b < 260) || (x >= mx && y >= my && g >= r && Math.abs(r - b) < 40)) {
      im.px[o + 3] = 0;
      continue;
    }
    // 초록 번짐 누르기: 빛이 배경과 섞인 자리
    if (g > top) im.px[o + 1] = top;
  }
  sheets.set(name, im);
  return im;
}

/** 시트 한 줄의 칸들 (안쪽만) */
function cells(name, ri) {
  const s = SHEETS[name];
  const r = s.rows[ri];
  const x0 = r.x0 ?? s.x0, x1 = r.x1 ?? s.x1;
  const cw = (x1 - x0) / r.n;
  return Array.from({ length: r.n }, (_, i) => k.crop(sheet(name), Math.round(x0 + i * cw) + INSET, r.y0 + INSET, Math.round(cw) - INSET * 2, r.y1 - r.y0 - INSET * 2));
}

function buildPaladinAwakening(outDir) {
  const out = {};
  for (const [key, [name, rows, size, fps, loop]] of Object.entries(ANIMS)) {
    const fs_ = rows.flatMap((ri) => cells(name, ri));
    // 프레임 bbox 합 → 정사각 틀 (가운데 맞춤)
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const f of fs_) {
      const b = k.bbox(f, 20);
      if (!b || b.w <= 0) continue;
      x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + b.w); y1 = Math.max(y1, b.y + b.h);
    }
    const side = Math.max(x1 - x0, y1 - y0);
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    const frames = fs_.map((f) => {
      const sq = k.blank(side, side);
      k.paste(sq, f, Math.round(side / 2 - cx), Math.round(side / 2 - cy));
      return k.resize(sq, size, size, 0.3);
    });
    const img = k.blank(size * frames.length, size);
    frames.forEach((f, i) => k.paste(img, f, i * size, 0));
    k.write(path.join(outDir, `${key}.png`), img);
    out[key] = { file: `mku/${key}.png`, frameWidth: size, frameHeight: size, frames: frames.length, density: DENSITY, anims: { play: { from: 0, to: frames.length - 1, fps, loop } } };
  }
  for (const [key, [name, x, y, w, h]] of Object.entries(ICONS)) {
    const c = k.crop(sheet(name), x + INSET, y + INSET, w - INSET * 2, h - INSET * 2);
    const b = k.bbox(c, 20);
    const side = Math.max(b.w, b.h);
    const sq = k.blank(side, side);
    k.paste(sq, c, Math.round(side / 2 - (b.x + b.w / 2)), Math.round(side / 2 - (b.y + b.h / 2)));
    k.write(path.join(outDir, `${key}.png`), k.resize(sq, ICON, ICON, 0.5));
    out[key] = { file: `mku/${key}.png`, frameWidth: ICON, frameHeight: ICON, frames: 1 };
  }
  return out;
}

module.exports = { buildPaladinAwakening };

if (require.main === module) {
  const artPath = path.join(REPO, 'src/data/art.json');
  const art = JSON.parse(fs.readFileSync(artPath, 'utf8'));
  const built = buildPaladinAwakening(path.join(REPO, 'public/assets/mku'));
  Object.assign(art.sprites, built);
  fs.writeFileSync(artPath, JSON.stringify(art, null, 2) + '\n');
  console.log(Object.entries(built).map(([key, v]) => `${key} ${v.frameWidth}×${v.frameHeight} ×${v.frames}`).join('\n'));
}
