import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import { gameData } from '../src/data/index';
import { validateGameData } from '../src/data/validate';
import { canBuy, merchantStock, rollEncounter, rollGrade, rollOptions, rollWeapon } from '../src/systems/loot';
import { plainWeapon, rollCrit, weaponStats } from '../src/systems/weapons';
import type { EncounterKindId } from '../src/types/data';

const W = gameData.weapons;
const L = gameData.loot;
const G = gameData.groupMultipliers;
const def = (id: string) => W.weapons.find((w) => w.id === id)!;

describe('무기 종류 (기획서 무기 표)', () => {
  it('총 6종·칼 5종 + 신궁 환디', () => {
    const by = (c: string) => W.weapons.filter((w) => w.category === c && w.droppable).map((w) => w.id).sort();
    expect(by('gun')).toEqual(['beamSmg', 'grenadeLauncher', 'piercingRifle', 'pistol', 'rifle', 'shotgun', 'smg', 'sniper']);
    expect(by('blade')).toEqual(['brokenBlade', 'crusherHammer', 'dagger', 'greatsword', 'hammer', 'hanabi', 'longsword', 'spear', 'thunderDagger']);
    const handi = def('handi');
    expect(handi.grade).toBe('mythic');
    expect(handi.droppable).toBe(false);
    expect(handi.tags).toEqual(['physical', 'ranged']);
    expect(handi.equipBonus).toEqual({ stats: { strength: 30 }, rangedDamage: 3 });
  });
  it('칼은 에너지를 쓰지 않고, 권총·단검·장검·대검·창·해머는 0', () => {
    for (const w of W.weapons.filter((x) => x.category === 'blade')) expect(w.energyCost).toBe(0);
    expect(def('pistol').energyCost).toBe(1);
  });
});

describe('등급·신화', () => {
  it('가중치대로 뽑고, 신화는 고정 확률로 따로', () => {
    const count: Record<string, number> = {};
    const r = new Rng(3);
    for (let i = 0; i < 4000; i++) {
      const g = rollGrade(r, { rare: 60, legendary: 35, unique: 5 }, 0.001);
      count[g] = (count[g] ?? 0) + 1;
    }
    expect(count.common).toBeUndefined();
    expect(count.rare! / 4000).toBeGreaterThan(0.55);
    expect(count.unique! / 4000).toBeLessThan(0.08);
    expect(rollGrade(new Rng(1), { common: 1 }, 1)).toBe('mythic');
  });

  it('신화 판정이 나면 신궁 환디', () => {
    expect(rollWeapon(new Rng(1), 'mythic', W.weapons, W.options, G, 'legendary').defId).toBe('handi');
  });

  it('유니크는 드롭 유니크 무기 4종 중 하나, 옵션 없음', () => {
    const seen = new Set<string>();
    for (let s = 0; s < 200; s++) {
      const w = rollWeapon(new Rng(s), 'unique', W.weapons, W.options, G, L.uniqueWeaponFallback);
      expect(w.grade).toBe('unique');
      expect(def(w.defId).grade).toBe('unique');
      expect(def(w.defId).droppable).toBe(true);
      expect(w.options).toEqual([]);
      seen.add(w.defId);
    }
    expect([...seen].sort()).toEqual(['beamSmg', 'crusherHammer', 'piercingRifle', 'thunderDagger']);
  });

  it('옵션: 레어 1개·전설 2개, 서로 다르고 분류에 맞는 것만', () => {
    for (let s = 0; s < 40; s++) {
      const r = rollWeapon(new Rng(s), 'rare', W.weapons, W.options, G, 'legendary');
      expect(r.options).toHaveLength(1);
      const l = rollWeapon(new Rng(s), 'legendary', W.weapons, W.options, G, 'legendary');
      expect(new Set(l.options.map((o) => o.id)).size).toBe(l.options.length);
      expect(l.options.length).toBe(2);
      const c = rollWeapon(new Rng(s), 'common', W.weapons, W.options, G, 'legendary');
      expect(c.options).toEqual([]);
    }
    // 칼에는 탄속·에너지 옵션이 붙지 않는다
    for (let s = 0; s < 40; s++) {
      for (const o of rollOptions(new Rng(s), def('longsword'), 2, W.options)) expect(['crit', 'attackSpeed']).toContain(o.id);
      // 에너지를 쓰지 않는 무기에는 에너지 감소가 붙지 않는다
      for (const o of rollOptions(new Rng(s), { ...def('pistol'), energyCost: 0 }, 3, W.options)) expect(o.id).not.toBe('energyCost');
    }
  });
});

describe('무기 수치', () => {
  it('등급 배율과 옵션을 반영한다', () => {
    const d = def('rifle');
    const s = weaponStats(d, { defId: 'rifle', grade: 'legendary', options: [{ id: 'attackSpeed', value: 0.25 }, { id: 'crit', value: 0.1 }] }, 1.45);
    expect(s.damage).toBeCloseTo(5 * 1.45);
    expect(s.fireIntervalSec).toBeCloseTo(0.22 / 1.25);
    expect(s.critChance).toBeCloseTo(0.1);
    const e = weaponStats(def('sniper'), { defId: 'sniper', grade: 'rare', options: [{ id: 'energyCost', value: 1 }] }, 1.2);
    expect(e.energyCost).toBe(3);
    const p = weaponStats(def('pistol'), plainWeapon(def('pistol')), 1);
    expect(p).toMatchObject({ damage: 4, energyCost: 1, critChance: 0 });
  });
  it('치명은 확률로 ×1.5', () => {
    expect(rollCrit(new Rng(1), 10, 1, W.critMultiplier)).toEqual({ damage: 15, crit: true });
    expect(rollCrit(new Rng(1), 10, 0, W.critMultiplier)).toEqual({ damage: 10, crit: false });
  });
});

describe('조우 칸', () => {
  const all = new Set<EncounterKindId>(['treasure', 'merchant', 'skillShop', 'statShop', 'raid', 'magiSpire', 'hiddenBoss']);
  it('기획서 확률: 보물 20·상인 16·스킬 상점 10·스탯 상점 10·습격 25·첨탑 18.5·히든보스 0.5', () => {
    expect(L.encounter.weights).toEqual({ treasure: 20, merchant: 16, skillShop: 10, statShop: 10, raid: 25, magiSpire: 18.5, hiddenBoss: 0.5 });
    const count: Record<string, number> = {};
    const r = new Rng(9);
    for (let i = 0; i < 5000; i++) {
      const k = rollEncounter(r, L.encounter.weights, all);
      count[k] = (count[k] ?? 0) + 1;
    }
    expect(count.treasure! / 5000).toBeCloseTo(0.2, 1);
    expect(count.hiddenBoss! / 5000).toBeLessThan(0.03);
  });
  it('아직 없는 유형은 빼고 뽑는다', () => {
    const only = new Set<EncounterKindId>(['treasure', 'merchant']);
    for (let s = 0; s < 50; s++) expect(['treasure', 'merchant']).toContain(rollEncounter(new Rng(s), L.encounter.weights, only));
  });
  it('같은 시드면 같은 유형', () => {
    expect(rollEncounter(new Rng(77), L.encounter.weights, all)).toBe(rollEncounter(new Rng(77), L.encounter.weights, all));
  });
});

describe('상인', () => {
  it('무기 3개, 등급별 가격', () => {
    const stock = merchantStock(new Rng(4), L, W.weapons, W.options, G);
    expect(stock).toHaveLength(3);
    for (const s of stock) expect(s.price).toBe(L.merchant.prices[s.weapon.grade]);
  });
  it('코인이 모자라거나 이미 팔렸으면 못 산다', () => {
    const item = { weapon: plainWeapon(def('rifle')), price: 30, sold: false };
    expect(canBuy(29.9, item)).toBe(false);
    expect(canBuy(30, item)).toBe(true);
    expect(canBuy(99, { ...item, sold: true })).toBe(false);
  });
});

describe('데이터 검증', () => {
  it('현재 데이터는 오류가 없다', () => {
    expect(validateGameData(gameData)).toEqual([]);
  });
});
