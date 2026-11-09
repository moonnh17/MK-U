import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import { ultimateCooldownSec } from '../src/systems/skills';
import { gameData } from '../src/data/index';
import { validateGameData } from '../src/data/validate';
import {
  convertSkills,
  judgeSchool,
  topSchools,
  paradoxRatio,
  skillAllowed,
} from '../src/systems/advancement';
import { drawSkillCards } from '../src/systems/cards';
import { emptyLoadout, findSkill, setSkillLevel, type SkillLoadout } from '../src/systems/skills';

const S = gameData.skills;
const ORDER = ['hectar', 'acro'] as const;

function loadout(entries: [string, number, boolean?][]): SkillLoadout {
  let lo = emptyLoadout(S.activeSlots);
  for (const [id, lv, aw] of entries) lo = setSkillLevel(lo, findSkill(S, id), lv, aw ?? false);
  return lo;
}

describe('전직 판정', () => {
  it('많은 쪽으로', () => {
    expect(judgeSchool({ hectar: 3, acro: 2 }, ORDER)).toBe('hectar');
    expect(judgeSchool({ hectar: 1, acro: 4 }, ORDER)).toBe('acro');
  });
  it('동점이면 정하지 않는다 (플레이어가 직접 선택)', () => {
    expect(judgeSchool({ hectar: 3, acro: 3 }, ORDER)).toBeNull();
    expect(topSchools({ hectar: 3, acro: 3 }, ORDER)).toEqual(['hectar', 'acro']);
    expect(topSchools({ hectar: 0, acro: 0 }, ORDER)).toEqual(['hectar', 'acro']);
    expect(topSchools({ hectar: 4, acro: 2 }, ORDER)).toEqual(['hectar']);
  });
});

describe('전직 스킬 변환 (기획서 예시)', () => {
  it('포탑 Lv2·레일건 Lv1·마기 변질 Lv2 → 헥타르: 변질 제거, 포인트 2 → 포탑 Lv3, 레일건 Lv2', () => {
    const lo = loadout([
      ['magiTurret', 2],
      ['railgun', 1],
      ['magiCorruption', 2],
    ]);
    // 포탑이 Lv3이 되면 대상에서 빠지므로 어떤 시드든 결과는 포탑 Lv3·레일건 Lv2 아니면 레일건 Lv3·포탑 Lv2
    for (let seed = 0; seed < 20; seed++) {
      const r = convertSkills(new Rng(seed), lo, S, 'hectar');
      expect(r.loadout.owned.magiCorruption).toBeUndefined();
      expect(r.log.removed).toEqual([{ skillId: 'magiCorruption', level: 2 }]);
      expect(r.log.gains).toHaveLength(2);
      const t = r.loadout.owned.magiTurret!.level;
      const g = r.loadout.owned.railgun!.level;
      expect(t + g).toBe(5);
      expect(Math.max(t, g)).toBeLessThanOrEqual(3);
    }
  });

  it('Lv3 스킬은 대상에서 빠지고, 받을 스킬이 없으면 남은 포인트는 사라진다', () => {
    const lo = loadout([
      ['magiTurret', 3],
      ['magiCorruption', 2],
    ]);
    const r = convertSkills(new Rng(1), lo, S, 'hectar');
    expect(r.loadout.owned.magiTurret!.level).toBe(3);
    expect(r.log.gains).toEqual([]);
    expect(r.log.removed).toHaveLength(1);
  });

  it('각성은 옮겨가지 않고 레벨(3)로만 센다', () => {
    const lo = loadout([
      ['magiTurret', 1],
      ['railgun', 1],
      ['purifyingWings', 3, true],
    ]);
    const r = convertSkills(new Rng(2), lo, S, 'hectar');
    expect(r.log.removed).toEqual([{ skillId: 'purifyingWings', level: 3 }]);
    expect(r.log.gains).toHaveLength(3);
    expect(Object.values(r.loadout.owned).every((o) => !o.awakened)).toBe(true);
  });

  it('패시브도 반대 학파면 제거하고, 빈 칸은 보관함의 자기 학파 스킬로 채운다', () => {
    let lo = loadout([
      ['unstableSubject', 1],
      ['magiCorruption', 1],
      ['experimentalWeapon', 1],
      ['mkPrototype', 1],
      ['magiTurret', 1],
      ['railgun', 1],
      ['reductionist', 1],
      ['combatDrone', 1],
    ]);
    // 액티브 3칸은 아크로가 차지, 나머지 아크로 하나와 헥타르 액티브 2개는 보관, 패시브 칸은 환원주의자
    expect(lo.active).toEqual(['unstableSubject', 'magiCorruption', 'experimentalWeapon']);
    expect(lo.passive).toBe('reductionist');
    const r = convertSkills(new Rng(3), lo, S, 'hectar');
    lo = r.loadout;
    expect(lo.active).toEqual(['magiTurret', 'railgun', null]);
    expect(lo.passive).toBe('combatDrone');
    expect(r.log.removed.map((x) => x.skillId).sort()).toEqual(['experimentalWeapon', 'magiCorruption', 'mkPrototype', 'reductionist', 'unstableSubject']);
  });

  it('반대 학파 스킬이 없으면 아무것도 바뀌지 않는다', () => {
    const lo = loadout([['magiTurret', 2]]);
    const r = convertSkills(new Rng(1), lo, S, 'hectar');
    expect(r.log.removed).toEqual([]);
    expect(r.loadout.owned.magiTurret!.level).toBe(2);
  });
});

describe('전직 후 카드 풀', () => {
  it('자기 학파 스킬만 나온다', () => {
    const scholar = gameData.jobs.jobs.find((j) => j.id === 'magiScholar')!;
    const allowed = (id: string) => skillAllowed(findSkill(S, id), scholar, 'acro');
    for (let seed = 0; seed < 30; seed++) {
      const cards = drawSkillCards(new Rng(seed), emptyLoadout(4), S, gameData.cards, allowed);
      for (const c of cards) expect(findSkill(S, c.skillId).school).toBe('acro');
    }
    expect(skillAllowed(findSkill(S, 'magiTurret'), scholar, null)).toBe(true);
  });
});

describe('학파 궁극기', () => {
  const ult = (id: string) => gameData.ultimates.ultimates.find((u) => u.id === id)!;

  it('모든 궁극기는 같은 재사용 대기(60초), 스킬 쿨타임 감소는 받지 않고 궁극기 쿨타임 감소만', () => {
    expect(gameData.ultimates.cooldownSec).toBe(60);
    expect(ultimateCooldownSec(60, 0)).toBe(60);
    expect(ultimateCooldownSec(60, 0.25)).toBeCloseTo(45);
    expect(ultimateCooldownSec(60, 5)).toBeCloseTo(6);
    for (const u of gameData.ultimates.ultimates) expect('gauge' in u).toBe(false);
  });

  it('역설 재현 비율: 일부 / 실험 성공 상당 부분 / 대성공 전부', () => {
    const r = { partial: 0.3, major: 0.6, full: 1 };
    expect(paradoxRatio(false, false, r)).toBe(0.3);
    expect(paradoxRatio(true, false, r)).toBe(0.6);
    expect(paradoxRatio(false, true, r)).toBe(1);
  });

  it('공간격은 벼락 전체, 특이점은 붕괴·역설 대성공만', () => {
    for (const tags of Object.values(ult('thunderbolt').sources)) expect(tags).toContain('space');
    for (const [k, tags] of Object.entries(ult('singularity').sources)) expect(tags.includes('space'), k).toBe(k === 'collapse' || k === 'replayGreat');
  });
});

describe('직업 데이터', () => {
  it('마기학자·전사가 열려 있고, 마기법사는 틀만', () => {
    const j = gameData.jobs.jobs;
    expect(j.map((x) => [x.id, x.enabled])).toEqual([
      ['magiScholar', true],
      ['magiMage', false],
      ['warrior', true],
    ]);
    expect(j[2]!.advancements.map((a) => [a.id, a.ultimate, a.passive])).toEqual([
      ['barbarian', 'berserkerRage', 'boilingHeart'],
      ['paladin', 'divineJudgment', 'prayerOfRevival'],
    ]);
    const ms = j[0]!;
    expect(ms.advancements.map((a) => [a.id, a.ultimate, a.passive])).toEqual([
      ['hectar', 'thunderbolt', 'combatDrone'],
      ['acro', 'singularity', 'reductionist'],
    ]);
  });

  it('학파 궁극기가 맞지 않으면 잡아낸다', () => {
    const d = structuredClone(gameData);
    d.jobs.jobs[0]!.advancements[0]!.ultimate = 'singularity';
    expect(validateGameData(d).some((e) => e.includes('학파가 다름'))).toBe(true);
  });
});
