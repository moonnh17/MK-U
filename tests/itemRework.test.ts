import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import { gameData } from '../src/data/index';
import { rollWeapon } from '../src/systems/loot';
import { chainTargets } from '../src/systems/targeting';
import { hpStance } from '../src/systems/vitals';
import { weaponStats } from '../src/systems/weapons';

const W = gameData.weapons;
const w = (id: string) => W.weapons.find((x) => x.id === id)!;
const item = (id: string) => gameData.items.items.find((x) => x.id === id)!;

describe('아이템에서 무기로', () => {
  it('아이템 목록에서 빠지고 무기에 있다', () => {
    for (const id of ['brokenBlade', 'alGulBlade', 'gihwanArm', 'ancientCore', 'eclipseCore', 'hanabi']) {
      expect(gameData.items.items.some((x) => x.id === id), id).toBe(false);
      expect(w(id), id).toBeDefined();
    }
  });
  it('등급', () => {
    expect(w('brokenBlade').grade).toBe('common');
    for (const id of ['alGulBlade', 'gihwanArm', 'ancientCore', 'eclipseCore']) expect(w(id).grade, id).toBe('unique');
  });
  it('부러진 칼날은 사거리가 가장 짧은 축이다', () => {
    expect(w('brokenBlade').range).toBeLessThanOrEqual(w('dagger').range);
  });
  it('알 굴 참마검: 보스 추가 피해, 3타 광범위, 치명타 10%', () => {
    const a = w('alGulBlade');
    expect(a.equipBonus?.bossDamage).toBeGreaterThan(0);
    expect(a.signature).toMatchObject({ every: 3, kind: 'bigSmash' });
    expect(weaponStats(a, { defId: a.id, grade: 'unique', options: [] }, 1).critChance).toBeCloseTo(0.1);
  });
  it('기환의 팔: 3타마다 번개 / 한아비: 바바리안 +30%, 3타 강화', () => {
    expect(w('gihwanArm').signature).toMatchObject({ every: 3, kind: 'chainBolt' });
    expect(w('hanabi').equipBonus?.jobDamage?.barbarian).toBe(0.3);
    expect(w('hanabi').signature).toMatchObject({ every: 3 });
  });
  it('유니크 판정이면 드롭 유니크(알 굴 참마검), 일반 판정에는 상위 무기가 안 나온다', () => {
    for (let s = 0; s < 100; s++) {
      expect(rollWeapon(new Rng(s), 'unique', W.weapons, W.options, gameData.groupMultipliers, 'legendary').defId).toBe('alGulBlade');
      const common = rollWeapon(new Rng(s), 'common', W.weapons, W.options, gameData.groupMultipliers, 'legendary').defId;
      expect(['alGulBlade', 'hanabi']).not.toContain(common);
    }
  });
});

describe('옮긴 효과', () => {
  const kinds = (id: string) => item(id).effects.map((e) => e.kind);
  it('헥타르 RAM·마력 전투 응용법', () => {
    expect(kinds('hectarRam')).toContain('grazeEnergy');
    expect(kinds('combatTheory')).toContain('cutReflect');
  });
  it('수치·등급 변경', () => {
    expect(item('namelessHelm').effects[0]).toMatchObject({ value: 10 });
    expect(item('antimatterSample').grade).toBe('legendary');
    expect(item('deathWhistle').grade).toBe('legendary');
  });
  it('어느 전사의 기억: 체력 절반 기준', () => {
    const e = { ratio: 0.5, damageUp: 0.15, takenDown: 0.15 };
    expect(hpStance(60, 100, e)).toEqual({ damage: 0.15, taken: 0 });
    expect(hpStance(40, 100, e)).toEqual({ damage: 0, taken: 0.15 });
  });
});

describe('튕기는 번개', () => {
  const pts = [{ x: 10, y: 0, radius: 0 }, { x: 30, y: 0, radius: 0 }, { x: 500, y: 0, radius: 0 }, { x: 60, y: 0, radius: 0 }];
  it('가까운 순서로, 사거리 안에서만, 같은 적은 한 번', () => {
    expect(chainTargets({ x: 0, y: 0 }, pts, 5, 40, new Set())).toEqual([0, 1, 3]);
    expect(chainTargets({ x: 0, y: 0 }, pts, 2, 40, new Set())).toEqual([0, 1]);
    expect(chainTargets({ x: 1000, y: 0 }, pts, 5, 40, new Set())).toEqual([]);
  });
});
