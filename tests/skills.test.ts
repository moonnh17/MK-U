import { describe, expect, it } from 'vitest';
import { gameData } from '../src/data/index';
import {
  acquireSkill,
  awakenSkill,
  awakeningReady,
  canAwaken,
  cooldownLeft,
  emptyLoadout,
  equipSkill,
  findSkill,
  levelUpSkill,
  setSkillLevel,
  skillValues,
  storedSkills,
  refundCooldown,
  tickCooldowns,
  type Cooldowns,
  type SkillLoadout,
} from '../src/systems/skills';

const sd = gameData.skills;
const def = (id: string) => findSkill(sd, id);
const ACTIVES = ['magiTurret', 'magiMine', 'antimatterCannon', 'magiField', 'railgun', 'purifyingWings'];

function withActives(n: number): SkillLoadout {
  let lo = emptyLoadout(sd.activeSlots);
  for (const id of ACTIVES.slice(0, n)) lo = acquireSkill(lo, def(id)).loadout;
  return lo;
}

describe('스킬 슬롯: 장착·보관', () => {
  it('액티브는 빈 칸에 자동 장착, 4번째부터 보관', () => {
    const lo = withActives(3);
    expect(lo.active).toEqual(ACTIVES.slice(0, 3));
    const r = acquireSkill(lo, def('railgun'));
    expect(r.equipped).toBe(false);
    expect(r.loadout.active).toEqual(ACTIVES.slice(0, 3));
    expect(storedSkills(r.loadout, sd)).toEqual(['railgun']);
    expect(r.loadout.owned.railgun!.level).toBe(1);
  });

  it('패시브는 1칸, 두 번째 패시브는 보관', () => {
    let lo = emptyLoadout(sd.activeSlots);
    lo = acquireSkill(lo, def('combatDrone')).loadout;
    expect(lo.passive).toBe('combatDrone');
    const r = acquireSkill(lo, def('reductionist'));
    expect(r.equipped).toBe(false);
    expect(r.loadout.passive).toBe('combatDrone');
    expect(storedSkills(r.loadout, sd)).toEqual(['reductionist']);
  });

  it('이미 가진 스킬은 다시 습득하지 않는다', () => {
    const lo = withActives(1);
    expect(() => acquireSkill(lo, def('magiTurret'))).toThrow();
  });

  it('보관 스킬을 찬 칸에 넣으면 원래 스킬이 보관되고, 넣은 스킬은 쿨타임이 처음부터', () => {
    let lo = withActives(4);
    const r = equipSkill(lo, 'magiField', 1, sd);
    lo = r.loadout;
    expect(lo.active[1]).toBe('magiField');
    expect(storedSkills(lo, sd)).toEqual(['magiMine']);
    expect(r.restarted).toEqual(['magiField']);
  });

  it('장착 칸끼리 바꾸면 자리만 바뀌고 쿨타임은 유지', () => {
    const r = equipSkill(withActives(3), 'magiTurret', 2, sd);
    expect(r.loadout.active.slice(0, 3)).toEqual(['antimatterCannon', 'magiMine', 'magiTurret']);
    expect(r.restarted).toEqual([]);
  });

  it('빈 칸에 넣을 수 있다', () => {
    const lo = withActives(1);
    const moved = equipSkill(lo, 'magiTurret', 2, sd).loadout;
    expect(moved.active).toEqual([null, null, 'magiTurret']);
  });

  it('보관 패시브를 패시브 칸에 넣으면 교체되고 레벨은 유지', () => {
    let lo = emptyLoadout(sd.activeSlots);
    lo = acquireSkill(lo, def('combatDrone')).loadout;
    lo = levelUpSkill(lo, 'combatDrone', sd.maxLevel);
    lo = acquireSkill(lo, def('reductionist')).loadout;
    lo = equipSkill(lo, 'reductionist', 'passive', sd).loadout;
    expect(lo.passive).toBe('reductionist');
    expect(storedSkills(lo, sd)).toEqual(['combatDrone']);
    expect(lo.owned.combatDrone!.level).toBe(2);
  });

  it('액티브를 패시브 칸에, 패시브를 액티브 칸에 넣을 수 없다', () => {
    let lo = withActives(1);
    lo = acquireSkill(lo, def('combatDrone')).loadout;
    expect(() => equipSkill(lo, 'magiTurret', 'passive', sd)).toThrow();
    expect(() => equipSkill(lo, 'combatDrone', 0, sd)).toThrow();
  });
});

describe('레벨·각성', () => {
  it('레벨은 최대 3까지', () => {
    let lo = withActives(1);
    lo = levelUpSkill(lo, 'magiTurret', sd.maxLevel);
    lo = levelUpSkill(lo, 'magiTurret', sd.maxLevel);
    expect(lo.owned.magiTurret!.level).toBe(3);
    expect(() => levelUpSkill(lo, 'magiTurret', sd.maxLevel)).toThrow();
  });

  it('각성 조건: Lv3 + 요구 아이템, 중복 각성 불가', () => {
    let lo = withActives(1);
    const turret = def('magiTurret');
    expect(canAwaken(lo, turret, ['extraArms'], sd.maxLevel)).toBe(false);
    lo = setSkillLevel(lo, turret, 3, false);
    expect(canAwaken(lo, turret, [], sd.maxLevel)).toBe(false);
    expect(canAwaken(lo, turret, ['lk99'], sd.maxLevel)).toBe(false);
    expect(canAwaken(lo, turret, ['extraArms'], sd.maxLevel)).toBe(true);
    lo = awakenSkill(lo, 'magiTurret');
    expect(lo.owned.magiTurret!.awakened).toBe(true);
    expect(canAwaken(lo, turret, ['extraArms'], sd.maxLevel)).toBe(false);
    expect(() => awakenSkill(lo, 'magiTurret')).toThrow();
  });

  it('장착하지 않은 스킬도 각성 대상', () => {
    let lo = withActives(5);
    lo = setSkillLevel(lo, def('railgun'), 3, false);
    expect(awakeningReady(lo, sd, ['lk99'])).toEqual(['railgun']);
  });

  it('각성 가능 목록은 오래 가진 순', () => {
    let lo = withActives(3);
    for (const id of ['antimatterCannon', 'magiTurret']) lo = setSkillLevel(lo, def(id), 3, false);
    expect(awakeningReady(lo, sd, ['antimatterSample', 'extraArms'])).toEqual(['magiTurret', 'antimatterCannon']);
  });

  it('수치: 레벨별 값, 각성하면 각성 값과 쿨타임', () => {
    const t = def('magiTurret');
    let lo = withActives(1);
    expect(skillValues(t, lo.owned.magiTurret!).values.lifeSec).toBe(9);
    lo = setSkillLevel(lo, t, 3, false);
    expect(skillValues(t, lo.owned.magiTurret!).values.lifeSec).toBe(24);
    lo = setSkillLevel(lo, t, 3, true);
    const v = skillValues(t, lo.owned.magiTurret!);
    expect(v.cooldownSec).toBe(t.awakening!.cooldownSec);
    expect(v.values.laserDamage).toBe(t.awakening!.values.laserDamage);
  });

  it('디버그 레벨 0은 스킬을 없앤다(칸도 비움)', () => {
    let lo = withActives(2);
    lo = setSkillLevel(lo, def('magiMine'), 0, false);
    expect(lo.owned.magiMine).toBeUndefined();
    expect(lo.active[1]).toBeNull();
  });
});

describe('쿨타임·궁극기 게이지', () => {
  it('쿨타임은 시간이 지나면 0까지 줄어든다', () => {
    let cd: Cooldowns = { a: 1, b: 0.3 };
    cd = tickCooldowns(cd, 0.5);
    expect(cooldownLeft(cd, 'a')).toBeCloseTo(0.5);
    expect(cooldownLeft(cd, 'b')).toBe(0);
    expect(cooldownLeft(cd, 'none')).toBe(0);
  });

  it('쿨타임 환급: 남은 시간에서 빼고, 다 돌려받으면 끝', () => {
    const cd: Cooldowns = { cannon: 9 };
    expect(cooldownLeft(refundCooldown(cd, 'cannon', 5), 'cannon')).toBeCloseTo(4);
    expect(cooldownLeft(refundCooldown({ cannon: 3 }, 'cannon', 5), 'cannon')).toBe(0);
    expect(cd.cannon).toBe(9);
  });

});
