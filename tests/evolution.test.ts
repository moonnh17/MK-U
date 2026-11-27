import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import { gameData } from '../src/data/index';
import {
  adaptStep,
  candidates,
  deathBlastKind,
  defenseMul,
  evolutionTargetOf,
  evolvedStats,
  findReward,
  newEvolutionState,
  overloadActive,
  pickEvolution,
  rollEvolutionCards,
  shouldSplit,
  uniqueSpawns,
  type EvolutionState,
} from '../src/systems/evolution';
import { rescaleHp } from '../src/systems/champions';

const E = gameData.overflow.evolution;
const common = E.evolutions.filter((e) => e.target === 'common');
const allMaxed = (): EvolutionState => ({ stacks: Object.fromEntries(E.evolutions.map((e) => [e.id, E.maxStacks])), uniques: [], overloadStacks: 0 });

describe('진화 데이터', () => {
  it('공용 15종 (일반 5·레어 5·전설 5), 유니크 2종(토마끼·악귀)', () => {
    expect(common).toHaveLength(15);
    for (const g of ['common', 'rare', 'legendary'] as const) expect(common.filter((e) => e.grade === g)).toHaveLength(5);
    expect(E.uniques.map((u) => u.base).sort()).toEqual(['akgwi', 'tomakki']);
    for (const u of E.uniques) expect(gameData.enemies.enemies.some((x) => x.id === u.enemy)).toBe(true);
  });
  it('보스 전용 진화가 따로 있다', () => {
    expect(E.evolutions.filter((e) => e.target === 'boss').length).toBeGreaterThan(0);
  });
  it('등급 60/28/9/3, 신화 없음', () => {
    expect(E.gradeWeights).toEqual({ common: 60, rare: 28, legendary: 9, unique: 3 });
    expect(Object.keys(E.rewards)).not.toContain('mythic');
  });
  it('카드 보상에 신화 아이템이 없다', () => {
    for (const list of Object.values(E.rewards)) for (const r of list) if ('weights' in r) expect(r.weights.mythic ?? 0).toBe(0);
  });
});

describe('진화 카드 뽑기', () => {
  it('3장, 같은 카드 중복 없음', () => {
    for (let s = 1; s <= 200; s++) {
      const cards = rollEvolutionCards(new Rng(s), newEvolutionState(), E);
      expect(cards).toHaveLength(3);
      expect(new Set(cards.map((c) => c.evoId)).size).toBe(3);
      for (const c of cards) expect(findReward(E, c.rewardId)).toBeDefined();
      for (const c of cards) expect(E.rewards[c.grade].some((r) => r.id === c.rewardId)).toBe(true);
    }
  });

  it('등급 분포 (시드 고정): 일반 > 레어 > 전설 > 유니크, 대략 60/28/9/3', () => {
    const n: Record<string, number> = {};
    let total = 0;
    for (let s = 1; s <= 3000; s++) {
      for (const c of rollEvolutionCards(new Rng(s), newEvolutionState(), E)) {
        n[c.grade] = (n[c.grade] ?? 0) + 1;
        total++;
      }
    }
    const p = (g: string) => (n[g] ?? 0) / total;
    expect(p('common')).toBeGreaterThan(0.55);
    expect(p('common')).toBeLessThan(0.65);
    expect(p('rare')).toBeGreaterThan(0.24);
    expect(p('rare')).toBeLessThan(0.32);
    expect(p('legendary')).toBeGreaterThan(0.07);
    expect(p('legendary')).toBeLessThan(0.115);
    expect(p('unique')).toBeGreaterThan(0.015);
    expect(p('unique')).toBeLessThan(0.045);
  });

  it('최대 중첩 진화는 후보에서 빠진다', () => {
    const st: EvolutionState = { ...newEvolutionState(), stacks: { haste: E.maxStacks } };
    expect(candidates(st, 'common', E, new Set())).not.toContain('haste');
    for (let s = 1; s <= 300; s++) for (const c of rollEvolutionCards(new Rng(s), st, E)) expect(c.evoId).not.toBe('haste');
  });

  it('유니크는 한 번만: 고른 유니크는 다시 나오지 않고, 다 고르면 유니크 등급 자체가 없다', () => {
    const one = pickEvolution(newEvolutionState(), { kind: 'evolution', evoId: 'uniqueTomakki', grade: 'unique', rewardId: 'itemUnique' }, E);
    expect(pickEvolution(one, { kind: 'evolution', evoId: 'uniqueTomakki', grade: 'unique', rewardId: 'itemUnique' }, E).uniques).toEqual(['uniqueTomakki']);
    const both: EvolutionState = { ...newEvolutionState(), uniques: E.uniques.map((u) => u.id) };
    for (let s = 1; s <= 500; s++) for (const c of rollEvolutionCards(new Rng(s), both, E)) expect(c.grade).not.toBe('unique');
  });

  it('소진: 공용·보스 전부 최대 + 유니크 2종 뒤에도 3장 (과부하 누적)', () => {
    const st = { ...allMaxed(), uniques: E.uniques.map((u) => u.id) };
    for (let s = 1; s <= 50; s++) {
      const cards = rollEvolutionCards(new Rng(s), st, E);
      expect(cards).toHaveLength(3);
      for (const c of cards) expect(c.evoId).toBe(E.overloadCard.id);
    }
    const after = pickEvolution(st, { kind: 'evolution', evoId: E.overloadCard.id, grade: 'common', rewardId: 'coinsS' }, E);
    expect(after.overloadStacks).toBe(1);
    expect(evolvedStats(after, 'common', E).hpMul).toBeGreaterThan(evolvedStats(st, 'common', E).hpMul);
  });

  it('중첩은 최대치를 넘지 않는다', () => {
    let st = newEvolutionState();
    for (let i = 0; i < 5; i++) st = pickEvolution(st, { kind: 'evolution', evoId: 'bulk', grade: 'common', rewardId: 'coinsS' }, E);
    expect(st.stacks.bulk).toBe(E.maxStacks);
  });
});

describe('진화 수치', () => {
  const stack = (id: string, n: number): EvolutionState => ({ ...newEvolutionState(), stacks: { [id]: n } });

  it('곱연산: 체력 1.2^n, 이동 1.15^n, 공격 1.15^n', () => {
    expect(evolvedStats(stack('bulk', 3), 'common', E).hpMul).toBeCloseTo(1.2 ** 3);
    expect(evolvedStats(stack('haste', 2), 'common', E).moveMul).toBeCloseTo(1.15 ** 2);
    expect(evolvedStats(stack('instinct', 3), 'common', E).damageMul).toBeCloseTo(1.15 ** 3);
  });

  it('방어: 최종 피해 × 100/(100+방어), 합산 상한', () => {
    expect(defenseMul(25, E.caps.defense)).toBeCloseTo(0.8);
    expect(defenseMul(500, E.caps.defense)).toBeCloseTo(100 / (100 + E.caps.defense));
    const st: EvolutionState = { ...newEvolutionState(), stacks: { harden: 3, adapt: 3 } };
    const s = evolvedStats(st, 'common', E);
    let def = s.defense;
    for (let i = 0; i < 200; i++) def = s.defense + adaptStep(def - s.defense, s);
    expect(s.defense + (s.adapt?.max ?? 0)).toBeGreaterThan(E.caps.defense);
    expect(defenseMul(def, E.caps.defense)).toBeCloseTo(100 / (100 + E.caps.defense));
  });

  it('변이 융합: 다른 공용 진화 중첩이 늘어난다 (융합 자신은 그대로)', () => {
    const base = evolvedStats(stack('bulk', 2), 'common', E).hpMul;
    const fused = evolvedStats({ ...newEvolutionState(), stacks: { bulk: 2, fusion: 1 } }, 'common', E).hpMul;
    expect(fused).toBeCloseTo(1.2 ** (2 * (1 + E.fusionPerStack)));
    expect(fused).toBeGreaterThan(base);
  });

  it('재생 합산 상한', () => {
    const s = evolvedStats({ ...newEvolutionState(), stacks: { regen: 3, hyperRegen: 3, fusion: 3 } }, 'common', E);
    expect(s.regenPerSec).toBeCloseTo(E.caps.regenPerSec);
  });

  it('재계산: 현재 체력 비율 유지, 같은 진화 상태면 중간 스폰도 같은 값', () => {
    const s = evolvedStats(stack('bulk', 2), 'common', E);
    expect(rescaleHp(30, 60, 60 * s.hpMul)).toBeCloseTo(30 * s.hpMul);
    expect(evolvedStats(stack('bulk', 2), 'common', E)).toEqual(s);
  });

  it('공용 진화는 보스에게, 보스 진화는 일반 적에게 가지 않는다', () => {
    const st: EvolutionState = { ...newEvolutionState(), stacks: { bulk: 3, bossBulk: 3 } };
    expect(evolvedStats(st, 'boss', E).hpMul).toBeCloseTo(1.15 ** 3);
    expect(evolvedStats(st, 'common', E).hpMul).toBeCloseTo(1.2 ** 3);
    expect(evolvedStats(st, 'none', E).hpMul).toBe(1);
  });
});

describe('적용 대상', () => {
  const t = (id: string, rank: 'normal' | 'champion' | 'boss' | 'hiddenBoss') => evolutionTargetOf({ id, rank }, E);
  it('일반 적·정예는 공용, 보스·히든보스는 보스 진화, 토마끼·개들개는 공용 제외', () => {
    expect(t('akgwi', 'normal')).toBe('common');
    expect(t('executor', 'champion')).toBe('common');
    expect(t('magiGolem', 'boss')).toBe('boss');
    expect(t('royalMage', 'hiddenBoss')).toBe('boss');
    expect(t('tomakki', 'normal')).toBe('none');
    expect(t('gaedeulgae', 'normal')).toBe('none');
  });
  it('보스가 부른 졸개(분신 포함)는 일반 적처럼 공용 진화', () => {
    expect(t('royalMageClone', 'normal')).toBe('common');
    expect(t('hectarTrooper', 'normal')).toBe('common');
  });
});

describe('폭발·분열·과부하', () => {
  const st: EvolutionState = { ...newEvolutionState(), stacks: { split: 1, explosive: 1, overload: 1 } };
  const s = evolvedStats(st, 'common', E);
  it('분열체는 다시 나뉘지 않고, 동시 개수 상한을 넘지 않는다', () => {
    let yes = 0;
    for (let i = 0; i < 400; i++) if (shouldSplit(new Rng(i), s, false, 0, E.caps.splitAlive)) yes++;
    expect(yes).toBeGreaterThan(50);
    for (let i = 0; i < 100; i++) expect(shouldSplit(new Rng(i), s, true, 0, E.caps.splitAlive)).toBe(false);
    for (let i = 0; i < 100; i++) expect(shouldSplit(new Rng(i), s, false, E.caps.splitAlive - 1, E.caps.splitAlive)).toBe(false);
  });
  it('폭발 중복 방지: 유니크 대폭발이 우선, 반역 개체는 터지지 않는다', () => {
    expect(deathBlastKind(true, s, false)).toBe('unique');
    expect(deathBlastKind(false, s, false)).toBe('evolution');
    expect(deathBlastKind(false, evolvedStats(newEvolutionState(), 'common', E), false)).toBeNull();
    expect(deathBlastKind(true, s, true)).toBeNull();
  });
  it('과부하: 주기 끝 activeSec 동안만', () => {
    const o = s.overload!;
    expect(overloadActive(0, o)).toBe(false);
    expect(overloadActive(o.cycleSec - o.activeSec / 2, o)).toBe(true);
    expect(overloadActive(o.cycleSec + 1, o)).toBe(false);
  });
});

describe('유니크 변형', () => {
  it('고른 유니크만, 장·맵과 상관없이 확률로 나온다', () => {
    const none = newEvolutionState();
    for (let s = 0; s < 50; s++) expect(uniqueSpawns(new Rng(s), none, E)).toEqual([]);
    const st: EvolutionState = { ...none, uniques: ['uniqueTomakki'] };
    let n = 0;
    for (let s = 0; s < 1000; s++) {
      const out = uniqueSpawns(new Rng(s), st, E);
      for (const id of out) expect(id).toBe('tomakkiGiant');
      n += out.length;
    }
    expect(n / 1000).toBeCloseTo(E.uniqueSpawnChance, 1);
  });
  it('토마끼 유니크: 매우 큼·뛸 때 탄막·죽으면 대폭발 / 악귀 유니크: 융합악귀 모습, 체력 낮음, 악귀 공격 그대로', () => {
    const en = (id: string) => gameData.enemies.enemies.find((x) => x.id === id)!;
    const g = en('tomakkiGiant');
    expect(g.size * (g.artScale ?? 1)).toBeGreaterThanOrEqual(en('tomakki').size * 2);
    expect(g.attacks?.some((a) => a.kind === 'lunge' && a.ring)).toBe(true);
    expect(g.deathBlast?.warnSec).toBeGreaterThan(0);
    const m = en('akgwiFusionMini');
    expect(m.spriteKey).toBe(en('fusionAkgwi').spriteKey);
    expect(m.maxHp).toBeLessThan(en('fusionAkgwi').maxHp / 5);
    expect(m.attacks).toEqual(en('akgwi').attacks);
  });
});

describe('진화 카드 보상', () => {
  it('기존 스테이지 보상에 더해진다 (본편은 그대로)', async () => {
    const { stageEndOfferKinds } = await import('../src/systems/overflow');
    expect(stageEndOfferKinds('skill', true)).toEqual(['skill', 'evolution']);
    expect(stageEndOfferKinds('item', false)).toEqual(['item']);
  });
  it('결정 보너스는 결산에 한 줄로 더해진다 (없으면 줄 없음)', async () => {
    const { crystalBreakdown, newRunRecord } = await import('../src/systems/runRecord');
    const r = newRunRecord();
    expect(crystalBreakdown(r, false, gameData.meta.crystals).lines.some((l) => l.key === 'evolution')).toBe(false);
    const withBonus = crystalBreakdown({ ...r, bonusCrystals: 40 }, false, gameData.meta.crystals);
    expect(withBonus.lines.find((l) => l.key === 'evolution')?.amount).toBe(40);
    expect(withBonus.total).toBe(crystalBreakdown(r, false, gameData.meta.crystals).total + 40);
  });
});
