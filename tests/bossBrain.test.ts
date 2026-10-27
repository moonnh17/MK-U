import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import { BOSS_PATTERN_IDS } from '../src/bosses/patterns';
import { gameData } from '../src/data/index';
import { RoomState } from '../src/systems/roomState';
import { availablePatterns, initialBoss, stepBoss, type BossBrainState, type BossPatternRule } from '../src/systems/bossBrain';

const P: BossPatternRule[] = [
  { id: 'claw', weight: 3, cooldownSec: 2, durationSec: 1, phase: 1, maxRange: 80 },
  { id: 'dash', weight: 2, cooldownSec: 4, durationSec: 1.5, phase: 1 },
  { id: 'blast', weight: 1, cooldownSec: 5, durationSec: 1, phase: 1 },
  { id: 'rage', weight: 5, cooldownSec: 3, durationSec: 1, phase: 2 },
];
const cfg = { enrageAt: 0.5, gapSec: 0.5, enrageSec: 1 };

function run(s: BossBrainState, sec: number, hp: number, dist: number, seed = 1) {
  const rng = new Rng(seed);
  const starts: string[] = [];
  const all: string[] = [];
  for (let t = 0; t < sec - 1e-9; t += 0.05) {
    const r = stepBoss(s, 0.05, hp, dist, P, cfg, rng);
    s = r.state;
    for (const e of r.events) {
      all.push(e.type === 'enrage' ? 'enrage' : `${e.type}:${e.id}`);
      if (e.type === 'start') starts.push(e.id);
    }
  }
  return { s, starts, all };
}

describe('보스 패턴 선택', () => {
  it('첫 대기 뒤에 패턴을 시작한다', () => {
    expect(run(initialBoss(1), 0.9, 1, 50).starts).toEqual([]);
    expect(run(initialBoss(1), 1.1, 1, 50).starts).toHaveLength(1);
  });

  it('같은 패턴을 두 번 연속 쓰지 않는다', () => {
    for (let seed = 1; seed < 20; seed++) {
      const { starts } = run(initialBoss(0), 30, 1, 50, seed);
      expect(starts.length).toBeGreaterThan(5);
      for (let i = 1; i < starts.length; i++) expect(starts[i]).not.toBe(starts[i - 1]);
    }
  });

  it('쿨타임이 남은 패턴은 고르지 않는다', () => {
    const s: BossBrainState = { ...initialBoss(0), cooldowns: { claw: 5, dash: 5 } };
    expect(availablePatterns(s, P, 50).map((p) => p.id)).toEqual(['blast']);
  });

  it('사거리 조건: 멀면 근접 패턴이 빠진다', () => {
    expect(availablePatterns(initialBoss(0), P, 200).map((p) => p.id)).toEqual(['dash', 'blast']);
  });

  it('강화 패턴은 강화 단계 전에는 나오지 않는다', () => {
    for (let seed = 1; seed < 10; seed++) expect(run(initialBoss(0), 20, 1, 50, seed).starts).not.toContain('rage');
  });

  it('체력 50% 이하에서 한 번만 강화 단계로 바뀌고, 하던 패턴을 끝낸 뒤 쉰다', () => {
    let s = run(initialBoss(0), 0.2, 1, 50).s;
    expect(s.current).not.toBeNull();
    const r = run(s, 0.05, 0.5, 50);
    expect(r.all[0]).toMatch(/^end:/);
    expect(r.all).toContain('enrage');
    expect(r.s.phase).toBe(2);
    expect(r.s.current).toBeNull();
    // 쉬는 동안(enrageSec) 패턴 없음
    s = r.s;
    expect(run(s, 0.9, 0.4, 50).starts).toEqual([]);
    const later = run(s, 30, 0.3, 50);
    expect(later.all.filter((x) => x === 'enrage')).toHaveLength(0);
    expect(later.starts).toContain('rage');
  });

  it('같은 시드면 같은 순서', () => {
    expect(run(initialBoss(0), 15, 1, 50, 7).starts).toEqual(run(initialBoss(0), 15, 1, 50, 7).starts);
  });
});

describe('보스방 경고 대기', () => {
  it('입장 대기 시간이 지난 뒤 첫 웨이브(보스)가 나온다', () => {
    const room = new RoomState('bossRoom', [['boss']], 0.8);
    expect(room.enter(1.5)).toEqual([{ type: 'lock' }]);
    expect(room.update(1)).toEqual([]);
    expect(room.update(0.6)).toEqual([]);
    expect(room.update(0.1)).toEqual([{ type: 'spawn', wave: ['boss'], index: 0 }]);
  });
  it('대기 없이 들어가면 바로', () => {
    const room = new RoomState('combatRoom', [['a']], 0.8);
    room.enter();
    expect(room.update(0.01)).toEqual([{ type: 'spawn', wave: ['a'], index: 0 }]);
  });
});

describe('챕터1 보스 데이터 (기획서 보스 패턴 표)', () => {
  const boss = (id: string) => gameData.bosses.bosses.find((b) => b.id === id)!;
  const names = (id: string, phase: 1 | 2) => boss(id).patterns.filter((p) => p.phase === phase).map((p) => gameData.text[`boss.pattern.${p.id}`]);

  it('1-2 융합악귀, 1-5 전기환띠', () => {
    expect(boss('fusionAkgwi').stage).toBe(2);
    expect(boss('electricRing').stage).toBe(5);
    expect(gameData.text['enemy.fusionAkgwi']).toBe('융합악귀');
    expect(gameData.text['enemy.electricRing']).toBe('전기환띠');
  });

  it('패턴 이름이 표와 같다', () => {
    expect(names('fusionAkgwi', 1)).toEqual(['악귀 할퀴기', '원혼 돌진', '악귀 분출', '원혼 폭발']);
    expect(names('electricRing', 1)).toEqual(['낙뢰 추적', '전격 파문', '회전 번개', '전격 감옥']);
    expect(names('electricRing', 2)).toEqual(['청뢰 돌진', '뇌전 봉쇄', '수축 전류']);
  });

  it('강화 단계는 체력 50% 이하', () => {
    for (const b of gameData.bosses.bosses) expect(b.enrageAt).toBe(0.5);
    // 폭주: 이동·돌진 가속, 분출 증가 / 거대화
    const f = boss('fusionAkgwi');
    expect(f.enraged.moveSpeedMul).toBeGreaterThan(1);
    expect(f.patterns.find((p) => p.id === 'spiritDash')!.values.speedEnraged).toBeGreaterThan(f.patterns.find((p) => p.id === 'spiritDash')!.values.speed!);
    expect(f.patterns.find((p) => p.id === 'eruption')!.values.bulletsEnraged).toBeGreaterThan(f.patterns.find((p) => p.id === 'eruption')!.values.bullets!);
    expect(boss('electricRing').enraged.scale).toBeGreaterThan(1);
  });

  it('모든 패턴에 실행 코드가 있다', () => {
    for (const b of gameData.bosses.bosses) for (const p of b.patterns) expect(BOSS_PATTERN_IDS).toContain(p.id);
  });
});