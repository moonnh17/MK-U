import { describe, expect, it } from 'vitest';
import { gameData } from '../src/data/index';
import { calcDamage, gradeMultiplier, tagMultiplier } from '../src/systems/damage';

const tags = gameData.tags;

describe('calcDamage 태그 배율', () => {
  it('증가가 없으면 ×1.0', () => {
    expect(calcDamage({ baseDamage: 10, tags: ['physical', 'melee'] }, {}, tags)).toBeCloseTo(10);
  });

  it('공격의 태그에 맞는 증가만 받는다', () => {
    expect(calcDamage({ baseDamage: 10, tags: ['physical', 'melee'] }, { physical: 0.4, tech: 1 }, tags)).toBeCloseTo(14);
    expect(calcDamage({ baseDamage: 10, tags: ['tech', 'ranged'] }, { tech: 0.2 }, tags)).toBeCloseTo(12);
  });

  it('여러 태그 증가는 더한 뒤 한 번만 곱한다 (+48% +40% → ×1.88)', () => {
    expect(tagMultiplier(['tech', 'magic', 'ranged'], { tech: 0.48, magic: 0.4 }, tags)).toBeCloseTo(1.88);
  });

  it('근접·원거리·기타 태그는 이 단계에서 배율이 없다', () => {
    expect(tagMultiplier(['melee', 'ranged', 'buff', 'bleed'], { melee: 1, buff: 1 }, tags)).toBe(1);
  });

  it('같은 태그가 두 번 있어도 한 번만 센다', () => {
    expect(tagMultiplier(['physical', 'physical'], { physical: 0.4 }, tags)).toBeCloseTo(1.4);
  });
});

describe('그룹 배율', () => {
  it('등급 배율을 데이터에서 읽는다', () => {
    expect(gradeMultiplier('common', gameData.groupMultipliers)).toBe(1);
    expect(gradeMultiplier('rare', gameData.groupMultipliers)).toBe(1.4);
    expect(gradeMultiplier('mythic', gameData.groupMultipliers)).toBe(3);
  });
});
