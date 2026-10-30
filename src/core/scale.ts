import type { UiMode } from '../input/uiMode';

/**
 * 화면 배율 (순수 함수): 기준 해상도 1px이 창에서 몇 CSS px인지. PC·모바일 모두 창에 꽉 차게.
 * (캔버스 픽셀이 곧 도트 하나라 표시는 가장 가까운 픽셀로 늘린다. DECISIONS 참고)
 */
export function computeZoom(viewW: number, viewH: number, baseW: number, baseH: number): number {
  return Math.max(Math.min(viewW / baseW, viewH / baseH), 0.25);
}

/** "#rrggbb" → 0xrrggbb */
export function hexColor(s: string): number {
  return parseInt(s.slice(1), 16);
}
