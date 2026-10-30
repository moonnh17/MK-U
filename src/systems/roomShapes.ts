/**
 * 방 모양 (순수 함수, 시드 재현): 방마다 크기 틀을 뽑고, 전투 칸에는 장애물 배치 틀을 뽑는다.
 * 장애물 블록은 방 안쪽 바닥 비율 자리(가운데 기준) + 타일 크기로 적혀 있고, 방 크기에 맞춰 타일 좌표로 바꾼다.
 * 문 앞 통로(문 폭 + 양옆 1타일, 안쪽으로 doorLaneTiles)에 걸리는 블록은 빼서 갇히지 않게 한다.
 */
import type { Rng } from '../core/rng';
import type { MapgenData, RoomKind } from '../types/data';
import type { Dir } from './mapgen';

export interface TileRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 방 크기(타일)와 장애물 틀 id (없으면 null) */
export function pickRoomShape(rng: Rng, kind: RoomKind, data: MapgenData): { w: number; h: number; layout: string | null } {
  const rules = data.roomSizeRules[kind];
  const id = rng.weighted(rules.map((r) => ({ item: r.size, weight: r.weight })));
  const size = data.roomSizes.find((s) => s.id === id)!;
  let layout: string | null = null;
  if (kind === 'combatRoom' && rng.chance(data.obstacles.chance)) {
    layout = rng.weighted(data.obstacles.layouts.map((l) => ({ item: l.id, weight: l.weight })));
  }
  return { w: size.w, h: size.h, layout };
}

/** 가장 큰 방 크기 (격자 한 칸 크기) */
export function maxRoomTiles(data: MapgenData): { w: number; h: number } {
  return { w: Math.max(...data.roomSizes.map((s) => s.w)), h: Math.max(...data.roomSizes.map((s) => s.h)) };
}

function overlaps(a: TileRect, b: TileRect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/** 문 앞 통로 (안쪽 바닥 타일 좌표) */
export function doorLanes(innerW: number, innerH: number, doors: readonly Dir[], data: MapgenData): TileRect[] {
  const cw = data.corridor.widthTiles + 2;
  const len = data.obstacles.doorLaneTiles;
  const cx = Math.floor((innerW - cw) / 2);
  const cy = Math.floor((innerH - cw) / 2);
  return doors.map((d) =>
    d === 'n' ? { x: cx, y: 0, w: cw, h: len } : d === 's' ? { x: cx, y: innerH - len, w: cw, h: len } : d === 'w' ? { x: 0, y: cy, w: len, h: cw } : { x: innerW - len, y: cy, w: len, h: cw },
  );
}

/** 장애물 블록 (안쪽 바닥 타일 좌표). 바닥 밖으로 나가거나 문 앞 통로에 걸리는 블록은 뺀다 */
export function obstacleTiles(layoutId: string | null, innerW: number, innerH: number, doors: readonly Dir[], data: MapgenData): TileRect[] {
  const layout = data.obstacles.layouts.find((l) => l.id === layoutId);
  if (!layout) return [];
  const lanes = doorLanes(innerW, innerH, doors, data);
  const out: TileRect[] = [];
  for (const b of layout.blocks) {
    const r = { x: Math.round(b.x * innerW - b.w / 2), y: Math.round(b.y * innerH - b.h / 2), w: b.w, h: b.h };
    // 벽에 붙지 않게 1타일 띄운다
    if (r.x < 1 || r.y < 1 || r.x + r.w > innerW - 1 || r.y + r.h > innerH - 1) continue;
    if (lanes.some((l) => overlaps(l, r))) continue;
    out.push(r);
  }
  return out;
}

/** 빈 바닥 타일이 모두 이어져 있는지 (장애물에 갇힌 칸이 없는지) */
export function floorConnected(innerW: number, innerH: number, blocks: readonly TileRect[]): boolean {
  const solid = new Set<number>();
  for (const b of blocks) for (let y = b.y; y < b.y + b.h; y++) for (let x = b.x; x < b.x + b.w; x++) solid.add(y * innerW + x);
  const free = innerW * innerH - solid.size;
  const start = [...Array(innerW * innerH).keys()].find((i) => !solid.has(i));
  if (start === undefined) return true;
  const seen = new Set([start]);
  const queue = [start];
  while (queue.length) {
    const i = queue.pop()!;
    const x = i % innerW;
    const y = Math.floor(i / innerW);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= innerW || ny >= innerH) continue;
      const j = ny * innerW + nx;
      if (solid.has(j) || seen.has(j)) continue;
      seen.add(j);
      queue.push(j);
    }
  }
  return seen.size === free;
}
