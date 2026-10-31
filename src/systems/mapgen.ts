/**
 * 스테이지 맵 생성 (순수 함수, 시드 재현).
 * 격자 위에 방을 놓고 트리 형태로 잇는다: 시작방 → 주 경로 → 끝 방(출구 또는 보스방),
 * 나머지 전투 칸·조우 칸은 가지로 붙인다. 끝 방은 항상 막다른 방이다.
 */
import { Rng } from '../core/rng';
import type { MapgenData, RoomKind, StageKind } from '../types/data';
import { pickRoomShape } from './roomShapes';

export type Dir = 'n' | 's' | 'e' | 'w';

export const DIRS: Record<Dir, { dx: number; dy: number; opposite: Dir }> = {
  n: { dx: 0, dy: -1, opposite: 's' },
  s: { dx: 0, dy: 1, opposite: 'n' },
  e: { dx: 1, dy: 0, opposite: 'w' },
  w: { dx: -1, dy: 0, opposite: 'e' },
};

export interface RoomNode {
  id: number;
  kind: RoomKind;
  gx: number;
  gy: number;
  /** 문이 있는 방향 → 이웃 방 id */
  doors: Partial<Record<Dir, number>>;
  /** 방 크기(타일, 벽 포함). 없으면 기본 roomTiles */
  size?: { w: number; h: number };
  /** 장애물 배치 틀 id (없으면 null) */
  layout?: string | null;
  /** 조우 칸: 전투 없는 유형(보물·상점)만 나온다. 작고 소품이 없다 */
  peaceful?: boolean;
  /** 방 가운데 월드 좌표 (compactRooms). 없으면 격자 칸 가운데 */
  center?: { x: number; y: number };
}

export interface StageMap {
  chapter: number;
  stage: number;
  kind: StageKind;
  rooms: RoomNode[];
  startId: number;
  /** 주 경로의 끝 방 (일반: 출구, 보스: 보스방) */
  lastId: number;
}

export function stageKindOf(stage: number, data: MapgenData): StageKind {
  return data.bossStages.includes(stage) ? 'boss' : 'normal';
}

export function stageSeedLabel(chapter: number, stage: number): string {
  return `stage-${chapter}-${stage}`;
}

const MAX_ATTEMPTS = 200;

export function generateStage(seed: number, chapter: number, stage: number, data: MapgenData): StageMap {
  const rng = Rng.derive(seed, stageSeedLabel(chapter, stage));
  const kind = stageKindOf(stage, data);
  const rule = data.stageRules[kind];
  const combatCount = rng.int(rule.combatRooms[0], rule.combatRooms[1]);

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const map = tryGenerate(rng, chapter, stage, kind, combatCount, data);
    if (map) {
      // 방 크기·장애물은 따로 뽑는다 (배치 난수와 섞이지 않게)
      const shapeRng = Rng.derive(seed, `${stageSeedLabel(chapter, stage)}-shape`);
      for (const n of map.rooms) {
        const s = pickRoomShape(shapeRng, n.kind, data);
        n.size = { w: s.w, h: s.h };
        n.layout = s.layout;
        if (n.kind === 'encounterRoom' && shapeRng.chance(data.encounterPeaceful.chance)) {
          const small = data.roomSizes.find((x) => x.id === data.encounterPeaceful.size)!;
          n.peaceful = true;
          n.size = { w: small.w, h: small.h };
          n.layout = null;
        }
      }
      compactRooms(map.rooms, data);
      return map;
    }
  }
  throw new Error(`맵 생성 실패: seed=${seed} ${chapter}-${stage}`);
}

/**
 * 방 사이가 복도 길이만큼만 벌어지게 좁혀 놓는다. 같은 줄·칸의 방은 가운데가 같아 복도가 곧게 이어진다.
 * 줄은 그 줄에서 가장 높은 방 기준으로 쌓아 서로 겹치지 않으므로, 칸은 같은 줄의 방끼리만 비교해 당긴다.
 */
export function compactRooms(rooms: RoomNode[], data: MapgenData): void {
  const tile = data.tileSize;
  const gap = data.corridor.lengthTiles * tile;
  const wOf = (n: RoomNode) => (n.size?.w ?? data.roomTiles.width) * tile;
  const hOf = (n: RoomNode) => (n.size?.h ?? data.roomTiles.height) * tile;
  const uniqueSorted = (v: number[]) => [...new Set(v)].sort((a, b) => a - b);

  const rowY = new Map<number, number>();
  let top = 0;
  for (const gy of uniqueSorted(rooms.map((n) => n.gy))) {
    const h = Math.max(...rooms.filter((n) => n.gy === gy).map(hOf));
    rowY.set(gy, top + h / 2);
    top += h + gap;
  }
  /** 줄별로 지금까지 놓은 방의 오른쪽 끝 */
  const rowRight = new Map<number, number>();
  let prevX = 0;
  for (const gx of uniqueSorted(rooms.map((n) => n.gx))) {
    const col = rooms.filter((n) => n.gx === gx);
    const x = Math.max(prevX, ...col.map((n) => wOf(n) / 2 + (rowRight.has(n.gy) ? rowRight.get(n.gy)! + gap : 0)));
    for (const n of col) {
      n.center = { x, y: rowY.get(n.gy)! };
      rowRight.set(n.gy, x + wOf(n) / 2);
    }
    prevX = x;
  }
}

function tryGenerate(
  rng: Rng,
  chapter: number,
  stage: number,
  kind: StageKind,
  combatCount: number,
  data: MapgenData,
): StageMap | null {
  const rule = data.stageRules[kind];
  const { width, height } = data.grid;
  const occupied = new Map<string, RoomNode>();
  const rooms: RoomNode[] = [];
  const key = (x: number, y: number) => `${x},${y}`;
  const inGrid = (x: number, y: number) => x >= 0 && y >= 0 && x < width && y < height;

  const add = (kindOf: RoomKind, gx: number, gy: number, from?: RoomNode): RoomNode => {
    const node: RoomNode = { id: rooms.length, kind: kindOf, gx, gy, doors: {} };
    rooms.push(node);
    occupied.set(key(gx, gy), node);
    if (from) {
      for (const [d, v] of Object.entries(DIRS) as [Dir, (typeof DIRS)[Dir]][]) {
        if (from.gx + v.dx === gx && from.gy + v.dy === gy) {
          from.doors[d] = node.id;
          node.doors[v.opposite] = from.id;
        }
      }
    }
    return node;
  };

  const freeNeighbors = (n: RoomNode): { x: number; y: number }[] =>
    Object.values(DIRS)
      .map((v) => ({ x: n.gx + v.dx, y: n.gy + v.dy }))
      .filter((p) => inGrid(p.x, p.y) && !occupied.has(key(p.x, p.y)));

  // 주 경로에 놓을 전투 칸 수: 최소 1, 나머지는 가지로
  const mainCombat = rng.int(Math.max(1, combatCount - 2), combatCount);
  const branchCombat = combatCount - mainCombat;

  const start = add('startRoom', Math.floor(width / 2), Math.floor(height / 2));
  let cur = start;
  const path: RoomNode[] = [start];
  for (let i = 0; i < mainCombat + 1; i++) {
    const options = freeNeighbors(cur);
    if (options.length === 0) return null;
    const p = rng.pick(options);
    const isLast = i === mainCombat;
    cur = add(isLast ? rule.lastRoom : 'combatRoom', p.x, p.y, cur);
    path.push(cur);
  }
  const last = cur;

  // 가지: 전투 칸 나머지 + 조우 칸 (+ 일반 스테이지에서 출구가 끝 방이 아닌 경우는 없음)
  const branchKinds: RoomKind[] = [];
  for (let i = 0; i < branchCombat; i++) branchKinds.push('combatRoom');
  for (let i = 0; i < rule.encounterRooms; i++) branchKinds.push('encounterRoom');

  for (const k of rng.shuffle(branchKinds)) {
    // 끝 방에는 붙이지 않는다(막다른 방 유지). 시작방 바로 옆 조우 칸도 허용.
    const anchors = rooms.filter((r) => r.id !== last.id && freeNeighbors(r).length > 0);
    if (anchors.length === 0) return null;
    const anchor = rng.pick(anchors);
    const p = rng.pick(freeNeighbors(anchor));
    add(k, p.x, p.y, anchor);
  }

  return { chapter, stage, kind, rooms, startId: start.id, lastId: last.id };
}

/** 시작방에서 도달 가능한 방 id (BFS) */
export function reachableFrom(map: StageMap, fromId: number): Set<number> {
  const seen = new Set<number>([fromId]);
  const queue = [fromId];
  while (queue.length) {
    const id = queue.shift()!;
    for (const next of Object.values(map.rooms[id]!.doors)) {
      if (next !== undefined && !seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  return seen;
}

/** 미니맵에 보일 방: 방문한 방 + 그 이웃 */
export function visibleRooms(map: StageMap, visited: ReadonlySet<number>, revealAll: boolean): Set<number> {
  if (revealAll) return new Set(map.rooms.map((r) => r.id));
  const out = new Set<number>(visited);
  for (const id of visited) {
    for (const n of Object.values(map.rooms[id]!.doors)) if (n !== undefined) out.add(n);
  }
  return out;
}
