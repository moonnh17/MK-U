import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import { gameData } from '../src/data/index';
import { validateGameData } from '../src/data/validate';
import { BOSS_PATTERN_IDS } from '../src/bosses/patterns';
import { hpStage } from '../src/systems/bossGeometry';
import { availablePatterns, initialBoss, stepBoss, type BossBrainState } from '../src/systems/bossBrain';
import { archonMods, archonStage, championStage, championWaves, raidChampions, rescaleHp } from '../src/systems/champions';
import { canBeElite } from '../src/systems/elites';
import { aimLocked, chainWindup, initialAi, stepAi, type AiAttack } from '../src/systems/enemyAi';
import { playableChapters } from '../src/systems/run';
import { spireSize } from '../src/systems/spire';

const B = gameData.bosses.bosses;
const boss = (id: string) => B.find((b) => b.id === id)!;
const enemy = (id: string) => gameData.enemies.enemies.find((e) => e.id === id)!;
const CH = gameData.waves.champions;

describe('챕터3 적 (기획서 로스터)', () => {
  it('일반 적: 고대인(원거리 탄막)·증오의 파편(초고속 돌격), 3장 웨이브는 이 둘로', () => {
    const ids = new Set(gameData.waves.waves.filter((w) => w.chapter === 3).flatMap((w) => w.spawns.map((s) => s.enemy)));
    expect([...ids].sort()).toEqual(['ancientOne', 'hatredShard']);
    expect(enemy('ancientOne').attacks![0]!.kind).toBe('fan');
    expect(enemy('hatredShard').attacks![0]).toMatchObject({ kind: 'lunge', chain: [2, 3] });
  });
  it('3장까지 플레이할 수 있다 (3-5가 런 클리어)', () => {
    expect(playableChapters(gameData.waves, gameData.mapgen)).toBe(3);
  });
  it('정예: 집행자(밧줄)·집정관(저격·흡수)은 champion 등급이고 엘리트가 붙지 않는다', () => {
    expect(CH.ids).toEqual(['executor', 'archon']);
    for (const id of CH.ids) {
      expect(enemy(id).rank).toBe('champion');
      expect(canBeElite(enemy(id).rank)).toBe(false);
    }
    expect(enemy('executor').attacks!.map((a) => a.kind)).toContain('rope');
    expect(enemy('archon').attacks![0]!.kind).toBe('snipe');
    expect(enemy('archon').absorb!.stages).toHaveLength(4);
  });
  it('정예 처치 보상은 일반 엘리트보다 많고, 10% 아이템 상자', () => {
    const c = gameData.elites.common;
    for (const id of CH.ids) {
      const e = enemy(id);
      expect(e.energyOrbs[0]).toBeGreaterThan(c.bonusEnergyOrbs[1]);
      expect(e.coins[0]).toBeGreaterThan(c.bonusCoins[1]);
    }
    expect(CH.itemChestChance).toBe(0.1);
  });
});

describe('정예 등장 규칙', () => {
  it('3-1·3-3·3-4 전투 칸에만 (보스 스테이지·다른 챕터 제외)', () => {
    const at = [1, 2, 3, 4, 5].filter((s) => championStage(3, s, CH));
    expect(at).toEqual([1, 3, 4]);
    expect(championStage(2, 1, CH)).toBe(false);
    for (let seed = 1; seed < 50; seed++) {
      expect(championWaves(new Rng(seed), 3, 2, 3, CH)).toEqual([null, null, null]);
      expect(championWaves(new Rng(seed), 1, 1, 3, CH)).toEqual([null, null, null]);
    }
  });
  it('웨이브마다 1마리까지, 방 하나에 상한까지', () => {
    let some = 0;
    for (let seed = 1; seed < 300; seed++) {
      const w = championWaves(new Rng(seed), 3, 3, 3, CH);
      const n = w.filter((x) => x !== null).length;
      expect(n).toBeLessThanOrEqual(CH.maxPerRoom);
      for (const x of w) if (x) expect(CH.ids).toContain(x);
      if (n > 0) some++;
    }
    // 일부 웨이브에만: 대부분의 방에 나오지만 전부는 아니다
    expect(some).toBeGreaterThan(100);
    expect(some).toBeLessThan(299);
  });
  it('대규모 습격: 3장에서 한 웨이브에 하나 또는 둘이 함께, 다른 챕터는 없음', () => {
    let both = 0;
    for (let seed = 1; seed < 200; seed++) {
      const r = raidChampions(new Rng(seed), 3, 3, CH);
      const filled = r.filter((x) => x.length > 0);
      expect(filled).toHaveLength(1);
      if (filled[0]!.length === 2) both++;
    }
    expect(both).toBeGreaterThan(50);
    expect(both).toBeLessThan(150);
    expect(raidChampions(new Rng(1), 2, 3, CH)).toEqual([[], [], []]);
  });
  it('같은 시드면 같은 배치', () => {
    expect(championWaves(new Rng(9), 3, 4, 3, CH)).toEqual(championWaves(new Rng(9), 3, 4, 3, CH));
  });
});

describe('집정관 흡수', () => {
  const A = enemy('archon').absorb!;
  it('흡수량 60·150·300·500에서 1~4단계, 그 이상은 4단계', () => {
    expect([0, 59, 60, 149, 150, 299, 300, 499, 500, 9999].map((x) => archonStage(x, A))).toEqual([0, 0, 1, 1, 2, 2, 3, 3, 4, 4]);
  });
  it('단계가 오를수록 체력·공격력·후광이 커진다', () => {
    const m = [0, 1, 2, 3, 4].map((s) => archonMods(s, A));
    expect(m[0]).toEqual({ hpMul: 1, damageMul: 1, haloRadius: 0 });
    for (let i = 1; i < m.length; i++) {
      expect(m[i]!.hpMul).toBeGreaterThan(m[i - 1]!.hpMul);
      expect(m[i]!.damageMul).toBeGreaterThan(m[i - 1]!.damageMul);
      expect(m[i]!.haloRadius).toBeGreaterThan(m[i - 1]!.haloRadius);
    }
  });
  it('몇 마리로는 최종 단계가 되지 않는다 (일반 적 다섯으로 2단계 안팎)', () => {
    const five = 5 * enemy('ancientOne').maxHp;
    expect(archonStage(five, A)).toBeLessThan(4);
  });
  it('최대 체력이 늘어도 남은 체력 비율은 그대로', () => {
    expect(rescaleHp(50, 200, 260)).toBe(65);
  });
});

describe('적 행동 (연속 돌진·저격 고정)', () => {
  const rush: AiAttack = { id: 'rush', triggerRange: 100, windupSec: 0.4, actSec: 0.2, recoverSec: 0.5, cooldownSec: 3 };
  it('연속 돌진: 끝난 돌진을 쿨타임 없이 짧은 예고로 다시 시작', () => {
    let s = initialAi([rush]);
    s = stepAi(s, 0.01, 50, [rush]).state;
    s = stepAi(s, 0.5, 50, [rush]).state;
    const end = stepAi(s, 0.3, 50, [rush]);
    expect(end.events.map((e) => e.type)).toEqual(['end']);
    const c = chainWindup(end.state, rush, 0.18);
    expect(c.phase).toBe('windup');
    expect(c.left).toBeCloseTo(0.18);
    expect(stepAi(c, 0.2, 50, [rush]).events.map((e) => e.type)).toEqual(['strike']);
  });
  it('저격: 예고 끝 lockSec 동안만 고정', () => {
    const snipe: AiAttack = { id: 'snipe', triggerRange: 300, windupSec: 1.5, actSec: 0.2, recoverSec: 0.5, cooldownSec: 3 };
    let s = stepAi(initialAi([snipe]), 0.01, 100, [snipe]).state;
    expect(aimLocked(s, 0.3)).toBe(false);
    s = stepAi(s, 1.25, 100, [snipe]).state;
    expect(aimLocked(s, 0.3)).toBe(true);
  });
});

describe('챕터3 보스 (기획서 표)', () => {
  it('3-2 식광, 3-5 마기카이저', () => {
    expect([boss('eclipse').chapter, boss('eclipse').stage]).toEqual([3, 2]);
    expect([boss('magiKaiser').chapter, boss('magiKaiser').stage]).toEqual([3, 5]);
  });
  it('식광: 7패턴, 일식은 체력 20% 이하, 일식 어둠 80px', () => {
    const b = boss('eclipse');
    expect(b.patterns.map((p) => p.id)).toEqual(['sunspotFall', 'orbitCut', 'shadowChase', 'eclipseShards', 'wideErosion', 'gravityCollapse', 'totalEclipse']);
    expect(b.patterns.find((p) => p.id === 'totalEclipse')!.hpBelow).toBe(0.2);
    expect(b.darkness?.lightRadius).toBe(80);
  });
  it('마기카이저: 체력 70·40%에 단계, 마지막 단계에 종말 명령과 독립 계승 4종', () => {
    const b = boss('magiKaiser');
    expect(b.unlocks).toEqual([0.7, 0.4]);
    expect(b.enrageAt).toBe(0);
    const at = (u: number) => b.patterns.filter((p) => !p.inherit && (p.unlock ?? 0) === u).map((p) => p.id);
    expect(at(0)).toEqual(['lineLaser', 'groundShock', 'homingMissiles', 'redBarrage', 'geyser']);
    expect(at(1)).toEqual(['kaiserPunch', 'kaiserDash', 'spinLaser', 'unstableLaser', 'kaiserIntimidate']);
    expect(at(2)).toEqual(['doomCommand']);
    expect(b.patterns.filter((p) => p.inherit).map((p) => p.id)).toEqual(['redChase', 'redFault', 'redSunspots', 'redEruption']);
    expect(b.inherit).toEqual({ rollSec: 0.75, chance: 0.35, minGapSec: 8 });
  });
  it('모든 패턴에 실행 객체가 있다', () => {
    for (const b of B) for (const p of b.patterns) expect(BOSS_PATTERN_IDS).toContain(p.id);
  });
  it('데이터 검증 통과', () => {
    expect(validateGameData(gameData)).toEqual([]);
  });
});

describe('체력 단계 (마기카이저)', () => {
  const b = boss('magiKaiser');
  const rules = b.patterns.filter((p) => !p.inherit);
  const cfg = { enrageAt: b.enrageAt, gapSec: b.gapSec, enrageSec: b.enrageSec, unlocks: b.unlocks };
  it('체력 → 단계', () => {
    expect([1, 0.71, 0.7, 0.41, 0.4, 0.01].map((h) => hpStage(h, b.unlocks))).toEqual([0, 0, 1, 1, 2, 2]);
    expect(hpStage(0.1)).toBe(0);
  });
  it('열리기 전 패턴은 고르지 않고, 단계가 열리면 하던 패턴을 끝내고 unlock 한 번씩', () => {
    let s: BossBrainState = initialBoss(0);
    const rng = new Rng(3);
    const unlocks: number[] = [];
    const before = new Set<string>();
    for (let t = 0; t < 30; t += 0.05) {
      const r = stepBoss(s, 0.05, t < 15 ? 1 : t < 22 ? 0.6 : 0.3, 50, rules, cfg, rng);
      s = r.state;
      for (const e of r.events) {
        if (e.type === 'unlock') unlocks.push(e.stage);
        if (e.type === 'start' && t < 15) before.add(e.id);
      }
    }
    expect(unlocks).toEqual([1, 2]);
    expect([...before].every((id) => ['lineLaser', 'groundShock', 'homingMissiles', 'redBarrage', 'geyser'].includes(id))).toBe(true);
    expect(s.phase).toBe(1);
  });
  it('체력이 회복돼도 단계는 내려가지 않고, 마지막 단계면 종말 명령까지 쓴다', () => {
    const s = stepBoss({ ...initialBoss(5), unlocked: 2 }, 0.05, 1, 50, rules, cfg, new Rng(1)).state;
    expect(s.unlocked).toBe(2);
    expect(availablePatterns(s, rules, 50).map((p) => p.id)).toContain('doomCommand');
    expect(availablePatterns({ ...s, unlocked: 1 }, rules, 50).map((p) => p.id)).not.toContain('doomCommand');
  });
  it('지열 분출은 구속 단계 전용', () => {
    expect(availablePatterns({ ...initialBoss(0), unlocked: 0 }, rules, 50).map((p) => p.id)).toContain('geyser');
    expect(availablePatterns({ ...initialBoss(0), unlocked: 1 }, rules, 50).map((p) => p.id)).not.toContain('geyser');
  });
  it('enrageAt 0이면 체력이 낮아도 강화 단계로 가지 않는다', () => {
    const r = stepBoss(initialBoss(0), 0.05, 0.01, 50, rules, cfg, new Rng(1));
    expect(r.events.some((e) => e.type === 'enrage')).toBe(false);
  });
});

describe('식광의 핵', () => {
  it('식광 전용 유니크 무기: 적 자리에 운석', () => {
    const w = gameData.weapons.weapons.find((x) => x.id === 'eclipseCore')!;
    expect(w).toMatchObject({ grade: 'unique', bossId: 'eclipse', droppable: false });
    expect(w.pattern.kind).toBe('meteor');
  });
});

describe('3장 첨탑', () => {
  it('3장은 대형 아니면 중형, 대형은 스킬 3개', () => {
    expect(gameData.loot.spire.large.picks).toBe(3);
    for (let seed = 1; seed < 30; seed++) for (const st of [1, 2, 3, 4, 5]) expect(['medium', 'large']).toContain(spireSize(new Rng(seed), 3, st, gameData.loot.spire));
  });
});

describe('웨이브 밖에서 함께 나온 정예', () => {
  it('정예까지 잡아야 다음 웨이브가 나온다', async () => {
    const { RoomState } = await import('../src/systems/roomState');
    const r = new RoomState('combatRoom', [['a', 'b'], ['c']], 0);
    r.enter();
    expect(r.update(0.1).map((e) => e.type)).toEqual(['spawn']);
    r.addAlive(1);
    r.enemyKilled();
    r.enemyKilled();
    expect(r.update(0.1)).toEqual([]);
    r.enemyKilled();
    expect(r.update(0.1).map((e) => e.type)).toEqual(['spawn']);
  });
});
