import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import { gameData } from '../src/data/index';
import { validateGameData } from '../src/data/validate';
import { eliteMods, pickTwoElites } from '../src/systems/elites';
import { spireSize } from '../src/systems/spire';
import { BOSS_PATTERN_IDS } from '../src/bosses/patterns';

const B = gameData.bosses.bosses;
const boss = (id: string) => B.find((b) => b.id === id)!;
const item = (id: string) => gameData.items.items.find((x) => x.id === id)!;

describe('챕터2 보스 (기획서 표)', () => {
  it('2-2 헥타르 수석 연구원, 2-5 마기골렘', () => {
    expect([boss('hectarChief').chapter, boss('hectarChief').stage]).toEqual([2, 2]);
    expect([boss('magiGolem').chapter, boss('magiGolem').stage]).toEqual([2, 5]);
  });
  it('헥타르 수석 연구원: 화력망 6종 + 벼락 실증(강화), 반물질 3→5, 주기 20% 단축', () => {
    const b = boss('hectarChief');
    expect(b.patterns.map((p) => p.id)).toEqual(['repulse', 'droneFire', 'antimatter', 'railCross', 'mineSiege', 'vectorField', 'boltProof', 'callTroopers']);
    expect(b.patterns.find((p) => p.id === 'boltProof')!.phase).toBe(2);
    const am = b.patterns.find((p) => p.id === 'antimatter')!.values;
    expect([am.count, am.countEnraged]).toEqual([3, 5]);
    expect(b.gapSecEnraged).toBeCloseTo(b.gapSec * 0.8);
    expect(b.patterns.find((p) => p.id === 'callTroopers')!.summon).toBe('hectarTrooper');
  });
  it('마기골렘: 대지 분쇄·마기 포격·파멸 광선·폐허의 군세·파성 돌진·위압, 광폭화에 지각 균열·붕괴 지대·종말의 단층', () => {
    const b = boss('magiGolem');
    expect(b.patterns.filter((p) => p.phase === 1).map((p) => p.id)).toEqual(['earthCrush', 'bombard', 'ruinBeam', 'ruinLegion', 'breakerDash', 'golemIntimidate']);
    expect(b.patterns.find((p) => p.id === 'breakerDash')!.values).toMatchObject({ exposeSec: 2.1, exposeMul: 2.2 });
    expect(b.patterns.filter((p) => p.phase === 2).map((p) => p.id)).toEqual(['crustCrack', 'collapseZone', 'doomFault']);
  });
  it('모든 패턴에 실행 객체가 있다', () => {
    for (const b of [...B, ...gameData.bosses.hiddenBosses]) for (const p of b.patterns) expect(BOSS_PATTERN_IDS).toContain(p.id);
  });
  it('데이터 검증 통과', () => {
    expect(validateGameData(gameData)).toEqual([]);
  });
});

describe('챕터2 보스 전용 아이템', () => {
  it('헥타르 RAM: 레어, 마기력 +4, 코인 +10%, 2-2 처치 시 20%', () => {
    expect(item('hectarRam')).toMatchObject({ grade: 'rare', pool: 'boss', bossId: 'hectarChief', dropChance: 0.2 });
  });
  it('고대병기의 코어: 마기골렘 전용 유니크 레이저 무기', () => {
    const w = gameData.weapons.weapons.find((x) => x.id === 'ancientCore')!;
    expect(w).toMatchObject({ grade: 'unique', bossId: 'magiGolem', droppable: false });
    expect(w.signature).toMatchObject({ kind: 'laser', every: 1 });
  });
});

describe('중형 첨탑', () => {
  const M = gameData.loot.spire.medium;
  it('스킬 2개 선택, 강적 75%', () => {
    expect(M.picks).toBe(2);
    expect(M.strongChance).toBe(0.75);
  });
  it('1장·2장 초반은 소형만, 2-3부터 50%, 3장은 대형 50%·아니면 중형', () => {
    const count = (c: number, s: number) => {
      let n = 0;
      for (let i = 0; i < 1000; i++) if (spireSize(new Rng(i), c, s, gameData.loot.spire) === 'medium') n++;
      return n / 1000;
    };
    expect(count(1, 5)).toBe(0);
    expect(count(2, 2)).toBe(0);
    expect(count(2, 3)).toBeGreaterThan(0.45);
    expect(count(2, 3)).toBeLessThan(0.55);
    expect(count(3, 1)).toBeGreaterThan(0.45);
    expect(count(3, 1)).toBeLessThan(0.55);
  });
});

describe('엘리트 2종이 겹친 개체', () => {
  const E = gameData.elites;
  const el = (id: string) => E.elites.find((x) => x.id === id)!;
  it('서로 다른 2종', () => {
    for (let s = 0; s < 100; s++) {
      const [a, b] = pickTwoElites(new Rng(s), E);
      expect(a).not.toBe(b);
    }
  });
  it('크기·체력 배율은 한 번, 종류별 배율은 곱한다', () => {
    const m = eliteMods([el('giant'), el('swift')], E);
    expect(m.scale).toBe(E.common.scale);
    expect(m.hpMul).toBe(E.common.hpMul);
    expect(m.damageTakenMul).toBeCloseTo(0.7);
    expect(m.moveSpeedMul).toBeCloseTo(1.5);
    expect(eliteMods(el('giant'), E)).toEqual(eliteMods([el('giant')], E));
  });
});
