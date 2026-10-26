import { describe, expect, it } from 'vitest';
import { gameData } from '../src/data/index';
import { generateStage } from '../src/systems/mapgen';
import { contains, corridors, doorRect, interiorRect, metrics, roomAt, roomCenter, wallRects } from '../src/systems/worldLayout';

const m = metrics(gameData.mapgen);

describe('월드 배치', () => {
  const map = generateStage(42, 1, 1, gameData.mapgen);

  it('방 중심 좌표는 그 방으로 판정된다', () => {
    for (const r of map.rooms) {
      const c = roomCenter(r, m);
      expect(roomAt(map, m, c.x, c.y)).toBe(r.id);
    }
  });

  it('복도 한가운데는 어느 방도 아니다', () => {
    for (const c of corridors(map, m)) {
      expect(roomAt(map, m, c.floor.x + c.floor.w / 2, c.floor.y + c.floor.h / 2)).toBeNull();
    }
  });

  it('복도 수 = 문 연결 수', () => {
    const edges = map.rooms.reduce((s, r) => s + Object.keys(r.doors).length, 0) / 2;
    expect(corridors(map, m)).toHaveLength(edges);
  });

  it('벽은 문 자리를 막지 않는다', () => {
    for (const r of map.rooms) {
      const walls = wallRects(r, m);
      for (const d of Object.keys(r.doors) as ('n' | 's' | 'e' | 'w')[]) {
        const g = doorRect(r, d, m);
        const cx = g.x + g.w / 2;
        const cy = g.y + g.h / 2;
        for (const w of walls) expect(contains({ x: w.x + 0.01, y: w.y + 0.01, w: w.w - 0.02, h: w.h - 0.02 }, cx, cy)).toBe(false);
      }
    }
  });

  it('방 바닥은 화면(480×270) 안에 들어간다', () => {
    const inner = interiorRect(map.rooms[0]!, m);
    expect(inner.w).toBeLessThanOrEqual(gameData.ui.baseWidth);
    expect(inner.h).toBeLessThanOrEqual(gameData.ui.baseHeight);
  });
});
