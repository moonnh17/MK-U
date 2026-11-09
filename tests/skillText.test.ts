import { describe, expect, it } from 'vitest';
import { formatText } from '../src/core/text';
import { gameData } from '../src/data/index';
import ko from '../src/data/text/ko.json';
import { skillValues } from '../src/systems/skills';
import { skillTextValues } from '../src/ui/skillText';

const T = ko as Record<string, string>;
const left = (key: string, values: Record<string, number>) => formatText(T, key, skillTextValues(values)).match(/\{\w+\}/g) ?? [];

describe('스킬 설명 (도감·카드)', () => {
  it('모든 스킬의 레벨·각성 설명에 빈 자리({값})가 남지 않는다', () => {
    for (const s of gameData.skills.skills) {
      for (let lv = 1; lv <= s.levels.length; lv++) expect(left(s.descKey, skillValues(s, { level: lv, awakened: false }).values), `${s.id} Lv${lv}`).toEqual([]);
      if (s.awakening) expect(left(s.awakening.descKey, skillValues(s, { level: s.levels.length, awakened: true }).values), `${s.id} 각성`).toEqual([]);
    }
  });
  it('궁극기 설명도', () => {
    for (const u of gameData.ultimates.ultimates) {
      expect(left(u.descKey, u.values), u.id).toEqual([]);
      if (u.awakening) expect(left(u.awakening.descKey, { ...u.values, ...u.awakening.values }), `${u.id} 각성`).toEqual([]);
    }
  });
  it('백분율 값: 0.35 → 35', () => {
    expect(skillTextValues({ a: 0.35 })).toEqual({ a: '0.35', aPct: '35' });
  });
});
