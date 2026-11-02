import { describe, expect, it } from 'vitest';
import { defaultSave } from '../src/core/save';
import { newPlayerState } from '../src/core/session';
import { gameData } from '../src/data/index';
import { buyUpgrade, nextCost, refundRemovedUpgrades, resetUpgrades, spentOn, upgradeBonus } from '../src/systems/upgrades';

const U = gameData.meta.upgrades;
const up = (id: string) => U.find((u) => u.id === id)!;
const JOB = 'magiScholar';

describe('강화 표 (기획서)', () => {
  it('스탯 강화는 없고 체력·보호막만 남는다', () => {
    expect(U.map((u) => u.id)).toEqual(['maxHp', 'sanity']);
  });
  it('최대 체력: 기본 체력 +5, 최대 5, 40·80·150·250·400', () => {
    expect(up('maxHp')).toMatchObject({ perLevel: 5, costs: [40, 80, 150, 250, 400] });
  });
  it('보호막: 최대치 +1, 최대 3, 100·250·500', () => {
    expect(up('sanity')).toMatchObject({ perLevel: 10, costs: [100, 250, 500] });
  });
});

describe('강화·초기화', () => {
  it('비용만큼 결정을 쓰고 레벨이 오른다, 다음 비용은 표대로', () => {
    const s = { ...defaultSave(), crystals: 130 };
    expect(buyUpgrade(s, JOB, up('maxHp'))).toBe(true);
    expect(buyUpgrade(s, JOB, up('maxHp'))).toBe(true);
    expect(s.crystals).toBe(10);
    expect(s.upgrades[JOB]).toEqual({ maxHp: 2 });
    expect(nextCost(up('maxHp'), 2)).toBe(150);
  });
  it('모자라면 그대로', () => {
    const s = { ...defaultSave(), crystals: 39 };
    expect(buyUpgrade(s, JOB, up('maxHp'))).toBe(false);
    expect(s.crystals).toBe(39);
    expect(s.upgrades[JOB] ?? {}).toEqual({});
  });
  it('최대 레벨이면 더 오르지 않는다', () => {
    const s = { ...defaultSave(), crystals: 100000 };
    for (let i = 0; i < 5; i++) buyUpgrade(s, JOB, up('sanity'));
    expect(s.upgrades[JOB]!.sanity).toBe(3);
    expect(nextCost(up('sanity'), 3)).toBeNull();
    expect(s.crystals).toBe(100000 - 850);
  });
  it('초기화: 그 직업에 쓴 결정 전액 반환', () => {
    const s = { ...defaultSave(), crystals: 1000 };
    buyUpgrade(s, JOB, up('maxHp'));
    buyUpgrade(s, JOB, up('maxHp'));
    buyUpgrade(s, JOB, up('maxHp'));
    expect(spentOn(s.upgrades[JOB], U)).toBe(40 + 80 + 150);
    expect(resetUpgrades(s, JOB, U)).toBe(270);
    expect(s.crystals).toBe(1000);
    expect(s.upgrades[JOB]).toEqual({});
  });
  it('직업마다 따로', () => {
    const s = { ...defaultSave(), crystals: 100 };
    buyUpgrade(s, JOB, up('maxHp'));
    expect(s.upgrades.warrior).toBeUndefined();
    expect(resetUpgrades(s, 'warrior', U)).toBe(0);
    expect(s.upgrades[JOB]).toEqual({ maxHp: 1 });
  });
});

describe('런 시작 적용', () => {
  it('기본 체력·보호막', () => {
    expect(upgradeBonus({ maxHp: 3, sanity: 1 }, U)).toEqual({ maxHp: 15, sanity: 10 });
  });
  it('강화 없으면 그대로', () => {
    expect(newPlayerState(gameData, JOB).meta).toEqual({ maxHp: 0, sanity: 0 });
  });
  it('기본 체력·보호막 강화가 시작 값에 들어간다', () => {
    const p = newPlayerState(gameData, JOB, { maxHp: 2, sanity: 1 });
    expect(p.meta).toEqual({ maxHp: 10, sanity: 10 });
    expect(p.maxHp).toBe(gameData.player.maxHp + 10);
    expect(p.hp).toBe(p.maxHp);
    expect(p.sanityMax).toBe(gameData.player.sanity.base + 10);
  });
});

describe('삭제된 스탯 강화 환불', () => {
  it('레벨을 지우고 쓴 결정을 돌려주며, 다른 강화는 그대로', () => {
    const s = defaultSave();
    s.crystals = 5;
    s.upgrades = { magiScholar: { strength: 2, maxHp: 1 }, warrior: { willpower: 1 } };
    expect(refundRemovedUpgrades(s, gameData.meta.removedUpgrades)).toBe(30 + 60 + 30);
    expect(s.crystals).toBe(125);
    expect(s.upgrades).toEqual({ magiScholar: { maxHp: 1 }, warrior: {} });
    expect(refundRemovedUpgrades(s, gameData.meta.removedUpgrades)).toBe(0);
  });
});

describe('기억조각 보관대 칸', () => {
  it('과거의 기억: 칸 10개, 얻은 수만큼 앞에서부터 열린다', async () => {
    const { pastSlots } = await import('../src/systems/memories');
    const s = pastSlots(gameData.meta.memory.pastSlots, 3);
    expect(s).toHaveLength(10);
    expect(s.filter((x) => x.open).map((x) => x.index)).toEqual([0, 1, 2]);
  });
  it('현재의 기억: 구현된 스킬 각성·궁극기 각성·전직, 보스 등장은 준비 중 칸 (제미니 칸은 gemini.test)', async () => {
    const { cutsceneSlots } = await import('../src/systems/memories');
    const { isSkillImplemented, isUltimateImplemented } = await import('../src/skills/registry');
    const slots = cutsceneSlots(gameData, { skill: isSkillImplemented, ultimate: isUltimateImplemented });
    const ids = slots.map((s) => s.id);
    expect(ids).toContain('skill.magiTurret');
    expect(ids).toContain('advancement.hectar');
    expect(ids).toContain('advancement.acro');
    expect(ids.filter((x) => x?.startsWith('advancement.'))).toHaveLength(2); // 잠긴 직업의 전직은 없음
    expect(slots.filter((s) => s.id === null).map((s) => s.group)).toEqual(['boss']);
    expect(new Set(ids.filter(Boolean)).size).toBe(ids.filter(Boolean).length);
  });
});
