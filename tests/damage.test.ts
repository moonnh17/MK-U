import { describe, expect, it } from 'vitest';
import { gameData } from '../src/data/index';
import { calcDamage, gradeMultiplier, startingStats, tagMultiplier } from '../src/systems/damage';

const tags = gameData.tags;
const base = () => startingStats(gameData.stats.startValue);

describe('calcDamage 태그 배율', () => {
  it('시작 스탯 10이면 ×1.0', () => {
    expect(calcDamage({ baseDamage: 10, tags: ['physical', 'melee'] }, base(), tags)).toBeCloseTo(10);
    expect(calcDamage({ baseDamage: 10, tags: ['tech', 'ranged'] }, base(), tags)).toBeCloseTo(10);
  });

  it('칼(물리·근접)은 힘을 따른다: 10 초과 1당 +4%', () => {
    const s = { ...base(), strength: 20 };
    expect(calcDamage({ baseDamage: 10, tags: ['physical', 'melee'] }, s, tags)).toBeCloseTo(14);
    // 지능은 칼에 영향 없음
    expect(calcDamage({ baseDamage: 10, tags: ['physical', 'melee'] }, { ...base(), intelligence: 30 }, tags)).toBeCloseTo(10);
  });

  it('총(기술·원거리)은 지능을 따른다', () => {
    const s = { ...base(), intelligence: 15 };
    expect(calcDamage({ baseDamage: 10, tags: ['tech', 'ranged'] }, s, tags)).toBeCloseTo(12);
  });

  it('상한 +150%', () => {
    const s = { ...base(), strength: 100 };
    expect(tagMultiplier(['physical'], s, tags)).toBeCloseTo(2.5);
  });

  it('여러 태그 보정은 더한 뒤 한 번만 곱한다 (+48% +40% → ×1.88)', () => {
    const s = { ...base(), intelligence: 22, magiPower: 20 };
    expect(tagMultiplier(['tech', 'magic', 'ranged'], s, tags)).toBeCloseTo(1.88);
  });

  it('스탯이 10보다 낮아도 감소하지 않는다', () => {
    expect(tagMultiplier(['physical'], { ...base(), strength: 3 }, tags)).toBe(1);
  });

  it('근접·원거리·기타 태그는 이 단계에서 배율이 없다', () => {
    expect(tagMultiplier(['melee', 'ranged', 'buff', 'bleed'], { ...base(), willpower: 40 }, tags)).toBe(1);
  });

  it('같은 태그가 두 번 있어도 한 번만 센다', () => {
    expect(tagMultiplier(['physical', 'physical'], { ...base(), strength: 20 }, tags)).toBeCloseTo(1.4);
  });
});

describe('그룹 배율', () => {
  it('등급 배율을 데이터에서 읽는다', () => {
    expect(gradeMultiplier('common', gameData.groupMultipliers)).toBe(1);
    expect(gradeMultiplier('rare', gameData.groupMultipliers)).toBe(1.2);
    expect(gradeMultiplier('mythic', gameData.groupMultipliers)).toBe(2);
  });
});
