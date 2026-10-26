/**
 * 격자 좌표 → 월드 좌표 (순수 함수).
 * 방 하나 = roomTiles × tileSize, 벽 두께 = 1타일, 방 사이는 복도(corridor)로 잇는다.
 */
import type { MapgenData } from '../types/data';
import { DIRS, type Dir, type RoomNode, type StageMap } from './mapgen';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface WorldMetrics {
  tile: number;
  roomW: number;
  roomH: number;
  corridorLen: number;
  corridorW: number;
  strideX: number;
  strideY: number;
}

export function metrics(d: MapgenData): WorldMetrics {
  const tile = d.tileSize;
  const roomW = d.roomTiles.width * tile;
  const roomH = d.roomTiles.height * tile;
  const corridorLen = d.corridor.lengthTiles * tile;
  const corridorW = d.corridor.widthTiles * tile;
  return { tile, roomW, roomH, corridorLen, corridorW, strideX: roomW + corridorLen, strideY: roomH + corridorLen };
}

export function roomRect(n: Pick<RoomNode, 'gx' | 'gy'>, m: WorldMetrics): Rect {
  return { x: n.gx * m.strideX, y: n.gy * m.strideY, w: m.roomW, h: m.roomH };
}

export function roomCenter(n: Pick<RoomNode, 'gx' | 'gy'>, m: WorldMetrics): { x: number; y: number } {
  const r = roomRect(n, m);
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
}

/** 벽 안쪽 바닥 */
export function interiorRect(n: Pick<RoomNode, 'gx' | 'gy'>, m: WorldMetrics, inset = 0): Rect {
  const r = roomRect(n, m);
  const t = m.tile + inset;
  return { x: r.x + t, y: r.y + t, w: r.w - t * 2, h: r.h - t * 2 };
}

/** 벽에 뚫린 문 자리 */
export function doorRect(n: Pick<RoomNode, 'gx' | 'gy'>, dir: Dir, m: WorldMetrics): Rect {
  const r = roomRect(n, m);
  const t = m.tile;
  const cw = m.corridorW;
  switch (dir) {
    case 'n':
      return { x: r.x + r.w / 2 - cw / 2, y: r.y, w: cw, h: t };
    case 's':
      return { x: r.x + r.w / 2 - cw / 2, y: r.y + r.h - t, w: cw, h: t };
    case 'w':
      return { x: r.x, y: r.y + r.h / 2 - cw / 2, w: t, h: cw };
    case 'e':
      return { x: r.x + r.w - t, y: r.y + r.h / 2 - cw / 2, w: t, h: cw };
  }
}

/** 방 벽 조각들 (문이 있는 변은 문 자리를 비운다) */
export function wallRects(n: RoomNode, m: WorldMetrics): Rect[] {
  const r = roomRect(n, m);
  const t = m.tile;
  const out: Rect[] = [];
  const horizontal = (y: number, dir: Dir) => {
    if (n.doors[dir] === undefined) {
      out.push({ x: r.x, y, w: r.w, h: t });
      return;
    }
    const g = doorRect(n, dir, m);
    out.push({ x: r.x, y, w: g.x - r.x, h: t });
    out.push({ x: g.x + g.w, y, w: r.x + r.w - (g.x + g.w), h: t });
  };
  const vertical = (x: number, dir: Dir) => {
    const top = r.y + t;
    const bottom = r.y + r.h - t;
    if (n.doors[dir] === undefined) {
      out.push({ x, y: top, w: t, h: bottom - top });
      return;
    }
    const g = doorRect(n, dir, m);
    out.push({ x, y: top, w: t, h: g.y - top });
    out.push({ x, y: g.y + g.h, w: t, h: bottom - (g.y + g.h) });
  };
  horizontal(r.y, 'n');
  horizontal(r.y + r.h - t, 's');
  vertical(r.x, 'w');
  vertical(r.x + r.w - t, 'e');
  return out;
}

export interface CorridorGeom {
  floor: Rect;
  walls: [Rect, Rect];
}

/** 동쪽·남쪽 방향 간선마다 복도 하나 (중복 없이) */
export function corridors(map: StageMap, m: WorldMetrics): CorridorGeom[] {
  const out: CorridorGeom[] = [];
  const t = m.tile;
  for (const n of map.rooms) {
    const r = roomRect(n, m);
    if (n.doors.e !== undefined) {
      const y = r.y + r.h / 2 - m.corridorW / 2;
      const x = r.x + r.w;
      out.push({
        floor: { x, y, w: m.corridorLen, h: m.corridorW },
        walls: [
          { x, y: y - t, w: m.corridorLen, h: t },
          { x, y: y + m.corridorW, w: m.corridorLen, h: t },
        ],
      });
    }
    if (n.doors.s !== undefined) {
      const x = r.x + r.w / 2 - m.corridorW / 2;
      const y = r.y + r.h;
      out.push({
        floor: { x, y, w: m.corridorW, h: m.corridorLen },
        walls: [
          { x: x - t, y, w: t, h: m.corridorLen },
          { x: x + m.corridorW, y, w: t, h: m.corridorLen },
        ],
      });
    }
  }
  return out;
}

export function contains(r: Rect, x: number, y: number): boolean {
  return x >= r.x && y >= r.y && x <= r.x + r.w && y <= r.y + r.h;
}

/** 좌표가 들어 있는 방 id (복도면 null) */
export function roomAt(map: StageMap, m: WorldMetrics, x: number, y: number): number | null {
  const gx = Math.floor(x / m.strideX);
  const gy = Math.floor(y / m.strideY);
  const n = map.rooms.find((r) => r.gx === gx && r.gy === gy);
  if (!n) return null;
  return contains(roomRect(n, m), x, y) ? n.id : null;
}

export function mapBounds(map: StageMap, m: WorldMetrics): Rect {
  const maxX = Math.max(...map.rooms.map((r) => r.gx));
  const maxY = Math.max(...map.rooms.map((r) => r.gy));
  return { x: 0, y: 0, w: (maxX + 1) * m.strideX, h: (maxY + 1) * m.strideY };
}

export { DIRS };
