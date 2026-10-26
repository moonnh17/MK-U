import { describe, expect, it } from 'vitest';
import { gameData } from '../src/data/index';
import { DIRS, generateStage, reachableFrom, stageKindOf, visibleRooms, type Dir } from '../src/systems/mapgen';

const m = gameData.mapgen;
const count = (map: ReturnType<typeof generateStage>, kind: string) => map.rooms.filter((r) => r.kind === kind).length;
const SEEDS = Array.from({ length: 60 }, (_, i) => i * 7919 + 1);

describe('맵 생성', () => {
  it('같은 시드·스테이지는 같은 맵', () => {
    expect(generateStage(123, 1, 3, m)).toEqual(generateStage(123, 1, 3, m));
  });

  it('시드나 스테이지가 다르면 다른 맵', () => {
    const a = JSON.stringify(generateStage(123, 1, 3, m));
    expect(JSON.stringify(generateStage(124, 1, 3, m))).not.toBe(a);
    expect(JSON.stringify(generateStage(123, 1, 4, m))).not.toBe(a);
  });

  it('X-2, X-5는 보스 스테이지', () => {
    expect([1, 2, 3, 4, 5].map((s) => stageKindOf(s, m))).toEqual(['normal', 'boss', 'normal', 'normal', 'boss']);
  });

  describe.each(SEEDS)('seed %i', (seed) => {
    it.each([1, 2, 3, 4, 5])('1-%i 방 개수·연결성·끝 방 규칙', (stage) => {
      const map = generateStage(seed, 1, stage, m);
      const boss = stageKindOf(stage, m) === 'boss';

      expect(count(map, 'startRoom')).toBe(1);
      expect(count(map, 'encounterRoom')).toBe(1);
      const combat = count(map, 'combatRoom');
      if (boss) {
        expect(combat).toBeGreaterThanOrEqual(2);
        expect(combat).toBeLessThanOrEqual(3);
        expect(count(map, 'bossRoom')).toBe(1);
        expect(count(map, 'exitRoom')).toBe(0);
        expect(map.rooms[map.lastId]!.kind).toBe('bossRoom');
      } else {
        expect(combat).toBeGreaterThanOrEqual(4);
        expect(combat).toBeLessThanOrEqual(5);
        expect(count(map, 'bossRoom')).toBe(0);
        expect(count(map, 'exitRoom')).toBe(1);
        expect(map.rooms[map.lastId]!.kind).toBe('exitRoom');
      }

      // 모든 방이 시작방에서 이어진다 (출구 포함)
      expect(reachableFrom(map, map.startId).size).toBe(map.rooms.length);

      // 끝 방은 막다른 방
      expect(Object.keys(map.rooms[map.lastId]!.doors)).toHaveLength(1);

      // 칸 중복 없음, 격자 안
      const cells = new Set(map.rooms.map((r) => `${r.gx},${r.gy}`));
      expect(cells.size).toBe(map.rooms.length);
      for (const r of map.rooms) {
        expect(r.gx).toBeGreaterThanOrEqual(0);
        expect(r.gy).toBeGreaterThanOrEqual(0);
        expect(r.gx).toBeLessThan(m.grid.width);
        expect(r.gy).toBeLessThan(m.grid.height);
      }

      // 문은 격자 이웃끼리, 양방향
      for (const r of map.rooms) {
        for (const [d, nid] of Object.entries(r.doors) as [Dir, number][]) {
          const n = map.rooms[nid]!;
          expect(n.gx - r.gx).toBe(DIRS[d].dx);
          expect(n.gy - r.gy).toBe(DIRS[d].dy);
          expect(n.doors[DIRS[d].opposite]).toBe(r.id);
        }
      }

      // 트리: 간선 수 = 방 수 - 1
      const edges = map.rooms.reduce((s, r) => s + Object.keys(r.doors).length, 0) / 2;
      expect(edges).toBe(map.rooms.length - 1);
    });
  });
});

describe('미니맵 표시 범위', () => {
  it('방문한 방과 그 이웃만 보인다', () => {
    const map = generateStage(5, 1, 1, m);
    const start = map.rooms[map.startId]!;
    const vis = visibleRooms(map, new Set([map.startId]), false);
    const expected = new Set([map.startId, ...Object.values(start.doors)]);
    expect(vis).toEqual(expected);
  });

  it('전체 공개면 모든 방', () => {
    const map = generateStage(5, 1, 1, m);
    expect(visibleRooms(map, new Set(), true).size).toBe(map.rooms.length);
  });
});
