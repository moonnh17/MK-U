/**
 * 벼락 '공간 절단' 연출의 시간표 (순수 함수).
 * 예고 동안 선 쪽으로 화면이 조금씩 압축되고(음수 변위), 절단 순간 양쪽이 크게 밀려나 검은 틈이 드러났다가 닫힌다.
 * 반환값은 기준 해상도 px. shift: 선 수직 방향 변위(+ 벌어짐, − 압축), gap: 검은 틈의 반폭.
 */
import type { RiftDef, SpaceCutDef } from '../types/data';

export interface SpaceCutFrame {
  shift: number;
  gap: number;
  /** 양쪽이 절단선을 따라 서로 반대로 미끄러지는 양 */
  slide: number;
  /** 0이면 효과 없음 */
  on: boolean;
}

/** t: 절단 순간을 0으로 한 시간(초). 예고는 t < 0 (−telegraphSec부터) */
export function spaceCutFrame(t: number, telegraphSec: number, c: SpaceCutDef): SpaceCutFrame {
  if (t < 0) {
    if (telegraphSec <= 0 || t < -telegraphSec) return { shift: 0, gap: 0, slide: 0, on: false };
    const k = 1 + t / telegraphSec;
    return { shift: -c.compressPx * k * k, gap: 0, slide: 0, on: true };
  }
  if (t >= c.closeSec) return { shift: 0, gap: 0, slide: 0, on: false };
  // 절단 직후 가장 크게 벌어졌다가 닫힌다 (처음엔 빨리, 끝은 천천히)
  const k = 1 - t / c.closeSec;
  const e = k * k;
  return { shift: c.shiftPx * e, gap: c.shiftPx * e, slide: c.slidePx * e, on: true };
}

/** 케라우노스 균열 전체 시간 */
export function riftTotalSec(r: RiftDef): number {
  return r.openSec + r.holdSec + r.sealSec;
}

/**
 * 케라우노스: 화면 전체가 사선으로 확 갈라지며 어긋난다(openSec) → 잠깐 그대로(holdSec)
 * → 서서히 미끄러져 돌아오며 봉합된다(sealSec, 끝으로 갈수록 느리게). t는 갈라지기 시작한 때부터(초).
 */
export function riftFrame(t: number, r: RiftDef): SpaceCutFrame {
  if (t < 0 || t >= riftTotalSec(r)) return { shift: 0, gap: 0, slide: 0, on: false };
  let k = 1;
  if (t < r.openSec) k = t / r.openSec;
  else if (t >= r.openSec + r.holdSec) {
    const u = (t - r.openSec - r.holdSec) / r.sealSec;
    k = (1 - u) ** 3;
  }
  return { shift: r.gapPx * k, gap: r.gapPx * k, slide: r.slidePx * k, on: true };
}
