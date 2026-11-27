/**
 * E — 오버플로우 통합 점검: 여러 시드로 1-1부터 40장까지 이어서 진행하며, 스테이지마다 진화 카드를 하나씩 고른다.
 * 보스 칸·랜덤 장·방 배치·진화 중첩과 상한·장 배율이 끝까지 규칙을 지키는지 한꺼번에 본다.
 */
import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import { gameData as d } from '../src/data/index';
import { evolvedStats, evolvedWave, newEvolutionState, pickEvolution, rollEvolutionCards, uniqueSpawns, type EvolutionState } from '../src/systems/evolution';
import { generateStage } from '../src/systems/mapgen';
import { advanceOverflow, firstOverflowStage, newOverflowState, overflowBossScale, overflowEnemyScale, stageBossId, type OverflowState } from '../src/systems/overflow';
import type { StageRef } from '../src/systems/run';

const O = d.overflow;
const E = O.evolution;
const CHAPTERS = 40;
const SEEDS = [1, 7, 42, 2026];

interface Step {
  stage: StageRef;
  state: OverflowState;
  evo: EvolutionState;
  cards: number;
}

/** 1-1부터 chapters장 끝까지. 진화 카드는 매번 굴려 첫 장을 고른다 */
function longRun(seed: number, chapters: number): Step[] {
  let stage = firstOverflowStage();
  let state = newOverflowState();
  let evo = newEvolutionState();
  const rng = Rng.derive(seed, 'long-run-evo');
  const out: Step[] = [];
  while (stage.chapter <= chapters) {
    const cards = rollEvolutionCards(rng, evo, E);
    out.push({ stage, state, evo, cards: cards.length });
    evo = pickEvolution(evo, cards[0]!, E);
    const r = advanceOverflow(seed, stage, state, d);
    stage = r.next;
    state = r.state;
  }
  return out;
}

const runs = SEEDS.map((s) => ({ seed: s, steps: longRun(s, CHAPTERS) }));
const bossOf = (st: Step) => st.stage.boss ?? stageBossId(st.stage, d);
const known = (id: string) => d.bosses.bosses.some((b) => b.id === id) || id === O.mimosa.enemyId || id === O.acro.enemyId;

describe('오버플로우 장기 진행 (40장 × 시드 4개)', () => {
  it('스테이지가 빠짐없이 이어진다 (장마다 5스테이지)', () => {
    for (const { steps } of runs) {
      expect(steps).toHaveLength(CHAPTERS * 5);
      steps.forEach((st, i) => expect(st.stage).toMatchObject({ chapter: Math.floor(i / 5) + 1, stage: (i % 5) + 1 }));
    }
  });

  it('고정 보스 칸: 4-5 헥타르 미모사, 3의 배수 장 X-5 마기카이저, 7-5 아크로 미모사는 런 전체에 딱 한 번', () => {
    for (const { steps } of runs) {
      const at = (c: number, s: number) => steps.find((x) => x.stage.chapter === c && x.stage.stage === s)!;
      expect(at(4, 5).stage.boss).toBe(O.mimosa.enemyId);
      expect(at(7, 5).stage.boss).toBe(O.acro.enemyId);
      expect(steps.filter((x) => x.stage.boss === O.acro.enemyId)).toHaveLength(1);
      for (let c = 6; c <= CHAPTERS; c += 3) if (c !== 7) expect(at(c, 5).stage.boss).toBe('magiKaiser');
    }
  });

  it('보스 스테이지마다 싸울 수 있는 보스가 있다 (전투 데이터가 있는 보스)', () => {
    for (const { steps } of runs) {
      for (const st of steps.filter((x) => d.mapgen.bossStages.includes(x.stage.stage))) {
        const id = bossOf(st);
        expect(id, `${st.stage.chapter}-${st.stage.stage}`).toBeDefined();
        expect(known(id!), id).toBe(true);
      }
    }
  });

  it('4장부터 랜덤 장: 두 장 연속 같은 테마 없음, 장 안에서는 같은 테마', () => {
    for (const { steps } of runs) {
      const theme = (c: number) => steps.find((x) => x.stage.chapter === c)!.stage.theme?.id;
      for (let c = 5; c <= CHAPTERS; c++) expect(theme(c), `${c}장`).not.toBe(theme(c - 1));
      for (const st of steps.filter((x) => x.stage.chapter >= 4)) expect(st.stage.theme?.id).toBe(theme(st.stage.chapter));
    }
  });

  it('방 배치 보장: 시작 방 1, 조우 칸 1 이상, 보스 스테이지만 보스방 1 (40장 전부)', () => {
    const { seed, steps } = runs[0]!;
    for (const st of steps) {
      const kinds = generateStage(seed, st.stage.chapter, st.stage.stage, d.mapgen).rooms.map((r) => r.kind);
      expect(kinds.filter((k) => k === 'startRoom')).toHaveLength(1);
      expect(kinds.filter((k) => k === 'encounterRoom').length).toBeGreaterThanOrEqual(1);
      expect(kinds.filter((k) => k === 'bossRoom')).toHaveLength(d.mapgen.bossStages.includes(st.stage.stage) ? 1 : 0);
    }
  });

  it('진화 카드는 끝까지 매번 3장, 중첩은 최대를 넘지 않는다 (200번 고른 뒤에도)', () => {
    for (const { steps } of runs) {
      for (const st of steps) {
        expect(st.cards).toBe(E.cardCount);
        for (const n of Object.values(st.evo.stacks)) expect(n).toBeLessThanOrEqual(E.maxStacks);
        expect(st.evo.uniques.length).toBeLessThanOrEqual(E.uniques.length);
      }
      // 끝에는 공용 진화가 소진돼 과부하 누적이 쌓여 있다
      expect(steps[steps.length - 1]!.evo.overloadStacks).toBeGreaterThan(0);
    }
  });

  it('끝까지 쌓인 진화 수치는 유한하고 상한을 지킨다', () => {
    for (const { steps } of runs) {
      const s = evolvedStats(steps[steps.length - 1]!.evo, 'common', E);
      for (const [k, v] of Object.entries(s)) if (typeof v === 'number') expect(Number.isFinite(v), k).toBe(true);
      expect(s.defense).toBeLessThanOrEqual(E.caps.defense);
      expect(s.regenPerSec).toBeLessThanOrEqual(E.caps.regenPerSec);
      expect(s.knockbackRes).toBeLessThanOrEqual(E.caps.knockbackRes);
      if (s.split) expect(s.split.chance).toBeLessThanOrEqual(E.caps.splitChance);
    }
  });

  it('모바일 부하: 진화가 다 쌓여도 한 웨이브 적 수는 상한 안 (가장 큰 웨이브 기준)', () => {
    const biggest = Math.max(...d.waves.waves.map((w) => w.spawns.reduce((n, s) => n + (Array.isArray(s.count) ? s.count[1] : 1), 0)));
    expect(biggest).toBeLessThan(E.caps.maxWave);
    for (const { seed, steps } of runs) {
      const evo = steps[steps.length - 1]!.evo;
      const mul = evolvedStats(evo, 'common', E).countMul;
      const rng = Rng.derive(seed, 'wave-load');
      for (let i = 0; i < 300; i++) {
        const wave = Array.from({ length: biggest }, (_, k) => `e${k}`);
        const out = evolvedWave(rng, wave, mul, uniqueSpawns(rng, evo, E), E.caps.maxWave);
        expect(out.length).toBeLessThanOrEqual(E.caps.maxWave);
        expect(out.length).toBeGreaterThanOrEqual(wave.length);
      }
    }
  });

  it('장 배율: 유한, 장이 갈수록 커진다 (적·보스)', () => {
    let prev = { hp: 0, damage: 0 };
    for (let c = 4; c <= CHAPTERS; c++) {
      const e = overflowEnemyScale(c, 1, d);
      expect(e.hp).toBeGreaterThan(prev.hp);
      expect(e.damage).toBeGreaterThan(prev.damage);
      prev = e;
      const b = overflowBossScale(c, 'magiKaiser', 5, d);
      expect(Number.isFinite(b.hp) && b.hp > 0 && Number.isFinite(b.damage) && b.damage > 0).toBe(true);
    }
  });

  it('같은 시드는 끝까지 같은 진행', () => {
    const a = longRun(7, 12).map((x) => `${x.stage.chapter}-${x.stage.stage}:${x.stage.theme?.id ?? ''}:${x.stage.boss ?? ''}`);
    const b = longRun(7, 12).map((x) => `${x.stage.chapter}-${x.stage.stage}:${x.stage.theme?.id ?? ''}:${x.stage.boss ?? ''}`);
    expect(a).toEqual(b);
  });
});
