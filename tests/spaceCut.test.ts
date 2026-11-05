import { describe, expect, it } from 'vitest';
import { gameData } from '../src/data/index';
import { spaceCutFrame } from '../src/systems/spaceCut';

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
