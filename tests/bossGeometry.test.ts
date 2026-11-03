import { describe, expect, it } from 'vitest';
import { gapBulletAngles, hpStage, inGap, predictPoint } from '../src/systems/bossGeometry';

describe('보스 패턴 기하', () => {
  it('고리 틈: 중심 각도 양쪽 절반까지, 각도가 한 바퀴 넘어가도 맞다', () => {
    expect(inGap(0.2, 0, 60)).toBe(true);
    expect(inGap(1, 0, 60)).toBe(false);
    expect(inGap(-Math.PI + 0.05, Math.PI - 0.05, 20)).toBe(true);
  });
  it('원형 탄막: 연속 gap발을 비운다 (끝을 넘어가도)', () => {
    expect(gapBulletAngles(12, 3, 2)).toHaveLength(10);
    const a = gapBulletAngles(4, 3, 2).map((x) => Math.round((x * 4) / (Math.PI * 2)));
    expect(a).toEqual([1, 2]);
  });
  it('이동 예측', () => {
    expect(predictPoint({ x: 10, y: 0 }, { x: 5, y: -2 }, 2)).toEqual({ x: 20, y: -4 });
  });
  it('체력 단계', () => {
    expect(hpStage(0.5, [0.7, 0.4])).toBe(1);
  });
});
