// 플레이어(마기학자·헥타르·아크로·전사·야만용사·성기사) 그림: scripts/art-src/players/*.png → public/assets/mku/player_*.png + art.json 항목
//
// 원본은 사용자가 준 5열×2줄 초록 배경 격자(2000×1116). 원본 프레임들은 늘 같은 발만 들려 있고 옆모습 다리는 거의 움직이지 않아
// 방향마다 기준 프레임 하나만 쓰고, 걷기는 게임 크기(키 52px 시트)에서 만든다.
//   정면·뒷모습: 다리 칸만 좌우로 뒤집어 반대 발을 들고, 디딘 발을 반대쪽에 복사해 두 발 다 디딘 자세를 만든다.
//   옆모습: 원본 해상도에서 앞다리·뒷다리를 잘라 엉덩이 둘레로 돌려 4자세(앞발 디딤 → 엇갈림 → 반대 발 디딤 → 엇갈림)를 만든다.
//   정면·뒷모습의 두 발 디딤 자세에서는 몸이 1px 올라가고, 옆모습은 다리를 세우면 저절로 올라간다.
// 프레임: 0 정면 서기 / 1~4 정면 걷기 / 5~8 뒷모습 걷기 / 9~12 옆 걷기 (오른쪽을 본다)
// build-art.cjs가 불러 쓰고, 혼자 실행하면(node scripts/build-players.cjs) art.json의 세 항목만 바꾼다.
const fs = require('fs');
const path = require('path');
const k = require('./pngkit.cjs');

const REPO = path.resolve(__dirname, '..');
const SRC = path.join(REPO, 'scripts/art-src/players');
const COLS = 5, ROWS = 2;
/** 게임 화면 키(px)와 그림 촘촘함 (기존 플레이어와 같다) → 시트 높이 52 */
const FIT = 26, DENSITY = 2;
const H = FIT * DENSITY;
/** 칸 테두리 격자선을 피해 안쪽만 쓴다 */
const INSET = 4;
/** 생성 도구 워터마크(✦)가 있는 오른쪽 아래 자리 (원본 2000×1116 기준) */
const MARK = { x: 1878, y: 990 };

/**
 * 방향별 프레임의 원본 칸 [파일, 줄, 칸]. 몸(코트·장신구)은 프레임마다 이 칸에서, 다리는 각 방향 첫 칸에서 만든다.
 * front: [서기, 걷기 4] / back: 걷기 4 / side: 걷기 4. 걷기 2·4번째는 같은 칸이라 몸이 앞뒤로 흔들리다 돌아온다.
 * 아크로 옆모습 3·4·5번 칸은 장치를 접고 있어 빼고, 추가 시트 칸을 쓴다.
 * plain: 장치가 없는 마기학자 (원본에 잘못 붙은 파란 구슬을 지운다). 칸의 넷째 값 'noHalo': 잘못 붙은 후광을 지운다, 'brownBoots': 은빛 정강이를 장화 색으로
 */
const row = (name, r, cols, fix) => cols.map((c) => (fix ? [name, r, c, fix] : [name, r, c]));
/** 'brownBoots': 칸 높이의 이 비율 아래를, 밝기 단계(합/60 × squeeze)별 장화 색으로 (장화 칸에서 뽑은 색) */
const BOOTS = { fromY: 0.84, squeeze: 0.55, ramp: [[20, 14, 12], [40, 30, 27], [61, 46, 38], [86, 66, 52], [107, 82, 61], [140, 103, 78]] };
const PLAYERS = {
  player_human: { plain: true, front: row('human', 0, [0, 1, 2, 3, 2]), back: row('extra-1', 0, [0, 1, 0, 1]), side: row('human', 1, [0, 1, 2, 1]) },
  player_hectar: { front: row('hectar', 0, [0, 1, 2, 3, 2]), back: row('extra-1', 0, [3, 4, 3, 4]), side: row('hectar', 1, [0, 1, 2, 1]) },
  player_acro: { front: row('acro', 0, [0, 1, 2, 3, 2]), back: [['extra-2', 0, 0], ['extra-2', 0, 1], ['extra-1', 0, 2], ['extra-2', 0, 1]], side: [['acro', 1, 0], ['acro', 1, 1], ['extra-1', 1, 2], ['acro', 1, 1]] },
  // 전사 계열(direct): 원본에 실제 걷기 자세가 있어 고른 칸을 그대로 쓴다. 디딤과 한 발 듦이 번갈아 오게 순서를 골랐다
  // (머리에 성기사 후광이 잘못 붙은 전사 칸은 쓰지 않는다). 성기사는 옆모습이 없어 3/4 정면 걷기를 move로 (위로는 뒷모습)
  player_warrior: {
    direct: true,
    idle: ['warrior-1', 1, 0, 'brownBoots'],
    front: [['warrior-1', 1, 1, 'brownBoots'], ...row('warrior-1', 1, [2, 3, 4])],
    back: [['warrior-8', 1, 1], ['warrior-8', 1, 2], ['warrior-8', 1, 3], ['warrior-8', 1, 2]],
    side: [['warrior-1', 0, 0, 'brownBoots'], ['warrior-1', 0, 2, 'brownBoots'], ['warrior-1', 0, 3, 'noHalo'], ['warrior-1', 0, 4, 'noHalo']],
  },
  player_barbarian: {
    direct: true,
    idle: ['warrior-7', 1, 1],
    front: row('warrior-7', 1, [0, 2, 3, 2]),
    back: [['warrior-6', 0, 1], ['warrior-6', 0, 3], ['warrior-6', 1, 1], ['warrior-6', 0, 3]],
    side: row('warrior-7', 0, [4, 1, 0, 3]),
  },
  player_paladin: {
    direct: true,
    idle: ['warrior-3', 0, 0],
    front: [['warrior-3', 0, 1], ['warrior-3', 0, 3], ['warrior-3', 1, 1], ['warrior-3', 0, 3]],
    back: [['warrior-9', 0, 1], ['warrior-9', 1, 0], ['warrior-9', 1, 2], ['warrior-9', 1, 0]],
  },
};

// ---------- 원본 칸 ----------

const sheets = new Map();
function sheet(name) {
  if (!sheets.has(name)) {
    const im = k.read(path.join(SRC, `${name}.png`));
    for (let i = 0; i < im.w * im.h; i++) {
      const o = i * 4;
      // 초록 배경·격자선: 초록이 빨강·파랑보다 뚜렷이 세다 (캐릭터에는 초록이 없다)
      if (im.px[o + 1] - Math.max(im.px[o], im.px[o + 2]) > 30) im.px[o + 3] = 0;
    }
    const mx = Math.round((MARK.x / 2000) * im.w), my = Math.round((MARK.y / 1116) * im.h);
    // 워터마크(옅은 초록빛 흰색)만 지운다: 오른쪽 아래 칸 캐릭터 발이 그 자리에 걸칠 수 있다
    for (let y = my; y < im.h; y++) for (let x = mx; x < im.w; x++) {
      const o = (y * im.w + x) * 4;
      if (im.px[o + 1] > im.px[o] + 8 && im.px[o + 1] > im.px[o + 2] + 8) im.px[o + 3] = 0;
    }
    sheets.set(name, im);
  }
  return sheets.get(name);
}

function cell([name, r, c, fix], plain) {
  const im = sheet(name);
  const cw = im.w / COLS, ch = im.h / ROWS;
  const f = k.crop(im, Math.round(c * cw) + INSET, Math.round(r * ch) + INSET, Math.round(cw) - INSET * 2, Math.round(ch) - INSET * 2);
  if (fix === 'brownBoots') {
    // 전사 원본은 정강이가 은빛 갑주인 칸과 갈색 장화인 칸이 섞여 있다(뒷모습은 모두 장화): 무릎 아래 은빛을 장화 색 단계로 바꾼다
    for (let y = Math.round(f.h * BOOTS.fromY); y < f.h; y++) for (let x = 0; x < f.w; x++) {
      const o = (y * f.w + x) * 4;
      const [r, g, b] = [f.px[o], f.px[o + 1], f.px[o + 2]];
      if (f.px[o + 3] <= 40 || b > r + 10) continue;
      const band = Math.min(BOOTS.ramp.length - 1, Math.round(((r + g + b) / 60) * BOOTS.squeeze));
      f.px.set(BOOTS.ramp[band], o);
    }
  }
  if (fix === 'noHalo') {
    // 성기사 후광이 잘못 붙은 칸: 후광은 황갈색, 투구는 은회색. 투구 꼭대기 둘레에서 은회색이 가까이(3px) 없는 따뜻한 색을 지우고,
    // 머리 위에 떠 남은 조각(칸 위쪽 30% 안에서 끝나는 작은 덩어리)도 지운다
    const px = f.px, idx = (x, y) => (y * f.w + x) * 4;
    const grey = (o) => px[o + 3] > 40 && px[o] > 60 && Math.abs(px[o] - px[o + 1]) < 25 && Math.abs(px[o + 1] - px[o + 2]) < 30;
    let top = f.h;
    for (let y = 0; y < f.h && top === f.h; y++) for (let x = 0; x < f.w; x++) if (grey(idx(x, y))) { top = y; break; }
    for (let y = 0; y < Math.min(f.h, top + 25); y++) for (let x = 0; x < f.w; x++) {
      const o = idx(x, y);
      if (px[o + 3] <= 40 || px[o] - px[o + 2] <= 40) continue;
      let near = false;
      for (let dy = -3; dy <= 3 && !near; dy++) for (let dx = -3; dx <= 3 && !near; dx++) {
        const a = x + dx, b = y + dy;
        if (a >= 0 && b >= 0 && a < f.w && b < f.h && grey(idx(a, b))) near = true;
      }
      if (!near) px[o + 3] = 0;
    }
    for (const comp of k.components(f, 40)) if (comp.area < 2000 && comp.y1 < f.h * 0.3) for (const p of comp.pts) px[p * 4 + 3] = 0;
  }
  if (plain) {
    // 잘못 붙은 파란 구슬: 파란 픽셀 둘레를 넉넉히 잡아 흰 코트가 아닌 픽셀(구슬 쇠붙이·빛)을 지운다 (후드에 붙어 있어 덩어리로는 못 가른다)
    let bx0 = f.w, by0 = f.h, bx1 = -1, by1 = -1;
    for (let y = 0; y < f.h; y++) for (let x = 0; x < f.w; x++) {
      const o = (y * f.w + x) * 4;
      if (f.px[o + 3] > 40 && f.px[o + 2] > f.px[o] + 40 && f.px[o + 2] > 120) { bx0 = Math.min(bx0, x); bx1 = Math.max(bx1, x); by0 = Math.min(by0, y); by1 = Math.max(by1, y); }
    }
    const m = Math.round(f.w * 0.05);
    for (let y = Math.max(0, by0 - m); y <= Math.min(f.h - 1, by1 + m); y++) for (let x = Math.max(0, bx0 - m); x <= Math.min(f.w - 1, bx1 + m); x++) {
      const o = (y * f.w + x) * 4;
      if (Math.min(f.px[o], f.px[o + 1], f.px[o + 2]) <= 165) f.px[o + 3] = 0;
    }
    // 구슬의 흰 반짝임처럼 남은 작은 조각
    for (const comp of k.components(f, 40)) if (comp.area < 400) for (const p of comp.pts) f.px[p * 4 + 3] = 0;
  }
  return f;
}

/** 발 가운데 x: 맨 아래 10% 줄의 불투명 픽셀 범위 가운데 */
function feetCenter(f, b) {
  let x0 = Infinity, x1 = -Infinity;
  for (let y = b.y + Math.round(b.h * 0.9); y < b.y + b.h; y++) for (let x = b.x; x < b.x + b.w; x++) if (f.px[(y * f.w + x) * 4 + 3] > 40) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); }
  return (x0 + x1) / 2;
}

// ---------- 게임 크기 프레임 다루기 ----------

const at = (im, x, y) => (y * im.w + x) * 4;
const opaque = (im, x, y) => x >= 0 && y >= 0 && x < im.w && y < im.h && im.px[at(im, x, y) + 3] > 0;
const isDark = (im, x, y) => opaque(im, x, y) && Math.max(im.px[at(im, x, y)], im.px[at(im, x, y) + 1], im.px[at(im, x, y) + 2]) < 80;
const isLight = (im, x, y) => opaque(im, x, y) && Math.max(im.px[at(im, x, y)], im.px[at(im, x, y) + 1], im.px[at(im, x, y) + 2]) > 150;
const copy = (im) => ({ w: im.w, h: im.h, px: Buffer.from(im.px) });
/** 코트 픽셀: 흰 천이거나 파랑·빨강으로 물든 색 (바지·장화의 어두운 갈색은 아니다) */
const isCoatPx = (im, x, y) => {
  if (!opaque(im, x, y)) return false;
  const o = at(im, x, y), r = im.px[o], g = im.px[o + 1], b = im.px[o + 2];
  return Math.min(r, g, b) > 120 || b > r + 30 || r > g + 60;
};

/** 코트 아래 줄에 남은 1px 가닥(양옆이 비어 있는 어두운 픽셀 — 다리는 3px 이상이라 다리가 아니다)과 작은 떨어진 조각을 지운다 */
function tidy(im) {
  for (let y = H - 14; y < H; y++) for (let x = 0; x < im.w; x++) {
    if (isDark(im, x, y) && !opaque(im, x - 1, y) && !opaque(im, x + 1, y)) im.px[at(im, x, y) + 3] = 0;
  }
  for (const c of k.components(im, 0)) if (c.area <= 3) for (const p of c.pts) im.px[p * 4 + 3] = 0;
  return im;
}

/** 몸 전체를 1px 올린다 (발은 다시 맞춘다) */
function lift(im, dy = 1) {
  const o = k.blank(im.w, im.h);
  k.paste(o, im, 0, -dy);
  return o;
}

/** 정면·뒷모습 다리 칸: 다리가 보이는 줄부터 바닥까지, 두 발의 좌우 끝 (거울 축 = 두 끝의 가운데) */
function legBox(im, cx) {
  let x0 = Infinity, x1 = -Infinity;
  // 좌우 끝은 코트 아래 발 쪽 줄에서만 잰다 (코트 윤곽의 어두운 픽셀이 섞이지 않게)
  for (let y = H - 8; y < H; y++) for (let x = Math.round(cx) - 8; x <= Math.round(cx) + 8; x++) if (isDark(im, x, y)) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); }
  // 위쪽 끝: 코트 자락(흰색·물든 색)이 끝나는 줄 아래부터만 다리로 본다 (코트·촉수를 거울로 옮기지 않게)
  let top = H - 14;
  for (let y = H - 14; y < H; y++) for (let x = x0 - 1; x <= x1 + 1; x++) if (isCoatPx(im, x, y)) top = Math.max(top, y + 1);
  return { x0, x1, top: Math.min(top, H - 6) };
}

/** 칸 안에서 왼쪽 반·오른쪽 반 중 어느 발이 더 낮게(바닥에) 있나 */
function lowestIn(im, x0, x1, top) {
  for (let y = H - 1; y >= top; y--) for (let x = x0; x < x1; x++) if (isDark(im, x, y)) return y;
  return -1;
}

/**
 * 다리 칸의 어두운 픽셀(바지·장화)만 옮긴다. 코트 같은 밝은 픽셀은 그대로 두고, 다리는 코트 뒤로 들어간다.
 * take(x): 이 칸의 다리를 지우고 다시 칠할지 / 거울로 가져온다
 */
function moveLegs(im, cx, take) {
  const { x0, x1, top } = legBox(im, cx);
  const o = copy(im);
  for (let y = top; y < H; y++) for (let x = x0; x <= x1; x++) if (take(x) && isDark(im, x, y)) o.px[at(o, x, y) + 3] = 0;
  for (let y = top; y < H; y++) for (let x = x0; x <= x1; x++) {
    const sx = x0 + x1 - x;
    if (take(x) && isDark(im, sx, y) && !opaque(o, x, y)) im.px.copy(o.px, at(o, x, y), at(im, sx, y), at(im, sx, y) + 4);
  }
  return o;
}

/** 다리를 좌우로 뒤집는다 → 반대 발이 들린다 */
const mirrorLegs = (im, cx) => moveLegs(im, cx, () => true);

/** 디딘 발을 들린 쪽에 거울로 복사 → 두 발 다 디딘 자세 */
function plantBoth(im, cx) {
  const { x0, x1, top } = legBox(im, cx);
  const mid = (x0 + x1) / 2;
  const leftDown = lowestIn(im, x0, Math.ceil(mid), top) >= lowestIn(im, Math.floor(mid) + 1, x1 + 1, top);
  return moveLegs(im, cx, (x) => (leftDown ? x > mid : x < mid));
}

/** body의 다리를 legs의 다리로 바꾼다 (다리 칸의 어두운 픽셀만, 코트는 body 그대로) */
function withLegs(body, legs, cx) {
  const { x0, x1, top } = legBox(legs, cx);
  const o = copy(body);
  for (let y = top; y < H; y++) for (let x = x0 - 2; x <= x1 + 2; x++) if (isDark(body, x, y)) o.px[at(o, x, y) + 3] = 0;
  for (let y = top; y < H; y++) for (let x = x0; x <= x1; x++) if (isDark(legs, x, y) && !opaque(o, x, y)) legs.px.copy(o.px, at(o, x, y), at(legs, x, y), at(legs, x, y) + 4);
  return o;
}

/**
 * 정면·뒷모습 걷기 [한 발 들기, 디딤↑, 반대 발 들기, 디딤↑]: 다리는 첫 몸의 다리를 거울로, 몸은 프레임마다 다른 칸
 * withIdle이면 앞에 [두 발 디딤 서기]를 붙인다 (idle은 bodies[0], 걷기는 bodies[1..4])
 */
function frontBack(bodies, cx, withIdle) {
  const base = bodies[0];
  const planted = plantBoth(base, cx);
  const walk = withIdle ? bodies.slice(1) : bodies;
  const legs = [base, planted, mirrorLegs(base, cx), planted];
  const frames = walk.map((b, i) => tidy(i % 2 ? lift(withLegs(b, legs[i], cx)) : withLegs(b, legs[i], cx)));
  return withIdle ? [tidy(planted), ...frames] : frames;
}

// ---------- 옆모습 걷기: 원본 다리를 잘라 돌린다 ----------

/**
 * 원본 옆모습 다리 자리 (셀 좌표, 원본 해상도). 세 직업 옆모습은 다리 그림이 같다.
 * cutY 아래가 다리, splitX로 뒷다리·앞다리를 가르고, ankleY 아래가 장화. pivot은 다리를 돌리는 엉덩이 자리
 */
const LEGS = {
  cutY: 455,
  minX: 109,
  splitX: 231,
  ankleY: 503,
  back: { x: 183, y: 455 },
  front: { x: 258, y: 455 },
};
/** 자세: 디딘 앞다리를 세우는 각도, 흔드는 뒷다리를 앞으로 돌리는 각도(도)와 들어 올림(px), 먼 다리 어둡게 */
const STRIDE = { plantDeg: 29, swingDeg: -27, swingLiftPx: 34, farShade: 0.68 };

/** 코트가 아닌 픽셀 = 다리 (밝은 코트, 파란·붉은 안감·장식은 코트) */
function isCoat(px, o) {
  const r = px[o], g = px[o + 1], b = px[o + 2];
  return Math.min(r, g, b) > 140 || b > r + 30 || r > g + 60;
}

/** 다리 한 조각(뒷다리/앞다리 × 다리/장화)을 떼어 낸 이미지들과, 다리를 지운 몸 */
function cutLegs(f) {
  const body = copy(f);
  const part = () => k.blank(f.w, f.h);
  const legs = { back: { leg: part(), boot: part() }, front: { leg: part(), boot: part() } };
  for (let y = LEGS.cutY; y < f.h; y++) for (let x = LEGS.minX; x < f.w; x++) {
    const o = at(f, x, y);
    if (f.px[o + 3] <= 40 || isCoat(f.px, o)) continue;
    const side = x < LEGS.splitX ? legs.back : legs.front;
    f.px.copy((y < LEGS.ankleY ? side.leg : side.boot).px, o, o, o + 4);
    body.px[o + 3] = 0;
  }
  return { body, legs };
}

/** 피벗 둘레로 deg만큼 돌리고(+이면 아래로 뻗은 발이 뒤(왼쪽)로) (dx, dy)만큼 옮겨 dst의 빈 자리(코트 뒤)에 칠한다 */
function stamp(dst, src, pivot, deg, dx, dy, shade, over = null) {
  const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  const b = k.bbox(src, 0);
  if (!b) return;
  const r = Math.ceil(Math.hypot(b.w, b.h)) + Math.abs(dx) + Math.abs(dy) + Math.ceil(Math.hypot(b.x - pivot.x, b.y - pivot.y)) + 4;
  for (let y = Math.max(0, pivot.y - r); y < Math.min(dst.h, pivot.y + r); y++) for (let x = Math.max(0, pivot.x - r); x < Math.min(dst.w, pivot.x + r); x++) {
    // 거꾸로 따라가 원본 픽셀을 찾는다 (가까운 픽셀)
    const ux = x - dx - pivot.x, uy = y - dy - pivot.y;
    const sx = Math.round(pivot.x + ux * c + uy * s), sy = Math.round(pivot.y - ux * s + uy * c);
    if (sx < 0 || sy < 0 || sx >= src.w || sy >= src.h) continue;
    const so = at(src, sx, sy);
    if (src.px[so + 3] <= 40) continue;
    const o = at(dst, x, y);
    if (dst.px[o + 3] > 40 && !(over && over[o / 4])) continue;
    for (let ch = 0; ch < 3; ch++) dst.px[o + ch] = Math.round(src.px[so + ch] * shade);
    dst.px[o + 3] = 255;
  }
}

/** 점 p를 pivot 둘레로 deg 돌린 자리 */
function turn(p, pivot, deg) {
  const a = (deg * Math.PI) / 180, ux = p.x - pivot.x, uy = p.y - pivot.y;
  return { x: pivot.x + ux * Math.cos(a) - uy * Math.sin(a), y: pivot.y + ux * Math.sin(a) + uy * Math.cos(a) };
}

/** 이미지에서 가장 아래 줄들의 가운데 (발목 자리) */
function bottomMid(im) {
  const b = k.bbox(im, 0);
  return { x: b.x + b.w / 2, y: b.y + b.h };
}

/**
 * 옆 걷기 4자세 (원본 해상도, 셀 크기): 원본 그대로(앞다리 디딤) → 엇갈림(앞다리를 세워 디디고 뒷다리를 들어 앞으로)
 * → 원본 모양에 가까운·먼 다리 명암만 바꿈(반대 발 디딤) → 엇갈림(반대). 먼 다리는 어둡게, 가까운 다리가 위에
 */
function sidePoses(f, bodies) {
  const { legs } = cutLegs(f);
  const { plantDeg, swingDeg, swingLiftPx, farShade } = STRIDE;
  // 앞다리를 세우면 발목이 옮겨 간다: 장화는 기울이지 않고 발목만 따라 옮긴다 (바닥에 평평하게)
  const ankle = bottomMid(legs.front.leg);
  const moved = turn(ankle, LEGS.front, plantDeg);
  const planted = (im, shade, over) => {
    stamp(im, legs.front.leg, LEGS.front, plantDeg, 0, 0, shade, over);
    stamp(im, legs.front.boot, LEGS.front, 0, Math.round(moved.x - ankle.x), Math.round(moved.y - ankle.y), shade, over);
  };
  const swing = (im, shade, over) => {
    stamp(im, legs.back.leg, LEGS.back, swingDeg, 0, -swingLiftPx, shade, over);
    stamp(im, legs.back.boot, LEGS.back, swingDeg, 0, -swingLiftPx, shade, over);
  };
  const asIs = (im, which, shade, over) => {
    stamp(im, legs[which].leg, LEGS[which], 0, 0, 0, shade, over);
    stamp(im, legs[which].boot, LEGS[which], 0, 0, 0, shade, over);
  };
  // 먼 다리를 먼저 칠하고, 가까운 다리는 먼 다리 위에 덮어 칠한다 (코트는 그대로 앞에)
  const pose = (drawFar, drawNear, bodyFrame) => {
    const body = cutLegs(bodyFrame).body;
    const im = copy(body);
    drawFar(im, farShade, null);
    const farMask = new Uint8Array(im.w * im.h);
    for (let i = 0; i < farMask.length; i++) if (im.px[i * 4 + 3] > 40 && body.px[i * 4 + 3] <= 40) farMask[i] = 1;
    drawNear(im, 1, farMask);
    // 다리를 옮기고 남은 코트 자락 끝의 떨어진 작은 조각 (줄이면 점으로 떠 보인다)
    for (const c of k.components(im, 40)) if (c.area < 900) for (const p of c.pts) im.px[p * 4 + 3] = 0;
    return im;
  };
  return [
    pose((im, s, o) => asIs(im, 'back', s, o), (im, s, o) => asIs(im, 'front', s, o), bodies[0]),
    pose(swing, planted, bodies[1]),
    pose((im, s, o) => asIs(im, 'front', s, o), (im, s, o) => asIs(im, 'back', s, o), bodies[2]),
    pose(planted, swing, bodies[3]),
  ];
}

// ---------- 시트 ----------

function buildPlayers(outDir) {
  const out = {};
  for (const [key, def] of Object.entries(PLAYERS)) {
    // 방향마다 원본 칸들(같은 자리에 그려져 있다)의 합집합 상자, 발 가운데는 첫 칸 기준. direct는 서기 칸을 정면 묶음에 넣는다
    const names = ['front', 'back', 'side'].filter((d) => def[d]);
    const dirs = names.map((dir) => {
      const fs = (def.direct && dir === 'front' ? [def.idle, ...def[dir]] : def[dir]).map((c) => cell(c, def.plain));
      const bs = fs.map((f) => k.bbox(f, 40));
      const x0 = Math.min(...bs.map((b) => b.x)), y0 = Math.min(...bs.map((b) => b.y));
      const b = { x: x0, y: y0, w: Math.max(...bs.map((q) => q.x + q.w)) - x0, h: Math.max(...bs.map((q) => q.y + q.h)) - y0 };
      return { fs, b, cx: feetCenter(fs[0], bs[0]) };
    });
    // 같은 배율: 가장 큰 키를 52px로. 발 가운데를 프레임 가운데에
    const s = H / Math.max(...dirs.map((x) => x.b.h));
    const half = Math.max(...dirs.map(({ b, cx }) => Math.max(cx - b.x, b.x + b.w - cx))) * s;
    const fw = Math.ceil((half * 2) / DENSITY) * DENSITY;
    // 원본 칸 하나를 게임 크기로: 가로는 방향의 상자·발 가운데에 맞추고, 세로는 crop 줄 범위의 아래를 시트 바닥에
    const shrink = (f, { b, cx }, y0 = b.y, h0 = b.h) => {
      const w = Math.max(1, Math.round(b.w * s)), h = Math.max(1, Math.round(h0 * s));
      const im = k.blank(fw, H);
      k.paste(im, k.resize(k.crop(f, b.x, y0, b.w, h0), w, h, 0.5), Math.round(fw / 2 - (cx - b.x) * s), H - h);
      return im;
    };
    let frames, anims;
    if (def.direct) {
      // [서기, 정면 4, (뒷모습 4), (옆 4)] 그대로. 없는 방향은 정면 걷기를 move로 쓴다
      const by = Object.fromEntries(names.map((n, i) => [n, dirs[i].fs.map((f) => shrink(f, dirs[i]))]));
      frames = [...by.front, ...(by.back ?? []), ...(by.side ?? [])];
      anims = { idle: { from: 0, to: 0, fps: 4 } };
      let at = 1;
      for (const [n, id] of [['front', by.side ? 'moveFront' : 'move'], ['back', 'moveBack'], ['side', 'move']]) {
        if (!by[n]) continue;
        const len = n === 'front' ? by.front.length - 1 : by[n].length;
        anims[id] = { from: at, to: at + len - 1, fps: 8 };
        at += len;
      }
    } else {
      const mid = fw / 2 - 0.5;
      const [fd, bd, sd] = dirs;
      const front = frontBack(fd.fs.map((f) => shrink(f, fd)), mid, true);
      const back = frontBack(bd.fs.map((f) => shrink(f, bd)), mid, false);
      // 옆 걷기: 원본 해상도에서 자세를 만들어 같은 배율로 줄인다. 발바닥은 자세마다 맨 아래에 (다리를 세우면 몸이 올라간다)
      const side = sidePoses(sd.fs[0], sd.fs).map((p) => {
        const pb = k.bbox(p, 40);
        return shrink(p, sd, pb.y, pb.y + pb.h - pb.y);
      });
      frames = [...front, ...back, ...side];
      anims = {
        idle: { from: 0, to: 0, fps: 4 },
        moveFront: { from: 1, to: 4, fps: 8 },
        moveBack: { from: 5, to: 8, fps: 8 },
        move: { from: 9, to: 12, fps: 8 },
      };
    }
    const sheetImg = k.blank(fw * frames.length, H);
    frames.forEach((f, i) => k.paste(sheetImg, f, i * fw, 0));
    k.write(path.join(outDir, `${key}.png`), sheetImg);
    out[key] = {
      file: `mku/${key}.png`,
      frameWidth: fw,
      frameHeight: H,
      frames: frames.length,
      density: DENSITY,
      anims,
    };
  }
  return out;
}

module.exports = { buildPlayers };

if (require.main === module) {
  const artPath = path.join(REPO, 'src/data/art.json');
  const art = JSON.parse(fs.readFileSync(artPath, 'utf8'));
  Object.assign(art.sprites, buildPlayers(path.join(REPO, 'public/assets/mku')));
  fs.writeFileSync(artPath, JSON.stringify(art, null, 2) + '\n');
  console.log(Object.keys(PLAYERS).map((key) => `${key} ${art.sprites[key].frameWidth}×${art.sprites[key].frameHeight} ×${art.sprites[key].frames}`).join('\n'));
}
