import { describe, expect, it } from 'vitest';
import { gameData } from '../src/data';
import { Rng } from '../src/core/rng';
import { newPlayerState } from '../src/core/session';
import { convertSkills, judgeMastery, skillAllowed } from '../src/systems/advancement';
import { drawSkillCards, applyCard } from '../src/systems/cards';
import { emptyLoadout, findSkill, masteryTotals, setSkillLevel } from '../src/systems/skills';
import { absorbInto, auraReduction, frenzyInterval, heartFlatDamage, whirlBonus } from '../src/systems/warrior';
import { isSkillImplemented, isUltimateImplemented } from '../src/skills/registry';

const S = gameData.skills;
const warrior = gameData.jobs.jobs.find((j) => j.id === 'warrior')!;
const order = warrior.advancements.map((a) => a.id) as ['barbarian', 'paladin'];
const owned = (w: number, f: number) => ({ masteryWeapon: { level: w }, masteryFaith: { level: f } });

describe('전사 전직 판정 (원본 규칙)', () => {
  it('무기 > 신앙 → 야만용사, 신앙 > 무기 → 성기사', () => {
    expect(judgeMastery(owned(2, 1), warrior.masteryJudge!, order)).toBe('barbarian');
    expect(judgeMastery(owned(1, 3), warrior.masteryJudge!, order)).toBe('paladin');
  });
  it('같고 신앙 1 이상 → 성기사, 둘 다 0 → 야만용사, 신체는 보지 않는다', () => {
    expect(judgeMastery(owned(2, 2), warrior.masteryJudge!, order)).toBe('paladin');
    expect(judgeMastery({ masteryBody: { level: 3 } }, warrior.masteryJudge!, order)).toBe('barbarian');
  });
});

describe('전사 카드 풀', () => {
  const allowedPre = (id: string) => isSkillImplemented(id) && skillAllowed(findSkill(S, id), warrior, null);
  it('챕터1(전직 전)에는 숙련만 나온다', () => {
    for (let seed = 0; seed < 30; seed++) {
      for (const c of drawSkillCards(new Rng(seed), emptyLoadout(3), S, gameData.cards, allowedPre)) expect(findSkill(S, c.skillId).kind).toBe('mastery');
    }
  });
  it('전직 후에는 자기 계열만, 숙련은 나오지 않는다', () => {
    for (let seed = 0; seed < 30; seed++) {
      const cards = drawSkillCards(new Rng(seed), emptyLoadout(3), S, gameData.cards, (id) => isSkillImplemented(id) && skillAllowed(findSkill(S, id), warrior, 'paladin'));
      for (const c of cards) expect(findSkill(S, c.skillId).school).toBe('paladin');
    }
  });
  it('마기학자 카드에는 전사 스킬이 없다', () => {
    const scholar = gameData.jobs.jobs.find((j) => j.id === 'magiScholar')!;
    expect(skillAllowed(findSkill(S, 'masteryWeapon'), scholar, null)).toBe(false);
    expect(skillAllowed(findSkill(S, 'frenzySlash'), scholar, 'hectar')).toBe(false);
  });
  it('숙련은 칸을 차지하지 않고 보관 알림도 없다', () => {
    const p = newPlayerState(gameData, 'warrior');
    const r = applyCard(p, { kind: 'skillNew', skillId: 'masteryWeapon' }, { skills: S });
    expect(r.stored).toBe(false);
    expect(r.holder.loadout.active).toEqual([null, null, null]);
  });
});

describe('전사 전직 변환과 숙련', () => {
  it('숙련은 전직 후에도 남고 포인트가 되지 않는다', () => {
    let lo = emptyLoadout(3);
    lo = setSkillLevel(lo, findSkill(S, 'masteryWeapon'), 3, false);
    lo = setSkillLevel(lo, findSkill(S, 'masteryBody'), 2, false);
    const r = convertSkills(new Rng(1), lo, S, 'barbarian');
    expect(r.log.removed).toEqual([]);
    expect(r.loadout.owned.masteryWeapon!.level).toBe(3);
    expect(r.loadout.owned.masteryBody!.level).toBe(2);
  });
  it('숙련 합: 무기 Lv2 근접 +16%, 신체 Lv1 최대 체력 +10%', () => {
    let lo = emptyLoadout(3);
    lo = setSkillLevel(lo, findSkill(S, 'masteryWeapon'), 2, false);
    lo = setSkillLevel(lo, findSkill(S, 'masteryBody'), 1, false);
    const t = masteryTotals(lo, S);
    expect(t.meleeDamage).toBeCloseTo(0.24);
    expect(t.maxHpFlat).toBe(20);
  });
});

describe('전사 시작', () => {
  it('전사는 단검, 마기학자는 권총을 들고 시작한다', () => {
    expect(newPlayerState(gameData, 'warrior').weapons.slots[0]?.defId).toBe('dagger');
    expect(newPlayerState(gameData, 'magiScholar').weapons.slots[0]?.defId).toBe('pistol');
    expect(newPlayerState(gameData, 'warrior').ultimate.id).toBe('sweep');
  });
  it('야만용사·성기사 스킬과 궁극기가 모두 발동 함수를 가진다', () => {
    for (const s of S.skills.filter((x) => x.job === 'warrior')) expect(isSkillImplemented(s.id), s.id).toBe(true);
    for (const id of ['sweep', 'berserkerRage', 'divineJudgment']) expect(isUltimateImplemented(id), id).toBe(true);
    // 계열마다 액티브 5 + 패시브 1
    for (const school of ['barbarian', 'paladin']) {
      const list = S.skills.filter((x) => x.school === school);
      expect(list.filter((x) => x.kind === 'active')).toHaveLength(5);
      expect(list.filter((x) => x.kind === 'passive')).toHaveLength(1);
    }
  });
});

describe('전사 공식', () => {
  it('광란의 검격: 같은 적을 벨수록 빨라지고 상한에서 멈춘다', () => {
    expect(frenzyInterval(0.5, 0, 0.05, 0.5)).toBe(0.5);
    expect(frenzyInterval(0.5, 4, 0.05, 0.5)).toBeCloseTo(0.4);
    expect(frenzyInterval(0.5, 100, 0.05, 0.5)).toBeCloseTo(0.25);
  });
  it('소용돌이 보너스 상한, 심장 피해 상한, 오라 감소, 보호막 흡수', () => {
    expect(whirlBonus(3, 0.1, 0.8)).toBeCloseTo(0.3);
    expect(whirlBonus(20, 0.1, 0.8)).toBe(0.8);
    expect(heartFlatDamage(140, 0.015, 18)).toBeCloseTo(2.1);
    expect(heartFlatDamage(5000, 0.015, 18)).toBe(18);
    expect(auraReduction(1, 0.35)).toBe(0);
    expect(auraReduction(0.2, 0.35)).toBeCloseTo(0.28);
    expect(absorbInto(10, 4)).toEqual({ shield: 6, left: 0 });
    expect(absorbInto(3, 10)).toEqual({ shield: 0, left: 7 });
  });
});

describe('전사 아이템 변형', () => {
  it('참나무의 심장: 야만용사는 임시 함성 대신 함성 효과 +10%, 다른 직업은 임시 함성', async () => {
    const { activeEffects } = await import('../src/systems/items');
    const oak = gameData.items.items.find((i) => i.id === 'oakHeart')!;
    const kinds = (school: string | null, job: string) => activeEffects(oak, { school: school as never, job }, gameData.groupMultipliers).map((e) => e.kind);
    expect(kinds('barbarian', 'warrior')).toContain('roarBoost');
    expect(kinds('barbarian', 'warrior')).not.toContain('tempRoar');
    expect(kinds('paladin', 'warrior')).toContain('tempRoar');
    expect(kinds(null, 'magiScholar')).toContain('tempRoar');
  });
});

describe('숙련은 보관 스킬이 아니다', () => {
  it('보관 목록에서 빠지고 숙련 목록에 들어간다', async () => {
    const { storedSkills, ownedMasteries } = await import('../src/systems/skills');
    let lo = emptyLoadout(3);
    lo = setSkillLevel(lo, findSkill(S, 'masteryWeapon'), 1, false);
    lo = setSkillLevel(lo, findSkill(S, 'masteryFaith'), 2, false);
    expect(storedSkills(lo, S)).toEqual([]);
    expect(ownedMasteries(lo, S)).toEqual(['masteryWeapon', 'masteryFaith']);
  });
});

describe('야만용사 각성', () => {
  it('스킬·궁극기마다 정해진 요구 아이템', async () => {
    const need = Object.fromEntries(S.skills.filter((x) => x.school === 'barbarian').map((x) => [x.id, x.awakening?.requiredItem]));
    expect(need).toEqual({ frenzySlash: 'ichor', chainThrow: 'chainRing', earthShatter: 'oldMagiEngine', whirlwind: 'tourbillon', warCry: 'oakHeart', boilingHeart: 'warriorMemory' });
    expect(gameData.ultimates.ultimates.find((u) => u.id === 'berserkerRage')!.awakening!.requiredItem).toBe('siriusArmor');
  });
  it('각성 수치는 Lv3 위에 덮인다 (소용돌이는 회전 그대로 + 참격)', async () => {
    const { skillValues } = await import('../src/systems/skills');
    const v = skillValues(findSkill(S, 'whirlwind'), { level: 3, awakened: true }).values;
    expect(v).toMatchObject({ damage: 39, hits: 14, shotPierce: 6 });
    expect(skillValues(findSkill(S, 'boilingHeart'), { level: 3, awakened: true }).values).toMatchObject({ maxHpPct: 0.65, hpDamage: 0.022, damageCap: 30 });
  });
  it('새 아이템: 설명 자리값, 시리우스의 갑주 야만용사 변형', async () => {
    const { itemDescParams } = await import('../src/ui/itemCard');
    const { activeEffects } = await import('../src/systems/items');
    const it = (id: string) => gameData.items.items.find((i) => i.id === id)!;
    expect(itemDescParams(it('ichor'), gameData.groupMultipliers)).toMatchObject({ ch2: '25', d2: '2' });
    expect(itemDescParams(it('siriusArmor'), gameData.groupMultipliers)).toMatchObject({ th3: '30', g3: '40', dur3: '5', s3: '30' });
    const kinds = (school: string | null) => activeEffects(it('siriusArmor'), { school: school as never, job: 'warrior' }, gameData.groupMultipliers).map((e) => e.kind);
    expect(kinds('barbarian')).toContain('ultimateCooldown');
    expect(kinds('paladin')).not.toContain('ultimateCooldown');
  });
});
