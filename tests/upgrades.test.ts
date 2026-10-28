import { describe, expect, it } from 'vitest';
import { defaultSave } from '../src/core/save';
import { newPlayerState } from '../src/core/session';
import { gameData } from '../src/data/index';
import { buyUpgrade, nextCost, resetUpgrades, spentOn, upgradeBonus } from '../src/systems/upgrades';
import { STAT_IDS } from '../src/types/data';

const U = gameData.meta.upgrades;
const up = (id: string) => U.find((u) => u.id === id)!;
const JOB = 'magiScholar';

describe('강화 표 (기획서)', () => {
  it('스탯 6종: 시작 스탯 +1, 최대 5, 30·60·120·200·300', () => {
    for (const s of STAT_IDS) expect(up(s)).toMatchObject({ kind: 'stat', stat: s, perLevel: 1, costs: [30, 60, 120, 200, 300] });
  });
  it('최대 체력: 기본 체력 +5, 최대 5, 40·80·150·250·400', () => {
    expect(up('maxHp')).toMatchObject({ perLevel: 5, costs: [40, 80, 150, 250, 400] });
  });
  it('보호막: 최대치 +1, 최대 3, 100·250·500', () => {
    expect(up('shield')).toMatchObject({ perLevel: 1, costs: [100, 250, 500] });
  });
});

describe('강화·초기화', () => {
  it('비용만큼 결정을 쓰고 레벨이 오른다, 다음 비용은 표대로', () => {
    const s = { ...defaultSave(), crystals: 100 };
    expect(buyUpgrade(s, JOB, up('strength'))).toBe(true);
    expect(buyUpgrade(s, JOB, up('strength'))).toBe(true);
    expect(s.crystals).toBe(10);
    expect(s.upgrades[JOB]).toEqual({ strength: 2 });
    expect(nextCost(up('strength'), 2)).toBe(120);
  });
  it('모자라면 그대로', () => {
    const s = { ...defaultSave(), crystals: 29 };
    expect(buyUpgrade(s, JOB, up('strength'))).toBe(false);
    expect(s.crystals).toBe(29);
    expect(s.upgrades[JOB] ?? {}).toEqual({});
  });
  it('최대 레벨이면 더 오르지 않는다', () => {
    const s = { ...defaultSave(), crystals: 100000 };
    for (let i = 0; i < 5; i++) buyUpgrade(s, JOB, up('shield'));
    expect(s.upgrades[JOB]!.shield).toBe(3);
    expect(nextCost(up('shield'), 3)).toBeNull();
    expect(s.crystals).toBe(100000 - 850);
  });
  it('초기화: 그 직업에 쓴 결정 전액 반환', () => {
    const s = { ...defaultSave(), crystals: 1000 };
    buyUpgrade(s, JOB, up('strength'));
    buyUpgrade(s, JOB, up('maxHp'));
    buyUpgrade(s, JOB, up('maxHp'));
    expect(spentOn(s.upgrades[JOB], U)).toBe(30 + 40 + 80);
    expect(resetUpgrades(s, JOB, U)).toBe(150);
    expect(s.crystals).toBe(1000);
    expect(s.upgrades[JOB]).toEqual({});
  });
  it('직업마다 따로', () => {
    const s = { ...defaultSave(), crystals: 100 };
    buyUpgrade(s, JOB, up('agility'));
    expect(s.upgrades.warrior).toBeUndefined();
    expect(resetUpgrades(s, 'warrior', U)).toBe(0);
    expect(s.upgrades[JOB]).toEqual({ agility: 1 });
  });
});

describe('런 시작 적용', () => {
  it('스탯·기본 체력·보호막', () => {
    const b = upgradeBonus({ strength: 5, willpower: 2, maxHp: 3, shield: 1 }, U);
    expect(b).toEqual({ stats: { strength: 5, willpower: 2 }, maxHp: 15, shield: 1 });
  });
  it('스탯을 모두 끝내면 시작 스탯 15', () => {
    const levels = Object.fromEntries(STAT_IDS.map((s) => [s, 5]));
    const p = newPlayerState(gameData, JOB, levels);
    for (const s of STAT_IDS) expect(p.stats[s]).toBe(15);
  });
  it('강화 없으면 그대로', () => {
    const p = newPlayerState(gameData, JOB);
    expect(p.meta).toEqual({ maxHp: 0, shield: 0 });
    expect(p.stats.strength).toBe(gameData.stats.startValue);
  });
  it('기본 체력·보호막 강화가 시작 값에 들어간다', () => {
    const p = newPlayerState(gameData, JOB, { maxHp: 2, shield: 1 });
    expect(p.meta).toEqual({ maxHp: 10, shield: 1 });
    expect(p.maxHp).toBe(gameData.player.maxHp + 10);
    expect(p.hp).toBe(p.maxHp);
    expect(p.shieldMax).toBe(gameData.player.shieldMax + 1);
  });
});

describe('기억조각 보관대 칸', () => {
  it('과거의 기억: 칸 10개, 얻은 수만큼 앞에서부터 열린다', async () => {
    const { pastSlots } = await import('../src/systems/memories');
    const s = pastSlots(gameData.meta.memory.pastSlots, 3);
    expect(s).toHaveLength(10);
    expect(s.filter((x) => x.open).map((x) => x.index)).toEqual([0, 1, 2]);
  });
  it('현재의 기억: 구현된 스킬 각성·궁극기 각성·전직, 보스 등장·제미니는 준비 중 칸', async () => {
    const { cutsceneSlots } = await import('../src/systems/memories');
    const { isSkillImplemented, isUltimateImplemented } = await import('../src/skills/registry');
    const slots = cutsceneSlots(gameData, { skill: isSkillImplemented, ultimate: isUltimateImplemented });
    const ids = slots.map((s) => s.id);
    expect(ids).toContain('skill.magiTurret');
    expect(ids).toContain('advancement.hectar');
    expect(ids).toContain('advancement.acro');
    expect(ids.filter((x) => x?.startsWith('advancement.'))).toHaveLength(2); // 잠긴 직업의 전직은 없음
    expect(slots.filter((s) => s.id === null).map((s) => s.group)).toEqual(['boss', 'gemini']);
    expect(new Set(ids.filter(Boolean)).size).toBe(ids.filter(Boolean).length);
  });
});
