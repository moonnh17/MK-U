import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import { gameData } from '../src/data/index';
import {
  applyCorruption,
  canRebel,
  corruptedDamage,
  pickResults,
  skillChance,
  tickCorruption,
  type CorruptionState,
} from '../src/systems/acro';
import { startingStats } from '../src/systems/damage';
import { setStat } from '../src/systems/stats';
import { combineMods, heal, payHp, takeDamage } from '../src/systems/vitals';

const stats = (int: number) => {
  const s = startingStats(10);
  return { ...s, intelligence: int };
};

describe('대성공·실험 성공 확률', () => {
  const tags = gameData.tags;
  it('확률 태그가 있으면 지능 보정 (1.03^(지능−10))', () => {
    expect(skillChance(0.1, 'greatSuccess', ['tech', 'chance'], stats(10), tags)).toBeCloseTo(0.1);
    expect(skillChance(0.1, 'greatSuccess', ['tech', 'chance'], stats(20), tags)).toBeCloseTo(0.1 * 1.03 ** 10);
  });
  it('대성공 상한 60%, 실험 성공 상한 98%', () => {
    expect(skillChance(0.5, 'greatSuccess', ['chance'], stats(45), tags)).toBe(0.6);
    expect(skillChance(0.9, 'success', ['chance'], stats(45), tags)).toBe(0.98);
  });
  it('확률 태그가 없으면 기본값 그대로', () => {
    expect(skillChance(0.1, 'greatSuccess', ['tech'], stats(30), tags)).toBe(0.1);
  });
  it('setStat과 함께 써도 같은 값', () => {
    const p = setStat({ stats: startingStats(10), hp: 100, maxHp: 100 }, 'intelligence', 20, 100, gameData.stats);
    expect(skillChance(0.2, 'success', ['chance'], p.stats, tags)).toBeCloseTo(0.2 * 1.03 ** 10);
  });
});

describe('실험 결과 뽑기', () => {
  const w = { explosion: 3, barrage: 3, discharge: 3, collapse: 1 };
  it('서로 다른 결과를 count개', () => {
    for (let s = 0; s < 30; s++) {
      const r = pickResults(new Rng(s), w, 3);
      expect(new Set(r).size).toBe(3);
    }
  });
  it('결과 수보다 많이 달라면 있는 만큼', () => {
    expect(pickResults(new Rng(1), w, 9)).toHaveLength(4);
  });
  it('가중치 0은 나오지 않는다', () => {
    for (let s = 0; s < 30; s++) expect(pickResults(new Rng(s), { a: 1, b: 0 }, 2)).toEqual(['a']);
  });
  it('같은 시드면 같은 결과', () => {
    expect(pickResults(new Rng(7), w, 2)).toEqual(pickResults(new Rng(7), w, 2));
  });
});

describe('마기 변질', () => {
  const c: CorruptionState = { leftSec: 2, vulnerability: 0.3, burstDamage: 8, burstRadius: 20, burstTags: ['magic'] };
  it('변질된 적은 받는 피해가 늘어난다', () => {
    expect(corruptedDamage(10, c)).toBeCloseTo(13);
    expect(corruptedDamage(10, null)).toBe(10);
  });
  it('시간이 지나면 풀린다', () => {
    expect(tickCorruption(c, 1)?.leftSec).toBeCloseTo(1);
    expect(tickCorruption(c, 2)).toBeNull();
  });
  it('다시 걸면 센 쪽·긴 쪽', () => {
    const r = applyCorruption(c, { ...c, leftSec: 1, vulnerability: 0.6 });
    expect(r.leftSec).toBe(2);
    expect(r.vulnerability).toBe(0.6);
  });
  it('보스·히든보스는 반역 개체가 될 수 없다', () => {
    expect(canRebel('normal')).toBe(true);
    expect(canRebel('elite')).toBe(true);
    expect(canRebel('champion')).toBe(true);
    expect(canRebel('boss')).toBe(false);
    expect(canRebel('hiddenBoss')).toBe(false);
  });
});

describe('체력·보호막', () => {
  const v = { hp: 50, maxHp: 100, shield: 10, shieldMax: 30 };
  it('피해는 보호막부터', () => {
    expect(takeDamage(v, 4)).toMatchObject({ shield: 6, hp: 50 });
    expect(takeDamage(v, 15)).toMatchObject({ shield: 0, hp: 45 });
    expect(takeDamage(v, 999).hp).toBe(0);
  });
  it('회복: 넘치는 양은 보호막으로 (최대치까지)', () => {
    expect(heal(v, 20, true)).toMatchObject({ hp: 70, shield: 10 });
    expect(heal({ ...v, hp: 95 }, 20, true)).toMatchObject({ hp: 100, shield: 25 });
    expect(heal({ ...v, hp: 100 }, 50, true)).toMatchObject({ hp: 100, shield: 30 });
    expect(heal({ ...v, hp: 100 }, 50, false)).toMatchObject({ hp: 100, shield: 10 });
  });
  it('보호막 최대치가 줄어도 이미 있는 보호막은 회복으로 깎이지 않는다', () => {
    expect(heal({ ...v, hp: 100, shield: 20, shieldMax: 0 }, 5, true).shield).toBe(20);
  });
  it('체력 소모는 죽지 않는다', () => {
    expect(payHp(100, 0.2)).toEqual({ hp: 80, paid: 20 });
    expect(payHp(1, 0.2)).toEqual({ hp: 1, paid: 0 });
    expect(payHp(2, 0.9).hp).toBeCloseTo(1);
  });
});

describe('플레이어 보정 합치기', () => {
  it('이속·보호막은 더하고 피해 감소는 곱한다', () => {
    const m = combineMods([{ moveSpeed: 0.2, damageReduction: 0.5 }, { damageReduction: 0.5, shieldMax: 30 }]);
    expect(m.moveSpeed).toBeCloseTo(0.2);
    expect(m.damageReduction).toBeCloseTo(0.75);
    expect(m.shieldMax).toBe(30);
  });
  it('비어 있으면 0', () => {
    expect(combineMods([])).toEqual({ moveSpeed: 0, damageReduction: 0, shieldMax: 0 });
  });
});
