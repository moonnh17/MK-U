/**
 * 화면(DOM) 아이콘에 도트 아트를 넣는다. 그림이 불러와져 있으면 첫 프레임을 요소 크기에 맞춰 배경으로,
 * 없으면 대체 색(없으면 비움). 그림을 넣었으면 true.
 */
import type { GameContext } from '../core/context';

/** 정사각이 아닌 프레임 스트립의 첫 칸만 잘라 둔 그림 (파일 경로별 한 번만 자른다) */
const firstFrames = new Map<string, Promise<string>>();

function firstFrame(url: string, w: number, h: number): Promise<string> {
  let p = firstFrames.get(url);
  if (!p) {
    p = new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas');
        c.width = w;
        c.height = h;
        c.getContext('2d')!.drawImage(img, 0, 0, w, h, 0, 0, w, h);
        resolve(c.toDataURL());
      };
      img.onerror = reject;
      img.src = url;
    });
    firstFrames.set(url, p);
  }
  return p;
}

export function applyArtIcon(el: HTMLElement, ctx: GameContext, key: string | null | undefined, fallbackColor?: string): boolean {
  const s = key && ctx.artLoaded.has(key) ? ctx.data.art.sprites[key] : undefined;
  // 늦게 잘린 그림이 그새 다른 그림으로 바뀐 칸을 덮지 않게
  el.dataset.artKey = s ? key! : '';
  if (s) {
    const url = `${ctx.data.art.basePath}${s.file}`;
    const frames = s.frames ?? 1;
    el.style.imageRendering = 'pixelated';
    el.classList.add('has-art');
    if (frames > 1 && s.frameWidth !== s.frameHeight) {
      // 정사각이 아닌 칸을 칸 크기로 늘리면 눌려 보인다: 첫 칸만 잘라 비율을 지킨다
      el.style.background = '';
      firstFrame(url, s.frameWidth, s.frameHeight).then(
        (src) => {
          if (el.dataset.artKey === key) el.style.background = `url("${src}") center / contain no-repeat`;
        },
        () => undefined,
      );
      return true;
    }
    // 정사각 스트립은 첫 칸만 보이게 프레임 수만큼 가로로 늘리고, 한 칸짜리는 비율을 지킨다
    el.style.background = `url("${url}") ${frames > 1 ? `0 0 / ${frames * 100}% 100%` : 'center / contain'} no-repeat`;
    return true;
  }
  el.style.background = fallbackColor ?? '';
  el.classList.remove('has-art');
  return false;
}
