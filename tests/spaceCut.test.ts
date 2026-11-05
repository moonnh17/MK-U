import { describe, expect, it } from 'vitest';
import { gameData } from '../src/data/index';
import { riftFrame, riftTotalSec, spaceCutFrame } from '../src/systems/spaceCut';

const C = gameData.ultimates.ultimates.find((u) => u.id === 'thunderbolt')!.spaceCut!;

describe('벼락 공간 절단 시간표', () => {
  it('예고 동안 압축(음수)이 점점 커지고 틈은 없다', () => {
    const a = spaceCutFrame(-0.2, 0.25, C);
    const b = spaceCutFrame(-0.01, 0.25, C);
    expect(a.gap).toBe(0);
    expect(b.shift).toBeLessThan(a.shift);
    expect(b.shift).toBeGreaterThanOrEqual(-C.compressPx);
  });
  it('절단 순간 가장 크게 벌어지고(4~8px), closeSec 동안 닫힌다', () => {
    const open = spaceCutFrame(0, 0.25, C);
    expect(open.shift).toBe(C.shiftPx);
    expect(open.gap).toBe(C.shiftPx);
    // 선을 따라 미끄러짐도 같은 순간 가장 크게, 같이 닫힌다
    expect(open.slide).toBe(C.slidePx);
    expect(spaceCutFrame(-0.1, 0.25, C).slide).toBe(0);
    expect(spaceCutFrame(C.closeSec / 2, 0.25, C).slide).toBeLessThan(C.slidePx);
    expect(C.shiftPx).toBeGreaterThanOrEqual(4);
    expect(C.shiftPx).toBeLessThanOrEqual(8);
    expect(spaceCutFrame(C.closeSec / 2, 0.25, C).shift).toBeLessThan(C.shiftPx);
    expect(spaceCutFrame(C.closeSec, 0.25, C).on).toBe(false);
    expect(C.closeSec).toBeGreaterThanOrEqual(0.2);
    expect(C.closeSec).toBeLessThanOrEqual(0.35);
  });
  it('예고 전·닫힌 뒤는 효과 없음', () => {
    expect(spaceCutFrame(-1, 0.25, C).on).toBe(false);
    expect(spaceCutFrame(0, 0, C).on).toBe(true);
  });
});

describe('케라우노스 균열 시간표', () => {
  const T = gameData.ultimates.ultimates.find((u) => u.id === 'thunderbolt')!;
  const R = T.rift!;
  it('확 갈라졌다가(짧게) 서서히 봉합된다(길게)', () => {
    expect(riftFrame(-0.01, R).on).toBe(false);
    expect(R.openSec).toBeLessThan(R.sealSec / 5);
    const peak = riftFrame(R.openSec, R);
    expect([peak.gap, peak.slide]).toEqual([R.gapPx, R.slidePx]);
    const half = riftFrame(R.openSec + R.holdSec + R.sealSec / 2, R);
    expect(half.slide).toBeGreaterThan(0);
    expect(half.slide).toBeLessThan(R.slidePx / 2);
    expect(riftFrame(riftTotalSec(R), R).on).toBe(false);
  });
  it('각성 값: 옛 사선 참격·주변 타격·붕괴·봉합 추가 타격 값은 없다', () => {
    expect(Object.keys(T.awakening!.values).sort()).toEqual(['range', 'riftDelaySec', 'strikeRadius']);
  });
});
