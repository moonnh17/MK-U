// 기존 MKU 스프라이트 → 게임 크기 도트 PNG(public/assets/mku/) + src/data/art.json
// 사용: npm run art:build -- <원본 MKU-sprites assets 폴더>
// 원본 파일 이름·배치(예: monsters.png 4열×6행)에 맞춘 대응표다. 원본이 바뀌면 이 표를 고친다.
// 끝나면 npm run assets로 그림 목록(docs/ASSETS.md)을 다시 만든다.
const fs = require('fs');
const path = require('path');
const k = require('./pngkit.cjs');
const SRC = process.argv[2];
const REPO = path.resolve(__dirname, '..');
if (!SRC || !fs.existsSync(path.join(SRC, 'monsters.png'))) {
  console.error('사용: npm run art:build -- <원본 MKU-sprites assets 폴더>');
  process.exit(1);
}
const OUT_DIR = 'mku';
const out = path.join(REPO, 'public/assets', OUT_DIR);
fs.mkdirSync(out, { recursive: true });

const cache = new Map();
const load = (f) => {
  if (!cache.has(f)) cache.set(f, k.read(path.join(SRC, f)));
  return cache.get(f);
};

/** 같은 크기 칸으로 나뉜 시트에서 프레임들 */
function cells(f, cw, ch, picks) {
  const im = load(f);
  const cols = Math.round(im.w / cw), rows = Math.round(im.h / ch);
  const all = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) all.push(k.crop(im, Math.round(c * cw), Math.round(r * ch), Math.round(cw), Math.round(ch)));
  return picks ? picks.map((i) => all[i]) : all;
}
/** 가로 스트립을 프레임 수로 균등 분할 */
const strip = (f, n) => { const im = load(f); return cells(f, im.w / n, im.h); };
/** 가로 스트립을 빈 세로줄로 나눠 프레임 찾기 (프레임 폭이 제각각인 시트) */
function gaps(f, cut = 40, minGap = 3) {
  const im = load(f);
  const filled = [];
  for (let x = 0; x < im.w; x++) {
    let any = false;
    for (let y = 0; y < im.h && !any; y++) if (im.px[(y * im.w + x) * 4 + 3] > cut) any = true;
    filled.push(any);
  }
  const segs = [];
  let start = -1, gap = 0;
  for (let x = 0; x <= im.w; x++) {
    const on = x < im.w && filled[x];
    if (on) { if (start < 0) start = x; gap = 0; }
    else if (start >= 0) { gap++; if (gap >= minGap || x === im.w) { segs.push([start, x - gap + 1]); start = -1; gap = 0; } }
  }
  // 작은 파편(입자)은 프레임이 아니다: 가장 넓은 것의 40% 미만은 버린다
  const maxW = Math.max(...segs.map(([a, b]) => b - a));
  return segs.filter(([a, b]) => b - a >= maxW * 0.4).map(([a, b]) => k.crop(im, a, 0, b - a, im.h));
}
const single = (f) => [load(f)];

/**
 * 프레임들을 같은 칸에 발밑·가운데 맞춰 놓고, 가장 긴 변이 fit px가 되게 같은 배율로 줄여 가로로 잇는다.
 * 반환: { file, frameWidth, frameHeight, frames }
 */
function sheet(key, frames, fit, opts = {}) {
  const cut = opts.cut ?? 40;
  const boxes = frames.map((f) => k.bbox(f, cut) ?? { x: 0, y: 0, w: f.w, h: f.h });
  const cw = Math.max(...boxes.map((b) => b.w)), ch = Math.max(...boxes.map((b) => b.h));
  const s = fit / Math.max(cw, ch);
  // independent: 원본마다 그린 배율이 달라(보스 단일 자세) 프레임마다 따로 fit에 맞춘다
  const fw = Math.max(1, Math.round(cw * s)), fh = Math.max(1, Math.round(ch * s));
  const outImg = k.blank(fw * frames.length, fh);
  frames.forEach((f, i) => {
    const b = boxes[i];
    const cell = k.blank(cw, ch);
    // 아래 가운데 정렬
    k.paste(cell, k.crop(f, b.x, b.y, b.w, b.h), Math.round((cw - b.w) / 2), ch - b.h);
    let small;
    if (opts.independent) {
      const si = Math.min(fw / b.w, fh / b.h);
      const iw = Math.max(1, Math.round(b.w * si)), ih = Math.max(1, Math.round(b.h * si));
      small = k.blank(fw, fh);
      k.paste(small, k.resize(k.crop(f, b.x, b.y, b.w, b.h), iw, ih, 0.5), Math.round((fw - iw) / 2), fh - ih);
    } else small = k.resize(cell, fw, fh, opts.soft ? null : 0.5);
    if (opts.dim) for (let p = 0; p < small.px.length; p += 4) for (let c = 0; c < 3; c++) small.px[p + c] = Math.round(small.px[p + c] * opts.dim);
    k.paste(outImg, small, i * fw, 0);
  });
  const file = `${OUT_DIR}/${key}.png`;
  k.write(path.join(REPO, 'public/assets', file), outImg);
  return { file, frameWidth: fw, frameHeight: fh, frames: frames.length };
}
/** 불투명 정사각형 그림(아이콘): 정사각형으로 채운 뒤 size로 */
function icon(key, f, size, crop) {
  let im = load(f);
  if (crop) im = k.crop(im, crop.x, crop.y, crop.w, crop.h);
  const side = Math.max(im.w, im.h);
  const sq = k.blank(side, side);
  k.paste(sq, im, Math.round((side - im.w) / 2), Math.round((side - im.h) / 2));
  const file = `${OUT_DIR}/${key}.png`;
  k.write(path.join(REPO, 'public/assets', file), k.resize(sq, size, size, 0.5));
  return { file, frameWidth: size, frameHeight: size, frames: 1 };
}
/** 바닥 타일: terrain.png 4×4 중 (col,row) 칸 */
function tile(key, col, row, size, dim = 1) {
  const im = load('terrain.png');
  const cw = im.w / 4;
  // 칸 경계선이 들어가지 않게 안쪽을 조금 잘라낸다
  const t = k.crop(im, Math.round(col * cw) + 3, Math.round(row * cw) + 3, Math.round(cw) - 6, Math.round(cw) - 6);
  const small = k.resize(t, size, size, 0.5);
  if (dim !== 1) for (let p = 0; p < small.px.length; p += 4) for (let c = 0; c < 3; c++) small.px[p + c] = Math.round(small.px[p + c] * dim);
  const file = `${OUT_DIR}/${key}.png`;
  k.write(path.join(REPO, 'public/assets', file), small);
  return { file, frameWidth: size, frameHeight: size, frames: 1 };
}

const sprites = {};
const anim = (n0, n1, fps) => ({ from: n0, to: n1, fps });
/** idle 프레임 + move 프레임을 한 시트로 */
function actor(key, idle, move, fit, opts = {}) {
  const s = sheet(key, [...idle, ...move], fit, opts);
  const anims = {};
  if (idle.length) anims.idle = anim(0, idle.length - 1, opts.idleFps ?? 4);
  if (move.length) anims.move = anim(idle.length, idle.length + move.length - 1, opts.moveFps ?? 8);
  sprites[key] = { ...s, anims, ...(opts.facing ? { facing: opts.facing } : {}) };
}

// ---------- 플레이어 (마기학자 · 전직 후 헥타르 · 아크로) ----------
const SCH = 1448 / 4;
['player_human', 'player_hectar', 'player_acro'].forEach((key, row) => {
  const fr = cells('scholars.png', SCH, SCH, [row * 4, row * 4 + 1, row * 4 + 2, row * 4 + 3]);
  actor(key, [fr[0]], fr, 26);
});

// ---------- 1장 (monsters.png 256 칸, 4열) ----------
const M = (row) => cells('monsters.png', 256, 256, [row * 4, row * 4 + 1, row * 4 + 2, row * 4 + 3]);
{ const r = M(0); actor('enemy_tomakki', [r[3]], [r[1], r[2], r[3]], 14, { facing: 'right' }); }
{ const r = M(1); actor('enemy_gaedeulgae', [r[0]], r, 19); }
{ const r = M(2); actor('enemy_akgwi', [r[0], r[1]], r, 24); }

// ---------- 2장 ----------
actor('enemy_hectar_trooper', [strip('spires/trooper.png', 4)[0]], strip('spires/trooper.png', 4), 22);
actor('enemy_hectar_chief', [strip('spires/researcher.png', 4)[0]], strip('spires/researcher.png', 4), 36);
actor('enemy_magi_beetle', strip('monsters/monster-magi_beetle-idle.png', 4), strip('monsters/monster-magi_beetle-move.png', 6), 24);
actor('enemy_a_memory', strip('monsters/monster-some_memory-idle.png', 6), strip('monsters/monster-some_memory-move.png', 8), 24);

// ---------- 3장 ----------
actor('enemy_ancient_one', strip('monsters/monster-nameless-idle.png', 5), strip('monsters/monster-nameless-move.png', 7), 26);
actor('enemy_hatred_shard', strip('monsters/monster-hatred_fragment-idle.png', 4), strip('monsters/monster-hatred_fragment-move.png', 6), 22, { cut: 120 });
actor('enemy_executor', gaps('late-elites/executor-idle.png'), gaps('late-elites/executor-move.png'), 38);
actor('enemy_archon', gaps('late-elites/archon-idle.png'), gaps('late-elites/archon-move.png'), 30);

// ---------- 보스 ----------
actor('enemy_fusion_akgwi', single('fusion/body-idle.png'), single('fusion/body-move.png'), 48, { independent: true });
actor('enemy_fusion_akgwi_phase2', single('fusion/body-rage.png'), single('fusion/body-move.png'), 52, { independent: true });
actor('enemy_electric_ring', single('electric/body-idle.png'), single('electric/body-walk.png'), 50, { independent: true });
actor('enemy_magi_golem', single('golem/body-idle.png'), single('golem/body-walk.png'), 56, { independent: true });
actor('enemy_magi_golem_phase2', single('golem/body-rage.png'), single('golem/body-walk.png'), 60, { independent: true });
actor('enemy_eclipse', strip('eclipse/p1-idle.png', 4), strip('eclipse/p1-move.png', 6), 50);
actor('enemy_eclipse_phase2', strip('eclipse/p2-idle.png', 4), strip('eclipse/p2-move.png', 6), 56);
// 마기카이저: 구속(1단계) → 2 → 3단계
actor('enemy_magi_kaiser', strip('kaiser/idle.png', 4), strip('kaiser/move.png', 6), 66);
actor('enemy_magi_kaiser_phase1', strip('kaiser/p1-idle.png', 4), [], 66);
actor('enemy_magi_kaiser_phase2', strip('kaiser/p2-idle.png', 4), strip('kaiser/move.png', 6), 66);
actor('enemy_magi_kaiser_phase3', strip('kaiser/p3-idle.png', 4), strip('kaiser/move.png', 6), 70);
// 선조의 잔상: 야만용사 시초 각성자의 전투 기록 → 야만용사 몸체
actor('enemy_ancestor_echo', single('warrior/barbarian-idle.png'), strip('warrior/barbarian-move.png', 2), 44, { independent: true });

// ---------- 첨탑 ----------
sprites.spire_small = sheet('spire_small', single('spires/small-0.png'), 44);
sprites.spire_medium = sheet('spire_medium', single('spires/medium-0.png'), 52);

// ---------- 스킬 오브젝트 (헥타르) ----------
sprites.skill_turret = sheet('skill_turret', single('hectar/turret-1.png'), 14);
sprites.skill_turret_big = sheet('skill_turret_big', single('hectar/turret-5.png'), 22);
sprites.skill_mine = sheet('skill_mine', single('hectar/mine-1.png'), 9);
sprites.skill_drone = sheet('skill_drone', single('hectar/drone-1.png'), 11);

// ---------- 타격·처치·등장 이펙트 (가장 긴 변) ----------
sprites.fx_hit_tech = sheet('fx_hit_tech', single('basic/rail-hit.png'), 16);
sprites.fx_hit_magic = sheet('fx_hit_magic', single('fusion/vfx-burst.png'), 16);
sprites.fx_hit_physical = sheet('fx_hit_physical', single('basic/laser-hit.png'), 14);
// 마기카이저 폭발 6프레임 중 3번째 칸은 위에 글자가 섞여 있어 뺀다
{ const ex = strip('kaiser/explosion.png', 6); sprites.fx_explosion = sheet('fx_explosion', [ex[0], ex[1], ex[3], ex[4], ex[5]], 40); }
sprites.fx_elite_burst = sheet('fx_elite_burst', single('fusion/vfx-explode.png'), 44);
sprites.fx_spawn = sheet('fx_spawn', single('fusion/vfx-smoke.png'), 26);

// ---------- 스킬·궁극기 아이콘 ----------
const SKILL_ICON = {
  magiTurret: 'turret', magiMine: 'mine', antimatterCannon: 'antimatter', magiField: 'field', railgun: 'rail', combatDrone: 'drone',
  unstableSubject: 'specimen', magiCorruption: 'mutate', experimentalWeapon: 'laser', purifyingWings: 'purify', mkPrototype: 'mk', reductionist: 'reduction',
};
for (const [id, f] of Object.entries(SKILL_ICON)) sprites[`icon_skill_${id}`] = icon(`icon_skill_${id}`, `icons/${f}.png`, 32);
const ULT_ICON = { firstLaw: 'repeat', thunderbolt: 'thunder', singularity: 'singularity' };
for (const [id, f] of Object.entries(ULT_ICON)) sprites[`icon_ult_${id}`] = icon(`icon_ult_${id}`, `icons/${f}.png`, 32);

// ---------- 미모사 제미니 ----------
sprites.icon_gemini = icon('icon_gemini', 'story/mg-portrait.png', 32, { x: 380, y: 230, w: 500, h: 500 });
{
  const im = load('story/mg-portrait.png');
  const c = k.crop(im, 157, 0, 940, 1254);
  const file = `${OUT_DIR}/portrait_gemini.png`;
  k.write(path.join(REPO, 'public/assets', file), k.resize(c, 96, 128, 0.5));
  sprites.portrait_gemini = { file, frameWidth: 96, frameHeight: 128, frames: 1 };
}

// ---------- 아이템 아이콘 ----------
const ITEM = {
  item_slime_stew: 'items/stew.png', item_magicasol: 'items/magi-casol.png', item_nameless_sword: 'items/nameless-sword.png', item_nameless_helm: 'items/nameless-helm.png',
  item_broken_blade: 'items/broken-blade.png', item_broken_hilt: 'items/broken-sheath.png', item_elegant_magi: 'items/elegant-magi.png', item_antimatter_sample: 'items/experimental-antimatter.png',
  item_combat_theory: 'items/combat-application.png', item_oak_heart: 'items/oak-heart.png', item_hanwoo_steak: 'items/raw-beef.png', item_lee_seal: 'items/lee-seal.png',
  item_magowiki_codex: 'items/magowiki.png', item_lsd_r: 'items/lsd-r.png', item_hanabi: 'items/hanabi.png', item_afro_belt: 'items/afro-belt.png',
  item_regulus_shard: 'items/regulus.png', item_caesar_crown: 'items/caesar.png', item_acrux_cross: 'items/acrux.png', item_orion_belt: 'items/betelgeuse.png',
  item_divine_sword: 'items/sword-youngdi.png', item_al_gul_blade: 'items/al-ghul.png', item_hectar_ram: 'items/hectar-ram.png',
  item_wonhon_lump: 'rewards/ghost-icon.png', item_gihwan_arm: 'rewards/arm-icon.png', item_ancient_core: 'rewards/core-icon.png',
};
for (const [key, f] of Object.entries(ITEM)) sprites[key] = icon(key, f, 32);

// ---------- 방 타일 (terrain.png: 1행 돌, 2행 푸른 기술, 3행 붉은 균열) ----------
// 3장은 붉은 적이 묻히지 않게 붉은 점이 드문 칸을 더 어둡게
const TILE_ROW = { 1: [0, 0], 2: [3, 1], 3: [2, 2] };
const FLOOR_DIM = { 1: 0.6, 2: 0.6, 3: 0.4 };
for (const [c, [col, row]] of Object.entries(TILE_ROW)) {
  // 바닥은 어둡게 눌러 캐릭터가 잘 보이게, 벽은 바닥보다 밝게
  sprites[`tile_floor_c${c}`] = tile(`tile_floor_c${c}`, col, row, 64, FLOOR_DIM[c]);
  sprites[`tile_corridor_c${c}`] = tile(`tile_corridor_c${c}`, col, row, 64, FLOOR_DIM[c] * 0.75);
  sprites[`tile_wall_c${c}`] = tile(`tile_wall_c${c}`, 2, 0, 32, c === '3' ? 0.5 : 0.75);
}

const artPath = path.join(REPO, 'src/data/art.json');
const json = { basePath: 'assets/', sprites };
fs.writeFileSync(artPath, JSON.stringify(json, null, 2) + '\n');
let bytes = 0;
for (const f of fs.readdirSync(out)) bytes += fs.statSync(path.join(out, f)).size;
console.log(`${Object.keys(sprites).length}개, ${Math.round(bytes / 1024)}KB`);
