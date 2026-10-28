import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import { gameData } from '../src/data/index';
import { validateGameData } from '../src/data/validate';
import {
  activeEffects,
  effectiveWeights,
  itemDamageMultiplier,
  itemTotals,
  pickHeal,
  pickItem,
  readySet,
  reshuffleDelta,
  rollItem,
  scaleEffect,
  transferWeight,
} from '../src/systems/items';
import { STAT_IDS, type StatId } from '../src/types/data';

const I = gameData.items;
const G = gameData.groupMultipliers;
const item = (id: string) => I.items.find((x) => x.id === id)!;
const noInvest = Object.fromEntries(STAT_IDS.map((s) => [s, 0])) as Record<StatId, number>;
const totals = (ids: string[], school: 'hectar' | 'acro' | null = null) =>
  itemTotals(ids, I, { school, job: 'magiScholar' }, G, { startValue: 10, invest: noInvest });

describe('아이템 목록 (기획서 표)', () => {
  it('일반 6·레어 5·전설 5·유니크 5·신화 1 + 세트 1 + 보스 전용', () => {
    const by = (g: string) => I.items.filter((x) => x.pool === 'normal' && x.grade === g).length;
    expect([by('common'), by('rare'), by('legendary'), by('unique'), by('mythic')]).toEqual([6, 5, 5, 5, 1]);
    expect(I.items.filter((x) => x.pool === 'set').map((x) => x.id)).toEqual(['alGulBlade']);
    expect(I.items.filter((x) => x.pool === 'boss').map((x) => [x.id, x.bossId])).toEqual([
      ['wonhonLump', 'fusionAkgwi'],
      ['gihwanArm', 'electricRing'],
      ['hectarRam', 'hectarChief'],
      ['ancientCore', 'magiGolem'],
      ['eclipseCore', 'eclipse'],
    ]);
  });
  it('데이터 검증 통과', () => {
    expect(validateGameData(gameData)).toEqual([]);
  });
});

describe('그룹 배율', () => {
  it('실제 값 = 기준값 × 그룹 배율', () => {
    const burst = scaleEffect(item('gihwanArm').effects[0]!, G);
    expect(burst).toMatchObject({ damage: 180 * G.itemGroups.procDamage, radius: 232.5 * G.itemGroups.area });
    const helm = scaleEffect(item('namelessHelm').effects[0]!, G);
    expect(helm).toMatchObject({ value: 40 * G.itemGroups.hpFlat });
  });
  it('그룹 배율 하나를 바꾸면 그 그룹 아이템이 같이 바뀐다', () => {
    const g2 = structuredClone(G);
    g2.itemGroups.statFlat = 2;
    const t = itemTotals(['elegantMagi', 'afroBelt'], I, { school: null, job: 'magiScholar' }, g2, { startValue: 10, invest: noInvest });
    expect(t.stats.intelligence).toBe(12);
    expect(t.stats.agility).toBe(40);
  });
});

describe('효과 합산', () => {
  it('같은 종류의 +%는 더한 뒤 한 번 곱한다', () => {
    const t = totals(['brokenBlade', 'combatTheory', 'leeSeal']);
    expect(t.damage.all).toBeCloseTo(0.02 + 0.07 + 0.15);
    expect(itemDamageMultiplier(t, 0, false, null)).toBeCloseTo(1.24);
  });
  it('신검 영디·마기만 있으면 4배', () => {
    expect(itemDamageMultiplier(totals(['divineSword']), 0, false, null)).toBeCloseTo(4);
  });
  it('모든 적이 받는 피해·보스 피해는 따로 곱한다', () => {
    const t = totals(['magowikiCodex', 'alGulBlade']);
    expect(itemDamageMultiplier(t, 0, true, null)).toBeCloseTo(1.2 * 1.2 * 1.05);
    expect(itemDamageMultiplier(t, 0, false, null)).toBeCloseTo(1.2 * 1.05);
  });
  it('모든 스탯 +5', () => {
    const t = totals(['magowikiCodex']);
    for (const s of STAT_IDS) expect(t.stats[s]).toBe(5);
  });
  it('실험용 반물질: 헥타르 외에는 자동 발사, 헥타르는 반물질포 피해 +20%', () => {
    const kinds = (school: 'hectar' | 'acro' | null) => activeEffects(item('antimatterSample'), { school, job: 'magiScholar' }, G).map((e) => e.kind);
    expect(kinds(null)).toEqual(['autoCast']);
    expect(kinds('acro')).toEqual(['autoCast']);
    expect(kinds('hectar')).toEqual(['skillDamage']);
    expect(itemDamageMultiplier(totals(['antimatterSample'], 'hectar'), 0, false, 'antimatterCannon')).toBeCloseTo(1.2);
  });
  it('직업 변형은 그 직업일 때만 (마기학자에게는 없음)', () => {
    expect(totals(['hanabi']).damage.all).toBeCloseTo(0.1);
  });
  it('레굴루스 부활은 헥타르만, 아크룩스 대성공은 아크로만', () => {
    const kinds = (id: string, school: 'hectar' | 'acro' | null) => activeEffects(item(id), { school, job: 'magiScholar' }, G).map((e) => e.kind);
    expect(kinds('regulusShard', 'hectar')).toContain('revive');
    expect(kinds('regulusShard', 'acro')).not.toContain('revive');
    expect(kinds('acruxCross', 'acro')).toContain('greatSuccess');
    expect(kinds('acruxCross', null)).not.toContain('greatSuccess');
    expect(kinds('acruxCross', null)).toContain('revive');
  });
});

describe('LSD-R', () => {
  it('기본 스탯 5, 정신력 1로 재편하고 감소분을 가장 많이 투자한 스탯으로', () => {
    const invest = { ...noInvest, agility: 8, magiPower: 3 };
    const d = reshuffleDelta(10, invest, 5, 1);
    expect(d.strength).toBe(-5);
    expect(d.willpower).toBe(-9);
    expect(d.agility).toBe(-5 + 5 * 5 + 9);
    expect(STAT_IDS.reduce((s, k) => s + d[k], 0)).toBe(0);
  });
});

describe('등급 가중치', () => {
  it('확률 이전: 얻은 등급의 가중치 2가 바로 위 등급으로, 유니크는 그대로', () => {
    let s = transferWeight({}, 'common', 2);
    s = transferWeight(s, 'rare', 2);
    expect(s).toEqual({ common: -2, rare: 0, legendary: 2 });
    expect(transferWeight(s, 'unique', 2)).toBe(s);
  });
  it('챕터마다 일반 −15를 상위 등급에 비율대로', () => {
    const w = effectiveWeights(I.treasureWeights, 2, 15, {});
    expect(w.common).toBe(45);
    expect((w.rare ?? 0) + (w.legendary ?? 0) + (w.unique ?? 0)).toBeCloseTo(55);
    expect(w.rare! / w.legendary!).toBeCloseTo(30 / 9);
  });
  it('가중치는 0 아래로 내려가지 않는다', () => {
    expect(effectiveWeights({ common: 1, rare: 1 }, 1, 15, { common: -5 }).common).toBe(0);
  });
});

describe('아이템 뽑기', () => {
  it('같은 아이템은 한 런에 한 번만', () => {
    const obtained = new Set<string>();
    for (let i = 0; i < 6; i++) {
      const id = pickItem(new Rng(i), 'common', I, obtained)!;
      expect(obtained.has(id)).toBe(false);
      obtained.add(id);
    }
    // 일반이 다 떨어지면 다른 등급에서
    expect(I.items.find((x) => x.id === pickItem(new Rng(1), 'common', I, obtained))!.grade).not.toBe('common');
  });
  it('보스 전용·세트 결과는 상자에서 나오지 않는다', () => {
    const seen = new Set<string>();
    for (let s = 0; s < 400; s++) seen.add(rollItem(new Rng(s), I.treasureWeights, 0.001, I, new Set())!);
    for (const id of ['wonhonLump', 'gihwanArm', 'alGulBlade']) expect(seen.has(id)).toBe(false);
  });
  it('신화 판정이 나면 신검 영디·마기', () => {
    expect(rollItem(new Rng(1), I.treasureWeights, 1, I, new Set())).toBe('divineSword');
  });
});

describe('회복·세트', () => {
  const c = (itemId: string, threshold: number, priority: number, ready = true) => ({ itemId, threshold, healTo: 0.8, priority, ready });
  it('동시 조건이면 생등심 → 스튜 → 마기카솔 순으로 하나만', () => {
    const cands = [c('magicasol', 0.5, 3), c('slimeStew', 0.5, 2), c('hanwooSteak', 0.1, 1)];
    expect(pickHeal(cands, 0.05)?.itemId).toBe('hanwooSteak');
    expect(pickHeal(cands, 0.4)?.itemId).toBe('slimeStew');
    expect(pickHeal([c('slimeStew', 0.5, 2, false), c('magicasol', 0.5, 3)], 0.4)?.itemId).toBe('magicasol');
    expect(pickHeal(cands, 0.6)).toBeNull();
  });
  it('기획서 회복 순서와 데이터가 같다', () => {
    const pr = (id: string) => (item(id).effects[0] as { priority: number }).priority;
    expect(pr('hanwooSteak') < pr('slimeStew') && pr('slimeStew') < pr('magicasol')).toBe(true);
  });
  it('부러진 칼날 + 망가진 손잡이 → 알 굴 참마검', () => {
    expect(readySet(new Set(['brokenBlade', 'brokenHilt']), new Set(['brokenBlade', 'brokenHilt']), I.sets)?.result).toBe('alGulBlade');
    expect(readySet(new Set(['brokenBlade']), new Set(['brokenBlade']), I.sets)).toBeNull();
    expect(readySet(new Set(['brokenBlade', 'brokenHilt']), new Set(['alGulBlade']), I.sets)).toBeNull();
  });
});

describe('스탯 투자 기록 (LSD-R)', () => {
  it('스탯 카드로 올린 양을 스탯별로 쌓는다', async () => {
    const { applyCard } = await import('../src/systems/cards');
    const { newPlayerState } = await import('../src/core/session');
    const p = newPlayerState(gameData);
    const ctx = { skills: gameData.skills, stats: gameData.stats, baseMaxHp: gameData.player.maxHp };
    const a = applyCard(p, { kind: 'stat', stat: 'agility', amount: 5, grade: 'mid' }, ctx).holder;
    const b = applyCard(a, { kind: 'stat', stat: 'agility', amount: 3, grade: 'low' }, ctx).holder;
    expect(b.statInvest.agility).toBe(8);
    expect(b.statInvest.strength).toBe(0);
  });
});
