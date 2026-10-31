import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import { gameData } from '../src/data/index';
import { generateStage } from '../src/systems/mapgen';
import { availablePatterns, initialBoss } from '../src/systems/bossBrain';
import { bossHalfOrbs } from '../src/systems/bossEnergy';
import { encounterPool } from '../src/systems/loot';
import { statSheetLines } from '../src/systems/statSheet';
import { statEffect } from '../src/systems/stats';
import { startingStats } from '../src/systems/damage';

const D = gameData;
const hp = (id: string) => D.enemies.enemies.find((e) => e.id === id)!.maxHp;

describe('보스 체력', () => {
  it('전체적으로 늘었고 마기카이저가 가장 많다', () => {
    expect(hp('fusionAkgwi')).toBe(900);
    expect(hp('electricRing')).toBeGreaterThan(1400);
    for (const b of D.bosses.bosses) if (b.id !== 'magiKaiser') expect(hp('magiKaiser')).toBeGreaterThan(hp(b.id) * 2);
  });
  it('반피를 넘는 순간 한 번만 추가 구슬', () => {
    const r = D.bosses.energyDrops;
    expect(bossHalfOrbs(0.6, 0.45, r)).toBe(r.halfHpOrbs);
    expect(bossHalfOrbs(0.45, 0.3, r)).toBe(0);
    expect(bossHalfOrbs(0.9, 0.8, r)).toBe(0);
    expect(r.halfHpOrbs).toBeGreaterThan(0);
  });
});

describe('보스 패턴 근접·원거리', () => {
  const all = [...D.bosses.bosses, ...D.bosses.hiddenBosses].flatMap((b) => b.patterns);
  it('모든 패턴이 분류되어 있고 근접은 거리 제한이 있다', () => {
    for (const p of all) {
      expect(['melee', 'ranged'], p.id).toContain(p.reach);
      if (p.reach === 'melee') expect(p.maxRange, p.id).toBeGreaterThan(0);
      else expect(p.maxRange, p.id).toBeUndefined();
    }
  });
  it('멀리 있으면 근접 패턴을 쓰지 않는다', () => {
    const boss = D.bosses.bosses.find((b) => b.id === 'fusionAkgwi')!;
    const far = availablePatterns(initialBoss(0), boss.patterns, 500).map((p) => p.id);
    expect(far).not.toContain('claw');
    expect(far).not.toContain('spiritBlast');
    expect(far).toContain('eruption');
    expect(availablePatterns(initialBoss(0), boss.patterns, 30).map((p) => p.id)).toContain('claw');
  });
});

describe('전투 없는 방', () => {
  it('시작 방·포탈 방·평화로운 조우 칸은 작고 장애물이 없다', () => {
    const small = D.mapgen.roomSizes.find((s) => s.id === D.mapgen.encounterPeaceful.size)!;
    let peaceful = 0;
    let fight = 0;
    for (let seed = 1; seed < 80; seed++) {
      for (const n of generateStage(seed, 1, 1, D.mapgen).rooms) {
        if (n.kind === 'startRoom' || n.kind === 'exitRoom' || n.peaceful) {
          expect(n.size, n.kind).toEqual({ w: small.w, h: small.h });
          expect(n.layout ?? null).toBeNull();
        }
        if (n.kind === 'encounterRoom') n.peaceful ? peaceful++ : fight++;
      }
    }
    expect(peaceful).toBeGreaterThan(0);
    expect(fight).toBeGreaterThan(0);
  });
  it('소품 규칙이 시작·포탈 방에 없다', () => {
    expect(D.mapgen.roomProps.rules.startRoom).toBeUndefined();
    expect(D.mapgen.roomProps.rules.exitRoom).toBeUndefined();
  });
  it('평화로운 칸 확률은 보물·상인 가중치와 맞는다', () => {
    const w = D.loot.encounter.weights;
    const sum = Object.values(w).reduce((a, b) => a + b, 0);
    expect(D.mapgen.encounterPeaceful.chance).toBeCloseTo((w.treasure + w.merchant) / sum, 2);
  });
  it('평화로운 칸은 보물·상인만, 아니면 전투 유형만', () => {
    const all = new Set(Object.keys(D.loot.encounter.weights) as (keyof typeof D.loot.encounter.weights)[]);
    expect([...encounterPool(all, true)].sort()).toEqual(['merchant', 'treasure']);
    expect(encounterPool(all, false).has('merchant')).toBe(false);
    expect(encounterPool(all, false).has('raid')).toBe(true);
  });
  it('시드 RNG 재현', () => {
    expect(generateStage(5, 1, 1, D.mapgen).rooms.map((n) => n.peaceful)).toEqual(generateStage(5, 1, 1, D.mapgen).rooms.map((n) => n.peaceful));
    void Rng;
  });
});

describe('스탯', () => {
  const base = startingStats(D.stats.startValue);
  it('민첩이 회피 재사용을 줄인다', () => {
    expect(statEffect('dodgeCooldown', base, D.stats)).toBe(0);
    expect(statEffect('dodgeCooldown', { ...base, agility: 30 }, D.stats)).toBeGreaterThan(0);
    expect(D.stats.effects.dodgeCooldown.cap).toBeLessThan(0.5);
  });
  it('정보창 줄: 스탯별로 효과가 있고 문구가 있다', () => {
    for (const s of D.stats.stats) {
      const lines = statSheetLines(s.id, base, D.stats, D.tags, D.player.sanity);
      expect(lines.length, s.id).toBeGreaterThan(0);
      for (const l of lines) expect(D.text[l.key], l.key).toBeTypeOf('string');
    }
  });
  it('정보창 줄: 값이 스탯을 따라 오른다', () => {
    const v = (st: typeof base) => statSheetLines('strength', st, D.stats, D.tags, D.player.sanity)[0]!.value;
    expect(v({ ...base, strength: 20 })).toBeCloseTo(40);
    expect(statSheetLines('willpower', base, D.stats, D.tags, D.player.sanity).at(-1)).toEqual({ key: 'sheet.sanityMax', value: 100 });
  });
  it('정신력 회복이 느려졌다', () => {
    expect(D.player.sanity.regenPerSec).toBeLessThan(2);
  });
});

describe('화면 수치', () => {
  it('무기는 몸 가운데', () => {
    expect(D.player.weaponHand.x).toBe(0);
  });
  it('사망 연출 시간이 있다', () => {
    expect(D.juice.playerDeath.sec).toBeGreaterThan(0.5);
  });
});
