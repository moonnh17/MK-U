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
  // 칸 경계로 자르면 경계를 넘은 부분이 잘리고 옆 칸 조각이 묻어 온다.
  // 이어진 덩어리를 통째로 무게중심이 있는 칸에 넣는다 (여러 칸에 걸친 큰 덩어리만 칸 경계로 나눈다)
  const padX = Math.round(cw / 2), padY = Math.round(ch / 2);
  const all = Array.from({ length: cols * rows }, () => k.blank(Math.round(cw) + padX * 2, Math.round(ch) + padY * 2));
  const put = (cell, c, r, p) => {
    if (c < 0 || r < 0 || c >= cols || r >= rows) return;
    const x = p % im.w, y = (p - x) / im.w;
    const dx = x - Math.round(c * cw) + padX, dy = y - Math.round(r * ch) + padY;
    const t = all[cell];
    if (dx < 0 || dy < 0 || dx >= t.w || dy >= t.h) return;
    im.px.copy(t.px, (dy * t.w + dx) * 4, p * 4, p * 4 + 4);
  };
  for (const comp of k.components(im)) {
    if (comp.x1 - comp.x0 > cw * 1.5 || comp.y1 - comp.y0 > ch * 1.5) {
      for (const p of comp.pts) {
        const x = p % im.w, y = (p - x) / im.w;
        const c = Math.min(cols - 1, Math.floor(x / cw)), r = Math.min(rows - 1, Math.floor(y / ch));
        put(r * cols + c, c, r, p);
      }
      continue;
    }
    let sx = 0, sy = 0;
    for (const p of comp.pts) { sx += p % im.w; sy += Math.floor(p / im.w); }
    const c = Math.min(cols - 1, Math.floor(sx / comp.area / cw)), r = Math.min(rows - 1, Math.floor(sy / comp.area / ch));
    for (const p of comp.pts) put(r * cols + c, c, r, p);
  }
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
  return segs.filter(([a, b]) => b - a >= maxW * 0.4).map(([a, b]) => {
    const f2 = k.crop(im, a, 0, b - a, im.h);
    const comps = k.components(f2, cut);
    const biggest = Math.max(...comps.map((c) => c.area));
    for (const c of comps) if (c.area < biggest * 0.05 && (c.x0 === 0 || c.x1 === f2.w - 1)) for (const p of c.pts) f2.px[p * 4 + 3] = 0;
    return f2;
  });
}
const single = (f) => [load(f)];

/** 게임 1px에 넣는 그림 픽셀 수. 원본 도트를 뭉개지 않고 도트만 작아진다 (크게 올리면 그림처럼 보이니 조금만) */
const ART_DENSITY = 2;
const even = (v) => Math.max(ART_DENSITY, Math.round(v / ART_DENSITY) * ART_DENSITY);
const ENEMY_OUTLINE = [255, 36, 36];
const SPECK_PX = 7;
/** 프레임마다 1칸씩 넓혀 그림 둘레에 테두리를 두른다 */
function outlined(img, fw, fh, n, color) {
  const out = k.blank((fw + 2) * n, fh + 2);
  for (let i = 0; i < n; i++) k.paste(out, k.crop(img, i * fw, 0, fw, fh), i * (fw + 2) + 1, 1);
  // 줄이면서 생긴 몇 픽셀짜리 부스러기는 테두리가 붙으면 지저분하다
  for (const c of k.components(out, 0)) if (c.area < SPECK_PX) for (const p of c.pts) out.px[p * 4 + 3] = 0;
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
/** 프레임 맨 위 띠에 있는 작은 글자 조각을 지운다 (원본 시트에 남은 잔재) */
function dropTopGlyphs(f) {
  const comps = k.components(f);
  const top = Math.min(...comps.map((c) => c.y0));
  const out = k.crop(f, 0, 0, f.w, f.h);
  const biggest = Math.max(...comps.map((c) => c.area));
  const band = (f.h / 2) * 0.09;
  for (const c of comps) if (c.area < biggest * 0.01 && c.y1 <= top + band) for (const p of c.pts) out.px[p * 4 + 3] = 0;
  return out;
}

/** 몸에서 멀리 떨어진 작은 조각(옆 프레임 부스러기, 글자 잔재)을 지운다. 몸 둘레의 불꽃·파편은 남긴다 */
function cleanFrame(f) {
  const comps = k.components(f);
  if (comps.length < 2) return f;
  const main = comps.reduce((a, b) => (b.area > a.area ? b : a));
  const reach = Math.max(main.x1 - main.x0, main.y1 - main.y0) * 0.18;
  const out = k.crop(f, 0, 0, f.w, f.h);
  for (const c of comps) {
    if (c === main || c.area >= main.area * 0.03) continue;
    const near = c.x1 >= main.x0 - reach && c.x0 <= main.x1 + reach && c.y1 >= main.y0 - reach && c.y0 <= main.y1 + reach;
    const inside = c.x0 >= main.x0 && c.x1 <= main.x1 && c.y0 >= main.y0 && c.y1 <= main.y1;
    if (inside || (near && c.area >= main.area * 0.002)) continue;
    for (const p of c.pts) out.px[p * 4 + 3] = 0;
  }
  return out;
}

/** idle 프레임 + move 프레임을 한 시트로 */
function actor(key, idle, move, fit, opts = {}) {
  // 적은 빨간 테두리로 배경과 확실히 구분한다
  if (key.startsWith('enemy_')) opts = { ...opts, outline: ENEMY_OUTLINE };
  const pose = opts.pose ?? null;
  const s = sheet(key, [...idle, ...move, ...(pose ? pose.frames : [])].map((f) => (key.startsWith('enemy_') ? cleanFrame(f) : f)), fit, opts);
  const anims = {};
  if (idle.length) anims.idle = anim(0, idle.length - 1, opts.idleFps ?? 4);
  if (move.length) anims.move = anim(idle.length, idle.length + move.length - 1, opts.moveFps ?? 8);
  // 공격 준비 자세: 한 번 돌고 마지막 칸에서 멈춘다
  if (pose) anims.aim = { ...anim(idle.length + move.length, idle.length + move.length + pose.frames.length - 1, pose.fps), loop: false };
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

// 유령 사수: 6번째 줄. 화살을 잡고(1) 시위에 걸어(2) 끝까지 당긴다(3)
{ const r = M(5); actor('enemy_ghost_shooter', [r[0]], [r[0], r[1]], 26, { moveFps: 4, pose: { frames: [r[1], r[2], r[3]], fps: 5 } }); }

// ---------- 2장 ----------
actor('enemy_hectar_trooper', [strip('spires/trooper.png', 4)[0]], strip('spires/trooper.png', 4), 22);
actor('enemy_magi_beetle', strip('monsters/monster-magi_beetle-idle.png', 4), strip('monsters/monster-magi_beetle-move.png', 6), 24);
actor('enemy_a_memory', strip('monsters/monster-some_memory-idle.png', 6), strip('monsters/monster-some_memory-move.png', 8), 24);

// ---------- 3장 ----------
actor('enemy_ancient_one', strip('monsters/monster-nameless-idle.png', 5), strip('monsters/monster-nameless-move.png', 7), 26);
actor('enemy_hatred_shard', strip('monsters/monster-hatred_fragment-idle.png', 4), strip('monsters/monster-hatred_fragment-move.png', 6), 22, { cut: 120 });
actor('enemy_executor', gaps('late-elites/executor-idle.png'), gaps('late-elites/executor-move.png'), 38);
actor('enemy_archon', gaps('late-elites/archon-idle.png'), gaps('late-elites/archon-move.png'), 30);

// ---------- 보스 ----------
// 마기카이저: 구속(1단계) → 2 → 3단계
actor('enemy_magi_kaiser', strip('kaiser/idle.png', 4), strip('kaiser/move.png', 6), 99);
// 선조의 잔상: 야만용사 시초 각성자의 전투 기록 → 야만용사 몸체
actor('enemy_ancestor_echo', single('warrior/barbarian-idle.png'), strip('warrior/barbarian-move.png', 2), 66, { independent: true });

// ---------- 첨탑 ----------
sprites.spire_small = sheet('spire_small', single('spires/small-0.png'), 44);
sprites.spire_medium = sheet('spire_medium', single('spires/medium-0.png'), 52);

// ---------- 스킬 오브젝트 (헥타르) ----------
// 포탑: 다리(고정)와 머리(적을 향해 돈다)를 나눈다. 원본 총구가 왼쪽이라 머리는 뒤집어 오른쪽을 보게 한다
function turret(key, f, fit, headBottom, legsTop, ballX, ballY, tipX, tipY) {
  const im = typeof f === 'string' ? load(f) : f;
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
  item_regulus_shard: 'items/regulus.png', item_caesar_crown: 'items/caesar.png', item_acrux_cross: 'items/acrux.png', item_orion_belt: 'items/betelgeuse.png',
  item_warrior_memory: 'warrior/icon-mastery-weapon.png', item_atros_codex: 'items/atros-codex.png',
  item_lk99: 'items/lk99.png', item_gisup_stone: 'items/gisup-stone.png', item_chantforet_spirit: 'items/chantforet-spirit.png',
  item_divine_sword: 'items/sword-youngdi.png', item_hectar_ram: 'items/hectar-ram.png',
  item_wonhon_lump: 'items/wonhon-lump.png', item_afro_belt: 'items/afro-belt.png', item_magowiki_codex: 'items/magowiki.png',
  item_death_whistle: 'items/death-whistle.png', item_royal_seal: 'items/royal-seal.png',
  item_magnet_resonator: 'items/magnet-resonator.png', item_steel_castle_figure: 'items/steel-castle-figure.png', item_war_diary: 'items/war-diary.png',
  item_snell_law: 'items/snell-law.png', item_hela_cell: 'items/hela-cell.png', item_forbidden_virus: 'items/forbidden-virus.png',
  item_extra_arms: 'items/extra-arms.png', item_forbidden_gift: 'items/forbidden-gift.png',
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
weapon('weapon_curved_bow', 0.8, [
  '.lKK.......',
  '.l.KbK.....',
  '.l..KbBK...',
  '.l...KbBK..',
  '.l....KbBK.',
  '.l.....KbK.',
  '.l.....KbBK',
  '.l......KbK',
  '.l......KbK',
  '.l......KGK',
  '.l......KGK',
  '.l......KGK',
  '.l......KbK',
  '.l......KbK',
  '.l.....KbBK',
  '.l.....KbK.',
  '.l....KbBK.',
  '.l...KbBK..',
  '.l..KbBK...',
  '.l.KbK.....',
  '.lKK.......',
]);
dots('projectile_arrow', [
  'm.m............l..',
  'wmmK...........lm.',
  '.wbBBBBBBBBBBBBmlw',
  'wmmK...........lm.',
  'm.m............l..',
]);
dots('projectile_zephyr_arrow', [
  'c.c............C..',
  'wccC...........CC.',
  '.wCcccccccccccccww',
  'wccC...........CC.',
  'c.c............C..',
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
// 사용자 제공 유니크 무기 (검은 배경을 지운다)
/** 흰 배경 지우기: 가장자리에 닿거나 넓은 흰 덩어리만 지운다 (무기 안쪽 구멍도 뚫리고 작은 하이라이트는 남는다) */
function knockWhite(im, min = 228, hole = 25) {
  const seen = new Uint8Array(im.w * im.h);
  const pale = (p) => im.px[p * 4 + 3] < 40 || Math.min(im.px[p * 4], im.px[p * 4 + 1], im.px[p * 4 + 2]) >= min;
  for (let s = 0; s < im.w * im.h; s++) {
    if (seen[s] || !pale(s)) continue;
    const list = [];
    const stack = [s];
    seen[s] = 1;
    let edge = false;
    while (stack.length) {
      const p = stack.pop();
      list.push(p);
      const x = p % im.w;
      const y = (p - x) / im.w;
      if (x === 0 || y === 0 || x === im.w - 1 || y === im.h - 1) edge = true;
      for (const n of [x > 0 ? p - 1 : -1, x < im.w - 1 ? p + 1 : -1, y > 0 ? p - im.w : -1, y < im.h - 1 ? p + im.w : -1]) {
        if (n >= 0 && !seen[n] && pale(n)) { seen[n] = 1; stack.push(n); }
      }
    }
    if (edge || list.length >= hole) for (const p of list) im.px[p * 4 + 3] = 0;
  }
  return im;
}
function userWhite(key, file, { rotate = 0, flip = false, fit, gripX, dim, min }) {
  let im = knockWhite(k.read(path.join(__dirname, 'art-src/weapons', file)), min);
  if (flip) im = k.flipX(im);
  if (rotate) im = k.rotate(im, rotate);
  sprites[key] = { ...sheet(key, [im], fit, { alphaCut: 0.25, dim }), gripX };
}
userWhite('weapon_zephyr', 'zephyr.png', { rotate: 90, fit: 34, gripX: 0.8, min: 235 });
userWhite('weapon_flame_staff', 'flame_staff.png', { rotate: 36, fit: 28, gripX: 0.35 });
userWhite('weapon_magi_fang', 'fang.png', { rotate: 19, fit: 30, gripX: 0.18 });
userWhite('weapon_mg70', 'mg70.png', { fit: 30, gripX: 0.3, dim: 1.5 });
userWhite('weapon_soul_calibur', 'soul.png', { flip: true, fit: 36, gripX: 0.24, dim: 1.9 });
userWhite('weapon_antimatter_pistol', 'antimatter_pistol.png', { fit: 22, gripX: 0.18 });
{
  // 소울 칼리버 시트 오른쪽 아래의 방전 파티클
  const sheetIm = knockWhite(k.read(path.join(__dirname, 'art-src/weapons/soul_sheet.png')));
  sprites.fx_soul_burst = sheet('fx_soul_burst', [k.crop(sheetIm, 714, 553, 658, 217)], 44, { alphaCut: 0.25 });
}
function userWeapon(key, file, { rotate = 0, flip = false, fit, gripX, black = 40, dim }) {
  let im = k.read(path.join(__dirname, 'art-src/weapons', file));
  const seen = new Uint8Array(im.w * im.h);
  const stack = [];
  const dark = (p) => Math.max(im.px[p * 4], im.px[p * 4 + 1], im.px[p * 4 + 2]) < black;
  for (let x = 0; x < im.w; x++) stack.push(x, (im.h - 1) * im.w + x);
  for (let y = 0; y < im.h; y++) stack.push(y * im.w, y * im.w + im.w - 1);
  while (stack.length) {
    const p = stack.pop();
    if (seen[p] || !dark(p)) continue;
    seen[p] = 1;
    im.px[p * 4 + 3] = 0;
    const x = p % im.w;
    if (x > 0) stack.push(p - 1);
    if (x < im.w - 1) stack.push(p + 1);
    if (p >= im.w) stack.push(p - im.w);
    if (p < im.w * (im.h - 1)) stack.push(p + im.w);
  }
  if (flip) im = k.flipX(im);
  if (rotate) im = k.rotate(im, rotate);
  sprites[key] = { ...sheet(key, [im], fit, { alphaCut: 0.25, dim }), gripX };
}
// 배경이 완전한 검정이라 문턱을 낮춘다 (40이면 어두운 칼날까지 배경으로 지워져 가운데가 뚫린다)
userWeapon('weapon_nekkar_cleaver', 'nekkar.png', { rotate: 45, fit: 28, gripX: 0.22, dim: 1.5, black: 8 });
// 새 무기 5종 (원본이 이미 투명 배경이라 검정 지우기는 끈다)
userWeapon('weapon_orbital_disc', 'orbital_disc.png', { fit: 16, gripX: 0.5, black: 0 });
userWeapon('weapon_space_needle', 'space_needle.png', { fit: 30, gripX: 0.15, black: 0 });
userWeapon('weapon_bootleg_gun', 'bootleg_gun.png', { fit: 30, gripX: 0.3, black: 0 });
userWeapon('weapon_debtor_arm', 'debtor_arm.png', { fit: 26, gripX: 0.2, black: 0 });
userWeapon('weapon_hwan_remnant', 'hwan_remnant.png', { fit: 32, gripX: 0.25, black: 0 });
{
  const w = (f) => k.read(path.join(__dirname, 'art-src/weapons', f));
  sprites.proj_orbital_disc = sheet('proj_orbital_disc', [w('orbital_disc.png')], 11, { alphaCut: 0.25 });
  sprites.proj_space_needle = sheet('proj_space_needle', [w('space_needle.png')], 14, { alphaCut: 0.25 });
  // 환국의 잔명 충전 단계 0~5 (무기 위에 작게 띄운다)
  sprites.fx_hwan_gauge = sheet('fx_hwan_gauge', [0, 1, 2, 3, 4, 5].map((i) => w(`hwan_gauge_${i}.png`)), 12, { alphaCut: 0.25 });
}
userWeapon('weapon_algieba_sling', 'algieba.png', { flip: true, rotate: -32, fit: 28, gripX: 0.3, black: 46 });
userWeapon('weapon_argo_banner', 'argo.png', { fit: 40, gripX: 0.2 });
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
// 무기 상자 등급별: 일반(쇠띠) · 고급(초록·은) · 최고급(금) · 전설(보라·금, 반짝임) · 보스(검붉은 쇠·해골·뿔)
dots('chest_weapon_basic', ["..KKKKKKKKKKKKKK..", ".KBBBBmBBBBmBBBBK.", "KBBBBBmBBBBmBBBBBK", "KbbbbbdbbbbdbbbbbK", "KKKKKKKKKKKKKKKKKK", "KBBBBBmKmmKmBBBBBK", "KBBBBBmKmdKmBBBBBK", "KbBBBBmKKKKmBBBBbK", "KbbbbbdbbbbdbbbbbK", ".KKKKKKKKKKKKKKKK."], { pal: {} });
dots('chest_weapon_advanced', ["..KKKKKKKKKKKKKK..", ".KwBBBgBBBBgBBBwK.", "KBBBBBgBBBBgBBBBBK", "KbbbbbgbbbbgbbbbbK", "KggggggggggggggggK", "KBBBBBgKggKgBBBBBK", "KBBBBBgKgcKgBBBBBK", "KwBBBBgKKKKgBBBBwK", "KbbbbbgbbbbgbbbbbK", ".KKKKKKKKKKKKKKKK."], { pal: { B: [60, 124, 82], b: [36, 78, 54], g: PAL.l, G: PAL.m } });
dots('chest_weapon_supreme', ["..KKKKKKKKKKKKKK..", ".KggggggggggggggK.", "KgBBBBYBBBBYBBBBgK", "KgbbbbYbbbbYbbbbgK", "KggggggggggggggggK", "KgBBBBYKYYKYBBBBgK", "KgBBBBYKYrKYBBBBgK", "KgbBBBYKKKKYBBBbgK", "KgbbbbYbbbbYbbbbgK", ".KKKKKKKKKKKKKKKK."], { pal: { B: [110, 64, 38], b: [70, 40, 26] } });
dots('chest_weapon_legendary', [".........y..........", "...KKKKKKKKKKKKKK...", "..KgpppPppppPpppgK..", ".KgppppPppppPppppgK.", ".KgNNNNPNNNNPNNNNgK.", "KggggggggggggggggggK", "KgpppppPKyyKPpppppgK", "KgpppppPKwyKPpppppgK", "KgNppppPKKKKPppppNgK", "KgNNNNNPNNNNPNNNNNgK", ".KKKKKKKKKKKKKKKKKK."], { pal: { P: [255, 226, 120], N: [70, 40, 140] } });
dots('chest_weapon_boss', [".K................K.", ".KK..............KK.", "..KKKKKKKKKKKKKKKK..", ".KdNNNNrNNNNrNNNNdK.", "KdNNNNNrNNNNrNNNNNdK", "KKKKKKKKKKKKKKKKKKKK", "KdNNNNNKwwwwKNNNNNdK", "KdNNNNNKrwwrKNNNNNdK", "KdNNNNNKwwwwKNNNNNdK", "KdNNNNNNKwwKNNNNNNdK", "KddddddddddddddddddK", ".KKKKKKKKKKKKKKKKKK."], { pal: { N: [46, 30, 36], d: [90, 30, 40], w: [220, 210, 190] } });
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
dots('ult_first_law', ['...EEE...', '.EEeeeEE.', '.EeeyyeE.', 'EeeywyyeE', 'EeywwwyeE', 'EeeywyyeE', '.EeeyyeE.', '.EEeeeEE.', '...EEE...']);

// 히든보스: 오리온의 성전사 = 성기사 몸체. 왕실특무마기법사는 원본에 없어 연구원을 보라색으로 물들여 쓴다 (임시)
actor('enemy_orion_crusader', gaps('warrior/paladin-idle.png'), gaps('warrior/paladin-move.png'), 56);
{
  const solid = (f) => (k.components(f).reduce((a, c) => Math.max(a, c.area), 0));
  const allFr = cells('spires/researcher-v141.png', 96, 192);
  const biggest = Math.max(...allFr.map(solid));
  const fr = allFr.filter((f) => solid(f) > biggest * 0.5).slice(0, 4).map((f) => {
    const t = k.crop(f, 0, 0, f.w, f.h);
    for (let p = 0; p < t.px.length; p += 4) { t.px[p] = Math.round(t.px[p] * 0.62); t.px[p + 1] = Math.round(t.px[p + 1] * 0.45); }
    return t;
  });
  actor('enemy_royal_mage', [fr[0]], fr.slice(0, 3), 46);
}

// 아이템 아이콘 (원본에 맞는 것이 없는 것은 직접 찍는다)
sprites.item_orion_shield = icon('item_orion_shield', 'warrior/icon-p-shield.png', CARD_ICON);

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

// ---------- 헥타르 스킬 (Lv1·3·5·각성 원본 묶음) ----------
// 게임의 Lv1·2·3이 원본의 Lv1·3·5다. 애니메이션은 원본 파일목록의 프레임 수·FPS·반복을 그대로 쓴다
const HECTAR_DIR = process.argv[3] ?? path.resolve(REPO, '../MKU-Hectar-Skills-Lv1-3-5-Awakened');
const HECTAR = JSON.parse(fs.readFileSync(path.join(HECTAR_DIR, '파일목록.json'), 'utf8')).files;
const hFile = (skill, level, label) => {
  const f = HECTAR.find((x) => x.skill.startsWith(skill) && x.level.startsWith(level) && x.label.startsWith(label));
  if (!f) throw new Error(`헥타르 그림 없음 ${skill} ${level} ${label}`);
  return f;
};
const hImg = (skill, level, label) => k.read(path.join(HECTAR_DIR, hFile(skill, level, label).file));
/** 이펙트: 칸 배치를 그대로 두고 줄인다(프레임이 흔들리지 않게). 빛 번짐은 반투명으로 남긴다 */
function fxArt(key, frames, fit, anim) {
  const fw = frames[0].w, fh = frames[0].h;
  const s = (fit * ART_DENSITY) / Math.max(fw, fh);
  const w = even(fw * s), h = even(fh * s);
  const out = k.blank(w * frames.length, h);
  frames.forEach((f, i) => k.paste(out, k.resize(f, w, h, null), i * w, 0));
  const file = `${OUT_DIR}/${key}.png`;
  k.write(path.join(REPO, 'public/assets', file), out);
  sprites[key] = { file, frameWidth: w, frameHeight: h, frames: frames.length, density: ART_DENSITY };
  if (frames.length > 1 && anim) sprites[key].anims = { play: { from: 0, to: frames.length - 1, fps: anim.fps, loop: anim.loop } };
}
function hFx(key, skill, level, label, fit) {
  const f = hFile(skill, level, label);
  const im = k.read(path.join(HECTAR_DIR, f.file));
  const a = f.animation;
  if (!a) return fxArt(key, [im], fit);
  const frames = Array.from({ length: a.frames }, (_, i) => k.crop(im, i * a.frameWidth, 0, a.frameWidth, a.frameHeight));
  fxArt(key, frames, fit, a);
}
const AW = '각성';
// 포탑
turret('skill_turret1', hImg('01', 'Lv1', '본체'), 22, 105, 100, 205, 75, 40, 48);
turret('skill_turret2', hImg('01', 'Lv3', '본체'), 26, 222, 205, 325, 165, 45, 85);
turret('skill_turret3', hImg('01', 'Lv5', '본체'), 30, 325, 300, 375, 245, 80, 170);
const TK = 42 / 262; // 각성 포탑 시트는 같은 배율로 줄인다
for (const [key, label, w] of [['idle', '대기', 253], ['rapid', '연사', 260], ['laser', '레이저발사', 253], ['shell', '포격', 262]]) hFx(`skill_bigturret_${key}`, '01', AW, label, w * TK);
hFx('skill_bigturret_bullet', '01', AW, '탄환', 9);
hFx('skill_bigturret_beam', '01', AW, '광선', 30);
hFx('skill_bigturret_shot', '01', AW, '탄체', 16);
hFx('skill_bigturret_blast', '01', AW, '폭발', 30);
hFx('skill_bigturret_hit', '01', AW, '명중', 16);
// 지뢰
[['1', 'Lv1', 9], ['2', 'Lv3', 11], ['3', 'Lv5', 13]].forEach(([n, lv, fit]) => {
  sprites[`skill_mine${n}`] = sheet(`skill_mine${n}`, [hImg('02', lv, '본체')], fit);
  const frames = [1, 2, 3, 4, 5, 6].map((i) => hImg('02', lv, `폭발_코드렌더_프레임0${i}`));
  fxArt(`skill_mine_blast${n}`, frames, 36, { fps: 20, loop: false });
});
hFx('skill_chainmine_idle', '02', AW, '대기', 16);
hFx('skill_chainmine_trigger', '02', AW, '기폭준비', 20);
hFx('skill_chainmine_blast', '02', AW, '폭발', 40);
hFx('skill_chainmine_link', '02', AW, '연쇄연결', 30);
hFx('skill_chainmine_mini', '02', AW, '소형기뢰', 11);
hFx('skill_chainmine_ring', '02', AW, '보조고리', 28);
// 드론
[['1', 'Lv1', 11], ['2', 'Lv3', 14], ['3', 'Lv5', 17]].forEach(([n, lv, fit]) => {
  sprites[`skill_drone${n}`] = sheet(`skill_drone${n}`, [hImg('03', lv, '본체')], fit);
});
const DK = 20 / 200;
for (const [key, label, w] of [['idle', '대기', 200], ['move', '이동', 198], ['charge', '충전', 197], ['laser', '레이저발사', 197]]) hFx(`skill_swarm_${key}`, '03', AW, label, w * DK);
hFx('skill_swarm_shot', '03', AW, '탄체', 8);
// 반물질포
[['1', 'Lv1', 7, 12, 30], ['2', 'Lv3', 9, 16, 40], ['3', 'Lv5', 12, 20, 50]].forEach(([n, lv, charge, shell, blast]) => {
  hFx(`skill_antimatter_charge${n}`, '05', lv, '충전', charge);
  hFx(`skill_antimatter_shell${n}`, '05', lv, '비행탄체', shell);
  hFx(`skill_antimatter_blast${n}`, '05', lv, '폭발', blast);
});
{
  const parts = [1, 2, 3, 4].map((i) => hImg('05', 'Lv1', `붕괴_공용애니프레임${i}`));
  const size = Math.max(...parts.map((p) => Math.max(p.w, p.h)));
  const cells2 = parts.map((p) => { const c = k.blank(size, size); k.paste(c, p, Math.round((size - p.w) / 2), Math.round((size - p.h) / 2)); return c; });
  fxArt('skill_antimatter_collapse', cells2, 40, { fps: 12, loop: false });
}
hFx('skill_antimatter_chargeA', '05', AW, '충전', 26);
hFx('skill_antimatter_shellA', '05', AW, '비행', 22);
hFx('skill_antimatter_trailA', '05', AW, '궤적', 24);
hFx('skill_antimatter_impactA', '05', AW, '충격', 40);
hFx('skill_antimatter_blastA', '05', AW, '폭발', 60);
// 근접 이펙트: 흑백으로 바꿔 게임에서 무기 색을 입힌다
{
  const fw = (f, cw, ids) => { const im = load(f); return ids.map((i) => k.crop(im, i * cw, 0, cw, im.h)); };
  const gray = (frames) => {
    // 크기를 맞추고(아래 가운데) 여백을 함께 잘라 프레임이 흔들리지 않게
    const W_ = Math.max(...frames.map((f) => f.w)), H_ = Math.max(...frames.map((f) => f.h));
    const cells_ = frames.map((f) => { const c = k.blank(W_, H_); k.paste(c, f, Math.round((W_ - f.w) / 2), H_ - f.h); return c; });
    const bs = cells_.map((c) => k.bbox(c, 24)).filter(Boolean);
    const x0 = Math.min(...bs.map((b) => b.x)), y0 = Math.min(...bs.map((b) => b.y));
    const x1 = Math.max(...bs.map((b) => b.x + b.w)), y1 = Math.max(...bs.map((b) => b.y + b.h));
    return cells_.map((c) => {
      const o = k.crop(c, x0, y0, x1 - x0, y1 - y0);
      for (let i = 0; i < o.w * o.h; i++) {
        const v = Math.max(o.px[i * 4], o.px[i * 4 + 1], o.px[i * 4 + 2]);
        o.px[i * 4] = v; o.px[i * 4 + 1] = v; o.px[i * 4 + 2] = v;
      }
      return o;
    });
  };
  fxArt('fx_melee_slash', gray(fw('warrior/b-slash.png', 370, [0, 1, 2, 3, 4, 5])), 44, { fps: 24, loop: false });
  fxArt('fx_melee_slam', gray(fw('warrior/b-slam.png', 370, [0, 1, 2, 3, 4, 5, 6, 7])), 48, { fps: 26, loop: false });
  fxArt('fx_melee_slash_big', gray(fw('barbarian-awakening-v120/ba-slash.png', 256, [8, 10, 12, 14, 15, 16, 18, 20, 22, 24])), 60, { fps: 26, loop: false });
  fxArt('fx_melee_slam_big', gray([1, 2, 3, 4, 5].map((n) => load(`new-skills/mk-shockwave-${n}.png`))), 64, { fps: 18, loop: false });
  fxArt('fx_buff_aura', gray(fw('warrior/p-aura.png', 370, [0, 1, 2, 3, 4, 5, 6, 7])), 44, { fps: 10, loop: true });
}
// 역장
[['1', 'Lv1'], ['2', 'Lv3'], ['3', 'Lv5']].forEach(([n, lv]) => hFx(`skill_field${n}`, '06', lv, '보호막', 48));
hFx('skill_fieldA_spawn', '06', AW, '생성', 56);
hFx('skill_fieldA_loop', '06', AW, '유지', 48);
hFx('skill_fieldA_end', '06', AW, '종료', 38);
hFx('skill_fieldA_contact', '06', AW, '탄막접촉', 26);
hFx('skill_fieldA_hex', '06', AW, '육각방어', 18);
hFx('skill_fieldA_deflect', '06', AW, '굴절', 20);
// 레일건
[['1', 'Lv1'], ['2', 'Lv3'], ['3', 'Lv5']].forEach(([n, lv]) => hFx(`skill_rail_beam${n}`, '07', lv, '관통광선', 120));
hFx('skill_rail_hit', '07', 'Lv1', '명중', 20);
hFx('skill_rail_charge', '07', 'Lv3', '충전', 14);
hFx('skill_rail_end', '07', 'Lv3', '종점폭발', 22);
hFx('skill_rail_wave', '07', 'Lv3', '종점파동', 34);
hFx('skill_rail_mark', '07', 'Lv5', '분석표식', 14);
hFx('skill_railA_charge', '07', AW, '충전', 24);
hFx('skill_railA_muzzle', '07', AW, '총구', 70);
hFx('skill_railA_hit', '07', AW, '명중', 20);
hFx('skill_railA_burst', '07', AW, '전자기파동', 30);
hFx('skill_railA_chain', '07', AW, '연쇄전격', 34);
// 벼락
[1, 2, 3, 4].forEach((i) => hFx(`ult_cut${i}`, '08', '기본', `공간절단_단계${i}`, i === 1 ? 60 : 260));
hFx('ult_kera_slash', '08', AW, '참격', 40);

// ---------- 아크로 스킬 팩 (Lv1·3·5 = 게임 Lv1·2·3) ----------
const ACRO_DIR = process.argv[4] ?? path.join(REPO, 'MKU-Acro-Skills-Lv1-3-5-Awakened');
const ACRO = JSON.parse(fs.readFileSync(path.join(ACRO_DIR, '파일목록.json'), 'utf8')).files;
const aList = (skill, level, label) => {
  const l = ACRO.filter((x) => x.skill.startsWith(skill) && x.level.startsWith(level) && x.label.startsWith(label));
  if (l.length === 0) throw new Error(`아크로 그림 없음 ${skill} ${level} ${label}`);
  return l;
};
/** 한 장·원본 시트 (시트 칸·fps는 파일목록 그대로). loop를 주면 원본 설정을 덮는다 */
function aFx(key, skill, level, label, fit, loop) {
  const f = aList(skill, level, label)[0];
  const im = k.read(path.join(ACRO_DIR, f.file));
  const a = f.animation;
  if (!a) return fxArt(key, [im], fit);
  const frames = Array.from({ length: a.frames }, (_, i) => k.crop(im, i * a.frameWidth, 0, a.frameWidth, a.frameHeight));
  fxArt(key, frames, fit, { fps: a.fps, loop: loop ?? a.loop });
}
/** 낱장 프레임 묶음: 크기가 달라 가장 큰 칸 가운데에 맞춰 놓는다 */
function aFrames(key, skill, level, label, fit, fps, loop = false) {
  const ims = aList(skill, level, label).map((f) => k.read(path.join(ACRO_DIR, f.file)));
  const w = Math.max(...ims.map((m) => m.w)), h = Math.max(...ims.map((m) => m.h));
  const frames = ims.map((m) => {
    const c = k.blank(w, h);
    k.paste(c, m, Math.floor((w - m.w) / 2), Math.floor((h - m.h) / 2));
    return c;
  });
  fxArt(key, frames, fit, { fps, loop });
}
// 공용 효과
aFrames('skill_acro_blast', '01', 'Lv1', '폭발_명중', 40, 20);
aFrames('skill_acro_flash', '04', 'Lv1', '명중섬광', 16, 20);
aFrames('skill_acro_spawn', '01', 'Lv1', '생성', 26, 12);
aFrames('skill_acro_shard', '01', 'Lv1', '근접공격_탄환', 30, 16);
aFrames('skill_acro_bullet', '01', 'Lv1', '보조사격', 14, 12, true);
aFrames('skill_acro_pull', '02', 'Lv1', '특이점', 36, 14);
aFrames('skill_acro_dispel', '02', 'Lv1', '강화해제', 34, 12);
aFrames('skill_acro_slice', '03', 'Lv1', '공간격', 36, 16);
// 불안정 실험체
[['1', 'Lv1', 16], ['2', 'Lv3', 18], ['3', 'Lv5', 20]].forEach(([n, lv, fit]) => aFx(`skill_subject${n}`, '01', lv, '본체', fit));
aFx('skill_specimen_spawn', '01', AW, '생성', 28);
aFx('skill_specimen_idle', '01', AW, '대기', 20);
aFx('skill_specimen_move', '01', AW, '이동', 20);
aFx('skill_specimen_attack', '01', AW, '공격', 24);
aFx('skill_specimen_power', '01', AW, '강화', 22);
aFx('skill_specimen_variant', '01', AW, '변칙강화', 28);
aFx('skill_specimen_death', '01', AW, '소멸', 28);
// 마기 변질
[['1', 'Lv1'], ['2', 'Lv3'], ['3', 'Lv5']].forEach(([n, lv]) => aFx(`skill_corrupt_mark${n}`, '02', lv, '변질표식', 24));
aFrames('skill_corrupt_smoke', '02', 'Lv1', '전염연기', 40, 14);
aFx('skill_corruptA_shot', '02', AW, '탄체', 40);
aFx('skill_corruptA_mark', '02', AW, '표식', 24);
aFx('skill_corruptA_aura', '02', AW, '오라', 28);
aFx('skill_corruptA_attack', '02', AW, '공격', 28);
aFx('skill_corruptA_end', '02', AW, '종료', 28);
// 실험 병기
aFx('skill_experiment_laser', '03', 'Lv1', '레이저', 120);
aFx('skill_pandora_laser', '03', AW, '레이저', 60);
aFx('skill_pandora_blast', '03', AW, '폭발', 44);
aFx('skill_pandora_burst', '03', AW, '탄막', 40);
aFx('skill_pandora_shell', '03', AW, '관통탄', 18, true);
aFx('skill_pandora_slice', '03', AW, '공간격', 40);
aFx('skill_pandora_pull', '03', AW, '흡인', 44);
aFx('skill_pandora_shock', '03', AW, '충격파', 40);
// 정화의 날개
[['1', 'Lv1'], ['2', 'Lv3'], ['3', 'Lv5']].forEach(([n, lv]) => aFrames(`skill_wings_slash${n}`, '04', lv, '참격', 60, 40));
aFx('skill_wingsA_hit1', '04', AW, '1타', 60);
aFx('skill_wingsA_hit2', '04', AW, '2타', 60);
aFx('skill_wingsA_hit3', '04', AW, '3타', 70);
aFx('skill_wingsA_bleed', '04', AW, '출혈_', 20);
aFx('skill_wingsA_mark', '04', AW, '출혈표식', 16);
// MK : 프로토타입
[['1', 'Lv1'], ['2', 'Lv3'], ['3', 'Lv5']].forEach(([n, lv]) => {
  aFrames(`skill_mk_morph${n}`, '05', lv, '변신', 38, 8);
  aFx(`skill_mk_idle${n}`, '05', lv, '대기', 38);
  aFx(`skill_mk_move${n}`, '05', lv, '이동', 38);
  aFx(`skill_mk_punch${n}`, '05', lv, '펀치', 38);
  aFx(`skill_mk_fist${n}`, '05', lv, '자동펀치', 14);
});
aFx('skill_mkA_morph', '05', AW, '조립변신', 40);
aFx('skill_mkA_idle', '05', AW, '대기', 40);
aFx('skill_mkA_move', '05', AW, '이동', 40);
aFx('skill_mkA_punch', '05', AW, '펀치', 40);
aFx('skill_mkA_blast', '05', AW, '폭발펀치', 40);
aFx('skill_mkA_drain', '05', AW, '마기소모', 40, false);
aFx('skill_mkA_release', '05', AW, '변신해제', 40);
// 환원주의자
aFx('skill_reduction_smoke', '06', 'Lv1', '흡수연기', 24);
aFx('skill_reduction_unit', '06', AW, '기초단위', 28);
// 특이점 실험
aFrames('ult_singularity', '08', '기본', '특이점핵', 40, 4);
aFx('ult_sing_collapse', '08', '기본', '결과_collapse', 100);
aFx('ult_sing_flash', '08', '기본', '결과_collapse-flash', 40);
aFx('ult_sing_rift', '08', '기본', '결과_collapse-rift', 40);
aFx('ult_sing_warning', '08', '기본', '결과_warning', 24);
aFrames('ult_sing_convert', '08', '기본', '결과_convert', 90, 12);
aFrames('ult_sing_overload', '08', '기본', '결과_overload', 100, 12);
aFrames('ult_sing_failure', '08', '기본', '결과_failure', 90, 12);
aFx('ult_paradox_start', '08', AW, '관측시작', 100);
aFx('ult_paradox_record', '08', AW, '기록_', 40);
aFx('ult_paradox_mark', '08', AW, '표식', 24);
aFx('ult_paradox_pull', '08', AW, '흡인', 100);
aFx('ult_paradox_replay1', '08', AW, '기록재현25', 30);
aFx('ult_paradox_replay2', '08', AW, '기록재현60', 34);
aFx('ult_paradox_replay3', '08', AW, '기록재현100', 38);
aFx('ult_paradox_crumble', '08', AW, '공간붕괴', 44);
aFx('ult_paradox_send', '08', AW, '기록전송', 34);
aFx('ult_paradox_end', '08', AW, '관측종료', 60);

// ---------- 보스 스프라이트 팩 ----------
const BOSS_DIR = process.argv[5] ?? path.join(REPO, 'MKU-Boss-Sprites-v174');
const BOSS = JSON.parse(fs.readFileSync(path.join(BOSS_DIR, '목록.json'), 'utf8')).animations;
const bAnim = (boss, id) => {
  const a = BOSS.find((x) => x.boss.startsWith(boss) && x.key === id);
  if (!a) throw new Error(`보스 그림 없음 ${boss} ${id}`);
  return a;
};
/** 프레임 이미지들. 게임표시용 보정본이 있으면 그것 (시트는 등록된 개별 프레임을 쓴다, 등분 금지) */
const bFrames = (boss, id) => {
  const a = bAnim(boss, id);
  const list = a.runtimeImage && a.individualFrames.length === 1 ? [a.runtimeImage] : a.individualFrames;
  return list.map((f) => k.read(path.join(BOSS_DIR, f)));
};
function bFx(boss, id, key, fit, rotate) {
  const a = bAnim(boss, id);
  // 큰 반경으로 늘여 그리므로 축소 보정본 대신 원본에서 줄인다
  let fr = a.individualFrames.map((f) => k.read(path.join(BOSS_DIR, f)));
  if (rotate) fr = fr.map((f) => k.rotate(f, rotate));
  fxArt(key, fr, fit, { fps: a.fps > 0 ? a.fps : 10, loop: a.loop });
}
const BOSS_SHEET_W = 3600;
/**
 * 보스 본체: idle·move·자세를 한 시트에 격자로 놓는다 (프레임이 많아 한 줄이면 텍스처 한계를 넘는다).
 * height: 자세마다 높이를 맞춘다(단일 포즈 보스). 없으면 시트 칸 그대로 같은 배율로 줄인다(프레임 시트 보스).
 * poses: { 이름: { frames, fps, loop } }
 */
function bossActor(key, states, fit, height) {
  const all = Object.values(states).flatMap((s) => s.frames);
  const boxes = all.map((f) => k.bbox(f, 40) ?? { x: 0, y: 0, w: f.w, h: f.h });
  const scale = (i) => (fit * ART_DENSITY) / (height ? boxes[i].h : Math.max(boxes[0].w, boxes[0].h));
  let fw, fh, cells;
  if (height) {
    fw = even(Math.max(...boxes.map((b, i) => b.w * scale(i))));
    fh = even(fit * ART_DENSITY);
    cells = all.map((f, i) => {
      const b = boxes[i];
      const s = scale(i);
      const c = k.blank(fw, fh);
      const iw = Math.max(1, Math.round(b.w * s));
      k.paste(c, k.resize(k.crop(f, b.x, b.y, b.w, b.h), iw, fh, 0.5), Math.round((fw - iw) / 2), 0);
      return c;
    });
  } else {
    // 같은 칸의 시트: 모든 프레임이 칸 안에서 정렬돼 있으므로 합친 영역으로 자른다
    const x0 = Math.min(...boxes.map((b) => b.x)), y0 = Math.min(...boxes.map((b) => b.y));
    const x1 = Math.max(...boxes.map((b) => b.x + b.w)), y1 = Math.max(...boxes.map((b) => b.y + b.h));
    const cx = all[0].w / 2;
    const half = Math.max(cx - x0, x1 - cx);
    const s = scale(0);
    fw = even(half * 2 * s);
    fh = even((y1 - y0) * s);
    cells = all.map((f) => k.resize(k.crop(f, Math.max(0, Math.floor(cx - half)), y0, Math.min(f.w, Math.ceil(half * 2)), y1 - y0), fw, fh, 0.5));
  }
  const framed = cells.map((c) => outlined(c, fw, fh, 1, ENEMY_OUTLINE));
  const cw = fw + 2, ch = fh + 2;
  const cols = Math.max(1, Math.min(framed.length, Math.floor(BOSS_SHEET_W / cw)));
  const rows = Math.ceil(framed.length / cols);
  const out = k.blank(cols * cw, rows * ch);
  framed.forEach((c, i) => k.paste(out, c, (i % cols) * cw, Math.floor(i / cols) * ch));
  const file = `${OUT_DIR}/${key}.png`;
  k.write(path.join(REPO, 'public/assets', file), out);
  const anims = {};
  let at = 0;
  for (const [name, st] of Object.entries(states)) {
    anims[name] = { from: at, to: at + st.frames.length - 1, fps: st.fps ?? 4, ...(st.loop === false ? { loop: false } : {}) };
    at += st.frames.length;
  }
  sprites[key] = { file, frameWidth: cw, frameHeight: ch, frames: framed.length, density: ART_DENSITY, anims };
}
const one = (boss, id) => bFrames(boss, id);
const st = (boss, id, fps, loop) => ({ frames: bFrames(boss, id), fps: fps ?? (bAnim(boss, id).fps || 4), loop: loop ?? bAnim(boss, id).loop });
// 융합악귀: 단일 포즈, 상태로 고른다
{
  const F = '01';
  const poses = { slash: { frames: one(F, 'body-slash'), loop: false }, dash: { frames: one(F, 'body-dash'), loop: false } };
  bossActor('enemy_fusion_akgwi', { idle: { frames: one(F, 'body-idle') }, move: { frames: one(F, 'body-move') }, ...poses }, 70, true);
  bossActor('enemy_fusion_akgwi_phase2', { idle: { frames: one(F, 'body-rage') }, move: { frames: one(F, 'body-move') }, ...poses }, 70, true);
}
// 전기환띠: 평상시 idle·walk 교대 (초당 5번)
{
  const E = '02';
  const walk = [...one(E, 'body-idle'), ...one(E, 'body-walk')];
  bossActor('enemy_electric_ring', { idle: { frames: walk, fps: 5 }, move: { frames: walk, fps: 5 }, cast: { frames: one(E, 'body-cast'), loop: false }, dash: { frames: one(E, 'body-dash'), loop: false } }, 75, true);
}
// 마기골렘: idle·walk 교대 (초당 3번), 패턴별 포즈
{
  const G = '04';
  const walk = [...one(G, 'body-idle'), ...one(G, 'body-walk')];
  const poses = Object.fromEntries(['ready', 'punch', 'slam', 'sweep', 'cast', 'overload'].map((p) => [p, { frames: one(G, `body-${p}`), loop: false }]));
  bossActor('enemy_magi_golem', { idle: { frames: walk, fps: 3 }, move: { frames: walk, fps: 3 }, ...poses }, 84, true);
  bossActor('enemy_magi_golem_phase2', { idle: { frames: one(G, 'body-rage') }, move: { frames: walk, fps: 3 }, ...poses }, 84, true);
}
/**
 * 식광 원본 프레임의 찌꺼기 지우기 (본체 둘레의 일부러 그린 파편은 둔다):
 * 1) 1~2px 굵기로 길게 뻗은 세로·가로 직선 (몸 옆에 붙은 선 포함)
 * 2) 본체가 아닌 가늘고 긴 조각 (가로세로비 8 이상, 굵기 2px 이하)
 * 3) 같은 줄(y)에 늘어선 작은 점 무리 (글자 찌꺼기)
 */
function cleanBossFrame(img, cut = 40) {
  const { w, h, px } = img;
  const a = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : px[(y * w + x) * 4 + 3]);
  let n = 0;
  const erase = (x, y) => {
    if (px[(y * w + x) * 4 + 3] > 0) n++;
    px[(y * w + x) * 4 + 3] = 0;
  };
  // 1) 세로선: 한 열에 긴 불투명 줄, 양옆 2px 바깥 열은 거의 비어 있음
  for (let x = 0; x < w; x++) {
    let run = 0, best = 0, end = 0;
    for (let y = 0; y < h; y++) {
      run = a(x, y) > cut ? run + 1 : 0;
      if (run > best) { best = run; end = y; }
    }
    if (best < h * 0.3) continue;
    let side = 0;
    for (let y = end - best + 1; y <= end; y++) side += (a(x - 3, y) > cut ? 1 : 0) + (a(x + 3, y) > cut ? 1 : 0);
    if (side > best * 0.3) continue;
    for (let y = end - best + 1; y <= end; y++) for (let dx = -1; dx <= 1; dx++) if (x + dx >= 0 && x + dx < w) erase(x + dx, y);
  }
  // 가로선
  for (let y = 0; y < h; y++) {
    let run = 0, best = 0, end = 0;
    for (let x = 0; x < w; x++) {
      run = a(x, y) > cut ? run + 1 : 0;
      if (run > best) { best = run; end = x; }
    }
    if (best < w * 0.3) continue;
    let side = 0;
    for (let x = end - best + 1; x <= end; x++) side += (a(x, y - 3) > cut ? 1 : 0) + (a(x, y + 3) > cut ? 1 : 0);
    if (side > best * 0.3) continue;
    for (let x = end - best + 1; x <= end; x++) for (let dy = -1; dy <= 1; dy++) if (y + dy >= 0 && y + dy < h) erase(x, y + dy);
  }
  const comps = k.components(img, cut);
  if (comps.length > 1) {
    const main = comps.reduce((p, c) => (c.area > p.area ? c : p));
    // 2) 가늘고 긴 조각
    for (const c of comps) {
      if (c === main) continue;
      const cw = c.x1 - c.x0 + 1, ch = c.y1 - c.y0 + 1;
      if (Math.min(cw, ch) <= 2 && Math.max(cw, ch) / Math.min(cw, ch) >= 8) for (const q of c.pts) erase(q % w, (q - (q % w)) / w);
    }
    // 3) 같은 y에서 시작하는 작은 점 5개 이상
    const rows = new Map();
    for (const c of comps) if (c !== main && c.area < 40 && c.y1 - c.y0 <= 5) rows.set(c.y0, [...(rows.get(c.y0) ?? []), c]);
    for (const list of rows.values()) if (list.length >= 5) for (const c of list) for (const q of c.pts) erase(q % w, (q - (q % w)) / w);
  }
  edgeDropped += n;
  return img;
}
let edgeDropped = 0;
const cleanSt = (s) => ({ ...s, frames: s.frames.map((f) => cleanBossFrame(f)) });
// 식광: 페이즈별 시트 (찌꺼기를 지운 뒤)
{
  const C = '03';
  const p = 'boss.eclipse.';
  const e = (id) => cleanSt(st(C, p + id));
  bossActor('enemy_eclipse', { idle: e('p1_idle'), move: e('p1_move'), charge: e('p1_charge'), hurt: e('p1_hurt') }, 75);
  bossActor('enemy_eclipse_phase2', { idle: e('p2_idle'), move: e('p2_move'), charge: e('p2_charge'), hurt: e('p2_hurt'), transition: e('transition') }, 84);
  console.log(`식광 찌꺼기 ${edgeDropped}px 지움`);
}
// 마기카이저: 구속 → 2 → 3단계
{
  const K = '05';
  const p = 'boss.magi_kaiser.';
  const moves = (id) => st(K, p + id);
  const arms = { punchWindup: moves('punch_windup'), punchStrike: moves('punch_strike'), laser: moves('laser'), dashStart: moves('dash_start'), dash: moves('dash'), dashEnd: moves('dash_end'), missile: moves('missile_launch'), cross: moves('cross') };
  bossActor('enemy_magi_kaiser_phase1', { idle: moves('p1_idle') }, 99);
  bossActor('enemy_magi_kaiser_phase2', { idle: moves('p2_idle'), move: moves('move'), transition: moves('p1_p2'), ...arms }, 99);
  bossActor('enemy_magi_kaiser_phase3', { idle: moves('p3_idle'), move: moves('move'), transition: moves('p2_p3'), command: moves('command'), ...arms }, 105);
}
// 헥타르 수석 연구원: 2페이즈 이동·대기는 첫 칸 고정
{
  const R = '06';
  const cast = st(R, 'cast');
  bossActor('enemy_hectar_chief', { idle: st(R, 'p1_idle'), move: st(R, 'p1_move'), cast }, 54);
  bossActor('enemy_hectar_chief_phase2', { idle: st(R, 'p2_idle'), move: st(R, 'p2_move'), cast }, 54);
}
bFx('01', 'vfx-slash', 'fx_fusion_slash', 110);
bFx('01', 'vfx-charge', 'fx_fusion_charge', 60);
bFx('01', 'vfx-dash', 'fx_fusion_dash', 60);
bFx('01', 'vfx-summon', 'fx_fusion_summon', 40);
bFx('01', 'vfx-bolt', 'fx_fusion_bolt', 16);
bFx('01', 'vfx-burst', 'fx_fusion_burst', 100);
bFx('01', 'vfx-smoke', 'fx_fusion_smoke', 40);
bFx('01', 'vfx-eruption', 'fx_fusion_eruption', 120);
bFx('01', 'vfx-vortex', 'fx_fusion_vortex', 90);
bFx('01', 'vfx-explode', 'fx_fusion_explode', 90);
bFx('01', 'vfx-orb', 'fx_fusion_orb', 40);
bFx('02', 'vfx-warning', 'fx_electric_warning', 30);
bFx('02', 'vfx-strike', 'fx_electric_strike', 50);
bFx('02', 'vfx-strike-heavy', 'fx_electric_strike2', 50);
bFx('02', 'vfx-radial', 'fx_electric_radial', 70);
bFx('02', 'vfx-orb', 'fx_electric_orb', 12);
bFx('02', 'vfx-laser', 'fx_electric_laser', 120);
bFx('02', 'vfx-line', 'fx_electric_line', 120);
bFx('02', 'vfx-cage', 'fx_electric_cage', 100);
bFx('02', 'vfx-ring', 'fx_electric_ring', 90);
bFx('02', 'vfx-cross', 'fx_electric_cross', 90);
bFx('02', 'vfx-aura', 'fx_electric_aura', 90);
bFx('02', 'vfx-dash', 'fx_electric_dash', 60);
bFx('02', 'vfx-impact', 'fx_electric_impact', 110);
// 2026-11-04 추가 이펙트 팩: 폴더 안 '…프레임01~04.png'를 한 줄 시트로
const PACK_DIR = path.join(REPO, 'MGTRPG-All-Created-Sprites-2026-11-04');
function packFx(key, dir, fit, fps, loop = false) {
  const d = path.join(PACK_DIR, dir);
  const fr = fs.readdirSync(d).filter((f) => /프레임0\d\.png$/.test(f)).sort().map((f) => k.read(path.join(d, f)));
  fxArt(key, fr, fit, { fps, loop });
}
packFx('fx_fusion_triple_claw', '01_융합악귀/01_추가공격_이펙트/01_원혼 삼중 할퀴기', 110, 16);
packFx('fx_fusion_core_burst', '01_융합악귀/01_추가공격_이펙트/02_원혼핵 파열', 90, 12);
packFx('fx_fusion_spirit_bolt', '90_공용_소형스프라이트/03_소형_탄체/04_원혼 유도편', 16, 10, true);
packFx('fx_electric_branch_bolt', '02_전기환띠/01_추가공격_이펙트/01_분기 낙뢰 타격', 60, 18);
packFx('fx_electric_ring_collapse', '02_전기환띠/01_추가공격_이펙트/02_붕괴하는 전격 고리', 90, 14);
packFx('fx_electric_grid', '02_전기환띠/02_광역공격_이펙트/01_기숲 뇌전 격자', 140, 12);
packFx('fx_electric_wave', '02_전기환띠/02_광역공격_이펙트/02_절규의 전격 해일', 110, 12);
packFx('fx_golem_crystal_crack', '04_마기골렘/01_추가공격_이펙트/01_지반 결정 균열', 60, 12);
packFx('fx_golem_core_shock', '04_마기골렘/01_추가공격_이펙트/02_노출 코어 충격파', 100, 14);
packFx('fx_golem_strata', '04_마기골렘/02_광역공격_이펙트/01_과기전쟁 지층 파쇄', 120, 10);
packFx('fx_golem_eight_lock', '04_마기골렘/02_광역공격_이펙트/02_고대 병기 팔방 봉쇄', 140, 10);
packFx('fx_bit_gear', '90_공용_소형스프라이트/04_잔재_보조비트/01_고대병기 톱니편', 12, 6, true);
packFx('fx_bit_crystal', '90_공용_소형스프라이트/04_잔재_보조비트/03_마기 결정 잔편', 12, 7, true);
packFx('fx_kaiser_cluster', '05_마기카이저/01_추가공격_이펙트/01_어깨 미사일 집속 폭발', 70, 18);
packFx('fx_kaiser_cross_burst', '05_마기카이저/01_추가공격_이펙트/02_종말 명령 교차 방출', 90, 14);
packFx('fx_kaiser_barrage_net', '05_마기카이저/02_광역공격_이펙트/01_종말 명령 포격망', 140, 14);
packFx('fx_kaiser_unbound', '05_마기카이저/02_광역공격_이펙트/02_구속해제 황제 전선', 140, 12);
packFx('fx_bit_rail_slug', '90_공용_소형스프라이트/03_소형_탄체/01_레일건 분리 탄자', 12, 12, true);
packFx('fx_bit_casing', '90_공용_소형스프라이트/04_잔재_보조비트/02_헥타르 방출 탄피', 10, 10, true);
packFx('fx_eclipse_blade_bloom', '03_식광/01_추가공격_이펙트/01_식광 칼날 개화', 80, 14);
packFx('fx_eclipse_core_collapse', '03_식광/01_추가공격_이펙트/02_흑일 핵 붕괴', 90, 12);
packFx('fx_eclipse_light_rain', '03_식광/02_광역공격_이펙트/01_흑일의 낙광우', 90, 10);
packFx('fx_eclipse_erosion_ring', '03_식광/02_광역공격_이펙트/02_개기식 침식권', 160, 10);
bFx('06', 'hectar-ring', 'fx_chief_ring', 70);
bFx('06', 'hectar-burst', 'fx_chief_burst', 60);
bFx('06', 'hectar-drone', 'fx_chief_drone', 14);
bFx('04', 'vfx-warning-circle', 'fx_golem_warn', 50);
bFx('04', 'vfx-artillery', 'fx_golem_artillery', 90);
bFx('04', 'vfx-shock-ring', 'fx_golem_shock', 90);
bFx('04', 'vfx-laser-center', 'fx_golem_ruin_beam', 120, 90);
bFx('04', 'vfx-laser-side', 'fx_golem_laser_side', 120);
bFx('04', 'vfx-summon', 'fx_golem_summon', 70);
bFx('04', 'vfx-minion', 'fx_golem_minion', 30);
bFx('04', 'vfx-dash-trail', 'fx_golem_trail', 50);
bFx('04', 'vfx-core', 'fx_golem_core', 36);
bFx('04', 'vfx-crack-hit', 'fx_golem_crack', 120, 90);
bFx('04', 'vfx-eight-warning', 'fx_golem_eight', 100);
bFx('04', 'vfx-eruption', 'fx_golem_eruption', 90);
bFx('04', 'vfx-fault-vertical', 'fx_golem_fault_v', 90);
bFx('04', 'vfx-fault-horizontal', 'fx_golem_fault_h', 90);
bFx('04', 'vfx-fault-hit', 'fx_golem_fault_hit', 50);
bFx('04', 'vfx-rage-aura', 'fx_golem_rage_aura', 90);
bFx('04', 'vfx-rage-core', 'fx_golem_rage_core', 40);
bFx('03', 'vfx.eclipse.warning', 'fx_eclipse_warning', 60);
bFx('03', 'vfx.eclipse.impact', 'fx_eclipse_impact', 100);
bFx('03', 'vfx.eclipse.blade', 'fx_eclipse_blade', 14);
bFx('03', 'vfx.eclipse.blade-charge', 'fx_eclipse_charge', 40);
bFx('03', 'vfx.eclipse.shadow-track', 'fx_eclipse_track', 60);
bFx('03', 'vfx.eclipse.shadow-lock', 'fx_eclipse_lock', 60);
bFx('03', 'vfx.eclipse.shadow', 'fx_eclipse_shadow', 70);
bFx('03', 'vfx.eclipse.field', 'fx_eclipse_field', 110);
bFx('03', 'vfx.eclipse.safe', 'fx_eclipse_safe', 80);
bFx('03', 'vfx.eclipse.gravity', 'fx_eclipse_gravity', 110);
bFx('03', 'vfx.eclipse.totality-warning', 'fx_eclipse_total_warn', 120);
bFx('03', 'vfx.eclipse.totality-hit', 'fx_eclipse_total_hit', 120);
bFx('03', 'vfx.boss.eclipse.death', 'fx_eclipse_death', 90);
bFx('03', 'boss.eclipse.p2_flare', 'fx_eclipse_flare', 110);
bFx('03', 'vfx.eclipse.residue', 'fx_eclipse_residue', 60);
bFx('05', 'vfx.kaiser.punch', 'fx_kaiser_punch', 100);
bFx('05', 'vfx.kaiser.shock', 'fx_kaiser_shock', 90);
bFx('05', 'vfx.kaiser.missile', 'fx_kaiser_missile', 16);
bFx('05', 'vfx.kaiser.sweep', 'fx_kaiser_sweep', 120);
bFx('05', 'vfx.kaiser.laser-warning', 'fx_kaiser_laser_warn', 120);
bFx('05', 'vfx.kaiser.laser-core', 'fx_kaiser_laser', 120);
bFx('05', 'vfx.kaiser.laser-muzzle', 'fx_kaiser_muzzle', 40);
bFx('05', 'vfx.kaiser.dash-impact', 'fx_kaiser_impact', 100);
bFx('05', 'vfx.kaiser.lock', 'fx_kaiser_lock', 40);
bFx('05', 'vfx.kaiser.sweep-warning', 'fx_kaiser_sweep_warn', 120);
bFx('05', 'vfx.kaiser.cross-vfx', 'fx_kaiser_cross', 120);
bFx('05', 'vfx.kaiser.command-shock', 'fx_kaiser_command', 120);
// vfx.kaiser.debris는 원본이 네모로 잘린 조각이라 쓰지 않는다 (지열 분출은 어깨 미사일 집속 폭발)
bFx('05', 'vfx.boss.magi_kaiser.death', 'fx_kaiser_death', 110);

const artPath = path.join(REPO, 'src/data/art.json');
const json = { basePath: 'assets/', sprites };
fs.writeFileSync(artPath, JSON.stringify(json, null, 2) + '\n');
let bytes = 0;
for (const f of fs.readdirSync(out)) bytes += fs.statSync(path.join(out, f)).size;
console.log(`${Object.keys(sprites).length}개, ${Math.round(bytes / 1024)}KB`);
