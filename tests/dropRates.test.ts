import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import { gameData as D } from '../src/data/index';
import { gradeRates, itemChance, itemSources, pct, weaponChance, weaponSources } from '../src/systems/dropRates';
import { rollItem } from '../src/systems/items';
import { rollGrade, rollWeapon } from '../src/systems/loot';

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
    for (let i = 0; i < n; i++) if (rollItem(rng, D.items.treasureWeights, D.loot.mythicChance, D.items, new Set()) === target) hit++;
    expect(hit / n).toBeCloseTo(itemChance(D, target, src.rates), 2);

    const w = D.weapons.weapons.find((x) => x.droppable && x.grade === 'rare')!.id;
    const weights = D.loot.weaponChest['5']!;
    const rates = gradeRates(weights, D.loot.mythicChance);
    let wh = 0;
    for (let i = 0; i < n; i++) {
      const g = rollGrade(rng, weights, D.loot.mythicChance);
      if (rollWeapon(rng, g, D.weapons.weapons, D.weapons.options, D.groupMultipliers, D.loot.uniqueWeaponFallback).defId === w) wh++;
    }
    expect(wh / n).toBeCloseTo(weaponChance(D, w, rates), 2);
  });
  it('퍼센트 표기는 작은 값도 0으로 보이지 않는다', () => {
    expect(pct(0.25)).toBe('25%');
    expect(pct(0.0123)).toBe('1.23%');
    expect(pct(0.00025)).toBe('0.025%');
    expect(pct(0)).toBe('0%');
  });
});
