import type { UiMode } from '../input/uiMode';

/**
 * 화면 배율 (순수 함수).
 * - PC: 정수 배 (최소 1)
 * - 모바일: 화면에 꽉 차는 비정수 배 (정수 배면 폰에서 여백이 너무 커서. DECISIONS 참고)
 */
export function computeZoom(viewW: number, viewH: number, baseW: number, baseH: number, mode: UiMode): number {
  const fit = Math.min(viewW / baseW, viewH / baseH);
  if (mode === 'mobile') return Math.max(fit, 0.25);
  return Math.max(1, Math.floor(fit));
}

/** "#rrggbb" → 0xrrggbb */
export function hexColor(s: string): number {
  return parseInt(s.slice(1), 16);
}
