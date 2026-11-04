import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import { gameData as D } from '../src/data/index';
import { gradeRates, itemChance, itemSources, pct, weaponChance, weaponSources } from '../src/systems/dropRates';
import { rollItem } from '../src/systems/items';
import { rollChestTier, rollGrade, rollWeapon } from '../src/systems/loot';
import { chapterWeights } from '../src/systems/items';

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

describe('획득 확률', () => {
  it('등급 확률: 가중치 비율 × (1 − 신화), 신화는 고정, 합은 1', () => {
    const r = gradeRates({ common: 75, rare: 25 }, 0.001);
    expect(r.common).toBeCloseTo(0.75 * 0.999);
    expect(r.mythic).toBeCloseTo(0.001);
    expect(sum(Object.values(r))).toBeCloseTo(1);
  });
  it('출처마다 일반 풀 아이템 확률의 합은 1, 무기 확률의 합도 1', () => {
    for (const s of itemSources(D)) expect(sum(D.items.items.map((x) => itemChance(D, x.id, s.rates)))).toBeCloseTo(1);
    for (const s of weaponSources(D)) expect(sum(D.weapons.weapons.map((w) => weaponChance(D, w.id, s.rates)))).toBeCloseTo(1);
  });
  it('보스·히든보스·세트 아이템은 상자에서 나오지 않는다', () => {
    const rates = itemSources(D)[0]!.rates;
    for (const x of D.items.items.filter((i) => i.pool !== 'normal')) expect(itemChance(D, x.id, rates)).toBe(0);
  });
  it('실제 뽑기와 맞는다 (아이템·무기 4만 번)', () => {
    const n = 40000;
    const src = itemSources(D)[0]!;
    const rng = new Rng(7);
    const target = D.items.items.find((x) => x.pool === 'normal' && x.grade === 'rare')!.id;
    let hit = 0;
    for (let i = 0; i < n; i++) if (rollItem(rng, D.items.treasureWeights['1']!, D.loot.mythicChance, D.items, new Set()) === target) hit++;
    expect(hit / n).toBeCloseTo(itemChance(D, target, src.rates), 2);

    const w = D.weapons.weapons.find((x) => x.droppable && x.grade === 'rare')!.id;
    const weights = D.loot.bossWeaponChest;
    const rates = gradeRates(weights, D.loot.mythicChance);
    let wh = 0;
    for (let i = 0; i < n; i++) {
      const g = rollGrade(rng, weights, D.loot.mythicChance);
      if (rollWeapon(rng, g, D.weapons.weapons, D.weapons.options, D.groupMultipliers, D.loot.uniqueWeaponFallback).defId === w) wh++;
    }
    expect(wh / n).toBeCloseTo(weaponChance(D, w, rates), 2);
  });
  it('시작 무기 상자에서는 부러진 칼날이 나오지 않는다', () => {
    const start = weaponSources(D)[0]!;
    expect(weaponChance(D, 'brokenBlade', start.rates, start.exclude)).toBe(0);
    const rng = new Rng(3);
    for (let i = 0; i < 300; i++) expect(rollWeapon(rng, 'common', D.weapons.weapons, D.weapons.options, D.groupMultipliers, D.loot.uniqueWeaponFallback, D.loot.startChestExclude).defId).not.toBe('brokenBlade');
  });
  it('퍼센트 표기는 작은 값도 0으로 보이지 않는다', () => {
    expect(pct(0.25)).toBe('25%');
    expect(pct(0.0123)).toBe('1.23%');
    expect(pct(0.00025)).toBe('0.025%');
    expect(pct(0)).toBe('0%');
  });
});
describe('등급표', () => {
  it('모든 출처의 등급표 몫은 정수 %', () => {
    for (const s of [...itemSources(D), ...weaponSources(D)])
      for (const v of Object.values(s.shares)) expect(Number.isInteger(Math.round(v * 1e6) / 1e4), s.key).toBe(true);
  });
});

describe('무기 상자 등급', () => {
  const L = D.loot;
  const share = (ch: number, legendary = 0) => {
    const rng = new Rng(ch * 31 + 1);
    const n: Record<string, number> = {};
    for (let i = 0; i < 20000; i++) {
      const t = rollChestTier(rng, chapterWeights(L.combatChestTiers, ch), legendary);
      n[t] = (n[t] ?? 0) + 1;
    }
    return (t: string) => (n[t] ?? 0) / 20000;
  };
  it('1장 일반 90·고급 10 / 2장 고급 80·일반 10·최고급 10 / 3장 최고급 90·일반 10', () => {
    expect(L.combatChestTiers).toEqual({ '1': { basic: 90, advanced: 10 }, '2': { basic: 10, advanced: 80, supreme: 10 }, '3': { basic: 10, supreme: 90 } });
    const s1 = share(1);
    expect(s1('basic')).toBeCloseTo(0.9, 1);
    expect(s1('supreme')).toBe(0);
  });
  it('일반·고급 상자는 아이템 상자 1·2장 표, 최고급은 3장 표보다 전설·유니크가 높다', () => {
    const t = L.weaponChestTiers;
    expect([t.basic.weights, t.advanced.weights]).toEqual([1, 2].map((ch) => chapterWeights(D.items.treasureWeights, ch)));
    const ch3 = chapterWeights(D.items.treasureWeights, 3);
    expect(t.supreme.weights.legendary!).toBeGreaterThan(ch3.legendary!);
    expect(t.supreme.weights.unique!).toBeGreaterThan(ch3.unique!);
  });
  it('전설 상자: 전설·유니크가 최고급보다 높다, 습격 확률은 장마다 오른다', () => {
    const { legendary, supreme } = L.weaponChestTiers;
    expect(legendary.weights.legendary!).toBeGreaterThan(supreme.weights.legendary!);
    expect(legendary.weights.unique!).toBeGreaterThan(supreme.weights.unique!);
    expect([1, 2, 3].map((ch) => chapterWeights(L.raidLegendaryChestChance, ch))).toEqual([0.1, 0.2, 0.3]);
    expect(share(1, 0.1)('legendary')).toBeCloseTo(0.1, 1);
  });
});
