/**
 * 화면(DOM) 아이콘에 도트 아트를 넣는다. 그림이 불러와져 있으면 첫 프레임을 요소 크기에 맞춰 배경으로,
 * 없으면 대체 색(없으면 비움). 그림을 넣었으면 true.
 */
import type { GameContext } from '../core/context';

export function applyArtIcon(el: HTMLElement, ctx: GameContext, key: string | null | undefined, fallbackColor?: string): boolean {
  const s = key && ctx.artLoaded.has(key) ? ctx.data.art.sprites[key] : undefined;
  if (s) {
    // 가로 프레임 스트립의 첫 칸만 보이게 (프레임 수만큼 가로로 늘린다)
    // 한 칸짜리는 비율을 지킨다 (가로로 긴 무기가 칸에 맞춰 늘어나지 않게)
    const frames = s.frames ?? 1;
    el.style.background = `url("${ctx.data.art.basePath}${s.file}") ${frames > 1 ? `0 0 / ${frames * 100}% 100%` : 'center / contain'} no-repeat`;
    el.style.imageRendering = 'pixelated';
    el.classList.add('has-art');
    return true;
  }
  el.style.background = fallbackColor ?? '';
  el.classList.remove('has-art');
  return false;
}
