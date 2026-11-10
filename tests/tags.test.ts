import { describe, expect, it } from 'vitest';
import { gameData } from '../src/data/index';
import { calcDamage, rangeMultiplier, spaceDamage } from '../src/systems/damage';
import {
  applyBleed,
  applyBurn,
  canAutoCast,
  skillTags,
  tagBadges,
  taggedChance,
  tickBleed,
  tickBurn,
} from '../src/systems/tags';
import type { BleedRule, BurnRule, SpaceRule } from '../src/types/data';

const tags = gameData.tags;
const rule = <T>(id: string) => tags.tags.find((t) => t.id === id)!.rule as T;

describe('피해: 물리·마기·기술 합산 후 근접·원거리 별도 단계', () => {
  it('기술 +50%, 마기 +40% → ×1.90 (더한 뒤 한 번 곱함)', () => {
    expect(calcDamage({ baseDamage: 10, tags: ['tech', 'magic', 'ranged'] }, { tech: 0.5, magic: 0.4 }, tags)).toBeCloseTo(19);
  });

  it('근접·원거리 증가는 별도로 곱한다', () => {
    expect(rangeMultiplier(['melee'], { melee: 0.2, ranged: 0.5 })).toBeCloseTo(1.2);
    expect(rangeMultiplier(['ranged'], { melee: 0.2, ranged: 0.5 })).toBeCloseTo(1.5);
    expect(rangeMultiplier(['physical'], { melee: 0.2, ranged: 0.5 })).toBe(1);
    expect(calcDamage({ baseDamage: 10, tags: ['physical', 'melee'] }, { physical: 0.4 }, tags, { melee: 0.5, ranged: 0 })).toBeCloseTo(21);
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
    const s = { physical: 0.4 };
    // 각성 포탑의 일반 탄환은 물리, 레이저는 기술
    expect(calcDamage({ baseDamage: 10, tags: skillTags(turret, true, 'bigBullet') }, s, tags)).toBeCloseTo(14);
    expect(calcDamage({ baseDamage: 10, tags: skillTags(turret, true, 'laser') }, s, tags)).toBeCloseTo(10);
  });
});

describe('확률: min(상한, 기본)', () => {
  it('상한: 대성공 60%, 실험 성공 98%', () => {
    expect(taggedChance(0.3, 'greatSuccess', tags)).toBeCloseTo(0.3);
    expect(taggedChance(0.7, 'greatSuccess', tags)).toBe(0.6);
    expect(taggedChance(0.99, 'success', tags)).toBe(0.98);
  });
});

describe('차징', () => {
  it('차징은 보정이 없다', () => {
    expect(tags.tags.find((t) => t.id === 'charging')!.rule.kind).toBe('none');
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
it('엘리트도 즉사 (최대 HP만큼), 집행자·집정관 10%', () => {    expect(spaceDamage('elite', 400, 10, r)).toBeGreaterThanOrEqual(400);    expect(spaceDamage('champion', 400, 10, r)).toBeCloseTo(40);  });  it('보스·히든보스는 즉사 없이 피해 ×1.8', () => {    expect(spaceDamage('boss', 1000, 10, r)).toBeCloseTo(18);    expect(spaceDamage('hiddenBoss', 1000, 10, r)).toBeCloseTo(18);  });
});

describe('출혈: 4초 / 1초 간격 / 최대 10중첩 / 재적용 시 갱신', () => {
  const r = rule<BleedRule>('bleed');
  it('중첩은 최대 10, 다시 걸면 지속시간이 갱신된다', () => {
    let s = applyBleed(null, 2, 1, r);
    s = { ...s, remainingSec: 1 };
    s = applyBleed(s, 2, 15, r);
    expect(s.stacks).toBe(10);
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

describe('화상: 지속시간 없음 / 중첩 상한 (보스 따로)', () => {
  const r = rule<BurnRule>('burn');
  it('일반 적은 크게, 보스는 bossMaxStacks까지만 쌓인다', () => {
    expect(applyBurn(applyBurn(null, 1, 30, r, false), 1, 30, r, false).stacks).toBe(Math.min(60, r.maxStacks));
    expect(applyBurn(applyBurn(null, 1, 8, r, true), 1, 8, r, true).stacks).toBe(r.bossMaxStacks);
  });
  it('틱 피해는 센 쪽을 남긴다', () => {
    expect(applyBurn(applyBurn(null, 3, 1, r, false), 1, 1, r, false).damagePerStack).toBe(3);
  });
  it('끝나지 않고 간격마다 중첩 × 피해', () => {
    let s = applyBurn(null, 2, 3, r, false);
    let total = 0;
    for (let i = 0; i < 100; i++) {
      const out = tickBurn(s, 0.1, r);
      total += out.damage;
      s = out.state;
    }
    expect(total).toBeCloseTo(2 * 3 * (10 / r.tickIntervalSec));
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

describe('출혈·화상 고정 피해 (사용자 지정)', () => {
  it('출혈 5, 화상 3, 최대 중첩 모두 10', () => {
    const b = rule<BleedRule>('bleed');
    const f = rule<BurnRule>('burn');
    expect([b.damagePerStack, f.damagePerStack]).toEqual([5, 3]);
    expect([b.maxStacks, f.maxStacks, f.bossMaxStacks]).toEqual([10, 10, 10]);
  });
  it('설명에 쓰는 데이터 값도 고정값과 같다 (0은 출혈 없음)', () => {
    const b = rule<BleedRule>('bleed').damagePerStack;
    const f = rule<BurnRule>('burn').damagePerStack;
    const vals = gameData.skills.skills.flatMap((s) => [...s.levels.map((l) => l.values), s.awakening?.values ?? {}]);
    for (const v of vals) {
      if (v.bleedDamage) expect(v.bleedDamage).toBe(b);
      if (v.burnDamage) expect(v.burnDamage).toBe(f);
    }
    for (const it of gameData.items.items)
      for (const e of it.effects) {
        if (e.kind === 'meleeBleed') expect(e.damage).toBe(b);
        if (e.kind === 'meleeBurn') expect(e.damage).toBe(f);
      }
    for (const w of gameData.weapons.weapons) if (w.bleed) expect(w.bleed.base).toBe(b);
  });
});
