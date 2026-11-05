/**
 * 벼락 '공간 절단' 연출의 시간표 (순수 함수).
 * 예고 동안 선 쪽으로 화면이 조금씩 압축되고(음수 변위), 절단 순간 양쪽이 크게 밀려나 검은 틈이 드러났다가 닫힌다.
 * 반환값은 기준 해상도 px. shift: 선 수직 방향 변위(+ 벌어짐, − 압축), gap: 검은 틈의 반폭.
 */
import type { SpaceCutDef } from '../types/data';

export interface SpaceCutFrame {
  shift: number;
  gap: number;
  /** 0이면 효과 없음 */
  on: boolean;
}

/** t: 절단 순간을 0으로 한 시간(초). 예고는 t < 0 (−telegraphSec부터) */
export function spaceCutFrame(t: number, telegraphSec: number, c: SpaceCutDef): SpaceCutFrame {
  if (t < 0) {
    if (telegraphSec <= 0 || t < -telegraphSec) return { shift: 0, gap: 0, on: false };
    const k = 1 + t / telegraphSec;
    return { shift: -c.compressPx * k * k, gap: 0, on: true };
  }
  if (t >= c.closeSec) return { shift: 0, gap: 0, on: false };
  // 절단 직후 가장 크게 벌어졌다가 닫힌다 (처음엔 빨리, 끝은 천천히)
  const k = 1 - t / c.closeSec;
  const shift = c.shiftPx * k * k;
  return { shift, gap: shift, on: true };
}
