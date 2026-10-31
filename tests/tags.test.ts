import { describe, expect, it } from 'vitest';
import { gameData } from '../src/data/index';
import { calcDamage, rangeMultiplier, spaceDamage, startingStats } from '../src/systems/damage';
import { addStat, maxHpFor, statEffect } from '../src/systems/stats';
import {
  applyBleed,
  buffDuration,
  canAutoCast,
  skillTags,
  tagBadges,
  taggedChance,
  tickBleed,
} from '../src/systems/tags';
import type { BleedRule, SpaceRule } from '../src/types/data';

const tags = gameData.tags;
const base = () => startingStats(gameData.stats.startValue);
const rule = <T>(id: string) => tags.tags.find((t) => t.id === id)!.rule as T;

describe('피해: 물리·마기·기술 합산 후 근접·원거리 별도 단계', () => {
  it('기술 +50%, 마기 +40% → ×1.90 (더한 뒤 한 번 곱함)', () => {
    const s = { ...base(), intelligence: 22.5, magiPower: 20 };
    expect(calcDamage({ baseDamage: 10, tags: ['tech', 'magic', 'ranged'] }, s, tags)).toBeCloseTo(19);
  });

  it('근접·원거리 증가는 별도로 곱한다', () => {
    expect(rangeMultiplier(['melee'], { melee: 0.2, ranged: 0.5 })).toBeCloseTo(1.2);
    expect(rangeMultiplier(['ranged'], { melee: 0.2, ranged: 0.5 })).toBeCloseTo(1.5);
    expect(rangeMultiplier(['physical'], { melee: 0.2, ranged: 0.5 })).toBe(1);
    const s = { ...base(), strength: 20 };
    expect(calcDamage({ baseDamage: 10, tags: ['physical', 'melee'] }, s, tags, { melee: 0.5, ranged: 0 })).toBeCloseTo(21);
  });

  it('부모 스킬이 아니라 실제 공격(source)의 태그를 본다', () => {
    const wings = gameData.skills.skills.find((x) => x.id === 'purifyingWings')!;
    // 출혈 공격은 물리·출혈, 근접 없음
    expect(skillTags(wings, true, 'bleed')).toEqual(['physical', 'bleed']);
    expect(skillTags(wings, true, 'bleed')).not.toContain('melee');
    // 표시 태그: 각성 전·후
    expect(skillTags(wings, false)).toEqual(['physical', 'melee']);
    expect(skillTags(wings, true)).toEqual(['physical', 'melee', 'bleed']);
    const turret = gameData.skills.skills.find((x) => x.id === 'magiTurret')!;
    const s = { ...base(), strength: 20, intelligence: 10 };
    // 각성 포탑의 일반 탄환은 물리 → 힘 보정, 레이저는 기술 → 지능 보정
    expect(calcDamage({ baseDamage: 10, tags: skillTags(turret, true, 'bigBullet') }, s, tags)).toBeCloseTo(14);
    expect(calcDamage({ baseDamage: 10, tags: skillTags(turret, true, 'laser') }, s, tags)).toBeCloseTo(10);
  });
});

describe('확률: min(상한, 기본 × 1.03^(지능−10))', () => {
  it('지능 10이면 기본값 그대로', () => {
    expect(taggedChance(0.3, 'greatSuccess', base(), tags)).toBeCloseTo(0.3);
  });

  it('지능 20이면 × 1.03^10', () => {
    expect(taggedChance(0.3, 'greatSuccess', { ...base(), intelligence: 20 }, tags)).toBeCloseTo(0.3 * 1.03 ** 10);
  });

  it('상한: 대성공 60%, 실험 성공 98%', () => {
    const s = { ...base(), intelligence: 80 };
    expect(taggedChance(0.3, 'greatSuccess', s, tags)).toBe(0.6);
    expect(taggedChance(0.5, 'success', s, tags)).toBe(0.98);
  });
});

describe('차징·버프 지속', () => {
  it('차징은 스탯 보정이 없다', () => {
    expect(tags.tags.find((t) => t.id === 'charging')!.rule.kind).toBe('none');
  });

  it('버프: 정신력 10 초과 1당 +3%, 상한 +90%, 버프 태그가 있을 때만', () => {
    expect(buffDuration(10, ['buff'], { ...base(), willpower: 20 }, tags)).toBeCloseTo(13);
    expect(buffDuration(10, ['buff'], { ...base(), willpower: 99 }, tags)).toBeCloseTo(19);
    expect(buffDuration(10, ['tech'], { ...base(), willpower: 20 }, tags)).toBe(10);
  });
});

describe('근접 발동 조건', () => {
  const origin = { x: 0, y: 0 };
  it('근접 스킬은 사거리 안에 적이 있어야 한다 (적 몸 반지름 포함)', () => {
    expect(canAutoCast(['physical', 'melee'], 40, origin, [])).toBe(false);
    expect(canAutoCast(['physical', 'melee'], 40, origin, [{ x: 60, y: 0, radius: 4 }])).toBe(false);
    expect(canAutoCast(['physical', 'melee'], 40, origin, [{ x: 43, y: 0, radius: 4 }])).toBe(true);
  });
  it('근접이 아니면 적이 없어도 발동한다', () => {
    expect(canAutoCast(['tech', 'ranged'], 40, origin, [])).toBe(true);
  });
});

describe('공간격', () => {
  const r = rule<SpaceRule>('space');
  it('일반 몬스터는 즉사 (최대 체력만큼)', () => {
    expect(spaceDamage('normal', 300, 10, r)).toBeGreaterThanOrEqual(300);
  });
  it('엘리트 최대 HP 25%, 집행자·집정관 10%', () => {
    expect(spaceDamage('elite', 400, 10, r)).toBeCloseTo(100);
    expect(spaceDamage('champion', 400, 10, r)).toBeCloseTo(40);
  });
  it('보스·히든보스는 즉사 없이 피해 ×2.4', () => {
    expect(spaceDamage('boss', 1000, 10, r)).toBeCloseTo(24);
    expect(spaceDamage('hiddenBoss', 1000, 10, r)).toBeCloseTo(24);
  });
});

describe('출혈: 4초 / 1초 간격 / 최대 3중첩 / 재적용 시 갱신', () => {
  const r = rule<BleedRule>('bleed');
  it('중첩은 최대 3, 다시 걸면 지속시간이 갱신된다', () => {
    let s = applyBleed(null, 2, 1, r);
    s = { ...s, remainingSec: 1 };
    s = applyBleed(s, 2, 5, r);
    expect(s.stacks).toBe(3);
    expect(s.remainingSec).toBe(4);
  });
  it('1초마다 중첩 × 피해를 주고 4초 뒤 끝난다', () => {
    let s: ReturnType<typeof applyBleed> | null = applyBleed(null, 2, 2, r);
    let total = 0;
    for (let i = 0; i < 50 && s; i++) {
      const out = tickBleed(s, 0.1, r);
      total += out.damage;
      s = out.state;
    }
    expect(s).toBeNull();
    expect(total).toBeCloseTo(2 * 2 * 4);
  });
});

describe('태그 배지', () => {
  it('태그 데이터의 이름 키·색을 쓴다', () => {
    expect(tagBadges(['physical', 'melee'], tags)).toEqual([
      { id: 'physical', nameKey: 'tag.physical', color: '#d9663b' },
      { id: 'melee', nameKey: 'tag.melee', color: '#c88f7f' },
    ]);
  });
});

describe('스탯 효과 (임시 수치)', () => {
  const sd = gameData.stats;
  it('시작 스탯 10이면 효과 0', () => {
    for (const id of ['maxHp', 'moveSpeed', 'skillArea', 'energyGain'] as const) {
      expect(statEffect(id, base(), sd)).toBe(0);
    }
  });
  it('견고: 최대 체력만 늘린다', () => {
    expect(maxHpFor(100, { ...base(), toughness: 20 }, sd)).toBe(120);
    expect(Object.keys(sd.effects).filter((k) => sd.effects[k as keyof typeof sd.effects].stat === 'toughness')).toEqual(['maxHp']);
  });
  it('민첩: 이동속도, 마기력: 스킬 범위·에너지 획득량', () => {
    expect(statEffect('moveSpeed', { ...base(), agility: 20 }, sd)).toBeCloseTo(0.15);
    expect(statEffect('skillArea', { ...base(), magiPower: 20 }, sd)).toBeCloseTo(0.2);
    expect(statEffect('energyGain', { ...base(), magiPower: 20 }, sd)).toBeCloseTo(0.3);
  });
  it('견고가 오르면 늘어난 최대 체력만큼 체력도 오른다', () => {
    const p = { stats: base(), hp: 50, maxHp: 100 };
    const out = addStat(p, 'toughness', 5, 100, sd);
    expect(out.stats.toughness).toBe(15);
    expect(out.maxHp).toBe(110);
    expect(out.hp).toBe(60);
    // 다른 스탯은 체력에 영향 없음
    expect(addStat(p, 'strength', 5, 100, sd)).toMatchObject({ hp: 50, maxHp: 100 });
  });
});
