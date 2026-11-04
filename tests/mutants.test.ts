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
  it('4종 모두 5문급, 혈관수·군집 폐포는 1장, 나머지는 2장, 움직이지 않는다', () => {
    const E = gameData.enemies.enemies;
    for (const [id, ch] of [['vesselTree', 1], ['pulseSac', 2], ['gazeBell', 2], ['clusterAlveoli', 1]] as const) {
      const e = E.find((x) => x.id === id)!;
      expect([e.chapter, e.mun, e.munClass, e.moveSpeed, e.rooted]).toEqual([ch, 5, true, 0, true]);
      expect(gameData.waves.waves.some((w) => w.chapter === ch && w.spawns.some((s) => s.enemy === id))).toBe(true);
    }
  });
});

describe('마기 군락체', () => {
  it('3장 4문급, 공격 두 개는 각자 준비 자세 그림이 있다', () => {
    const e = gameData.enemies.enemies.find((x) => x.id === 'magiColonyFusion')!;
    expect([e.chapter, e.mun, e.munClass]).toEqual([3, 4, true]);
    const anims = gameData.art.sprites[e.spriteKey]!.anims!;
    for (const a of e.attacks!) expect(anims[a.pose!], a.id).toBeDefined();
    expect(e.attacks!.find((a) => a.id === 'gazePulse')!.perpOffsets).toEqual([0, -18, 18]);
    expect(e.attacks!.find((a) => a.id === 'veinBarrage')!.volley!.bursts).toBe(3);
  });
});
