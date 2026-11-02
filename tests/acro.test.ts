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
import { combineMods, heal, payHp, takeDamage } from '../src/systems/vitals';

describe('대성공·실험 성공 확률', () => {
  const tags = gameData.tags;
  it('확률 태그가 있으면 상한을 적용한다: 대성공 60%, 실험 성공 98%', () => {
    expect(skillChance(0.1, 'greatSuccess', ['tech', 'chance'], tags)).toBeCloseTo(0.1);
    expect(skillChance(0.7, 'greatSuccess', ['chance'], tags)).toBe(0.6);
    expect(skillChance(0.99, 'success', ['chance'], tags)).toBe(0.98);
  });
  it('확률 태그가 없으면 기본값 그대로', () => {
    expect(skillChance(0.7, 'greatSuccess', ['tech'], tags)).toBe(0.7);
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

describe('체력', () => {
  const v = { hp: 50, maxHp: 100 };
  it('피해', () => {
    expect(takeDamage(v, 15).hp).toBe(35);
    expect(takeDamage(v, 999).hp).toBe(0);
  });
  it('회복: 넘치는 양을 돌려준다', () => {
    expect(heal(v, 20)).toEqual({ hp: 70, overflow: 0 });
    expect(heal({ ...v, hp: 95 }, 20)).toEqual({ hp: 100, overflow: 15 });
  });
  it('체력 소모는 죽지 않는다', () => {
    expect(payHp(100, 0.2)).toEqual({ hp: 80, paid: 20 });
    expect(payHp(1, 0.2)).toEqual({ hp: 1, paid: 0 });
    expect(payHp(2, 0.9).hp).toBeCloseTo(1);
  });
});

describe('플레이어 보정 합치기', () => {
  it('이속은 더하고 피해 감소는 곱한다', () => {
    const m = combineMods([{ moveSpeed: 0.2, damageReduction: 0.5 }, { damageReduction: 0.5 }]);
    expect(m.moveSpeed).toBeCloseTo(0.2);
    expect(m.damageReduction).toBeCloseTo(0.75);
  });
  it('비어 있으면 0', () => {
    expect(combineMods([])).toEqual({ moveSpeed: 0, damageReduction: 0 });
  });
});
