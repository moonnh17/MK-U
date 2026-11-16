import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import { gameData } from '../src/data/index';
import { validateGameData } from '../src/data/validate';
import { skillAllowed } from '../src/systems/advancement';
import { drawSkillCards } from '../src/systems/cards';
import { activeImprint, addElement, castBoost, chargeAfterMove, concertFull, condenseFill, elementDamageMul, executable, frostHit, imprintMods, judgeBySlots, slowAmount, staffDamageMul, willCopies } from '../src/systems/magiMage';
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

describe('백온파: 서리·둔화', () => {
  it('냉기 피해마다 서리 중첩, 3중첩이면 빙결하고 비운다', () => {
    let st = frostHit(null, 3, 3);
    expect(st).toEqual({ state: { stacks: 1, leftSec: 3 }, freeze: false });
    st = frostHit(st.state, 3, 3);
    expect(st.state?.stacks).toBe(2);
    st = frostHit(st.state, 3, 3);
    expect(st).toEqual({ state: null, freeze: true });
  });
  it('시간이 다 된 중첩은 처음부터', () => {
    expect(frostHit({ stacks: 2, leftSec: 0 }, 3, 3).state?.stacks).toBe(1);
  });
  it('감속은 가장 센 것 + 한파, 상한', () => {
    expect(slowAmount([0.3, 0.1], 0.15, 0.8)).toBeCloseTo(0.45);
    expect(slowAmount([0.7], 0.2, 0.8)).toBeCloseTo(0.8);
    expect(slowAmount([], 0, 0.8)).toBe(0);
  });
  it('빙창·얼음 보주는 냉기, 화염구는 화염, 뇌격은 번개, 원소 가호는 원소 없음', () => {
    expect(['fireball', 'fireWall', 'iceSpear', 'iceOrb', 'chainLightning', 'elementWard'].map((id) => findSkill(S, id).element)).toEqual(['fire', 'fire', 'ice', 'ice', 'lightning', undefined]);
  });
});

describe('백온파: 대전·원소 순환', () => {
  const spark = activeImprint(loadout([['chainLightning', 3]]), S, mage, null);
  const cycle = { damage: 0.18, windowSec: 3 };
  it('이동한 거리만큼 충전, 가득 차면 멈춘다', () => {
    expect(chargeAfterMove(0, 180, 360)).toBeCloseTo(0.5);
    expect(chargeAfterMove(0.9, 360, 360)).toBe(1);
  });
  it('대전: 충전 비율만큼 피해, 가득 차면 연쇄 +2', () => {
    expect(castBoost(0.5, spark, null, 'fire', null)).toEqual({ mul: 1.2, chains: 1, windowSec: 3 });
    expect(castBoost(1, spark, null, 'fire', null)?.chains).toBe(2);
    expect(castBoost(0, spark, null, 'fire', null)).toBeNull();
  });
  it('원소 순환: 앞서 쓴 원소와 다를 때만', () => {
    expect(castBoost(0, null, cycle, 'ice', 'fire')?.mul).toBeCloseTo(1.18);
    expect(castBoost(0, null, cycle, 'fire', 'fire')).toBeNull();
    expect(castBoost(0, null, cycle, 'fire', null)).toBeNull();
    expect(castBoost(0, null, cycle, undefined, 'fire')).toBeNull();
  });
  it('둘이 겹치면 곱한다', () => {
    expect(castBoost(1, spark, cycle, 'ice', 'fire')?.mul).toBeCloseTo(1.4 * 1.18);
  });
});

describe('원소 대합주', () => {
  it('세 원소를 모두 써야 최대 강화', () => {
    let used = addElement([], 'fire');
    used = addElement(used, 'fire');
    expect(used).toEqual(['fire']);
    expect(concertFull(used)).toBe(false);
    used = addElement(addElement(used, 'ice'), 'lightning');
    expect(concertFull(used)).toBe(true);
    expect(addElement(used, undefined)).toEqual(used);
  });
});

describe('휘강파: 응축·과잉 전개·극단', () => {
  it('응축은 시간과 순수 전개 피해로 차고 1에서 멈춘다', () => {
    expect(condenseFill(0, 4, 8)).toBeCloseTo(0.5);
    expect(condenseFill(0.5, 0, 0, 50, 0.005)).toBeCloseTo(0.75);
    expect(condenseFill(0.9, 8, 8)).toBe(1);
  });
  it('응축 각인: 게이지 비율만큼 다음 스킬 피해', () => {
    const im = activeImprint(loadout([['magiCondenser', 2]]), S, mage, null);
    expect(castBoost(1, im, null, undefined, null)).toEqual({ mul: 1.45, chains: 0, windowSec: 3 });
    expect(castBoost(0.5, im, null, undefined, null)?.mul).toBeCloseTo(1.225);
  });
  it('과잉 전개: 재사용 대기 빨리 + 받는 피해, 극단: 받는 피해', () => {
    expect(imprintMods(activeImprint(loadout([['magiBolt', 3]]), S, mage, null))).toEqual({ cooldownRate: 0.25, damageTaken: 0.2 });
    expect(imprintMods(activeImprint(loadout([['magiPillar', 1]]), S, mage, null))).toEqual({ damageTaken: 0.2 });
    expect(imprintMods(null)).toEqual({});
  });
  it('계열 공명이면 과잉 전개 수치도 +50% (받는 피해는 고정)', () => {
    const m = imprintMods(activeImprint(loadout([['magiBolt', 2]]), S, mage, 'hwigang'));
    expect(m.cooldownRate).toBeCloseTo(0.3);
    expect(m.damageTaken).toBe(0.2);
  });
});

describe('슬픈 처형·집행 의지체', () => {
  it('처형은 체력이 낮은 일반·엘리트만', () => {
    expect(executable('normal', 20, 100, 0.3)).toBe(true);
    expect(executable('elite', 30, 100, 0.3)).toBe(true);
    expect(executable('normal', 31, 100, 0.3)).toBe(false);
    for (const r of ['champion', 'boss', 'hiddenBoss']) expect(executable(r, 1, 100, 0.3)).toBe(false);
  });
  it('의지체는 마기법사 액티브만 따라 쓴다 (순간이동·원소 가호·집행 의지체 제외)', () => {
    const ex = ['teleport', 'elementWard', 'executionWill'];
    expect(willCopies(findSkill(S, 'fireball'), ex)).toBe(true);
    expect(willCopies(findSkill(S, 'magiBurst'), ex)).toBe(true);
    for (const id of ex) expect(willCopies(findSkill(S, id), ex)).toBe(false);
    expect(willCopies(findSkill(S, 'magiTurret'), ex)).toBe(false);
    expect(willCopies(findSkill(S, 'pureUnfolding'), ex)).toBe(false);
  });
  it('집행 의지체 레벨: 1기 8초 / 2기 10초 / 1기 14초, 쿨타임 20초', () => {
    const d = findSkill(S, 'executionWill');
    expect(d.levels.map((l) => [l.values.kind, l.values.count, l.values.lifeSec, l.cooldownSec])).toEqual([[1, 1, 8, 20], [2, 2, 10, 20], [3, 1, 14, 20]]);
    expect(d.levels[0]!.values.copyDelaySec).toBe(0.5);
    expect(d.levels[0]!.values.copyDamage).toBe(0.4);
  });
  it('휘강파 액티브 7종 모두 구현·각인', () => {
    const hw = S.skills.filter((s) => s.school === 'hwigang' && s.kind === 'active').map((s) => s.id).sort();
    expect(hw).toEqual(['executionWill', 'magiBolt', 'magiBurst', 'magiCondenser', 'magiPillar', 'magiWave', 'teleport']);
  });
});
