import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import { gameData } from '../src/data/index';
import { IMPLEMENTED_ENCOUNTERS } from '../src/systems/encounter';
import { effectiveWeights, transferWeight } from '../src/systems/items';
import { chargeGain, inSpireCircle, spireEliteCount, spireItemChoices, SpireState, type SpireRules } from '../src/systems/spire';

const S = gameData.loot.spire;
const I = gameData.items;
const rules: SpireRules = { fallSec: 1, riseSec: 1, chargePerKill: { normal: 0.25, elite: 0.5 }, minAlive: 2, spawnGapSec: 1 };

describe('첨탑 데이터 (기획서 소형 표)', () => {
  it('소형 첨탑 가중치 레어 62 · 전설 28 · 유니크 10, 신화는 고정 0.1%', () => {
    expect(S.small.weights).toEqual({ rare: 62, legendary: 28, unique: 10 });
    expect(gameData.loot.mythicChance).toBe(0.001);
  });
  it('카드 3장 중 1장', () => {
    expect(S.cards).toBe(3);
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

describe('아이템 선택 카드', () => {
  it('서로 다른 아이템 3장, 가진 아이템은 나오지 않는다', () => {
    const owned = new Set(['elegantMagi', 'leeSeal']);
    for (let seed = 0; seed < 50; seed++) {
      const ids = spireItemChoices(new Rng(seed), S.small.weights, 0.001, I, owned, 3);
      expect(ids).toHaveLength(3);
      expect(new Set(ids).size).toBe(3);
      for (const id of ids) expect(owned.has(id)).toBe(false);
    }
  });
  it('일반 등급은 나오지 않는다 (레어 이상 가중치)', () => {
    for (let seed = 0; seed < 200; seed++) {
      for (const id of spireItemChoices(new Rng(seed), S.small.weights, 0.001, I, new Set(), 3)) {
        expect(I.items.find((x) => x.id === id)!.grade).not.toBe('common');
      }
    }
  });
  it('보스 전용·세트 결과는 나오지 않는다', () => {
    const seen = new Set<string>();
    for (let seed = 0; seed < 300; seed++) for (const id of spireItemChoices(new Rng(seed), S.small.weights, 0.001, I, new Set(), 3)) seen.add(id);
    for (const id of ['wonhonLump', 'warriorMemory']) expect(seen.has(id)).toBe(false);
  });
  it('신화 판정은 가중치 밖에서 따로', () => {
    expect(spireItemChoices(new Rng(1), S.small.weights, 1, I, new Set(), 3)[0]).toBe('divineSword');
  });
  it('남은 아이템이 모자라면 있는 만큼만', () => {
    const all = new Set(I.items.filter((x) => x.pool === 'normal').map((x) => x.id));
    all.delete('magicasol');
    expect(spireItemChoices(new Rng(3), S.small.weights, 0.001, I, all, 3)).toEqual(['magicasol']);
  });
  it('확률 이전은 첨탑 가중치에도 적용되고, 일반 칸이 없어 챕터 이동은 영향 없음', () => {
    const shift = transferWeight(transferWeight({}, 'rare', 2), 'legendary', 2);
    const w = effectiveWeights(S.small.weights, 3, I.chapterCommonShift, shift);
    expect(w).toEqual({ rare: 60, legendary: 28, unique: 12 });
  });
});
