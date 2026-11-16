import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import { gameData } from '../src/data/index';
import { validateGameData } from '../src/data/validate';
import { skillAllowed } from '../src/systems/advancement';
import { drawSkillCards } from '../src/systems/cards';
import { activeImprint, elementDamageMul, judgeBySlots, staffDamageMul } from '../src/systems/magiMage';
import { awakeningReady, emptyLoadout, equipSkill, findSkill, setSkillLevel, type SkillLoadout } from '../src/systems/skills';
import { tickBurn, applyBurn } from '../src/systems/tags';
import type { BurnRule } from '../src/types/data';

const S = gameData.skills;
const mage = gameData.jobs.jobs.find((j) => j.id === 'magiMage')!;
const scholar = gameData.jobs.jobs.find((j) => j.id === 'magiScholar')!;
const ORDER = mage.advancements.map((a) => a.id) as ['hwigang', 'baekon'];

function loadout(entries: [string, number][]): SkillLoadout {
  let lo = emptyLoadout(S.activeSlots);
  for (const [id, lv] of entries) lo = setSkillLevel(lo, findSkill(S, id), lv, false);
  return lo;
}

describe('마기법사 데이터', () => {
  it('선택할 수 있고, 데이터 검증을 통과한다', () => {
    expect(mage.enabled).toBe(true);
    expect(validateGameData(gameData)).toEqual([]);
  });
  it('휘강파는 보라', () => {
    expect(mage.advancements.find((a) => a.id === 'hwigang')!.color).toBe('#b266ff');
  });
  it('마기법사 액티브는 모두 각인이 있고 Lv1~3 수치를 가진다', () => {
    for (const s of S.skills.filter((x) => x.job === 'magiMage' && x.kind === 'active')) {
      expect(s.imprint, s.id).toBeDefined();
      expect(s.imprint!.levels.length).toBe(S.maxLevel);
    }
  });
  it('각성 없는 스킬도 허용되고 각성 대상이 되지 않는다', () => {
    const lo = loadout([['fireWall', 3], ['teleport', 3]]);
    expect(findSkill(S, 'fireWall').awakening).toBeUndefined();
    expect(awakeningReady(lo, S, gameData.items.items.map((i) => i.id))).toEqual([]);
  });
});

describe('개전 각인', () => {
  it('1번 칸 스킬의 각인만, 레벨별 수치', () => {
    for (const [lv, v] of [[1, 0.15], [2, 0.25], [3, 0.35]] as const) {
      const im = activeImprint(loadout([['fireWall', lv], ['teleport', 1]]), S, mage, null);
      expect(im?.skillId).toBe('fireWall');
      expect(im?.effect).toBe('fireDamage');
      expect(im?.values.fireDamage).toBeCloseTo(v);
    }
  });
  it('칸 순서를 바꾸면 각인도 바뀐다', () => {
    const lo = loadout([['fireWall', 1], ['teleport', 2]]);
    const swapped = equipSkill(lo, 'teleport', 0, S).loadout;
    const im = activeImprint(swapped, S, mage, null);
    expect(im?.skillId).toBe('teleport');
    expect(im?.values.staffDamage).toBeCloseTo(0.25);
  });
  it('1번 칸이 비었거나 각인 없는 스킬(다른 직업)이면 없다', () => {
    expect(activeImprint(emptyLoadout(S.activeSlots), S, mage, null)).toBeNull();
    expect(activeImprint(loadout([['magiTurret', 2], ['fireWall', 3]]), S, mage, 'baekon')).toBeNull();
  });
  it('각인 규칙이 없는 직업은 각인이 없다', () => {
    expect(activeImprint(loadout([['fireWall', 3]]), S, scholar, null)).toBeNull();
  });
  it('계열 공명: 전직 후 자기 학파 스킬이면 +50%', () => {
    const lo = loadout([['fireWall', 3]]);
    expect(activeImprint(lo, S, mage, 'baekon')?.values.fireDamage).toBeCloseTo(0.35 * 1.5);
    expect(activeImprint(lo, S, mage, 'baekon')?.resonance).toBe(true);
    expect(activeImprint(lo, S, mage, 'hwigang')?.values.fireDamage).toBeCloseTo(0.35);
    expect(activeImprint(lo, S, mage, null)?.resonance).toBe(false);
  });
});

describe('작열: 화염 피해 증가는 직접 피해에만', () => {
  it('화염 원소만 오른다', () => {
    const im = activeImprint(loadout([['fireWall', 2]]), S, mage, null);
    expect(elementDamageMul('fire', im)).toBeCloseTo(1.25);
    expect(elementDamageMul('ice', im)).toBe(1);
    expect(elementDamageMul(undefined, im)).toBe(1);
    expect(elementDamageMul('fire', null)).toBe(1);
  });
  it('화상 틱은 각인과 상관없는 고정값 (중첩 × 3)', () => {
    const rule = gameData.tags.tags.find((t) => t.id === 'burn')!.rule as BurnRule;
    const st = applyBurn(null, rule.damagePerStack, 2, rule, false);
    expect(tickBurn(st, 1, rule).damage).toBe(2 * rule.damagePerStack);
  });
});

describe('지팡이 공명', () => {
  it('지팡이 계열 무기만', () => {
    const im = activeImprint(loadout([['teleport', 3]]), S, mage, null);
    expect(staffDamageMul('staff', im)).toBeCloseTo(1.35);
    expect(staffDamageMul('gun', im)).toBe(1);
  });
});

describe('마기법사 전직 판정 (칸 순서)', () => {
  it('1번 칸 스킬의 학파', () => {
    expect(judgeBySlots(loadout([['teleport', 1], ['fireWall', 3]]).active, S, ORDER)).toBe('hwigang');
    expect(judgeBySlots(loadout([['fireWall', 1], ['teleport', 3]]).active, S, ORDER)).toBe('baekon');
  });
  it('1번 칸이 비었거나 학파 스킬이 아니면 2번 → 3번', () => {
    expect(judgeBySlots([null, 'teleport', 'fireWall'], S, ORDER)).toBe('hwigang');
    expect(judgeBySlots(['magiTurret', null, 'fireWall'], S, ORDER)).toBe('baekon');
  });
  it('모두 없으면 직접 선택(null)', () => {
    expect(judgeBySlots([null, null, null], S, ORDER)).toBeNull();
    expect(judgeBySlots(['magiTurret', 'railgun', null], S, ORDER)).toBeNull();
  });
});

describe('마기법사 카드 풀', () => {
  it('전직 전: 백온·휘강만', () => {
    for (const s of S.skills) {
      const ok = skillAllowed(s, mage, null);
      expect(ok, s.id).toBe(s.school === 'baekon' || s.school === 'hwigang');
    }
  });
  it('전직 후: 모든 직업의 스킬(숙련 제외)', () => {
    for (const s of S.skills) expect(skillAllowed(s, mage, 'baekon'), s.id).toBe(s.kind !== 'mastery');
    const seen = new Set<string>();
    for (let seed = 0; seed < 80; seed++) {
      for (const c of drawSkillCards(new Rng(seed), emptyLoadout(S.activeSlots), S, gameData.cards, (id) => skillAllowed(findSkill(S, id), mage, 'hwigang'))) seen.add(findSkill(S, c.skillId).job);
    }
    expect([...seen].sort()).toEqual(['magiMage', 'magiScholar', 'warrior']);
  });
  it('마기학자·전사 카드 풀은 그대로', () => {
    expect(skillAllowed(findSkill(S, 'fireWall'), scholar, null)).toBe(false);
    expect(skillAllowed(findSkill(S, 'fireWall'), scholar, 'hectar')).toBe(false);
    expect(skillAllowed(findSkill(S, 'railgun'), scholar, 'acro')).toBe(false);
  });
});
