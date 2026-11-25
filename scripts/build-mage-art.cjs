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
const ULTS = new Set(['elementConcert', 'sadExecution', 'magiOperation']);
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
  weapon_elder_wand: ['elderWand', 30, 0.5, 0.2],
  weapon_unstable_shard: ['unstableShard', 22, 0.5, 0.2],
  weapon_rasalhague_sword: ['rasalhagueSword', 40, 0.5, 0.15],
  weapon_avior_staff: ['aviorStaff', 32, 0.5, 0.3],
  weapon_seven_star_gavel: ['bukduStaff', 34, 0.5, 0.25],
  proj_seven_star_orb: ['bukduOrb', 14, 0.35],
  fx_seven_star_blast: ['bukduBlast', 60, 0.3],
  fx_judgment_beam: ['judgmentBeam', 40, 0.25],
  fx_judgment_sigil: ['judgmentSigil', 80, 0.3],
  weapon_denebola_blade: ['denebolaBlade', 30, 0.5, 0.15],
  proj_denebola_shard: ['denebolaShard', 12, 0.35],
  fx_denebola_whip: ['denebolaWhip', 70, 0.5, 0.04],
};

/** 힉스필드 아이템 아이콘 (scripts/art-src/items-hf): key → 파일 */
const ITEMS = {
  item_magi_stone: 'magiStone',
  item_gray_dumbbell: 'grayDumbbell',
  item_golden_ember_fruit: 'goldenEmberFruit',
  item_volcano_furnace_ember: 'volcanoFurnaceEmber',
  item_great_wall_icicle: 'greatWallIcicle',
  item_cold_of_cold: 'coldOfCold',
  item_astrape: 'astrape',
  item_element_compass: 'elementCompass',
  item_hollow_magi_pipe: 'hollowMagiPipe',
  item_resonant_bell: 'resonantBell',
  item_compressed_magi_crystal: 'compressedMagiCrystal',
  item_broken_pillar_shard: 'brokenPillarShard',
  item_shattered_coordinate_slab: 'shatteredCoordinateSlab',
  item_ancient_weapon_energy_source: 'ancientWeaponEnergySource',
  item_dube_eye: 'dubeEye',
};

/**
 * 백온파 각성 힉스필드 시트(scripts/art-src/awaken-hf, 5열 × 2행 투명): 한 줄을 애니메이션 하나로.
 * 줄의 5칸을 모두 덮는 상자로 잘라(칸끼리 기준점이 같게) 화면 폭 w로 줄인다. key: [파일, 줄, fps, 반복, w]
 */
const AWAKEN_SHEETS = {
  fx_awk_blizzard: ['blizzard', 1, 10, true, 96],
  fx_awk_thundercloud: ['thundercloud', 0, 8, true, 56],
  fx_awk_thunder_strike: ['thundercloud', 1, 14, false, 56],
  fx_awk_union_converge: ['triple-union', 0, 10, false, 80],
  fx_awk_union_burst: ['triple-union', 1, 12, false, 120],
};

function buildAwakenSheet(outDir, key, [file, row, fps, loop, w]) {
  const im = k.read(path.join(SRC, 'awaken-hf', `${file}.png`));
  const cw = im.w / 5, ch = im.h / 2;
  const cells = [0, 1, 2, 3, 4].map((c) => k.crop(im, Math.round(c * cw), Math.round(row * ch), Math.round(cw), Math.round(ch)));
  let x0 = Infinity, y0 = Infinity, x1 = 0, y1 = 0;
  for (const c of cells) {
    const b = k.bbox(c, 16);
    if (b.w <= 0) continue;
    x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + b.w); y1 = Math.max(y1, b.y + b.h);
  }
  const fw = w * DENSITY;
  const fh = Math.max(1, Math.round((fw * (y1 - y0)) / (x1 - x0)));
  const sheet = k.blank(fw * 5, fh);
  cells.forEach((c, i) => k.paste(sheet, k.resize(k.crop(c, x0, y0, x1 - x0, y1 - y0), fw, fh, null), i * fw, 0));
  k.write(path.join(outDir, `${key}.png`), sheet);
  return { file: `mku/${key}.png`, frameWidth: fw, frameHeight: fh, frames: 5, density: DENSITY, anims: { play: { from: 0, to: 4, fps, ...(loop ? {} : { loop: false }) } } };
}

/** 집행 의지체 소환체·순수 전개 정령 (scripts/art-src/summons-hf, 오른쪽을 보는 한 장): key: [파일, 화면 키 px, 좌우 뒤집기] */
const SUMMONS = {
  // 정령 강림(순수 전개 각성) 상위 정령
  summon_spirit_fire2: ['spiritFire2', 26],
  summon_spirit_ice2: ['spiritIce2', 26],
  summon_spirit_lightning2: ['spiritLightning2', 26],
  summon_spirit_magi2: ['spiritMagi2', 26],
  summon_spirit_fire: ['spiritFire', 20],
  summon_spirit_ice: ['spiritIce', 20],
  summon_spirit_lightning: ['spiritLightning', 20],
  summon_spirit_magi: ['spiritMagi', 20],
};

/**
 * 집행 의지체 소환체 움직이는 그림: 힉스필드 4칸 가로 띠(같은 캐릭터를 참조로 뽑음)를 칸으로 나눠 한 줄 시트로 잇는다.
 * 칸마다 발밑(아래 1/4의 가운데)을 맞춰 걸을 때 흔들리지 않게 한다. 띠마다 칸 키(중앙값)를 화면 키 h에 맞춘다.
 * anims: 이름 → [원본(한 장 또는 4칸 띠), fps, 반복]. flip: 원본이 왼쪽을 본다
 */
const SUMMON_ANIMS = {
  summon_will_construct: { h: 40, flip: true, anims: { idle: ['willFloat', 6, true], move: ['willFloat', 8, true], cast: ['willCast', 12, false] } },
  summon_magi_soldier: { h: 40, anims: { idle: ['soldier', 1, true], move: ['soldierWalk', 8, true], attack: ['soldierThrust', 16, false] } },
  summon_imitation_golem: { h: 60, anims: { idle: ['golem2', 1, true], move: ['golemWalk', 6, true], attack: ['golemSlam', 10, false] } },
};

/** 띠를 칸으로: 빈 세로줄로 4덩어리가 나오면 그것, 아니면 네 등분 */
function stripFrames(im) {
  const on = [];
  for (let x = 0; x < im.w; x++) {
    let n = 0;
    for (let y = 0; y < im.h; y++) if (im.px[(y * im.w + x) * 4 + 3] > 40) n++;
    on.push(n > 2);
  }
  let runs = [];
  let st = -1;
  for (let x = 0; x <= im.w; x++) {
    const v = x < im.w && on[x];
    if (v && st < 0) st = x;
    if (!v && st >= 0) {
      runs.push([st, x - 1]);
      st = -1;
    }
  }
  const merged = [];
  for (const r of runs) {
    if (merged.length && r[0] - merged[merged.length - 1][1] < 12) merged[merged.length - 1][1] = r[1];
    else merged.push([...r]);
  }
  runs = merged.filter((r) => r[1] - r[0] > 30);
  if (runs.length !== 4) runs = [0, 1, 2, 3].map((i) => [Math.round((i * im.w) / 4), Math.round(((i + 1) * im.w) / 4) - 1]);
  return runs.map(([a, b]) => {
    const c = k.crop(im, a, 0, b - a + 1, im.h);
    const bb = k.bbox(c, 24);
    return k.crop(c, bb.x, bb.y, bb.w, bb.h);
  });
}

/** 발밑 가로 자리: 아래 1/4 불투명 픽셀의 가운데 */
function footX(im) {
  let sum = 0;
  let n = 0;
  for (let y = Math.floor(im.h * 0.75); y < im.h; y++) for (let x = 0; x < im.w; x++) if (im.px[(y * im.w + x) * 4 + 3] > 80) {
    sum += x;
    n++;
  }
  return n ? sum / n : im.w / 2;
}

function buildSummonSheet(outDir, key, spec) {
  const target = spec.h * DENSITY;
  const frames = [];
  const anims = {};
  for (const [name, [src, fps, loop]] of Object.entries(spec.anims)) {
    const im = k.read(path.join(SRC, 'summons-hf', `${src}.png`));
    let list = src.match(/Walk|Float|Cast|Thrust|Slam/) ? stripFrames(im) : [trimmed(path.join(SRC, 'summons-hf', `${src}.png`))];
    if (spec.flip) list = list.map((f) => k.flipX(f));
    const hs = list.map((f) => f.h).sort((a, b) => a - b);
    const kk = target / hs[Math.floor(hs.length / 2)];
    list = list.map((f) => k.resize(f, Math.max(1, Math.round(f.w * kk)), Math.max(1, Math.round(f.h * kk)), 0.5));
    // 같은 원본을 또 쓰면(의지체 idle·move) 프레임을 다시 넣지 않는다
    const same = Object.entries(anims).find(([, a]) => a.src === src);
    if (same) {
      anims[name] = { from: same[1].from, to: same[1].to, fps, ...(loop ? {} : { loop: false }), src };
      continue;
    }
    anims[name] = { from: frames.length, to: frames.length + list.length - 1, fps, ...(loop ? {} : { loop: false }), src };
    frames.push(...list);
  }
  const half = Math.ceil(Math.max(...frames.map((f) => Math.max(footX(f), f.w - footX(f)))));
  const fw = half * 2;
  const fh = Math.max(...frames.map((f) => f.h));
  const sheet = k.blank(fw * frames.length, fh);
  frames.forEach((f, i) => k.paste(sheet, f, i * fw + Math.round(half - footX(f)), fh - f.h));
  k.write(path.join(outDir, `${key}.png`), sheet);
  for (const a of Object.values(anims)) delete a.src;
  return { file: `mku/${key}.png`, frameWidth: fw, frameHeight: fh, frames: frames.length, density: DENSITY, anims };
}

/** 휘강파 각성 그림 (scripts/art-src/hwk-hf, 힉스필드 투명): key: [파일, 화면 폭 px, 알파 기준] */
const HWK = {
  fx_hwk_guillotine: ['guillotine', 70, 0.35],
  proj_hwk_lance: ['lance', 30, 0.35],
  proj_hwk_orb_dark: ['orbDark', 20, 0.3],
  proj_hwk_orb_bright: ['orbBright', 20, 0.3],
  fx_hwk_portal: ['portal', 32, 0.3],
};

/** 마기 기둥: 솟는 기둥(세로)과 바닥 균열(가로). key: [파일, 화면 폭 px] */
const PILLAR = { fx_hw_pillar_column: ['pillar', 40], fx_hw_pillar_crater: ['crater', 64] };

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
  for (const [key, f] of Object.entries(ITEMS)) {
    const im = trimmed(path.join(SRC, 'items-hf', `${f}.png`));
    const side = Math.max(im.w, im.h);
    const sq = k.blank(side, side);
    k.paste(sq, im, Math.round((side - im.w) / 2), Math.round((side - im.h) / 2));
    k.write(path.join(outDir, `${key}.png`), k.resize(sq, ICON, ICON, 0.5));
    out[key] = { file: `mku/${key}.png`, frameWidth: ICON, frameHeight: ICON, frames: 1 };
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
  for (const [key, spec] of Object.entries(SUMMON_ANIMS)) out[key] = buildSummonSheet(outDir, key, spec);
  for (const [key, spec] of Object.entries(AWAKEN_SHEETS)) out[key] = buildAwakenSheet(outDir, key, spec);
  for (const [key, [f, w, cut]] of Object.entries(HWK)) {
    const im = trimmed(path.join(SRC, 'hwk-hf', `${f}.png`));
    const fw = w * DENSITY;
    const fh = Math.max(1, Math.round((fw * im.h) / im.w));
    k.write(path.join(outDir, `${key}.png`), k.resize(im, fw, fh, cut));
    out[key] = { file: `mku/${key}.png`, frameWidth: fw, frameHeight: fh, frames: 1, density: DENSITY };
  }
  for (const [key, [f, w]] of Object.entries(PILLAR)) {
    const im = trimmed(path.join(SRC, 'summons-hf', `${f}.png`));
    const fw = w * DENSITY;
    const fh = Math.max(1, Math.round((fw * im.h) / im.w));
    k.write(path.join(outDir, `${key}.png`), k.resize(im, fw, fh, 0.3));
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
