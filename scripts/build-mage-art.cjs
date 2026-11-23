// 마기법사 스킬 아이콘·투사체: 힉스필드(GPT Image 2.6)로 만든 투명 배경 1024px 그림 → public/assets/mku/<key>.png + art.json 항목
//
// 아이콘은 scripts/art-src/mage-icons/<스킬·궁극기 id>.png, 투사체는 scripts/art-src/mage-proj/<이름>.png(오른쪽을 보는 그림).
// 투명 여백을 잘라 아이콘은 정사각 64px, 투사체는 화면 폭 × 밀도로 줄인다.
// build-art.cjs가 불러 쓰고, 혼자 실행하면(node scripts/build-mage-art.cjs) art.json의 해당 항목만 바꾼다.
const fs = require('fs');
const path = require('path');
const k = require('./pngkit.cjs');

const REPO = path.resolve(__dirname, '..');
const SRC = path.join(REPO, 'scripts/art-src');
const ICON = 64, DENSITY = 2;
const ULTS = new Set(['elementConcert', 'sadExecution']);
/** key: [mage-proj 파일, 화면 폭 px] */
const PROJ = {
  skill_mage_fireball: ['fireball', 28],
  skill_mage_ice_spear: ['iceSpear', 30],
  skill_mage_ice_shard: ['iceShard', 14],
  skill_mage_ice_orb: ['iceOrb', 22],
  skill_hw_condenser: ['condenser', 24],
};

/** 힉스필드 무기·탄 그림(scripts/art-src/weapons-hf, 오른쪽을 보는 그림) key: [파일, 화면 폭 px, 알파 기준, 손잡이 위치] */
const WEAPONS = {
  weapon_wooden_staff: ['woodenStaff', 30, 0.5, 0.3],
  weapon_spirit_fist: ['spiritFist', 30, 0.5, 0.25],
  proj_spirit_fist: ['spiritFistShot', 20, 0.35],
  fx_spirit_fist_blast: ['spiritFistBlast', 48, 0.35],
};

/** 집행 의지체 소환체·순수 전개 정령 (scripts/art-src/summons-hf, 오른쪽을 보는 한 장): key: [파일, 화면 키 px, 좌우 뒤집기] */
const SUMMONS = {
  summon_will_construct: ['will', 40, true],
  summon_magi_soldier: ['soldier', 40],
  summon_imitation_golem: ['golem', 60],
  summon_spirit_fire: ['spiritFire', 20],
  summon_spirit_ice: ['spiritIce', 20],
  summon_spirit_lightning: ['spiritLightning', 20],
  summon_spirit_magi: ['spiritMagi', 20],
};

const FRAME = 128;
const FRAMES = { hud_imprint_frame: 'imprint', hud_imprint_frame_gold: 'resonance' };

function trimmed(f) {
  const im = k.read(f);
  const b = k.bbox(im, 24);
  return k.crop(im, b.x, b.y, b.w, b.h);
}

function buildMageArt(outDir) {
  const out = {};
  for (const f of fs.readdirSync(path.join(SRC, 'mage-icons')).filter((n) => n.endsWith('.png')).sort()) {
    const id = path.basename(f, '.png');
    const key = ULTS.has(id) ? `icon_ult_${id}` : `icon_skill_${id}`;
    const im = trimmed(path.join(SRC, 'mage-icons', f));
    const side = Math.max(im.w, im.h);
    const sq = k.blank(side, side);
    k.paste(sq, im, Math.round((side - im.w) / 2), Math.round((side - im.h) / 2));
    k.write(path.join(outDir, `${key}.png`), k.resize(sq, ICON, ICON, 0.5));
    out[key] = { file: `mku/${key}.png`, frameWidth: ICON, frameHeight: ICON, frames: 1 };
  }
  for (const [key, [f, w]] of Object.entries(PROJ)) {
    const im = trimmed(path.join(SRC, 'mage-proj', `${f}.png`));
    const fw = w * DENSITY;
    const fh = Math.max(1, Math.round((fw * im.h) / im.w));
    k.write(path.join(outDir, `${key}.png`), k.resize(im, fw, fh, 0.5));
    out[key] = { file: `mku/${key}.png`, frameWidth: fw, frameHeight: fh, frames: 1, density: DENSITY };
  }
  for (const [key, [f, w, cut, gripX]] of Object.entries(WEAPONS)) {
    const im = trimmed(path.join(SRC, 'weapons-hf', `${f}.png`));
    const fw = w * DENSITY;
    const fh = Math.max(1, Math.round((fw * im.h) / im.w));
    k.write(path.join(outDir, `${key}.png`), k.resize(im, fw, fh, cut));
    out[key] = { file: `mku/${key}.png`, frameWidth: fw, frameHeight: fh, frames: 1, density: DENSITY, ...(gripX !== undefined ? { gripX } : {}) };
  }
  for (const [key, [f, h, flip]] of Object.entries(SUMMONS)) {
    let im = trimmed(path.join(SRC, 'summons-hf', `${f}.png`));
    if (flip) im = k.flipX(im);
    const fh = h * DENSITY;
    const fw = Math.max(1, Math.round((fh * im.w) / im.h));
    k.write(path.join(outDir, `${key}.png`), k.resize(im, fw, fh, 0.5));
    out[key] = { file: `mku/${key}.png`, frameWidth: fw, frameHeight: fh, frames: 1, density: DENSITY };
  }
  // 개전 각인 칸 장식 틀: 정사각 128px (화면에서 31px로 줄여 쓴다)
  for (const [key, f] of Object.entries(FRAMES)) {
    const im = trimmed(path.join(SRC, 'mage-frame', `${f}.png`));
    k.write(path.join(outDir, `${key}.png`), k.resize(im, FRAME, FRAME, 0.5));
    out[key] = { file: `mku/${key}.png`, frameWidth: FRAME, frameHeight: FRAME, frames: 1 };
  }
  return out;
}

module.exports = { buildMageArt };

if (require.main === module) {
  const artPath = path.join(REPO, 'src/data/art.json');
  const art = JSON.parse(fs.readFileSync(artPath, 'utf8'));
  const built = buildMageArt(path.join(REPO, 'public/assets/mku'));
  Object.assign(art.sprites, built);
  fs.writeFileSync(artPath, JSON.stringify(art, null, 2) + '\n');
  console.log(Object.entries(built).map(([key, v]) => `${key} ${v.frameWidth}×${v.frameHeight}`).join('\n'));
}
