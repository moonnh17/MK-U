import { describe, expect, it } from 'vitest';
import { absorbHit, refracts, stackShield, tickShield } from '../src/systems/shield';
import {
  bestClusterTarget,
  chainTargets,
  lineHits,
  priorityTarget,
  ringPoints,
  type RankWeights,
} from '../src/systems/targeting';

const W: RankWeights = { normal: 1, elite: 3, champion: 4, boss: 6, hiddenBoss: 6 };
const t = (x: number, y: number, radius = 4) => ({ x, y, radius });
const r = (x: number, y: number, rank: keyof RankWeights = 'normal') => ({ x, y, radius: 4, rank });

describe('lineHits (레일건 관통)', () => {
  const origin = { x: 0, y: 0 };
  const right = { x: 1, y: 0 };
  it('선 위의 적을 가까운 순으로', () => {
    const targets = [t(100, 0), t(30, 2), t(60, -3)];
    expect(lineHits(origin, right, 200, 3, targets)).toEqual([1, 2, 0]);
  });
  it('폭 밖·뒤쪽·사거리 밖은 제외 (몸 반지름은 포함)', () => {
    const targets = [t(50, 20), t(-30, 0), t(260, 0), t(50, 6)];
    expect(lineHits(origin, right, 200, 3, targets)).toEqual([3]);
  });
});

describe('chainTargets (초전도 연쇄)', () => {
  it('마지막 적에서 가까운 적으로 최대 count번', () => {
    const targets = [t(0, 0), t(50, 0), t(20, 0), t(300, 0)];
    expect(chainTargets({ x: 0, y: 0 }, targets, 2, 80, new Set([0]))).toEqual([2, 1]);
  });
  it('사거리 밖이면 멈춘다', () => {
    const targets = [t(0, 0), t(200, 0)];
    expect(chainTargets({ x: 0, y: 0 }, targets, 2, 80, new Set([0]))).toEqual([]);
  });
});

describe('bestClusterTarget (다연장반입자포 자동 조준)', () => {
  it('밀집 지역을 고른다', () => {
    const targets = [r(0, 0), r(200, 0), r(205, 5), r(195, -5)];
    expect([1, 2, 3]).toContain(bestClusterTarget(targets, 20, W));
  });
  it('강적이 일반 2마리 무리보다 우선', () => {
    const targets = [r(0, 0), r(5, 0), r(200, 0, 'boss')];
    expect(bestClusterTarget(targets, 20, W)).toBe(2);
  });
  it('적이 없으면 -1', () => {
    expect(bestClusterTarget([], 20, W)).toBe(-1);
  });
});

describe('priorityTarget (군집지성 목표)', () => {
  it('등급 우선, 같으면 가까운 적', () => {
    const targets = [r(10, 0), r(100, 0, 'elite'), r(5, 0)];
    expect(priorityTarget({ x: 0, y: 0 }, targets, 150, W)).toBe(1);
    expect(priorityTarget({ x: 0, y: 0 }, [r(10, 0), r(5, 0)], 150, W)).toBe(1);
  });
  it('사거리 밖은 무시', () => {
    expect(priorityTarget({ x: 0, y: 0 }, [r(500, 0, 'boss')], 150, W)).toBe(-1);
  });
});

describe('ringPoints', () => {
  it('고르게 놓는다', () => {
    const pts = ringPoints({ x: 0, y: 0 }, 4, 10, 0);
    expect(pts[0]!.x).toBeCloseTo(10);
    expect(pts[1]!.y).toBeCloseTo(10);
    expect(pts[2]!.x).toBeCloseTo(-10);
  });
});

describe('마기역장 보호막', () => {
  it('쓸 때마다 한 겹씩 3겹까지 쌓인다', () => {
    let s = stackShield(null, 1, 3);
    expect(s.hits).toBe(1);
    for (let i = 0; i < 5; i++) s = stackShield(s, 1, 3);
    expect(s.hits).toBe(3);
  });
  it('공격마다 한 겹씩 막고 다 쓰면 사라진다', () => {
    let s = stackShield(stackShield(null, 1, 3), 1, 3) as ReturnType<typeof stackShield> | null;
    const a = absorbHit(s);
    expect(a.blocked).toBe(true);
    expect(a.shield?.hits).toBe(1);
    s = absorbHit(a.shield).shield;
    expect(s).toBeNull();
    expect(absorbHit(s).blocked).toBe(false);
  });
  it('시간이 지나도 사라지지 않는다', () => {
    expect(tickShield(stackShield(null, 1, 3), 100000)?.hits).toBe(1);
  });
  it('각성: 막기를 다 써도 굴절 시간 동안 일반 탄을 지우고, 끝나면 굴절만 멈춘다', () => {
    const after = absorbHit(stackShield(null, 1, 3, 6, 30)).shield;
    expect(after).not.toBeNull();
    expect(refracts(after, 20, true)).toBe(true);
    expect(refracts(after, 40, true)).toBe(false);
    // 무효화할 수 없는 탄(근접·장판·보스 대형 레이저)
    expect(refracts(after, 20, false)).toBe(false);
    expect(tickShield(after!, 7)).toBeNull();
    const kept = tickShield(stackShield(null, 1, 3, 6, 30), 7);
    expect(kept?.hits).toBe(1);
    expect(refracts(kept, 20, true)).toBe(false);
    expect(refracts(stackShield(null, 1, 3), 5, true)).toBe(false);
  });
});
