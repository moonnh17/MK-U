import { describe, expect, it } from 'vitest';
import { gameData } from '../src/data/index';
import { burstAngle, rootAngle } from '../src/systems/enemyAi';

describe('검보라 마기 변이체', () => {
  it('혈관수 뿌리: 플레이어 방향 → +turn → −turn', () => {
    expect([0, 1, 2].map((i) => rootAngle(1, i, 0.5))).toEqual([1, 1.5, 0.5]);
  });
  it('군집 폐포 탄막은 한 번마다 turn씩 돈다', () => {
    expect([0, 1, 2].map((b) => burstAngle(0, b, 0.5))).toEqual([0, 0.5, 1]);
  });
  it('4종 모두 5문급, 혈관수는 1장·나머지는 2장, 움직이지 않는다', () => {
    const E = gameData.enemies.enemies;
    for (const [id, ch] of [['vesselTree', 1], ['pulseSac', 2], ['gazeBell', 2], ['clusterAlveoli', 2]] as const) {
      const e = E.find((x) => x.id === id)!;
      expect([e.chapter, e.mun, e.munClass, e.moveSpeed, e.rooted]).toEqual([ch, 5, true, 0, true]);
      expect(gameData.waves.waves.some((w) => w.chapter === ch && w.spawns.some((s) => s.enemy === id))).toBe(true);
    }
  });
});
