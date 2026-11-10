import type { UiMode } from '../input/uiMode';

/**
 * 화면 배율 (순수 함수): 기준 해상도 1px이 창에서 몇 CSS px인지. PC·모바일 모두 창에 꽉 차게.
 * (캔버스를 고해상도로 그리므로 정수 배가 아니어도 도트가 뭉개지지 않는다. DECISIONS 참고)
 */
export function computeZoom(viewW: number, viewH: number, baseW: number, baseH: number): number {
  return Math.max(Math.min(viewW / baseW, viewH / baseH), 0.25);
}

/**
 * 게임 1px을 캔버스 몇 px로 그릴지: 화면(창을 최대로 키웠을 때)의 실제 픽셀 수에 맞춘 정수.
 * 시작할 때 한 번 정한다. 창 크기가 바뀌면 캔버스 표시 크기만 바뀐다.
 */
export function renderScale(screenW: number, screenH: number, dpr: number, baseW: number, baseH: number, min: number, max: number): number {
  const long = Math.max(screenW, screenH);
  const short = Math.min(screenW, screenH);
  return Math.max(min, Math.min(max, Math.ceil(Math.min(long / baseW, short / baseH) * dpr)));
}

/** "#rrggbb" → 0xrrggbb */
export function hexColor(s: string): number {
  return parseInt(s.slice(1), 16);
}

/** 두 "#rrggbb" 색을 k(0이면 a, 1이면 b)만큼 섞는다 */
export function mixHex(a: string, b: string, k: number): string {
  const x = hexColor(a), y = hexColor(b);
  const ch = (s: number) => Math.round(((x >> s) & 255) * (1 - k) + ((y >> s) & 255) * k);
  return `#${((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, '0')}`;
}
