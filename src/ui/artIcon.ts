/**
 * 화면(DOM) 아이콘에 도트 아트를 넣는다. 그림이 불러와져 있으면 첫 프레임을 요소 크기에 맞춰 배경으로,
 * 없으면 대체 색(없으면 비움). 그림을 넣었으면 true.
 */
import type { GameContext } from '../core/context';

export function applyArtIcon(el: HTMLElement, ctx: GameContext, key: string | null | undefined, fallbackColor?: string): boolean {
  const s = key && ctx.artLoaded.has(key) ? ctx.data.art.sprites[key] : undefined;
  if (s) {
    // 가로 프레임 스트립의 첫 칸만 보이게 (프레임 수만큼 가로로 늘린다)
    el.style.background = `url("${ctx.data.art.basePath}${s.file}") 0 0 / ${(s.frames ?? 1) * 100}% 100% no-repeat`;
    el.style.imageRendering = 'pixelated';
    el.classList.add('has-art');
    return true;
  }
  el.style.background = fallbackColor ?? '';
  el.classList.remove('has-art');
  return false;
}
