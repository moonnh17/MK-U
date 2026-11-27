import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import { gameData } from '../src/data/index';
import { blinkTarget, clashTimes, crossLines, cutLines, hopRoom, segmentDist, summonPlan, themeBosses } from '../src/systems/acroMimosa';

const arena = { x: 0, y: 0, w: 320, h: 200 };
const A = gameData.overflow.acro;

describe('아크로 미모사 (순수 함수)', () => {
  it('순간이동 자리: 방 안(가장자리 여백), 플레이어와 거리 범위', () => {
    const rng = new Rng(4);
    for (let i = 0; i < 50; i++) {
      const p = { x: rng.range(20, 300), y: rng.range(20, 180) };
      const t = blinkTarget(rng, arena, p, A.blink.minDistPx, A.blink.maxDistPx, A.blink.edgePx);
      expect(t.x).toBeGreaterThanOrEqual(A.blink.edgePx);
      expect(t.x).toBeLessThanOrEqual(arena.w - A.blink.edgePx);
      expect(t.y).toBeGreaterThanOrEqual(A.blink.edgePx);
      expect(t.y).toBeLessThanOrEqual(arena.h - A.blink.edgePx);
    }
  });
  it('공간 베기: 첫 선은 플레이어를 지난다, 선 수는 요청대로', () => {
    const p = { x: 100, y: 80 };
    const lines = cutLines(new Rng(2), p, 3, 40);
    expect(lines).toHaveLength(3);
    expect(segmentDist(p, lines[0]!, 600)).toBeLessThan(0.001);
  });
  it('교차 베기: 각도가 고르게 퍼진다 (방 가운데를 지남)', () => {
    const c = { x: 160, y: 100 };
    const lines = crossLines(new Rng(1), c, 6);
    expect(lines).toHaveLength(6);
    const angs = lines.map((l) => ((l.angle % Math.PI) + Math.PI) % Math.PI).sort((a, b) => a - b);
    for (let i = 1; i < angs.length; i++) expect(angs[i]! - angs[i - 1]!).toBeGreaterThan(0.2);
    // 선 사이에 빈 쐐기(안전 구역)가 있다: 가운데에서 먼 곳 중 어떤 선에도 닿지 않는 점이 있다
    const far = Array.from({ length: 36 }, (_, i) => ({ x: c.x + Math.cos((i * Math.PI) / 18) * 90, y: c.y + Math.sin((i * Math.PI) / 18) * 90 }));
    expect(far.some((p) => lines.every((l) => segmentDist(p, l, 640) > 12))).toBe(true);
  });
  it('넘어갈 칸: 보스방과 직전 칸은 빼고, 고를 칸이 없으면 null', () => {
    const rooms = [{ id: 0 }, { id: 1 }, { id: 2 }, { id: 3 }];
    for (let s = 0; s < 20; s++) {
      const r = hopRoom(new Rng(s), rooms, 3, 1);
      expect([0, 2]).toContain(r);
    }
    expect(hopRoom(new Rng(1), [{ id: 3 }], 3, null)).toBeNull();
  });
  it('소환: 그 장의 일반 적 n마리 + 그 장 보스 하나 (뺄 보스 제외)', () => {
    const bosses = themeBosses(gameData, 3, A.summon.excludeBosses);
    expect(bosses).not.toContain('magiKaiser');
    expect(bosses.length).toBeGreaterThan(0);
    const plan = summonPlan(new Rng(5), ['a', 'b'], bosses, 5);
    expect(plan.normals).toHaveLength(5);
    expect(plan.normals.every((x) => ['a', 'b'].includes(x))).toBe(true);
    expect(bosses).toContain(plan.boss);
    expect(summonPlan(new Rng(5), ['a'], [], 2).boss).toBeNull();
  });
  it('합 겨루기: 간격이 점점 짧아진다', () => {
    const t = clashTimes(A.clash.hops, A.clash.startGapSec, A.clash.endGapSec);
    expect(t).toHaveLength(A.clash.hops);
    const gaps = t.map((x, i) => x - (t[i - 1] ?? 0));
    for (let i = 1; i < gaps.length; i++) expect(gaps[i]!).toBeLessThan(gaps[i - 1]! + 1e-9);
    expect(gaps[0]).toBeCloseTo(A.clash.startGapSec);
    expect(gaps[gaps.length - 1]).toBeCloseTo(A.clash.endGapSec);
  });
  it('1~3장 보스 풀은 모든 장에서 하나 이상', () => {
    for (const ch of A.summon.themeChapters) expect(themeBosses(gameData, ch, A.summon.excludeBosses).length).toBeGreaterThan(0);
  });
});
