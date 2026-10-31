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

/** 게임 1px에 넣는 그림 픽셀 수. 원본 도트를 뭉개지 않고 도트만 작아진다 (크게 올리면 그림처럼 보이니 조금만) */
const ART_DENSITY = 2;
const even = (v) => Math.max(ART_DENSITY, Math.round(v / ART_DENSITY) * ART_DENSITY);
const ENEMY_OUTLINE = [255, 36, 36];
/** 프레임마다 1칸씩 넓혀 그림 둘레에 테두리를 두른다 */
function outlined(img, fw, fh, n, color) {
  const out = k.blank((fw + 2) * n, fh + 2);
  for (let i = 0; i < n; i++) k.paste(out, k.crop(img, i * fw, 0, fw, fh), i * (fw + 2) + 1, 1);
  const on = (x, y) => x >= 0 && y >= 0 && x < out.w && y < out.h && out.px[(y * out.w + x) * 4 + 3] > 0;
  const marks = [];
  for (let y = 0; y < out.h; y++) for (let x = 0; x < out.w; x++) {
    if (on(x, y)) continue;
    // 옆 프레임으로 넘어가지 않게 같은 칸 안만 본다
    const cell = Math.floor(x / (fw + 2));
    const same = (a) => Math.floor(a / (fw + 2)) === cell;
    if ((same(x - 1) && on(x - 1, y)) || (same(x + 1) && on(x + 1, y)) || on(x, y - 1) || on(x, y + 1)) marks.push((y * out.w + x) * 4);
  }
  for (const o of marks) { out.px[o] = color[0]; out.px[o + 1] = color[1]; out.px[o + 2] = color[2]; out.px[o + 3] = 255; }
  return out;
}

/**
 * 프레임들을 같은 칸에 발밑·가운데 맞춰 놓고, 가장 긴 변이 fit px가 되게 같은 배율로 줄여 가로로 잇는다.
 * 반환: { file, frameWidth, frameHeight, frames }
 */
function sheet(key, frames, fit, opts = {}) {
  const cut = opts.cut ?? 40;
  const boxes = frames.map((f) => k.bbox(f, cut) ?? { x: 0, y: 0, w: f.w, h: f.h });
  const cw = Math.max(...boxes.map((b) => b.w)), ch = Math.max(...boxes.map((b) => b.h));
  const s = (fit * ART_DENSITY) / Math.max(cw, ch);
  // independent: 원본마다 그린 배율이 달라(보스 단일 자세) 프레임마다 따로 fit에 맞춘다
  const fw = even(cw * s), fh = even(ch * s);
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
    } else small = k.resize(cell, fw, fh, opts.soft ? null : opts.alphaCut ?? 0.5);
    if (opts.dim) for (let p = 0; p < small.px.length; p += 4) for (let c = 0; c < 3; c++) small.px[p + c] = Math.min(255, Math.round(small.px[p + c] * opts.dim));
    k.paste(outImg, small, i * fw, 0);
  });
  const file = `${OUT_DIR}/${key}.png`;
  if (opts.outline) {
    const framed = outlined(outImg, fw, fh, frames.length, opts.outline);
    k.write(path.join(REPO, 'public/assets', file), framed);
    return { file, frameWidth: fw + 2, frameHeight: fh + 2, frames: frames.length, density: ART_DENSITY };
  }
  k.write(path.join(REPO, 'public/assets', file), outImg);
  return { file, frameWidth: fw, frameHeight: fh, frames: frames.length, density: ART_DENSITY };
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
  const px = size * ART_DENSITY;
  const small = k.resize(t, px, px, 0.5);
  if (dim !== 1) for (let p = 0; p < small.px.length; p += 4) for (let c = 0; c < 3; c++) small.px[p + c] = Math.round(small.px[p + c] * dim);
  const file = `${OUT_DIR}/${key}.png`;
  k.write(path.join(REPO, 'public/assets', file), small);
  return { file, frameWidth: px, frameHeight: px, frames: 1, density: ART_DENSITY };
}

const sprites = {};
const anim = (n0, n1, fps) => ({ from: n0, to: n1, fps });
/** idle 프레임 + move 프레임을 한 시트로 */
function actor(key, idle, move, fit, opts = {}) {
  // 적은 빨간 테두리로 배경과 확실히 구분한다
  if (key.startsWith('enemy_')) opts = { ...opts, outline: ENEMY_OUTLINE };
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

// 유령 사수: 6번째 줄. 마지막 칸이 활을 당긴 자세
{ const r = M(5); actor('enemy_ghost_shooter', [r[0]], [r[0], r[1], r[2]], 26); }

// ---------- 2장 ----------
actor('enemy_hectar_trooper', [strip('spires/trooper.png', 4)[0]], strip('spires/trooper.png', 4), 22);
actor('enemy_hectar_chief', [strip('spires/researcher.png', 4)[0]], strip('spires/researcher.png', 4), 54);
actor('enemy_magi_beetle', strip('monsters/monster-magi_beetle-idle.png', 4), strip('monsters/monster-magi_beetle-move.png', 6), 24);
actor('enemy_a_memory', strip('monsters/monster-some_memory-idle.png', 6), strip('monsters/monster-some_memory-move.png', 8), 24);

// ---------- 3장 ----------
actor('enemy_ancient_one', strip('monsters/monster-nameless-idle.png', 5), strip('monsters/monster-nameless-move.png', 7), 26);
actor('enemy_hatred_shard', strip('monsters/monster-hatred_fragment-idle.png', 4), strip('monsters/monster-hatred_fragment-move.png', 6), 22, { cut: 120 });
actor('enemy_executor', gaps('late-elites/executor-idle.png'), gaps('late-elites/executor-move.png'), 38);
actor('enemy_archon', gaps('late-elites/archon-idle.png'), gaps('late-elites/archon-move.png'), 30);

// ---------- 보스 ----------
actor('enemy_fusion_akgwi', single('fusion/body-idle.png'), single('fusion/body-move.png'), 72, { independent: true });
actor('enemy_fusion_akgwi_phase2', single('fusion/body-rage.png'), single('fusion/body-move.png'), 78, { independent: true });
actor('enemy_electric_ring', single('electric/body-idle.png'), single('electric/body-walk.png'), 75, { independent: true });
actor('enemy_magi_golem', single('golem/body-idle.png'), single('golem/body-walk.png'), 84, { independent: true });
actor('enemy_magi_golem_phase2', single('golem/body-rage.png'), single('golem/body-walk.png'), 90, { independent: true });
actor('enemy_eclipse', strip('eclipse/p1-idle.png', 4), strip('eclipse/p1-move.png', 6), 75);
actor('enemy_eclipse_phase2', strip('eclipse/p2-idle.png', 4), strip('eclipse/p2-move.png', 6), 84);
// 마기카이저: 구속(1단계) → 2 → 3단계
actor('enemy_magi_kaiser', strip('kaiser/idle.png', 4), strip('kaiser/move.png', 6), 99);
actor('enemy_magi_kaiser_phase1', strip('kaiser/p1-idle.png', 4), [], 99);
actor('enemy_magi_kaiser_phase2', strip('kaiser/p2-idle.png', 4), strip('kaiser/move.png', 6), 99);
actor('enemy_magi_kaiser_phase3', strip('kaiser/p3-idle.png', 4), strip('kaiser/move.png', 6), 105);
// 선조의 잔상: 야만용사 시초 각성자의 전투 기록 → 야만용사 몸체
actor('enemy_ancestor_echo', single('warrior/barbarian-idle.png'), strip('warrior/barbarian-move.png', 2), 66, { independent: true });

// ---------- 첨탑 ----------
sprites.spire_small = sheet('spire_small', single('spires/small-0.png'), 44);
sprites.spire_medium = sheet('spire_medium', single('spires/medium-0.png'), 52);

// ---------- 스킬 오브젝트 (헥타르) ----------
// 포탑: 다리(고정)와 머리(적을 향해 돈다)를 나눈다. 원본 총구가 왼쪽이라 머리는 뒤집어 오른쪽을 보게 한다
function turret(key, f, fit, headBottom, legsTop, ballX, ballY, tipX, tipY) {
  const im = load(f);
  const whole = k.bbox(im, 40);
  const s = fit / Math.max(whole.w, whole.h);
  const legs = k.crop(im, 0, legsTop, im.w, im.h - legsTop);
  const lb = k.bbox(legs, 40);
  sprites[key] = sheet(key, [legs], Math.round(Math.max(lb.w, lb.h) * s));
  const head = k.flipX(k.crop(im, 0, 0, im.w, headBottom));
  const hb = k.bbox(head, 40);
  const hk = `${key}_head`;
  sprites[hk] = sheet(hk, [head], Math.round(Math.max(hb.w, hb.h) * s));
  sprites[hk].aim = {
    pivotX: Math.round(((im.w - 1 - ballX - hb.x) / hb.w) * 100) / 100,
    pivotY: Math.round(((ballY - hb.y) / hb.h) * 100) / 100,
    mountY: Math.round((ballY - (legsTop + lb.y + lb.h / 2)) * s),
    tiltDeg: Math.round((Math.atan2(ballY - tipY, ballX - tipX) * 180) / Math.PI),
    muzzlePx: Math.round(Math.hypot(ballX - tipX, ballY - tipY) * s),
  };
}
turret('skill_turret', 'hectar/turret-1.png', 22, 105, 100, 205, 75, 40, 48);
turret('skill_turret_big', 'hectar/turret-5.png', 32, 325, 300, 375, 245, 80, 170);
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
// 카드 창에서 크게 보여 주므로 넉넉하게 만든다
const CARD_ICON = 64;
const STAT_ICON = { strength: 'strength', toughness: 'fortitude', agility: 'agility', intelligence: 'intellect', magiPower: 'magic', willpower: 'spirit' };
for (const [id, f] of Object.entries(STAT_ICON)) sprites[`icon_stat_${id}`] = icon(`icon_stat_${id}`, `icons/${f}.png`, CARD_ICON);
const SKILL_ICON = {
  magiTurret: 'turret', magiMine: 'mine', antimatterCannon: 'antimatter', magiField: 'field', railgun: 'rail', combatDrone: 'drone',
  unstableSubject: 'specimen', magiCorruption: 'mutate', experimentalWeapon: 'laser', purifyingWings: 'purify', mkPrototype: 'mk', reductionist: 'reduction',
};
for (const [id, f] of Object.entries(SKILL_ICON)) sprites[`icon_skill_${id}`] = icon(`icon_skill_${id}`, `icons/${f}.png`, CARD_ICON);
const ULT_ICON = { firstLaw: 'repeat', thunderbolt: 'thunder', singularity: 'singularity' };
for (const [id, f] of Object.entries(ULT_ICON)) sprites[`icon_ult_${id}`] = icon(`icon_ult_${id}`, `icons/${f}.png`, CARD_ICON);

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
  item_broken_hilt: 'items/broken-sheath.png', item_elegant_magi: 'items/elegant-magi.png', item_antimatter_sample: 'items/experimental-antimatter.png',
  item_combat_theory: 'items/combat-application.png', item_oak_heart: 'items/oak-heart.png', item_hanwoo_steak: 'items/raw-beef.png', item_lee_seal: 'items/lee-seal.png',
  item_magowiki_codex: 'items/magowiki.png', item_lsd_r: 'items/lsd-r.png', item_afro_belt: 'items/afro-belt.png',
  item_regulus_shard: 'items/regulus.png', item_caesar_crown: 'items/caesar.png', item_acrux_cross: 'items/acrux.png', item_orion_belt: 'items/betelgeuse.png',
  item_warrior_memory: 'warrior/icon-mastery-weapon.png', item_atros_codex: 'codex/simple-paper.png',
  item_divine_sword: 'items/sword-youngdi.png', item_hectar_ram: 'items/hectar-ram.png',
  item_wonhon_lump: 'rewards/ghost-icon.png',
};
for (const [key, f] of Object.entries(ITEM)) sprites[key] = icon(key, f, CARD_ICON);

// ---------- 방 타일 (terrain.png: 1행 돌, 2행 푸른 기술, 3행 붉은 균열) ----------
// 3장은 붉은 적이 묻히지 않게 붉은 점이 드문 칸을 더 어둡게
const TILE_ROW = { 1: [0, 0], 2: [3, 1], 3: [2, 2] };
const FLOOR_DIM = { 1: 0.45, 2: 0.45, 3: 0.32 };
for (const [c, [col, row]] of Object.entries(TILE_ROW)) {
  // 바닥은 어둡게 눌러 캐릭터가 잘 보이게, 벽은 바닥보다 밝게
  sprites[`tile_floor_c${c}`] = tile(`tile_floor_c${c}`, col, row, 64, FLOOR_DIM[c]);
  sprites[`tile_corridor_c${c}`] = tile(`tile_corridor_c${c}`, col, row, 64, FLOOR_DIM[c] * 0.75);
  sprites[`tile_wall_c${c}`] = tile(`tile_wall_c${c}`, 2, 0, 32, c === '3' ? 0.5 : 0.75);
}

// ---------- 방 꾸미기 (terrain.png 바닥 변형, environment 묶음의 소품) ----------
// 바닥 변형: 방마다 하나를 고른다. 타일이 커서 같은 무늬가 덜 반복된다
const FLOOR_VARIANTS = {
  1: [[0, 0], [1, 0], [2, 0], [3, 0], [0, 3], [1, 3]],
  2: [[0, 1], [1, 1], [2, 1], [3, 1]],
  3: [[0, 2], [1, 2], [2, 2]],
};
for (const [c, list] of Object.entries(FLOOR_VARIANTS)) {
  list.forEach(([col, row], i) => { sprites[`tile_floor_c${c}_v${i}`] = tile(`tile_floor_c${c}_v${i}`, col, row, 128, FLOOR_DIM[c]); });
}
const prop = (key, f, x, y, fit, dim) => { sprites[key] = sheet(key, [k.component(load(`environment/${f}-atlas.png`), x, y)], fit, dim ? { dim } : {}); };
// 지형지물: 챕터마다 바닥과 확실히 다른 소품 (바위 / 기계·상자 / 붉은 수정)
const OBSTACLES = {
  1: [['cave', 55, 50], ['cave', 135, 70], ['cave', 305, 50], ['cave', 395, 55], ['cave', 480, 50], ['cave', 640, 60]],
  2: [['ruins', 165, 815], ['ruins', 530, 800], ['ruins', 625, 815], ['ruins', 455, 810], ['ruins', 695, 810], ['ruins', 120, 465]],
  3: [['cave', 885, 560], ['cave', 1180, 570], ['cave', 800, 640], ['cave', 1065, 680], ['ruins', 790, 470], ['ruins', 970, 470]],
};
for (const [c, list] of Object.entries(OBSTACLES)) list.forEach(([f, x, y], i) => prop(`obstacle_c${c}_${i}`, f, x, y, 28));
// 바닥 장식: 밟고 지나가는 잔해·패널·균열 (x, y, 크기)
const DECALS = {
  1: [['ruins', 610, 965, 28], ['ruins', 715, 965, 26], ['ruins', 810, 965, 26], ['ruins', 610, 1025, 28], ['ruins', 720, 1025, 28], ['cave', 550, 995, 30], ['cave', 720, 995, 34]],
  2: [['ruins', 70, 345, 56], ['ruins', 170, 345, 56], ['ruins', 560, 345, 56], ['ruins', 610, 965, 28], ['ruins', 715, 965, 26], ['ruins', 810, 965, 26], ['cave', 720, 995, 34]],
  3: [['ruins', 885, 965, 28], ['ruins', 975, 965, 26], ['ruins', 1075, 965, 22], ['ruins', 1160, 975, 36], ['ruins', 790, 345, 56], ['ruins', 1290, 345, 56], ['cave', 1180, 985, 24]],
};
for (const [c, list] of Object.entries(DECALS)) list.forEach(([f, x, y, fit], i) => prop(`decal_c${c}_${i}`, f, x, y, fit, 0.5));
// 자판기
prop('prop_vending', 'ruins', 545, 465, 32);
// 물약: 원본에 없어 직접 찍는다 (. 투명, o 테두리, g 유리, r 물약, w 빛, c 코르크)
{
  const rows = ['...ccc...', '...ccc...', '..oooo...', '...ogo...', '...ogo...', '..oggoo..', '.ogrrrgo.', 'ogrwrrrgo', 'ogrrrrrgo', 'ogrrrrrgo', '.ogrrrgo.', '..ooooo..'];
  const col = { o: [38, 20, 28], g: [190, 215, 230], r: [226, 58, 76], w: [255, 190, 190], c: [150, 104, 64] };
  const im = k.blank(rows[0].length, rows.length);
  rows.forEach((r, y) => [...r].forEach((ch, x) => {
    if (ch === '.') return;
    const o = (y * im.w + x) * 4;
    im.px[o] = col[ch][0]; im.px[o + 1] = col[ch][1]; im.px[o + 2] = col[ch][2]; im.px[o + 3] = 255;
  }));
  const file = `${OUT_DIR}/pickup_potion.png`;
  k.write(path.join(REPO, 'public/assets', file), im);
  sprites.pickup_potion = { file, frameWidth: im.w, frameHeight: im.h, frames: 1 };
}

// ---------- 직접 찍은 도트 (원본에 없는 무기·탄·상자 등) ----------
// 글자 하나가 한 칸이다. . 투명, 그 외는 팔레트 색. 줄 길이가 달라도 오른쪽을 비운다
const PAL = {
  K: [24, 20, 30], d: [70, 76, 92], m: [130, 138, 156], l: [196, 204, 220], w: [240, 244, 255],
  b: [92, 58, 36], B: [150, 100, 60], g: [232, 190, 70], G: [168, 120, 40], Y: [255, 226, 120], r: [214, 58, 70],
  c: [90, 220, 240], C: [40, 130, 190], p: [120, 84, 220], P: [200, 170, 255], s: [232, 196, 160], S: [180, 130, 100],
  o: [96, 120, 84], O: [60, 80, 58], n: [60, 72, 110], N: [38, 46, 74], e: [255, 154, 60], E: [200, 80, 30], y: [255, 240, 170],
};
function dots(key, rows, opts = {}) {
  const pal = { ...PAL, ...opts.pal };
  const sc = opts.scale ?? 1;
  const w = Math.max(...rows.map((r) => r.length));
  const im = k.blank(w * sc, rows.length * sc);
  rows.forEach((r, y) => [...r].forEach((ch, x) => {
    if (ch === '.') return;
    if (!pal[ch]) throw new Error(`${key}: 팔레트에 없는 글자 ${ch}`);
    for (let j = 0; j < sc; j++) for (let i = 0; i < sc; i++) {
      const o = (((y * sc + j) * im.w) + x * sc + i) * 4;
      im.px[o] = pal[ch][0]; im.px[o + 1] = pal[ch][1]; im.px[o + 2] = pal[ch][2]; im.px[o + 3] = 255;
    }
  }));
  const file = `${OUT_DIR}/${key}.png`;
  k.write(path.join(REPO, 'public/assets', file), im);
  sprites[key] = { file, frameWidth: im.w, frameHeight: im.h, frames: 1, ...(opts.extra ?? {}) };
}
/** 무기는 오른쪽을 보게 그린다. gripX: 손에 쥐는 가로 위치(0~1) */
const weapon = (key, gripX, rows, pal) => dots(key, rows, { pal, extra: { gripX } });
weapon('weapon_pistol', 0.4, [
  '.KKKKKKKKKK',
  'KllllllllmK',
  'KmmmmmmmddK',
  '.KKdBBKKKK.',
  '...KBBK....',
  '...KbBK....',
  '...KKKK....',
]);
weapon('weapon_smg', 0.4, [
  '.....KK.......',
  '.KKKKKKKKKKKK.',
  'KmlllllllllmmK',
  'KdmmmmmmmmmddK',
  '.KKKdBKKdKKKK.',
  '....KBK.KdK...',
  '....KbK.KdK...',
  '....KKK.KKK...',
]);
weapon('weapon_shotgun', 0.4, [
  '........KKKKKKKKK',
  'KKKK..KKlllllllmK',
  'KBBBKKKmmmmmmmmdK',
  'KbBBBBBKKbBBBKKKK',
  '.KKKbBBK.KKKKK...',
  '....KKKK.........',
]);
weapon('weapon_rifle', 0.35, [
  '.......KKKK.........',
  'KKKK.KKKKKKKKKKKKKKK',
  'KoooKKooooooollllllK',
  'KOoooooooooodKKKKKKK',
  '.KKOOKKdKKOOK.......',
  '...KKK.KdK.KK.......',
  '.......KKK..........',
]);
weapon('weapon_sniper', 0.3, [
  '......KKKKKKK...........',
  '......KcCnnnK...........',
  'KKKK...KKKKK............',
  'KnnnKKKKKKKKKKKKKKKKKKKK',
  'KnnnnnnnmmlllllllllllllK',
  '.KKKnnKKdKKKKKKKKKKKKKKK',
  '...KKK.KdK..............',
  '.......KK...............',
]);
weapon('weapon_grenade_launcher', 0.35, [
  '....KKKKKKKKKKK.',
  'KKKKKGGGGGGGGGGK',
  'KBBBKGgggggggGGK',
  'KbBBKGGGGGGGGGGK',
  '.KKBKKKKKKKKKKK.',
  '...KdKGGGK......',
  '...KdKGGGK......',
  '...KKKKKKK......',
]);
weapon('weapon_dagger', 0.2, [
  '...K........',
  '..KgKKKKKK..',
  'KKKgKwwwwlK.',
  'KbBgKlllmmdK',
  'KKKgKmmmdK..',
  '..KgKKKKK...',
  '...K........',
]);
weapon('weapon_longsword', 0.15, [
  '...K..............',
  '..KgKKKKKKKKKKKK..',
  'KKKgKwwwwwwwwwwlK.',
  'KbBgKlllllllllmmdK',
  'KKKgKmmmmmmmmmdK..',
  '..KgKKKKKKKKKKK...',
  '...K..............',
]);
weapon('weapon_greatsword', 0.15, [
  '....KK................',
  '....KgK...............',
  '....KgKKKKKKKKKKKKKKK.',
  '.KKKKgKwwwwwwwwwwwwwlK',
  'KbBbBgKlllllllllllllmK',
  'KbBbBgKmmmmmmmmmmmmmdK',
  '.KKKKgKdddddddddddddK.',
  '....KgKKKKKKKKKKKKKK..',
  '....KgK...............',
  '....KK................',
]);
weapon('weapon_spear', 0.3, [
  '.....................KK...',
  '....................KlmK..',
  'KKKKKKKKKKKKKKKKKKKKKlllKK',
  'KbBBBBBBBBBBBBBBBBBgKwwwmK',
  'KKKKKKKKKKKKKKKKKKKKKmmmKK',
  '....................KmdK..',
  '.....................KK...',
]);
weapon('weapon_hammer', 0.25, [
  '...........KKKKKK',
  '...........KlllmK',
  '...........KlmmdK',
  '...........KlmmdK',
  'KKKKKKKKKKKKlmmdK',
  'KbBBBBBBBBBBlmmdK',
  'KKKKKKKKKKKKlmmdK',
  '...........KlmmdK',
  '...........KlmmdK',
  '...........KmmddK',
  '...........KKKKKK',
]);
weapon('weapon_avior_staff', 0.3, [
  '................KKK.',
  '...............KPpK.',
  '..............KPpPpK',
  'KKKKKKKKKKKKKKKPwPpK',
  'KbBBBBBBBBBBBBgKPpPK',
  'KKKKKKKKKKKKKKKgKpPK',
  '................KKK.',
]);
weapon('weapon_fist', 0.5, [
  '.KKKKK..',
  'KsssssK.',
  'KssssssK',
  'KSsssssK',
  'KSSsssSK',
  '.KSSSSK.',
  '..KKKK..',
]);
// 원본에 있는 전설 무기: 대각선·세로 그림을 오른쪽으로 돌린다
function bigWeapon(key, f, deg, fit, gripX, dim) {
  // 활시위·칼날처럼 가는 선이 줄이다 사라지지 않게 알파 기준을 낮춘다
  sprites[key] = { ...sheet(key, [k.rotate(load(f), deg)], fit, { alphaCut: 0.25, dim }), gripX };
}
// 환디는 원본이 어두워 바닥에 묻히므로 밝힌다
bigWeapon('weapon_handi', 'items/bow-hwandi.png', 45, 26, 0.5, 1.9);
bigWeapon('weapon_rasalgethi_club', 'items/rasalgethi.png', 45, 22, 0.2);
bigWeapon('weapon_rasalhague_sword', 'warrior/p-sword-single.png', 90, 26, 0.15);
bigWeapon('weapon_broken_blade', 'items/broken-blade.png', 45, 14, 0.3);
bigWeapon('weapon_al_gul_blade', 'items/al-ghul.png', -90, 28, 0.2);
bigWeapon('weapon_hanabi', 'items/hanabi.png', 135, 28, 0.2);
bigWeapon('weapon_gihwan_arm', 'rewards/arm.png', -90, 26, 0.2);
bigWeapon('weapon_ancient_core', 'golem/vfx-core.png', 0, 16, 0.5);
bigWeapon('weapon_eclipse_core', 'eclipse/totality-sun.png', 0, 16, 0.5);
// 고대병기의 코어 레이저(마기골렘 원본), 식광 운석
sprites.fx_golem_laser = sheet('fx_golem_laser', single('golem/vfx-laser-side.png'), 96, { alphaCut: 0.2 });
sprites.fx_eclipse_meteor = sheet('fx_eclipse_meteor', [strip('eclipse/drop.png', 3)[0]], 20);

// 탄·줍는 것
dots('projectile_player', ['.ggg.', 'gYyYg', 'gyyyg', 'gYyYg', '.ggg.']);
dots('enemy_bullet', ['..KKK..', '.KrrrK.', 'KrrwrrK', 'KrwwwrK', 'KrrwrrK', '.KrrrK.', '..KKK..']);
// 마기 입자: 보랏빛 알갱이와 작은 빛
dots('pickup_coin', ['...P...', '..KpK..', '.KpPpK.', 'PpPwPpP', '.KpPpK.', '..KpK..', '...P...']);
dots('pickup_energy', ['...K...', '..KwK..', '.KwcCK.', 'KwccCCK', 'KcccCCK', '.KcCCK.', '..KCK..', '...K...']);

// 상자: 나무(무기) / 푸른 금속(아이템)
const CHEST = [
  '..KKKKKKKKKKKKKK..',
  '.KBBBBgBBBBgBBBBK.',
  'KBBBBBgBBBBgBBBBBK',
  'KbbbbbgbbbbgbbbbbK',
  'KKKKKKKKKKKKKKKKKK',
  'KBBBBBgKggKgBBBBBK',
  'KBBBBBgKgGKgBBBBBK',
  'KbBBBBgKKKKgBBBBbK',
  'KbbbbbgbbbbgbbbbbK',
  '.KKKKKKKKKKKKKKKK.',
];
dots('chest_weapon', CHEST);
dots('chest_item', CHEST, { pal: { B: PAL.C, b: PAL.n, g: PAL.c, G: PAL.C } });
dots('merchant_stand', [
  'KKKKKKKKKKKKKKKKKKKK',
  'KlllllllllllllllllmK',
  'KmmmmmmmmmmmmmmmmmdK',
  'KKKKKKKKKKKKKKKKKKKK',
  '..KddK........KddK..',
  '..KddK........KddK..',
  '..KKKK........KKKK..',
]);
dots('enemy_training_dummy', [
  '......KKKK......', '.....KBBBBK.....', '....KBBBBBBK....', '....KBBKKBBK....', '....KBBBBBBK....', '.....KBBBBK.....',
  'KKKKKKKbbKKKKKKK', 'KBBBBBBBBBBBBBBK', 'KbbbbbbBBbbbbbbK', 'KKKKKKKBBKKKKKKK',
  '......KBBK......', '......KBbK......', '......KBBK......', '......KbBK......', '......KBBK......', '......KBbK......',
  '.....KKBBKK.....', '....KbbbbbbK....', '....KKKKKKKK....',
]);

// 부서지는 소품: 나무 상자, 불꽃 표시 통, 보석 색이 다른 석상
dots('prop_crate', [
  'KKKKKKKKKKKKKK', 'KBBBBBBBBBBBBK', 'KBbGbbbbbbGbBK', 'KBbbGbbbbGbbBK', 'KBbbbGbbGbbbBK', 'KBbbbbGGbbbbBK', 'KBbbbbGGbbbbBK',
  'KBbbbGbbGbbbBK', 'KBbbGbbbbGbbBK', 'KBbGbbbbbbGbBK', 'KBBBBBBBBBBBBK', 'KbbbbbbbbbbbbK', 'KKKKKKKKKKKKKK',
]);
dots('prop_barrel', [
  '..KKKKKKKK..', '.KmlllllllK.', 'KKKKKKKKKKKK', 'KrrrrrrrrrRK', 'KrrrYYrrrrRK', 'KrrYYYYrrrRK', 'KrrYeeYYrrRK',
  'KKKKKKKKKKKK', 'KrrYeeeYrrRK', 'KrrrYeYrrrRK', 'KrrrrrrrrrRK', 'KKKKKKKKKKKK', '.KdddddddK..', '..KKKKKKKK..',
], { pal: { R: [140, 30, 44] } });
const STATUE = [
  '.....KKKKKK.....', '....KlllllmK....', '....KllGGlmK....', '....KlGGGGmK....', '....KllGGlmK....', '.....KlllmK.....', '...KKKlllmKKK...',
  '..KlllllllmmmK..', '..KlKKlllKKmmK..', '..KlK.KlK.KmmK..', '....KKlllmKK....', '....KlllllmK....', '....KlllllmK....', '...KKKKKKKKKK...',
  '..KmmmmmmmmmmK..', '.KddddddddddddK.', 'KKKKKKKKKKKKKKKK',
];
dots('prop_statue_heal', STATUE, { pal: { G: PAL.r } });
dots('prop_statue_energy', STATUE, { pal: { G: PAL.c } });
dots('prop_statue_sanity', STATUE, { pal: { G: PAL.P } });

// 포털·코어
sprites.prop_exit_portal = sheet('prop_exit_portal', single('rift/frame-1.png'), 36);
sprites.prop_encounter_core = sheet('prop_encounter_core', single('mimosa/frames/crystal.png'), 24);

// 스킬 오브젝트 (탄은 오른쪽을 본다)
sprites.skill_turret_shell = sheet('skill_turret_shell', [gaps('awakening/turret-shell.png')[0]], 9);
sprites.skill_mine_chain = sheet('skill_mine_chain', [gaps('awakening/mine-mini.png')[0]], 8);
sprites.skill_antimatter_charge = sheet('skill_antimatter_charge', single('new-skills/antimatter-charge-1.png'), 7);
sprites.skill_antimatter_shell = sheet('skill_antimatter_shell', single('new-skills/antimatter-projectile-1.png'), 16);
sprites.skill_subject = sheet('skill_subject', [gaps('acro-awakening/specimen-idle.png')[0]], 16);
sprites.skill_experiment_shell = sheet('skill_experiment_shell', single('acro/shot-0.png'), 13);
dots('ult_first_law', ['...EEE...', '.EEeeeEE.', '.EeeyyeE.', 'EeeywyyeE', 'EeywwwyeE', 'EeeywyyeE', '.EeeyyeE.', '.EEeeeEE.', '...EEE...']);
sprites.ult_singularity = sheet('ult_singularity', single('acro/well-2.png'), 14);

// 히든보스: 오리온의 성전사 = 성기사 몸체. 왕실특무마기법사는 원본에 없어 연구원을 보라색으로 물들여 쓴다 (임시)
actor('enemy_orion_crusader', gaps('warrior/paladin-idle.png'), gaps('warrior/paladin-move.png'), 56);
{
  const fr = cells('spires/researcher-v141.png', 96, 192).slice(0, 4).map((f) => {
    const t = k.crop(f, 0, 0, f.w, f.h);
    for (let p = 0; p < t.px.length; p += 4) { t.px[p] = Math.round(t.px[p] * 0.62); t.px[p + 1] = Math.round(t.px[p + 1] * 0.45); }
    return t;
  });
  actor('enemy_royal_mage', [fr[0]], fr, 46);
}

// 아이템 아이콘 (원본에 맞는 것이 없는 둘은 직접 찍는다)
sprites.item_death_whistle = icon('item_death_whistle', 'warrior/icon-b-shout.png', CARD_ICON);
sprites.item_orion_shield = icon('item_orion_shield', 'warrior/icon-p-shield.png', CARD_ICON);
dots('item_royal_seal', [
  '.....KKKKKK.....', '...KKppppppKK...', '..KppPPPPPPppK..', '.KpPPpPPPPpPPpK.', '.KpPpPPggPPpPpK.', 'KpPPPPggggPPPPpK', 'KpPPPggwwggPPPpK', 'KpPPggwwwwggPPpK',
  'KpPPggwwwwggPPpK', 'KpPPPggwwggPPPpK', 'KpPPPPggggPPPPpK', '.KpPpPPggPPpPpK.', '.KpPPpPPPPpPPpK.', '..KppPPPPPPppK..', '...KKppppppKK...', '.....KKKKKK.....',
], { scale: 4 });
dots('item_gisup_stone', [
  '................', '....KKKKKK......', '...KmmmmlKK.....', '..KmlllmmmlK....', '..KmldmmdmlKK...', '..KmmmmmmmmmK...', '..KmddmmdmmlK...', '..KmmmmmmmmlK...',
  '..KmdmmddmmmK...', '..KmmmmmmmmmK...', '..KmddmmmdmlK...', '..KmmmmmmmmmK...', '..KdmmmdmmmdK...', '..KddKmmmKddK...', '...KK.KdK.KK....', '......KK........',
], { scale: 4 });

// 실험장
const labProp = (key, x, y, fit) => { sprites[key] = sheet(key, [k.component(load('environment/ruins-atlas.png'), x, y)], fit); };
labProp('lab_capsule', 180, 570, 32);
labProp('lab_codex', 345, 455, 28);
sprites.lab_job_device = sheet('lab_job_device', single('mimosa/frames/device.png'), 32);
sprites.lab_portal = sheet('lab_portal', single('fusion/vfx-portal.png'), 34);
sprites.lab_archive = sheet('lab_archive', single('mimosa/frames/data.png'), 28);
sprites.lab_gemini = sheet('lab_gemini', single('story/mg-full.png'), 32);
{
  const im = k.blank(100, 12);
  for (let y = 0; y < 12; y++) for (let x = 0; x < 100; x++) {
    const edge = x === 0 || y === 0 || x === 99 || y === 11;
    const inner = x === 1 || y === 1 || x === 98 || y === 10;
    const c = edge ? PAL.K : inner ? PAL.n : [6, 9, 12];
    const o = (y * 100 + x) * 4;
    im.px[o] = c[0]; im.px[o + 1] = c[1]; im.px[o + 2] = c[2]; im.px[o + 3] = 255;
  }
  const file = `${OUT_DIR}/lab_window.png`;
  k.write(path.join(REPO, 'public/assets', file), im);
  sprites.lab_window = { file, frameWidth: 100, frameHeight: 12, frames: 1 };
}

const artPath = path.join(REPO, 'src/data/art.json');
const json = { basePath: 'assets/', sprites };
fs.writeFileSync(artPath, JSON.stringify(json, null, 2) + '\n');
let bytes = 0;
for (const f of fs.readdirSync(out)) bytes += fs.statSync(path.join(out, f)).size;
console.log(`${Object.keys(sprites).length}개, ${Math.round(bytes / 1024)}KB`);
