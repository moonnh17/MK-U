import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import { gameData } from '../src/data/index';
import { beamEmpowered, beamStacksAfter, collectDebt, needleLinks, rolledEnergyCost } from '../src/systems/weaponMechanics';

const W = (id: string) => gameData.weapons.weapons.find((w) => w.id === id)!;

describe('공간봉합침 연결', () => {
  it('가장 오래된 침부터 가까운 순서로 잇는다', () => {
    const pts = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 10, y: 0 }, { x: 50, y: 0 }];
    expect(needleLinks(pts)).toEqual([[0, 2], [2, 3], [3, 1]]);
  });
  it('침이 하나면 선이 없다', () => {
    expect(needleLinks([{ x: 0, y: 0 }])).toEqual([]);
    expect(needleLinks([{ x: 0, y: 0 }, { x: NaN, y: 0 }])).toEqual([]); // NaN 좌표에도 멈추지 않는다
  });
});

describe('환국의 잔명 충전', () => {
  it('맞힌 사격마다 1, 다섯이면 강화, 강화 사격 뒤 0 (강화 사격은 충전에 안 들어감)', () => {
    let s = 0;
    for (let i = 0; i < 5; i++) s = beamStacksAfter(s, 5, true);
    expect(s).toBe(5);
    expect(beamEmpowered(s, 5)).toBe(true);
    s = beamStacksAfter(s, 5, true);
    expect(s).toBe(0);
  });
  it('빗나간 사격은 충전하지 않는다', () => {
    expect(beamStacksAfter(2, 5, false)).toBe(2);
  });
});

describe('야시장 복제총·체납자의 의수', () => {
  it('에너지 소모는 범위 안에서 무작위', () => {
    const rng = new Rng(3);
    const w = W('bootlegGun');
    const costs = Array.from({ length: 200 }, () => rolledEnergyCost(rng, 1, w.energyRange!));
    expect(Math.min(...costs)).toBeGreaterThanOrEqual(w.energyRange![0]);
    expect(Math.max(...costs)).toBeLessThanOrEqual(w.energyRange![1]);
    expect(new Set(costs).size).toBeGreaterThan(20);
  });
  it('복제총은 MG70보다 피해가 높고 0.5%로 터진다', () => {
    expect(W('bootlegGun').baseDamage).toBeGreaterThan(W('mg70').baseDamage);
    expect(W('bootlegGun').selfDestruct!.chance).toBe(0.005);
  });
  it('징수: 마기 입자가 모자라면 내지 않고 주먹 성능', () => {
    expect(collectDebt(25, 10)).toEqual({ coins: 15, paid: true });
    expect(collectDebt(9, 10)).toEqual({ coins: 9, paid: false });
  });
});

describe('등급 이동', () => {
  it('고대병기의 코어·식광의 핵은 전설로 옮겨도 실제 피해·에너지가 그대로', () => {
    const g = gameData.groupMultipliers.grades;
    const mul = (id: string) => g.find((x) => x.id === id)!;
    for (const [id, dmg, en] of [['ancientCore', 35, 7.5], ['eclipseCore', 50, 7.5]] as const) {
      const w = W(id);
      expect(w.grade).toBe('legendary');
      expect(w.baseDamage * mul('legendary').damageMultiplier).toBeCloseTo(dmg, 1);
      expect(w.energyCost * mul('legendary').energyMultiplier).toBeCloseTo(en, 1);
    }
  });
});

describe('무기 분류·차징 태그', () => {
  const weapons = gameData.weapons.weapons;
  it('모든 무기는 아는 분류가 하나 이상', () => {
    const ids = new Set(gameData.weapons.classes.map((c) => c.id));
    for (const w of weapons) {
      expect(w.classes.length, w.id).toBeGreaterThan(0);
      for (const c of w.classes) expect(ids.has(c), `${w.id}:${c}`).toBe(true);
    }
  });
  it('여러 발 쏘는 무기와 궤도절삭륜은 산탄, 레이저 무기는 레이저', () => {
    for (const w of weapons.filter((x) => x.pattern.kind === 'spread')) expect(w.classes, w.id).toContain('spread');
    expect(W('orbitalDisc').classes).toContain('spread');
    expect(W('orbitalDisc').boomerang!.maxExtraCharges).toBe(1);
    expect(W('hwanRemnant').classes).toContain('laser');
    expect(W('ancientCore').classes).toContain('laser');
  });
  it('차징 무기는 차징 태그', () => {
    for (const w of weapons.filter((x) => x.charge)) expect(w.tags, w.id).toContain('charging');
  });
});

describe('스넬의 법칙·LK-99', () => {
  const item = (id: string) => gameData.items.items.find((x) => x.id === id)!;
  it('스넬의 법칙: 기술 피해 없음, 레이저 튕김 1', () => {
    expect(item('snellLaw').effects.some((e) => e.kind === 'damage')).toBe(false);
    expect(item('snellLaw').effects).toContainEqual({ kind: 'laserBounce', bounces: 1 });
  });
  it('LK-99: 모든 피해 15%, 차징 시간 -10%', () => {
    expect(item('lk99').effects).toContainEqual({ kind: 'damage', scope: 'all', value: 0.15, group: 'damagePct' });
    expect(item('lk99').effects).toContainEqual({ kind: 'chargeTime', value: 0.1, group: 'damagePct' });
  });
});

describe('능력 이름', () => {
  it('능력 이름이 있는 아이템은 능력 설명이 따로 있다 (도감: 일반 능력 아래)', () => {
    const named = gameData.items.items.filter((x) => x.abilityNameKey);
    expect(named.length).toBe(17);
    for (const x of named) expect(x.abilityDescKey, x.id).toBeDefined();
  });
  it('이름 받은 무기 능력', () => {
    for (const id of ['algiebaSling', 'nekkarCleaver', 'argoBanner', 'magiFang', 'zephyr', 'mg70', 'orbitalDisc']) expect(W(id).abilityNameKey, id).toBeDefined();
    expect(W('aviorStaff').signature!.nameKey).toBeDefined();
    expect(W('rasalgethiClub').signature!.nameKey).toBe('weapon.sig.bigSmash');
  });
});
