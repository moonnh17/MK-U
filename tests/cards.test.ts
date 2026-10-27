import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import { gameData } from '../src/data/index';
import {
  applyCard,
  drawSkillCards,
  drawStatCards,
  stageEndOffers,
  runStartOffers,
  type Card,
  type CardHolder,
} from '../src/systems/cards';
import { startingStats } from '../src/systems/damage';
import { acquireSkill, emptyLoadout, findSkill, setSkillLevel, type SkillLoadout } from '../src/systems/skills';

const d = gameData;
const sd = d.skills;
const def = (id: string) => findSkill(sd, id);
const base = () => startingStats(d.stats.startValue);
const all = () => true;

function holder(lo: SkillLoadout = emptyLoadout(sd.activeSlots), stats = base()): CardHolder {
  return { loadout: lo, stats, hp: 100, maxHp: 100, schoolPicks: { hectar: 0, acro: 0 } };
}

const draw = (h: CardHolder, seed = 1, available: (id: string) => boolean = all) =>
  drawSkillCards(new Rng(seed), h.loadout, h.stats, sd, d.cards, available);

describe('카드 스케줄', () => {
  const ref = (stage: number) => ({ chapter: 1, stage });

  it('런 시작은 스킬', () => {
    expect(runStartOffers(d.cards)).toEqual(['skill']);
  });

  it('스테이지 후: 1-1 스탯, 1-2 스킬, 1-3 스탯, 1-4 스킬, 1-5 스탯 (교차)', () => {
    const after = [1, 2, 3, 4, 5].map((s) => stageEndOffers(ref(s), d.mapgen, d.cards).afterStage);
    expect(after).toEqual(['stat', 'skill', 'stat', 'skill', 'stat']);
    // 런 전체로 이어진다: 2-1 후 스킬
    expect(stageEndOffers({ chapter: 2, stage: 1 }, d.mapgen, d.cards).afterStage).toBe('skill');
  });

  it('보스 스테이지(X-2, X-5)는 보스방에서 스킬 카드 1회 더', () => {
    const boss = [1, 2, 3, 4, 5].map((s) => stageEndOffers(ref(s), d.mapgen, d.cards).bossRoom);
    expect(boss).toEqual([[], ['skill'], [], [], ['skill']]);
  });

  it('챕터1 스킬 선택은 5회, 스탯 3회', () => {
    const offers = [...runStartOffers(d.cards)];
    for (const s of [1, 2, 3, 4, 5]) {
      const e = stageEndOffers(ref(s), d.mapgen, d.cards);
      offers.push(...e.bossRoom, e.afterStage);
    }
    expect(offers.filter((k) => k === 'skill')).toHaveLength(5);
    expect(offers.filter((k) => k === 'stat')).toHaveLength(3);
  });
});

describe('스킬 카드 풀', () => {
  it('3장, 서로 다른 스킬, 가진 액티브는 신규로 나오지 않는다', () => {
    const lo = acquireSkill(emptyLoadout(sd.activeSlots), def('magiTurret')).loadout;
    for (let seed = 1; seed <= 50; seed++) {
      const cards = draw(holder(lo), seed);
      expect(cards).toHaveLength(3);
      const ids = cards.filter((c) => c.kind !== 'stat').map((c) => (c as { skillId: string }).skillId);
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

  it('각성 조건을 채우면 반드시 각성 카드가 들어간다 (안 골라도 다음에 다시)', () => {
    const lo = setSkillLevel(emptyLoadout(sd.activeSlots), def('magiTurret'), 3, false);
    const strong = { ...base(), strength: 20 };
    for (let seed = 1; seed <= 30; seed++) {
      expect(draw(holder(lo, strong), seed)).toContainEqual({ kind: 'awakening', skillId: 'magiTurret' });
    }
    // 요구 스탯 미달이면 없음
    expect(draw(holder(lo), 1)).not.toContainEqual({ kind: 'awakening', skillId: 'magiTurret' });
  });

  it('각성 카드는 최대 3장, 오래 가진 순', () => {
    let lo = emptyLoadout(sd.activeSlots);
    for (const id of ['magiTurret', 'purifyingWings', 'railgun', 'magiMine']) lo = setSkillLevel(lo, def(id), 3, false);
    const s = { ...base(), strength: 20, intelligence: 20, magiPower: 20 };
    const cards = draw(holder(lo, s), 7);
    expect(cards).toEqual([
      { kind: 'awakening', skillId: 'magiTurret' },
      { kind: 'awakening', skillId: 'purifyingWings' },
      { kind: 'awakening', skillId: 'railgun' },
    ]);
  });

  it('구현된 스킬만 나온다', () => {
    const only = (id: string) => id === 'magiTurret' || id === 'purifyingWings';
    for (let seed = 1; seed <= 30; seed++) {
      for (const c of draw(holder(), seed, only)) if (c.kind !== 'stat') expect(only(c.skillId)).toBe(true);
    }
  });

  it('후보가 3장보다 적으면 스탯 카드로 채운다', () => {
    const only = (id: string) => id === 'magiTurret' || id === 'purifyingWings';
    const cards = draw(holder(), 3, only);
    expect(cards.filter((c) => c.kind === 'skillNew')).toHaveLength(2);
    expect(cards.filter((c) => c.kind === 'stat')).toHaveLength(1);
    // 후보가 없으면 전부 스탯
    let lo = emptyLoadout(sd.activeSlots);
    for (const id of ['magiTurret', 'purifyingWings']) lo = setSkillLevel(lo, def(id), 3, true);
    expect(draw(holder(lo), 3, only).every((c) => c.kind === 'stat')).toBe(true);
  });

  it('같은 시드면 같은 카드', () => {
    expect(draw(holder(), 42)).toEqual(draw(holder(), 42));
  });
});

describe('스탯 카드', () => {
  it('서로 다른 스탯 3개, 등급별 +3 / +5 / +8', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const cards = drawStatCards(new Rng(seed), 3, d.cards);
      expect(cards).toHaveLength(3);
      const stats = cards.map((c) => (c.kind === 'stat' ? c.stat : ''));
      expect(new Set(stats).size).toBe(3);
      for (const c of cards) if (c.kind === 'stat') expect([3, 5, 8]).toContain(c.amount);
    }
  });

  it('등급 확률은 데이터 가중치를 따른다', () => {
    const rng = new Rng(9);
    const count: Record<number, number> = { 3: 0, 5: 0, 8: 0 };
    for (let i = 0; i < 3000; i++) for (const c of drawStatCards(rng, 1, d.cards)) if (c.kind === 'stat') count[c.amount]!++;
    expect(count[3]! / 3000).toBeGreaterThan(0.55);
    expect(count[8]! / 3000).toBeLessThan(0.14);
  });
});

describe('카드 적용과 전직 집계', () => {
  const ctx = { skills: sd, stats: d.stats, baseMaxHp: d.player.maxHp };

  it('신규·레벨업·각성 모두 계열 1회로 센다, 스탯 카드는 세지 않는다', () => {
    let h = holder();
    const pick = (c: Card) => (h = applyCard(h, c, ctx).holder);
    pick({ kind: 'skillNew', skillId: 'magiTurret' });
    pick({ kind: 'skillLevelUp', skillId: 'magiTurret' });
    pick({ kind: 'skillNew', skillId: 'purifyingWings' });
    pick({ kind: 'stat', stat: 'strength', amount: 5, grade: 'mid' });
    expect(h.schoolPicks).toEqual({ hectar: 2, acro: 1 });
    expect(h.loadout.owned.magiTurret!.level).toBe(2);
    expect(h.stats.strength).toBe(15);
    h.loadout = setSkillLevel(h.loadout, def('purifyingWings'), 3, false);
    pick({ kind: 'awakening', skillId: 'purifyingWings' });
    expect(h.loadout.owned.purifyingWings!.awakened).toBe(true);
    expect(h.schoolPicks.acro).toBe(2);
  });

  it('5번째 액티브는 보관됨을 알린다', () => {
    let h = holder();
    for (const id of ['magiTurret', 'magiMine', 'antimatterCannon', 'magiField']) {
      h = applyCard(h, { kind: 'skillNew', skillId: id }, ctx).holder;
    }
    const r = applyCard(h, { kind: 'skillNew', skillId: 'railgun' }, ctx);
    expect(r.stored).toBe(true);
  });

  it('견고 카드는 최대 체력도 올린다', () => {
    const r = applyCard(holder(), { kind: 'stat', stat: 'toughness', amount: 5, grade: 'mid' }, ctx);
    expect(r.holder.maxHp).toBe(110);
    expect(r.holder.hp).toBe(110);
  });
});
