import { describe, expect, it } from 'vitest';
import { gameData } from '../src/data/index';
import {
  advanceOverflow,
  bossForStage,
  contentChapter,
  firstOverflowStage,
  newOverflowState,
  overflowBossScale,
  overflowEnemyScale,
  resolveBossId,
  stageBossId,
  waveChaptersOf,
  type OverflowState,
} from '../src/systems/overflow';
import type { StageRef } from '../src/systems/run';
import { generateStage } from '../src/systems/mapgen';

const d = gameData;
const O = d.overflow;

/** 시드 하나로 n스테이지 진행 */
function play(seed: number, n: number): { stage: StageRef; state: OverflowState }[] {
  let stage = firstOverflowStage();
  let state = newOverflowState();
  const out = [{ stage, state }];
  for (let i = 1; i < n; i++) {
    const r = advanceOverflow(seed, stage, state, d);
    stage = r.next;
    state = r.state;
    out.push({ stage, state });
  }
  return out;
}

const at = (list: ReturnType<typeof play>, c: number, s: number) => list.find((x) => x.stage.chapter === c && x.stage.stage === s)!.stage;

describe('오버플로우 진행', () => {
  it('끝이 없다: X-5 다음은 다음 장 1스테이지', () => {
    const list = play(1, 60);
    expect(list[59]!.stage).toMatchObject({ chapter: 12, stage: 5 });
    expect(list.map((x) => `${x.stage.chapter}-${x.stage.stage}`).slice(4, 7)).toEqual(['1-5', '2-1', '2-2']);
  });

  it('1~3장은 고정 순서: 테마·보스 지정 없이 본편 그대로', () => {
    for (const x of play(3, 15)) {
      expect(x.stage.theme).toBeUndefined();
      expect(x.stage.boss).toBeUndefined();
      expect(contentChapter(x.stage)).toBe(x.stage.chapter);
    }
  });

  it('4장부터 랜덤 장: 한 장 안에서는 같은 테마, 풀에 1~3장과 전용 맵이 섞인다', () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 40; seed++) {
      const list = play(seed, 50);
      for (let c = 4; c <= 10; c++) {
        const ids = new Set([1, 2, 3, 4, 5].map((s) => at(list, c, s).theme!.id));
        expect(ids.size).toBe(1);
        seen.add([...ids][0]!);
      }
    }
    for (const t of O.themes) expect(seen.has(t.id)).toBe(true);
  });

  it('같은 테마가 두 장 연속으로 나오지 않는다', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const list = play(seed, 60);
      for (let c = 5; c <= 12; c++) expect(at(list, c, 1).theme!.id).not.toBe(at(list, c - 1, 1).theme!.id);
    }
  });

  it('같은 시드는 같은 결과', () => {
    expect(JSON.stringify(play(77, 45))).toBe(JSON.stringify(play(77, 45)));
    expect(JSON.stringify(play(77, 45))).not.toBe(JSON.stringify(play(78, 45)));
  });

  it('테마의 표 조회 장·웨이브 장', () => {
    const list = play(5, 30);
    const s = at(list, 4, 1);
    expect(contentChapter(s)).toBe(s.theme!.chapter);
    expect(waveChaptersOf(s)).toEqual(s.theme!.waveChapters);
    expect(waveChaptersOf({ chapter: 2, stage: 1 })).toEqual([2]);
  });

  it('랜덤 장도 방 배치 보장: 시작 방·조우 칸 1개 이상·보스방(X-2·X-5)', () => {
    const list = play(11, 50);
    for (const x of list.filter((y) => y.stage.chapter >= 4)) {
      const map = generateStage(11, x.stage.chapter, x.stage.stage, d.mapgen);
      const kinds = map.rooms.map((r) => r.kind);
      expect(kinds.filter((k) => k === 'startRoom')).toHaveLength(1);
      expect(kinds.filter((k) => k === 'encounterRoom').length).toBeGreaterThanOrEqual(1);
      expect(kinds.filter((k) => k === 'bossRoom')).toHaveLength([2, 5].includes(x.stage.stage) ? 1 : 0);
    }
  });
});

describe('오버플로우 보스 칸', () => {
  const story = (c: number, s: number) => d.bosses.bosses.find((b) => b.chapter === c && b.stage === s)!.id;

  it('4-2는 그 장(기준 장)의 X-2 보스', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const s = at(play(seed, 25), 4, 2);
      expect(s.boss).toBe(story(s.theme!.chapter, 2));
    }
  });

  it('4-5 헥타르 미모사, 3의 배수 장 X-5 마기카이저, 7-5 아크로 미모사', () => {
    const list = play(9, 75);
    expect(at(list, 4, 5).boss).toBe('hectarMimosa');
    for (const c of [6, 9, 12, 15]) expect(at(list, c, 5).boss).toBe('magiKaiser');
    expect(at(list, 7, 5).boss).toBe('acroMimosa');
    expect(list.filter((x) => x.stage.boss === 'acroMimosa')).toHaveLength(1);
  });

  it('아크로 미모사는 한 번만: 이미 만났으면 7-5도 풀에서 추첨', () => {
    const state: OverflowState = { ...newOverflowState(), onceBosses: ['acroMimosa'] };
    const b = bossForStage(4, 7, 5, { id: 'ch1', chapter: 1, waveChapters: [1] }, state, d);
    expect(O.bossPools['5']).toContain(b);
  });

  it('나머지 X-2·X-5는 풀에서 추첨, 직전 보스와 다르다', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const list = play(seed, 70);
      const fixed = new Set(['4-2', '4-5', '7-5', '6-5', '9-5', '12-5']);
      let prev: string | undefined;
      for (const x of list) {
        if (x.stage.chapter < 4 || ![2, 5].includes(x.stage.stage)) continue;
        const key = `${x.stage.chapter}-${x.stage.stage}`;
        if (!fixed.has(key)) {
          expect(O.bossPools[String(x.stage.stage)]).toContain(x.stage.boss);
          expect(x.stage.boss).not.toBe(prev);
        }
        prev = x.stage.boss;
      }
    }
  });

  it('보스가 없는 스테이지는 boss 없음', () => {
    for (const x of play(2, 40)) if (![2, 5].includes(x.stage.stage)) expect(x.stage.boss).toBeUndefined();
  });

  it('스폰할 보스 id: 본편은 장·스테이지 표, 오버플로우는 칸 → 임시 보스로 대신', () => {
    expect(stageBossId({ chapter: 2, stage: 2 }, d)).toBe('hectarChief');
    expect(stageBossId({ chapter: 4, stage: 5, boss: 'hectarMimosa' }, d)).toBe(O.placeholderBosses.hectarMimosa);
    expect(resolveBossId('magiKaiser', d)).toBe('magiKaiser');
    for (const id of Object.values(O.placeholderBosses)) expect(d.enemies.enemies.some((e) => e.id === id)).toBe(true);
  });
});

describe('오버플로우 장 배율', () => {
  it('1~3장은 배율 없음', () => {
    expect(overflowEnemyScale(3, 1, d)).toEqual({ hp: 1, damage: 1 });
    expect(overflowBossScale(2, 'fusionAkgwi', 2, d)).toEqual({ hp: 1, damage: 1 });
  });

  it('4장부터: 적은 자기 장 → 3장 수준 + 장마다 성장', () => {
    const g = O.scale.growthPerChapter;
    expect(overflowEnemyScale(4, 3, d).hp).toBeCloseTo(1 + g.hp);
    expect(overflowEnemyScale(4, 1, d).hp).toBeCloseTo(O.scale.tierToChapter3['1']!.hp * (1 + g.hp));
    expect(overflowEnemyScale(6, 2, d).damage).toBeCloseTo(O.scale.tierToChapter3['2']!.damage * (1 + 3 * g.damage));
  });

  it('4장부터 보스: 같은 칸의 3장 보스 체력·피해 단계에 맞춘다', () => {
    const hp = (id: string) => d.enemies.enemies.find((e) => e.id === id)!.maxHp;
    const g = 1 + O.scale.growthPerChapter.hp;
    const s = overflowBossScale(4, 'fusionAkgwi', 2, d);
    expect(hp('fusionAkgwi') * s.hp).toBeCloseTo(hp('eclipse') * g);
    expect(s.damage).toBeCloseTo((O.scale.bossDamageTier.eclipse! / O.scale.bossDamageTier.fusionAkgwi!) * (1 + O.scale.growthPerChapter.damage));
    expect(overflowBossScale(4, 'magiKaiser', 5, d).hp).toBeCloseTo(g);
  });
});

describe('디버그 스테이지 이동', () => {
  it('overflowStageAt은 정상 진행과 같은 스테이지·상태', async () => {
    const { overflowStageAt } = await import('../src/systems/overflow');
    const list = play(21, 40);
    const x = list.find((y) => y.stage.chapter === 7 && y.stage.stage === 5)!;
    expect(overflowStageAt(21, 7, 5, d)).toEqual(x);
  });
});
