import { describe, expect, it } from 'vitest';
import { gameData } from '../src/data/index';
import { validateGameData } from '../src/data/validate';
import { generateStage, type Dir } from '../src/systems/mapgen';
import { doorLanes, floorConnected, obstacleTiles, stampGrid } from '../src/systems/roomShapes';
import { corridors, interiorRect, metrics, obstacleRects, roomAt, roomRect } from '../src/systems/worldLayout';

const D = gameData.mapgen;
const m = metrics(D);
const DOOR_SETS: Dir[][] = [[], ['n'], ['e', 'w'], ['n', 's', 'e', 'w'], ['s', 'e']];

describe('방 크기 틀', () => {
  it('데이터 검증 통과', () => {
    expect(validateGameData(gameData)).toEqual([]);
  });
  it('모든 방에 크기가 있고, 보스방은 큰 방, 보스·시작 방에는 장애물이 없다', () => {
    for (let seed = 1; seed < 30; seed++) {
      for (const [c, s] of [[1, 1], [1, 2], [3, 5]] as const) {
        const map = generateStage(seed, c, s, D);
        for (const n of map.rooms) {
          expect(n.size, `${seed} ${n.kind}`).toBeDefined();
          if (n.kind === 'bossRoom') expect(n.size).toEqual({ w: 36, h: 21 });
          if (n.kind === 'bossRoom' || n.kind === 'startRoom') expect(n.layout ?? null).toBeNull();
        }
      }
    }
  });
  it('크기가 섞인다 (여러 시드에서 전투 칸 크기 3종 이상)', () => {
    const sizes = new Set<string>();
    for (let seed = 1; seed < 40; seed++) for (const n of generateStage(seed, 1, 1, D).rooms) if (n.kind === 'combatRoom') sizes.add(`${n.size!.w}x${n.size!.h}`);
    expect(sizes.size).toBeGreaterThanOrEqual(3);
  });
  it('같은 시드면 같은 크기·장애물', () => {
    const a = generateStage(9, 2, 3, D).rooms.map((n) => [n.size, n.layout]);
    expect(generateStage(9, 2, 3, D).rooms.map((n) => [n.size, n.layout])).toEqual(a);
  });
});

describe('월드 배치', () => {
  it('방은 겹치지 않고 좌표로 찾을 수 있다', () => {
    for (let seed = 1; seed < 150; seed++) {
      const map = generateStage(seed, 1 + (seed % 3), 1 + (seed % 5), D);
      const rects = map.rooms.map((n) => roomRect(n, m));
      for (const [i, n] of map.rooms.entries()) {
        const r = rects[i]!;
        expect(r.x).toBeGreaterThanOrEqual(0);
        expect(r.y).toBeGreaterThanOrEqual(0);
        expect(roomAt(map, m, r.x + r.w / 2, r.y + r.h / 2)).toBe(n.id);
        for (const o of rects.slice(i + 1)) expect(r.x < o.x + o.w && o.x < r.x + r.w && r.y < o.y + o.h && o.y < r.y + r.h).toBe(false);
        // 복도가 다른 방을 뚫고 지나가지 않는다
        for (const c of corridors(map, m)) {
          const hit = c.floor.x < r.x + r.w && r.x < c.floor.x + c.floor.w && c.floor.y < r.y + r.h && r.y < c.floor.y + c.floor.h;
          expect(hit, `seed ${seed} room ${n.id}`).toBe(false);
        }
      }
    }
  });
  it('복도는 평균적으로 짧다', () => {
    const lens: number[] = [];
    for (let seed = 1; seed < 150; seed++) for (const c of corridors(generateStage(seed, 1, 1, D), m)) lens.push(Math.max(c.floor.w, c.floor.h) / m.tile);
    expect(lens.reduce((a, b) => a + b, 0) / lens.length).toBeLessThan(8);
  });
  it('복도는 두 방 벽을 잇고(길이 > 0), 마주 보는 문은 같은 높이', () => {
    for (let seed = 1; seed < 15; seed++) {
      const map = generateStage(seed, 2, 2, D);
      for (const c of corridors(map, m)) expect(Math.min(c.floor.w, c.floor.h)).toBeGreaterThan(0);
      for (const n of map.rooms) {
        if (n.doors.e === undefined) continue;
        const a = roomRect(n, m);
        const b = roomRect(map.rooms[n.doors.e]!, m);
        expect(a.y + a.h / 2).toBeCloseTo(b.y + b.h / 2);
      }
    }
  });
});

describe('장애물 배치 틀', () => {
  const layouts = D.obstacles.layouts.map((l) => l.id);
  it('모든 틀 × 모든 크기 × 문 조합에서 빈 바닥이 끊기지 않고 문 앞 통로는 비어 있다', () => {
    for (const id of layouts) {
      for (const s of D.roomSizes) {
        const iw = s.w - 2;
        const ih = s.h - 2;
        for (const doors of DOOR_SETS) {
          const blocks = obstacleTiles(id, iw, ih, doors, D);
          expect(floorConnected(iw, ih, blocks), `${id} ${s.id} ${doors.join('')}`).toBe(true);
          for (const l of doorLanes(iw, ih, doors, D)) {
            for (const b of blocks) expect(b.x < l.x + l.w && l.x < b.x + b.w && b.y < l.y + l.h && l.y < b.y + b.h).toBe(false);
          }
          for (const b of blocks) {
            expect(b.x).toBeGreaterThanOrEqual(1);
            expect(b.x + b.w).toBeLessThanOrEqual(iw - 1);
          }
        }
      }
    }
  });
  it('틀마다 적어도 한 크기에서는 블록이 남는다', () => {
    for (const id of layouts) expect(D.roomSizes.some((s) => obstacleTiles(id, s.w - 2, s.h - 2, ['n', 's', 'e', 'w'], D).length > 0), id).toBe(true);
  });
  it('갇힌 칸 판정', () => {
    // 가운데 칸을 둘러싸면 끊긴다
    expect(floorConnected(5, 5, [{ x: 1, y: 1, w: 3, h: 1 }, { x: 1, y: 3, w: 3, h: 1 }, { x: 1, y: 2, w: 1, h: 1 }, { x: 3, y: 2, w: 1, h: 1 }])).toBe(false);
    expect(floorConnected(5, 5, [{ x: 1, y: 1, w: 3, h: 1 }])).toBe(true);
  });
  it('월드 좌표 장애물은 방 안쪽 바닥 안에 있다', () => {
    for (let seed = 1; seed < 20; seed++) {
      const map = generateStage(seed, 1, 3, D);
      for (const n of map.rooms) {
        const inner = interiorRect(n, m);
        for (const o of obstacleRects(n, m, D)) {
          expect(o.x).toBeGreaterThanOrEqual(inner.x);
          expect(o.y + o.h).toBeLessThanOrEqual(inner.y + inner.h);
        }
      }
    }
  });
});

describe('stampGrid', () => {
  it('사각형을 간격대로 덮는다 (자리는 모두 안쪽)', () => {
    const r = { x: 100, y: 200, w: 64, h: 16 };
    const pts = stampGrid(r, 16);
    expect(pts.length).toBe(4);
    for (const p of pts) {
      expect(p.x).toBeGreaterThan(r.x);
      expect(p.x).toBeLessThan(r.x + r.w);
      expect(p.y).toBeCloseTo(208);
    }
  });

  it('간격보다 작아도 한 자리는 찍는다', () => {
    expect(stampGrid({ x: 0, y: 0, w: 4, h: 4 }, 16)).toEqual([{ x: 2, y: 2 }]);
  });
});
