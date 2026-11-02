import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import { gameData } from '../src/data/index';
import {
  applyCard,
  drawSkillCards,
  stageEndOffers,
  runStartOffers,
  type Card,
  type CardHolder,
} from '../src/systems/cards';
import { acquireSkill, emptyLoadout, findSkill, setSkillLevel, type SkillLoadout } from '../src/systems/skills';

const d = gameData;
const sd = d.skills;
const def = (id: string) => findSkill(sd, id);
const all = () => true;

function holder(lo: SkillLoadout = emptyLoadout(sd.activeSlots)): CardHolder {
  return { loadout: lo, schoolPicks: { hectar: 0, acro: 0 } };
}

const draw = (h: CardHolder, seed = 1, available: (id: string) => boolean = all) =>
  drawSkillCards(new Rng(seed), h.loadout, sd, d.cards, available);

describe('카드 스케줄', () => {
  const ref = (stage: number) => ({ chapter: 1, stage });

  it('런 시작은 스킬', () => {
    expect(runStartOffers(d.cards)).toEqual(['skill']);
  });

  it('스테이지 후: 1-1 아이템, 1-2 스킬, 1-3 아이템, 1-4 스킬, 1-5 아이템 (교차)', () => {
    const after = [1, 2, 3, 4, 5].map((s) => stageEndOffers(ref(s), d.mapgen, d.cards).afterStage);
    expect(after).toEqual(['item', 'skill', 'item', 'skill', 'item']);
    // 런 전체로 이어진다: 2-1 후 스킬
    expect(stageEndOffers({ chapter: 2, stage: 1 }, d.mapgen, d.cards).afterStage).toBe('skill');
  });

  it('보스 스테이지(X-2, X-5)는 보스방에서 스킬 카드 1회 더', () => {
    const boss = [1, 2, 3, 4, 5].map((s) => stageEndOffers(ref(s), d.mapgen, d.cards).bossRoom);
    expect(boss).toEqual([[], ['skill'], [], [], ['skill']]);
  });

  it('챕터1 스킬 선택은 5회, 아이템 3회', () => {
    const offers = [...runStartOffers(d.cards)];
    for (const s of [1, 2, 3, 4, 5]) {
      const e = stageEndOffers(ref(s), d.mapgen, d.cards);
      offers.push(...e.bossRoom, e.afterStage);
    }
    expect(offers.filter((k) => k === 'skill')).toHaveLength(5);
    expect(offers.filter((k) => k === 'item')).toHaveLength(3);
  });
});

describe('스킬 카드 풀', () => {
  it('3장, 서로 다른 스킬, 가진 액티브는 신규로 나오지 않는다', () => {
    const lo = acquireSkill(emptyLoadout(sd.activeSlots), def('magiTurret')).loadout;
    for (let seed = 1; seed <= 50; seed++) {
      const cards = draw(holder(lo), seed);
      expect(cards).toHaveLength(3);
      const ids = cards.map((c) => c.skillId);
      expect(new Set(ids).size).toBe(ids.length);
      expect(cards).not.toContainEqual({ kind: 'skillNew', skillId: 'magiTurret' });
    }
  });

  it('보유 스킬 레벨업·패시브 습득/레벨업이 섞여 나온다', () => {
    let lo = acquireSkill(emptyLoadout(sd.activeSlots), def('magiTurret')).loadout;
    lo = acquireSkill(lo, def('combatDrone')).loadout;
    const seen = new Set<string>();
    for (let seed = 1; seed <= 200; seed++) for (const c of draw(holder(lo), seed)) seen.add(`${c.kind}:${'skillId' in c ? c.skillId : ''}`);
    expect(seen).toContain('skillLevelUp:magiTurret');
    expect(seen).toContain('skillLevelUp:combatDrone');
    expect(seen).toContain('skillNew:reductionist');
  });

  it('Lv3 스킬은 레벨업 카드가 나오지 않는다', () => {
    const lo = setSkillLevel(emptyLoadout(sd.activeSlots), def('magiTurret'), 3, false);
    for (let seed = 1; seed <= 50; seed++) {
      expect(draw(holder(lo), seed)).not.toContainEqual({ kind: 'skillLevelUp', skillId: 'magiTurret' });
    }
  });

  it('구현된 스킬만 나온다', () => {
    const only = (id: string) => id === 'magiTurret' || id === 'purifyingWings';
    for (let seed = 1; seed <= 30; seed++) {
      for (const c of draw(holder(), seed, only)) expect(only(c.skillId)).toBe(true);
    }
  });

  it('후보가 3장보다 적으면 그만큼만, 없으면 빈 목록', () => {
    const only = (id: string) => id === 'magiTurret' || id === 'purifyingWings';
    expect(draw(holder(), 3, only)).toHaveLength(2);
    let lo = emptyLoadout(sd.activeSlots);
    for (const id of ['magiTurret', 'purifyingWings']) lo = setSkillLevel(lo, def(id), 3, true);
    expect(draw(holder(lo), 3, only)).toEqual([]);
  });

  it('같은 시드면 같은 카드', () => {
    expect(draw(holder(), 42)).toEqual(draw(holder(), 42));
  });
});

describe('카드 적용과 전직 집계', () => {
  const ctx = { skills: sd };

  it('신규·레벨업 모두 계열 1회로 센다', () => {
    let h = holder();
    const pick = (c: Card) => (h = applyCard(h, c, ctx).holder);
    pick({ kind: 'skillNew', skillId: 'magiTurret' });
    pick({ kind: 'skillLevelUp', skillId: 'magiTurret' });
    pick({ kind: 'skillNew', skillId: 'purifyingWings' });
    expect(h.schoolPicks).toEqual({ hectar: 2, acro: 1 });
    expect(h.loadout.owned.magiTurret!.level).toBe(2);
  });

  it('5번째 액티브는 보관됨을 알린다', () => {
    let h = holder();
    for (const id of ['magiTurret', 'magiMine', 'antimatterCannon', 'magiField']) {
      h = applyCard(h, { kind: 'skillNew', skillId: id }, ctx).holder;
    }
    const r = applyCard(h, { kind: 'skillNew', skillId: 'railgun' }, ctx);
    expect(r.stored).toBe(true);
  });
});
