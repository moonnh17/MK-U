import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import { gameData } from '../src/data/index';
import { IMPLEMENTED_ENCOUNTERS } from '../src/systems/encounter';
import { chargeGain, inSpireCircle, spireEliteCount, SpireState, type SpireRules } from '../src/systems/spire';

const S = gameData.loot.spire;
const rules: SpireRules = { fallSec: 1, riseSec: 1, chargePerKill: { normal: 0.25, elite: 0.5 }, minAlive: 2, spawnGapSec: 1 };

describe('첨탑 데이터 (기획서 소형 표)', () => {
  it('고르는 스킬 수: 소형 1 · 중형 2 · 대형 3', () => {
    expect([S.small.picks, S.medium.picks, S.large.picks]).toEqual([1, 2, 3]);
  });
  it('충전량: 일반 12% · 엘리트 30%', () => {
    expect(S.chargePerKill).toEqual({ normal: 0.12, elite: 0.3, champion: 0.3 });
  });
  it('조우 판정에 첨탑이 들어간다', () => {
    expect(IMPLEMENTED_ENCOUNTERS.has('magiSpire')).toBe(true);
  });
});

describe('충전', () => {
  it('원 안 처치만 충전된다', () => {
    expect(chargeGain('normal', true, rules.chargePerKill)).toBe(0.25);
    expect(chargeGain('normal', false, rules.chargePerKill)).toBe(0);
    expect(chargeGain('boss', true, rules.chargePerKill)).toBe(0);
  });
  it('몸이 원에 걸치면 안', () => {
    expect(inSpireCircle(75, 0, 72, 4)).toBe(true);
    expect(inSpireCircle(77, 0, 72, 4)).toBe(false);
  });
});

describe('진행 상태기계', () => {
  it('낙하 → 착지와 함께 첫 무리 → 충전 100%에 상승 → 끝', () => {
    const s = new SpireState(rules);
    expect(s.update(0.5, 0)).toEqual([]);
    expect(s.update(0.6, 0)).toEqual([{ type: 'landed' }, { type: 'spawn', index: 0 }]);
    expect(s.phase).toBe('charging');
    expect(s.onKill('normal', true)).toEqual([]);
    expect(s.onKill('normal', false)).toEqual([]);
    expect(s.charge).toBeCloseTo(0.25);
    expect(s.onKill('elite', true)).toEqual([]);
    expect(s.onKill('normal', true)).toEqual([{ type: 'charged' }]);
    expect(s.phase).toBe('rising');
    // 상승 중에는 더 소환하지 않고, 처치도 충전하지 않는다
    expect(s.onKill('normal', true)).toEqual([]);
    expect(s.update(0.5, 0)).toEqual([]);
    expect(s.update(0.6, 0)).toEqual([{ type: 'risen' }]);
    expect(s.phase).toBe('done');
  });
  it('방해: 남은 적이 minAlive 이하이고 간격이 지나야 다음 무리', () => {
    const s = new SpireState(rules);
    s.update(1, 0); // 착지 + 무리 0
    expect(s.update(0.5, 5)).toEqual([]);
    expect(s.update(0.6, 3)).toEqual([]); // 간격은 지났지만 아직 많다
    expect(s.update(0.1, 2)).toEqual([{ type: 'spawn', index: 1 }]);
    expect(s.update(0.5, 0)).toEqual([]); // 간격 1초
    expect(s.update(0.6, 0)).toEqual([{ type: 'spawn', index: 2 }]);
  });
  it('충전은 100%를 넘지 않는다', () => {
    const s = new SpireState({ ...rules, chargePerKill: { normal: 0.7 } });
    s.update(1, 0);
    s.onKill('normal', true);
    s.onKill('normal', true);
    expect(s.charge).toBe(1);
  });
  it('디버그 즉시 충전', () => {
    const s = new SpireState(rules);
    s.update(1, 0);
    expect(s.forceCharge()).toEqual([{ type: 'charged' }]);
    expect(s.forceCharge()).toEqual([]);
  });
});

describe('방해 병력', () => {
  it('엘리트는 평소의 2배', () => {
    expect(S.eliteMul).toBe(2);
    expect(spireEliteCount(1, S.eliteMul)).toBe(2);
    expect(spireEliteCount(2, S.eliteMul)).toBe(4);
  });
});
