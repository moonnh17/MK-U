import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import { gameData } from '../src/data/index';
import { advanceStage, firstStage } from '../src/systems/run';
import { RoomState, planCombatWaves, wavesForRoom } from '../src/systems/roomState';

const DELAY = 0.5;

/** 방 하나를 끝까지 돌린다: 소환되는 대로 전부 처치 */
function playThrough(room: RoomState): string[] {
  const log: string[] = [];
  for (let step = 0; step < 1000 && room.phase !== 'cleared'; step++) {
    for (const e of room.update(0.1)) {
      log.push(e.type);
      if (e.type === 'spawn') for (let i = 0; i < e.wave.length; i++) room.enemyKilled();
    }
  }
  return log;
}

describe('RoomState', () => {
  it('전투 칸: 입장하면 잠기고, 웨이브를 다 깨면 열린다', () => {
    const room = new RoomState('combatRoom', [['a', 'a'], ['b']], DELAY);
    expect(room.phase).toBe('idle');
    expect(room.enter()).toEqual([{ type: 'lock' }]);
    expect(room.phase).toBe('locked');
    expect(playThrough(room)).toEqual(['spawn', 'spawn', 'cleared']);
    expect(room.phase).toBe('cleared');
  });

  it('적이 남아 있으면 다음 웨이브가 나오지 않는다', () => {
    const room = new RoomState('combatRoom', [['a', 'a'], ['b']], DELAY);
    room.enter();
    expect(room.update(0.1)[0]).toMatchObject({ type: 'spawn', index: 0 });
    room.enemyKilled();
    expect(room.update(5)).toEqual([]);
    room.enemyKilled();
    // 웨이브 사이 대기
    expect(room.update(0.1)).toEqual([]);
    room.update(DELAY);
    expect(room.update(0.1)[0]).toMatchObject({ type: 'spawn', index: 1 });
  });

  it('한 번 깬 방은 다시 들어가도 잠기지 않는다', () => {
    const room = new RoomState('combatRoom', [['a']], DELAY);
    room.enter();
    playThrough(room);
    expect(room.enter()).toEqual([]);
    expect(room.phase).toBe('cleared');
  });

  it('웨이브가 없는 방(시작방·조우 칸·출구)은 잠기지 않는다', () => {
    for (const kind of ['startRoom', 'encounterRoom', 'exitRoom'] as const) {
      const room = new RoomState(kind, [], DELAY);
      expect(room.phase).toBe('cleared');
      expect(room.enter()).toEqual([]);
    }
  });

  it('즉시 클리어(디버그)', () => {
    const room = new RoomState('combatRoom', [['a', 'b']], DELAY);
    room.enter();
    room.update(0.1);
    expect(room.forceClear()).toEqual([{ type: 'cleared' }]);
    expect(room.phase).toBe('cleared');
  });
});

describe('웨이브 계획', () => {
  const wd = gameData.waves;
  const range = gameData.mapgen.combatWaves;

  it('전투 칸 웨이브는 2~3번, 챕터1 적만 나온다', () => {
    const ch1 = new Set(gameData.enemies.enemies.filter((e) => e.chapter === 1 && e.rank === 'normal').map((e) => e.id));
    for (let seed = 0; seed < 100; seed++) {
      const waves = planCombatWaves(new Rng(seed), 1, range, wd);
      expect(waves.length).toBeGreaterThanOrEqual(2);
      expect(waves.length).toBeLessThanOrEqual(3);
      for (const w of waves) {
        expect(w.length).toBeGreaterThan(0);
        for (const id of w) expect(ch1.has(id)).toBe(true);
      }
    }
  });

  it('같은 시드·방이면 같은 웨이브', () => {
    const a = wavesForRoom(9, 1, 1, 3, 'combatRoom', range, 'trainingDummy', wd);
    const b = wavesForRoom(9, 1, 1, 3, 'combatRoom', range, 'trainingDummy', wd);
    expect(a).toEqual(b);
  });

  it('보스방은 더미 1개, 나머지 방은 웨이브 없음', () => {
    expect(wavesForRoom(1, 1, 2, 0, 'bossRoom', range, 'trainingDummy', wd)).toEqual([['trainingDummy']]);
    expect(wavesForRoom(1, 1, 1, 0, 'encounterRoom', range, 'trainingDummy', wd)).toEqual([]);
  });
});

describe('스테이지 진행', () => {
  it('1-1 → 1-5 다음은 챕터 클리어', () => {
    let cur = firstStage();
    const seen = [`${cur.chapter}-${cur.stage}`];
    for (;;) {
      const adv = advanceStage(cur, gameData.mapgen);
      if (adv.type === 'chapterClear') {
        expect(adv.chapter).toBe(1);
        break;
      }
      cur = adv.next;
      seen.push(`${cur.chapter}-${cur.stage}`);
    }
    expect(seen).toEqual(['1-1', '1-2', '1-3', '1-4', '1-5']);
  });
});
