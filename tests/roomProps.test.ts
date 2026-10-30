import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import { gameData } from '../src/data/index';
import { crateDrops, damageProp, placeRoomProps } from '../src/systems/roomProps';
import { floorConnected, obstacleTiles, pickRoomShape } from '../src/systems/roomShapes';

const P = gameData.mapgen.roomProps;
const D = gameData.mapgen;
const area = { x: 0, y: 0, w: 300, h: 200 };
const rule = { crates: [3, 3] as [number, number], barrels: [2, 2] as [number, number], statueChance: 1 };

describe('방 소품 배치', () => {
  it('규칙대로 놓는다 (같은 시드면 같은 자리)', () => {
    const a = placeRoomProps(new Rng(5), area, [], rule, 20, ['heal']);
    expect(a.filter((s) => s.kind === 'crate')).toHaveLength(3);
    expect(a.filter((s) => s.kind === 'barrel')).toHaveLength(2);
    expect(a.filter((s) => s.kind === 'statue')).toHaveLength(1);
    expect(placeRoomProps(new Rng(5), area, [], rule, 20, ['heal'])).toEqual(a);
  });
  it('피할 자리와 간격을 지킨다', () => {
    const avoid = [{ x: 100, y: 50, w: 100, h: 100 }];
    for (let seed = 1; seed < 30; seed++) {
      const spots = placeRoomProps(new Rng(seed), area, avoid, rule, 24, ['heal']);
      for (const s of spots) expect(s.x >= 100 && s.x <= 200 && s.y >= 50 && s.y <= 150).toBe(false);
      spots.forEach((s, i) => spots.slice(i + 1).forEach((o) => expect(Math.hypot(s.x - o.x, s.y - o.y)).toBeGreaterThanOrEqual(24)));
    }
  });
  it('자리가 없으면 적게 놓는다', () => {
    expect(placeRoomProps(new Rng(1), area, [area], rule, 20, ['heal'])).toEqual([]);
  });
  it('보스방에는 상자·석상이 없고, 시작 방에 석상이 없다', () => {
    expect(P.rules.bossRoom!.crates).toEqual([0, 0]);
    expect(P.rules.bossRoom!.statueChance).toBe(0);
    expect(P.rules.startRoom!.statueChance).toBe(0);
  });
  it('내구도', () => {
    expect(damageProp(5, 2)).toEqual({ hp: 3, broken: false });
    expect(damageProp(2, 5)).toEqual({ hp: 0, broken: true });
  });
  it('드롭: 확률 0이면 없고 1이면 범위 안', () => {
    expect(crateDrops(new Rng(1), { chance: 0, count: [1, 3] })).toBe(0);
    const n = crateDrops(new Rng(1), { chance: 1, count: [1, 3] });
    expect(n).toBeGreaterThanOrEqual(1);
    expect(n).toBeLessThanOrEqual(3);
  });
  it('폭발 통은 플레이어도 다치게 하고, 석상은 회복·에너지·정신력', () => {
    expect(P.barrel.playerDamage).toBeGreaterThan(0);
    expect(P.statues.map((s) => s.kind).sort()).toEqual(['energy', 'heal', 'sanity']);
  });
});

describe('늘어난 지형지물', () => {
  it('배치 틀이 14종이다', () => {
    expect(D.obstacles.layouts).toHaveLength(14);
  });
  it('조우·출구 방에도 장애물이 나오되 가운데가 비는 틀만 쓴다', () => {
    const open = new Set(D.obstacles.layouts.filter((l) => l.open).map((l) => l.id));
    for (const kind of ['encounterRoom', 'exitRoom'] as const) {
      const seen = new Set<string>();
      for (let seed = 1; seed < 200; seed++) {
        const s = pickRoomShape(new Rng(seed), kind, D);
        if (s.layout) {
          seen.add(s.layout);
          expect(open.has(s.layout), s.layout).toBe(true);
        }
      }
      expect(seen.size).toBeGreaterThan(0);
    }
  });
  it('가운데가 비는 틀: 모든 크기에서 가운데(상인 진열대 폭 포함)가 비고 끊기지 않는다', () => {
    const used = new Set([...D.roomSizeRules.encounterRoom, ...D.roomSizeRules.exitRoom].map((r) => r.size));
    for (const l of D.obstacles.layouts.filter((x) => x.open)) {
      for (const s of D.roomSizes.filter((x) => used.has(x.id))) {
        const iw = s.w - 2;
        const ih = s.h - 2;
        const blocks = obstacleTiles(l.id, iw, ih, [], D);
        expect(floorConnected(iw, ih, blocks)).toBe(true);
        const cx = iw / 2;
        const cy = ih / 2;
        for (const b of blocks) {
          const hit = b.x < cx + 5 && b.x + b.w > cx - 5 && b.y < cy + 2 && b.y + b.h > cy - 2;
          expect(hit, `${l.id} ${s.id}`).toBe(false);
        }
      }
    }
  });
});
