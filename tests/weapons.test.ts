import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import { gameData } from '../src/data/index';
import {
  activeWeapon,
  autoAim,
  canFire,
  gainEnergy,
  gunShots,
  inArc,
  initialSlots,
  otherWeapon,
  dropWeaponAt,
  emptyHanded,
  pickUpWeapon,
  projectilesCut,
  spendEnergy,
  swapWeapon,
} from '../src/systems/weapons';

const weapon = (id: string) => gameData.weapons.weapons.find((w) => w.id === id)!;

describe('무기 2슬롯', () => {
  it('시작은 권총 1자루', () => {
    const s = initialSlots('pistol');
    expect(activeWeapon(s)).toBe('pistol');
    expect(otherWeapon(s)).toBeNull();
  });

  it('두 번째 슬롯이 비어 있으면 교체해도 그대로', () => {
    const s = initialSlots('pistol');
    expect(swapWeapon(s)).toEqual(s);
  });

  it('빈 슬롯이 있으면 주운 무기를 넣고 그 무기를 든다', () => {
    const { slots, dropped } = pickUpWeapon(initialSlots('pistol'), 'shotgun');
    expect(dropped).toBeNull();
    expect(slots.slots).toEqual(['pistol', 'shotgun']);
    expect(activeWeapon(slots)).toBe('shotgun');
  });

  it('E로 두 무기를 오간다', () => {
    const { slots } = pickUpWeapon(initialSlots('pistol'), 'shotgun');
    const a = swapWeapon(slots);
    expect(activeWeapon(a)).toBe('pistol');
    expect(activeWeapon(swapWeapon(a))).toBe('shotgun');
  });

  it('슬롯이 다 찼으면 들고 있던 무기와 교환하고 버린 무기를 돌려준다', () => {
    const full = pickUpWeapon(initialSlots('pistol'), 'shotgun').slots; // 산탄총 들고 있음
    const { slots, dropped } = pickUpWeapon(full, 'longsword');
    expect(dropped).toBe('shotgun');
    expect(slots.slots).toEqual(['pistol', 'longsword']);
    expect(activeWeapon(slots)).toBe('longsword');
  });
});

describe('무기 버리기와 맨손', () => {
  const two = () => pickUpWeapon(initialSlots('pistol'), 'shotgun').slots; // [권총, 산탄총], 산탄총 들고 있음
  it('들고 있던 무기를 버리면 다른 무기를 든다', () => {
    const { slots, dropped } = dropWeaponAt(two(), 1);
    expect(dropped).toBe('shotgun');
    expect(slots.slots).toEqual(['pistol', null]);
    expect(activeWeapon(slots)).toBe('pistol');
  });
  it('들고 있지 않은 무기를 버리면 손은 그대로', () => {
    const { slots, dropped } = dropWeaponAt(two(), 0);
    expect(dropped).toBe('pistol');
    expect(activeWeapon(slots)).toBe('shotgun');
  });
  it('마지막 무기도 버릴 수 있고, 그러면 맨손(주먹)', () => {
    const { slots } = dropWeaponAt(initialSlots('pistol'), 0);
    expect(emptyHanded(slots)).toBe(true);
    expect(activeWeapon(slots)).toBeNull();
    expect(swapWeapon(slots)).toEqual(slots);
  });
  it('맨손에서 주우면 그 무기를 든다', () => {
    const empty = dropWeaponAt(initialSlots('pistol'), 0).slots;
    const { slots, dropped } = pickUpWeapon(empty, 'longsword');
    expect(dropped).toBeNull();
    expect(activeWeapon(slots)).toBe('longsword');
  });
  it('빈 슬롯을 버리면 아무 일도 없다', () => {
    const s = initialSlots('pistol');
    expect(dropWeaponAt(s, 1)).toEqual({ slots: s, dropped: null });
  });
  it('주먹: 에너지 없는 칼, 상점·드롭에 나오지 않는다', () => {
    const f = weapon(gameData.weapons.fistWeapon);
    expect(f).toMatchObject({ category: 'blade', energyCost: 0, droppable: false });
  });
});

describe('에너지', () => {
  it('장검은 에너지 0이라 언제나 쓸 수 있고, 권총은 탄당 1을 쓴다', () => {
    expect(canFire(0, weapon('pistol'))).toBe(false);
    expect(spendEnergy(1, weapon('pistol'))).toBe(0);
    expect(spendEnergy(0, weapon('longsword'))).toBe(0);
  });

  it('산탄총은 에너지를 소모하고, 부족하면 쏠 수 없다', () => {
    const sg = weapon('shotgun');
    expect(spendEnergy(10, sg)).toBe(10 - sg.energyCost);
    expect(spendEnergy(sg.energyCost - 1, sg)).toBeNull();
    expect(canFire(sg.energyCost - 1, sg)).toBe(false);
  });

  it('구슬 획득은 최대치를 넘지 않는다', () => {
    expect(gainEnergy(198, 5, 200)).toBe(200);
    expect(gainEnergy(10, 5, 200)).toBe(15);
  });
});

describe('자동 조준', () => {
  const o = { x: 0, y: 0 };

  it('가장 가까운 적을 노린다', () => {
    const { dir, target } = autoAim(o, [{ x: 100, y: 0 }, { x: 0, y: -30 }, { x: -50, y: 50 }], { x: 1, y: 0 });
    expect(target).toEqual({ x: 0, y: -30 });
    expect(dir.x).toBeCloseTo(0);
    expect(dir.y).toBeCloseTo(-1);
  });

  it('적이 없으면 마지막 조준 방향', () => {
    const { dir, target } = autoAim(o, [], { x: 0, y: 3 });
    expect(target).toBeNull();
    expect(dir).toEqual({ x: 0, y: 1 });
  });
});

describe('공격 패턴', () => {
  it('권총은 1발', () => {
    expect(gunShots(weapon('pistol'), 0, new Rng(1))).toHaveLength(1);
  });

  it('산탄총은 5~7발 부채꼴, 조준 방향을 중심으로 대칭', () => {
    const sg = weapon('shotgun');
    for (let seed = 0; seed < 50; seed++) {
      const shots = gunShots(sg, 1, new Rng(seed));
      expect(shots.length).toBeGreaterThanOrEqual(5);
      expect(shots.length).toBeLessThanOrEqual(7);
      const mean = shots.reduce((s, x) => s + x.angle, 0) / shots.length;
      expect(mean).toBeCloseTo(1);
    }
  });

  it('반원 베기 판정', () => {
    // 오른쪽(0rad)을 보고 180도, 반지름 28
    expect(inArc({ x: 0, y: 0 }, 0, 180, 28, { x: 20, y: 0 })).toBe(true);
    expect(inArc({ x: 0, y: 0 }, 0, 180, 28, { x: 0, y: 20 })).toBe(true); // 경계(90도)
    expect(inArc({ x: 0, y: 0 }, 0, 180, 28, { x: -20, y: 0 })).toBe(false); // 뒤쪽
    expect(inArc({ x: 0, y: 0 }, 0, 180, 28, { x: 40, y: 0 })).toBe(false); // 사거리 밖
    expect(inArc({ x: 0, y: 0 }, 0, 180, 28, { x: 34, y: 0 }, 8)).toBe(true); // 몸통 반지름 포함
  });

  it('장검은 앞쪽의 일반 투사체만 지운다', () => {
    const cut = projectilesCut(weapon('longsword'), { x: 0, y: 0 }, 0, [
      { x: 15, y: 0, cuttable: true },
      { x: -15, y: 0, cuttable: true },
      { x: 10, y: 5, cuttable: false },
    ]);
    expect(cut).toEqual([0]);
    expect(projectilesCut(weapon('pistol'), { x: 0, y: 0 }, 0, [{ x: 5, y: 0, cuttable: true }])).toEqual([]);
  });
});
