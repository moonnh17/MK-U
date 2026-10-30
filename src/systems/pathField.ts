/**
 * 적 길 찾기 (순수 함수). 방 내부를 격자로 나눠 목표까지의 거리를 재고(BFS), 거리가 줄어드는 칸으로 간다.
 * 거리표는 목표 칸이 바뀔 때만 다시 만든다.
 */
import type { Vec2 } from '../core/actions';

export interface AreaRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PathField {
  area: AreaRect;
  cell: number;
  cols: number;
  rows: number;
  blocked: Uint8Array;
  /** 목표 칸까지의 거리 (-1 = 못 감) */
  dist: Int32Array;
  goalCell: number;
}

/** 8방향 (대각선은 양옆이 뚫려 있을 때만) */
const DIRS: readonly [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

/** margin: 장애물을 이만큼 넓혀 본다 (몸이 끼지 않게) */
export function buildPathField(area: AreaRect, obstacles: readonly AreaRect[], cell: number, margin: number): PathField {
  const cols = Math.max(1, Math.floor(area.w / cell));
  const rows = Math.max(1, Math.floor(area.h / cell));
  const blocked = new Uint8Array(cols * rows);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = area.x + (c + 0.5) * cell;
      const y = area.y + (r + 0.5) * cell;
      if (obstacles.some((o) => x > o.x - margin && x < o.x + o.w + margin && y > o.y - margin && y < o.y + o.h + margin)) blocked[r * cols + c] = 1;
    }
  }
  return { area, cell, cols, rows, blocked, dist: new Int32Array(cols * rows).fill(-1), goalCell: -1 };
}

function cellAt(f: PathField, p: Vec2): number {
  const c = Math.floor((p.x - f.area.x) / f.cell);
  const r = Math.floor((p.y - f.area.y) / f.cell);
  if (c < 0 || r < 0 || c >= f.cols || r >= f.rows) return -1;
  return r * f.cols + c;
}

function floodFrom(f: PathField, goal: number): void {
  f.dist.fill(-1);
  f.goalCell = goal;
  const queue = [goal];
  f.dist[goal] = 0;
  for (let i = 0; i < queue.length; i++) {
    const cur = queue[i]!;
    const r = Math.floor(cur / f.cols);
    const c = cur - r * f.cols;
    for (let k = 0; k < 4; k++) {
      const nc = c + DIRS[k]![0];
      const nr = r + DIRS[k]![1];
      if (nc < 0 || nr < 0 || nc >= f.cols || nr >= f.rows) continue;
      const n = nr * f.cols + nc;
      if (f.blocked[n] || f.dist[n] !== -1) continue;
      f.dist[n] = f.dist[cur]! + 1;
      queue.push(n);
    }
  }
}

/** from에서 goal로 가는 다음 방향. 구역 밖이거나 길이 없으면 null (곧장 가는 동작으로 돌아간다) */
export function pathDir(f: PathField, from: Vec2, goal: Vec2): Vec2 | null {
  const g = cellAt(f, goal);
  const s = cellAt(f, from);
  if (g < 0 || s < 0) return null;
  // 목표가 장애물 칸(여유 폭 안)이어도 길은 그 칸까지 잰다
  if (g !== f.goalCell) floodFrom(f, g);
  const r = Math.floor(s / f.cols);
  const c = s - r * f.cols;
  let best = f.dist[s]! >= 0 ? f.dist[s]! : Infinity;
  let to = -1;
  for (const [dc, dr] of DIRS) {
    const nc = c + dc;
    const nr = r + dr;
    if (nc < 0 || nr < 0 || nc >= f.cols || nr >= f.rows) continue;
    const n = nr * f.cols + nc;
    if (f.dist[n]! < 0 || f.blocked[n]) continue;
    if (dc !== 0 && dr !== 0 && (f.blocked[r * f.cols + nc] || f.blocked[nr * f.cols + c])) continue;
    if (f.dist[n]! < best) {
      best = f.dist[n]!;
      to = n;
    }
  }
  if (to < 0) return null;
  const tr = Math.floor(to / f.cols);
  const tc = to - tr * f.cols;
  const dx = f.area.x + (tc + 0.5) * f.cell - from.x;
  const dy = f.area.y + (tr + 0.5) * f.cell - from.y;
  const len = Math.hypot(dx, dy) || 1;
  return { x: dx / len, y: dy / len };
}

/** 두 점 사이가 장애물(margin만큼 넓힌)에 막히지 않았는지 */
export function segmentClear(a: Vec2, b: Vec2, obstacles: readonly AreaRect[], margin = 0): boolean {
  for (const o of obstacles) {
    const x0 = o.x - margin;
    const y0 = o.y - margin;
    const x1 = o.x + o.w + margin;
    const y1 = o.y + o.h + margin;
    // 선분-사각형 교차 (slab)
    let t0 = 0;
    let t1 = 1;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    let hit = true;
    for (const [p, q] of [[-dx, a.x - x0], [dx, x1 - a.x], [-dy, a.y - y0], [dy, y1 - a.y]] as const) {
      if (p === 0) {
        if (q < 0) hit = false;
        continue;
      }
      const t = q / p;
      if (p < 0) t0 = Math.max(t0, t);
      else t1 = Math.min(t1, t);
    }
    if (hit && t0 <= t1) return false;
  }
  return true;
}
