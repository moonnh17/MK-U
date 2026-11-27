/**
 * 4-5 헥타르 학파 연구원 미모사 (순수 함수, 제안): 시뮬레이션 격자, 광범위 공격의 안전 구역,
 * 시스템 변조 시간표(전조 → 발동 → 원복), 슬롯 셔플, 관측 결과.
 */
import type { Rng } from '../core/rng';
import type { EvolutionState } from './evolution';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Cell {
  c: number;
  r: number;
}

export interface Grid {
  arena: Rect;
  cols: number;
  rows: number;
  /** 칸 크기 (가로·세로) */
  cw: number;
  ch: number;
}

/** 방을 cellPx 안팎의 칸으로 나눈다 (가장자리가 남지 않게 칸 크기를 늘린다) */
export function makeGrid(arena: Rect, cellPx: number): Grid {
  const cols = Math.max(1, Math.floor(arena.w / cellPx));
  const rows = Math.max(1, Math.floor(arena.h / cellPx));
  return { arena, cols, rows, cw: arena.w / cols, ch: arena.h / rows };
}

export function cellRect(g: Grid, cell: Cell): Rect {
  return { x: g.arena.x + cell.c * g.cw, y: g.arena.y + cell.r * g.ch, w: g.cw, h: g.ch };
}

export function cellAt(g: Grid, x: number, y: number): Cell {
  return {
    c: Math.min(g.cols - 1, Math.max(0, Math.floor((x - g.arena.x) / g.cw))),
    r: Math.min(g.rows - 1, Math.max(0, Math.floor((y - g.arena.y) / g.ch))),
  };
}

export function allCells(g: Grid): Cell[] {
  const out: Cell[] = [];
  for (let r = 0; r < g.rows; r++) for (let c = 0; c < g.cols; c++) out.push({ c, r });
  return out;
}

const key = (x: Cell) => `${x.c},${x.r}`;

/** 격자 낙하: 비율만큼 무작위 칸 (보스가 누운 맨 윗줄 제외) */
export function dropCells(rng: Rng, g: Grid, ratio: number): Cell[] {
  const pool = allCells(g).filter((x) => x.r > 0);
  const n = Math.max(1, Math.min(pool.length - 1, Math.round(pool.length * ratio)));
  return rng.shuffle([...pool]).slice(0, n);
}

/**
 * 격자 이동: 띠(bandCols칸 폭 세로줄)를 번갈아 위험·안전으로. step마다 위험 띠가 한 칸씩 옆으로 간다.
 * 안전한 띠가 늘 남는다.
 */
export function shiftCells(g: Grid, step: number, bandCols: number): Cell[] {
  return allCells(g).filter((x) => x.r > 0 && Math.floor((x.c + step) / bandCols) % 2 === 0);
}

/** 최종 정리: 위험 칸 전부와 안전 칸(서로 멀리, 맨 윗줄 아님) */
export function purgeCells(rng: Rng, g: Grid, safeCount: number): { danger: Cell[]; safe: Cell[] } {
  const pool = rng.shuffle(allCells(g).filter((x) => x.r > 0));
  const safe: Cell[] = [];
  for (const x of pool) {
    if (safe.length >= safeCount) break;
    if (safe.every((s) => Math.abs(s.c - x.c) + Math.abs(s.r - x.r) >= Math.max(3, Math.floor(g.cols / 3)))) safe.push(x);
  }
  if (safe.length === 0) safe.push(pool[0]!);
  const s = new Set(safe.map(key));
  return { danger: allCells(g).filter((x) => !s.has(key(x))), safe };
}

/** 위험 칸이 아닌 칸이 하나라도 있는가 */
export function hasSafeCell(g: Grid, danger: readonly Cell[]): boolean {
  const d = new Set(danger.map(key));
  return allCells(g).some((x) => !d.has(key(x)));
}

/** 격자 스캔 한 줄: 방 끝에서 끝까지 움직이는 얇은 띠. 줄을 따라 틈(gaps, 띠 방향 위치)이 있다 */
export interface ScanLine {
  axis: 'h' | 'v';
  /** 시작·끝 자리 (가로 줄이면 y, 세로 줄이면 x) */
  from: number;
  to: number;
  width: number;
  speed: number;
  /** 틈: 줄 방향 [시작, 끝] (지나갈 수 있는 자리) */
  gaps: [number, number][];
}

/** 스캔선: 축마다 틈 gapCount개(폭 gapPx), 서로 겹치지 않게 */
export function makeScan(rng: Rng, a: Rect, axis: 'h' | 'v', width: number, speed: number, gapCount: number, gapPx: number): ScanLine {
  const len = axis === 'h' ? a.w : a.h;
  const start = axis === 'h' ? a.x : a.y;
  const reverse = rng.chance(0.5);
  const from = axis === 'h' ? (reverse ? a.y + a.h : a.y) : reverse ? a.x + a.w : a.x;
  const to = axis === 'h' ? (reverse ? a.y : a.y + a.h) : reverse ? a.x : a.x + a.w;
  const slots = Math.max(gapCount, Math.floor(len / (gapPx * 2)));
  const picks = rng.shuffle(Array.from({ length: slots }, (_, i) => i)).slice(0, gapCount);
  const gaps = picks.map((i): [number, number] => {
    const c = start + ((i + 0.5) * len) / slots;
    return [c - gapPx / 2, c + gapPx / 2];
  });
  return { axis, from, to, width, speed, gaps };
}

/** 스캔선이 t초 뒤 있는 자리 */
export function scanPos(s: ScanLine, t: number): number {
  const d = Math.sign(s.to - s.from) * s.speed * Math.max(0, t);
  return Math.abs(d) >= Math.abs(s.to - s.from) ? s.to : s.from + d;
}

export function scanDone(s: ScanLine, t: number): boolean {
  return s.speed * t >= Math.abs(s.to - s.from);
}

/** 플레이어(원)가 스캔선에 맞는가: 띠 안이고 틈 밖 */
export function scanHits(s: ScanLine, t: number, p: { x: number; y: number }, r: number): boolean {
  const at = scanPos(s, t);
  const across = s.axis === 'h' ? p.y : p.x;
  const along = s.axis === 'h' ? p.x : p.y;
  if (Math.abs(across - at) > s.width / 2 + r) return false;
  return !s.gaps.some(([a, b]) => along - r >= a && along + r <= b);
}

/** 위성 포격 표지: 최대 maxCount, 첫 발은 플레이어 자리, 나머지는 방 안 무작위 */
export function satelliteMarks(rng: Rng, a: Rect, player: { x: number; y: number }, count: number, maxCount: number, radius: number): { x: number; y: number }[] {
  const n = Math.min(count, maxCount);
  const out = [{ x: player.x, y: player.y }];
  while (out.length < n) out.push({ x: rng.range(a.x + radius, a.x + a.w - radius), y: rng.range(a.y + radius, a.y + a.h - radius) });
  return out;
}

/** 표지 반경 밖 자리가 방 안에 있는가 (격자 점으로 확인) */
export function hasUncovered(a: Rect, marks: readonly { x: number; y: number }[], radius: number, step = 8): boolean {
  for (let x = a.x + step / 2; x < a.x + a.w; x += step) for (let y = a.y + step / 2; y < a.y + a.h; y += step) if (marks.every((m) => Math.hypot(m.x - x, m.y - y) > radius)) return true;
  return false;
}

/** 전역 레이저 엄폐물: 방 가운데 아래쪽에 count개, 그 아래가 그림자(안전) */
export function coverRects(rng: Rng, a: Rect, count: number, w: number, h: number): Rect[] {
  const band = a.w / count;
  return Array.from({ length: count }, (_, i) => ({
    x: a.x + band * i + rng.range(4, Math.max(4, band - w - 4)),
    y: a.y + a.h * rng.range(0.35, 0.55),
    w,
    h,
  }));
}

/** 레이저(위에서 아래로)를 피하는 그림자: 엄폐물 아래부터 방 바닥까지 */
export function coverShadows(a: Rect, covers: readonly Rect[]): Rect[] {
  return covers.map((c) => ({ x: c.x, y: c.y, w: c.w, h: a.y + a.h - c.y }));
}

export function inRect(p: { x: number; y: number }, r: Rect, margin = 0): boolean {
  return p.x - margin >= r.x && p.x + margin <= r.x + r.w && p.y - margin >= r.y && p.y + margin <= r.y + r.h;
}

// ---------- 시스템 변조 ----------

export type TamperKind = 'patchNote' | 'slotShuffle' | 'computeError';
export type TamperStage = 'quietBefore' | 'telegraph' | 'active' | 'rollback' | 'quietAfter' | 'done';

export interface TamperTiming {
  quietSec: number;
  telegraphSec: number;
  activeSec: number;
  rollbackSec: number;
}

/** 변조 시간표: 공격 쉼 → 전조 → 발동 → 원복 → 공격 쉼 */
export function tamperStage(t: number, s: TamperTiming): TamperStage {
  let x = t;
  for (const [stage, sec] of [
    ['quietBefore', s.quietSec],
    ['telegraph', s.telegraphSec],
    ['active', s.activeSec],
    ['rollback', s.rollbackSec],
    ['quietAfter', s.quietSec],
  ] as const) {
    if (x < sec) return stage;
    x -= sec;
  }
  return 'done';
}

/** 이 단계 동안 보스가 새 공격을 시작하지 않는가 (억울한 피격 방지) */
export function tamperBlocksAttacks(stage: TamperStage): boolean {
  return stage === 'quietBefore' || stage === 'telegraph' || stage === 'rollback' || stage === 'quietAfter';
}

/** 슬롯 셔플 순열: 모든 칸이 자리를 옮긴다 (n ≥ 2) */
export function derangement(rng: Rng, n: number): number[] {
  if (n < 2) return Array.from({ length: n }, (_, i) => i);
  for (;;) {
    const p = rng.shuffle(Array.from({ length: n }, (_, i) => i));
    if (p.every((v, i) => v !== i)) return p;
  }
}

/** 화면 칸 j에 보일(=누르면 쓸) 원래 칸 */
export function shuffledSlot(perm: readonly number[] | null, j: number): number {
  return perm?.[j] ?? j;
}

/** 패치 노트 규칙 */
export type PatchRule = 'invertX' | 'invertY' | 'invertXY' | 'gravity';

/** 이동 입력에 패치를 입힌다 (모바일 버튼 배치는 그대로, 방향만) */
export function patchMove(move: { x: number; y: number }, rules: readonly PatchRule[]): { x: number; y: number } {
  let { x, y } = move;
  for (const r of rules) {
    if (r === 'invertX' || r === 'invertXY') x = -x;
    if (r === 'invertY' || r === 'invertXY') y = -y;
  }
  return { x, y };
}

/** 넉백(밀림) 방향: 중력 패치면 반대로 (끌려온다) */
export function patchPush(v: { x: number; y: number }, rules: readonly PatchRule[]): { x: number; y: number } {
  return rules.includes('gravity') ? { x: -v.x, y: -v.y } : v;
}

/** 연산 오류 표시: 이름 일부를 깨진 글자로 (판정에는 쓰지 않는다) */
export function garble(rng: Rng, text: string, ratio: number, glyphs: string): string {
  return [...text].map((ch) => (ch !== ' ' && rng.chance(ratio) ? glyphs[rng.int(0, glyphs.length - 1)]! : ch)).join('');
}

// ---------- 관측 결과 ----------

export interface ObservationRules {
  /** 진화 id → 계열 */
  groups: Record<string, 'hp' | 'attack' | 'speed'>;
  /** 계열 중첩 1당 보스 배율 */
  perStack: { hp: number; attack: number; speed: number };
  max: { hp: number; attack: number; speed: number };
}

/** 지금까지 고른 진화 중 체력·공격·속도 계열이 보스에게: 받는 피해 감소·공격력·패턴 속도 (제안) */
export function observation(st: EvolutionState | null, rules: ObservationRules): { takenMul: number; damageMul: number; gapMul: number; counts: { hp: number; attack: number; speed: number } } {
  const counts = { hp: 0, attack: 0, speed: 0 };
  for (const [id, n] of Object.entries(st?.stacks ?? {})) {
    const g = rules.groups[id];
    if (g) counts[g] += n;
  }
  const k = (g: 'hp' | 'attack' | 'speed') => Math.min(rules.max[g], counts[g] * rules.perStack[g]);
  return { takenMul: 1 - k('hp'), damageMul: 1 + k('attack'), gapMul: 1 - k('speed'), counts };
}

/** 페이즈: 체력 비율 → 1·2·3 */
export function mimosaPhase(hpRatio: number, thresholds: readonly number[]): number {
  return 1 + thresholds.filter((t) => hpRatio <= t).length;
}
