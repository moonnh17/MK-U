/**
 * 미모사 제미니 미니 대사 (DOM). 화면 위쪽 가운데 작은 아이콘 + 말풍선, 게임은 멈추지 않는다.
 * 무엇을 언제 띄울지는 RunScene의 MiniQueue가 정하고, 여기는 geminiMini 이벤트대로 페이드만 한다.
 */
import type { GameContext } from '../core/context';
import { bus } from '../core/events';
import { artKeys } from '../systems/art';
import { applyArtIcon } from './artIcon';

export class GeminiMini {
  private readonly root: HTMLDivElement;
  private readonly bubble: HTMLDivElement;
  private readonly icon: HTMLDivElement;

  constructor(private readonly ctx: GameContext) {
    this.root = document.createElement('div');
    this.root.id = 'gemini-mini';
    this.root.style.setProperty('--gemini', ctx.data.gemini.color);
    this.root.style.setProperty('--fade', `${ctx.data.gemini.mini.fadeSec}s`);
    const icon = document.createElement('div');
    icon.className = 'gm-icon';
    icon.innerHTML = '<i></i><i></i>';
    this.icon = icon;
    this.bubble = document.createElement('div');
    this.bubble.className = 'gm-bubble';
    this.root.append(icon, this.bubble);
    document.body.appendChild(this.root);
    bus.on('geminiMini', ({ line }) => {
      if (line) {
        // 게임 화면(캔버스) 위쪽 가운데에 붙인다 (창 비율이 달라 위아래가 비어도)
        const r = document.querySelector('canvas')?.getBoundingClientRect();
        if (r) this.root.style.top = `${Math.max(0, r.top) + 6}px`;
        // 아이콘 그림이 있으면 그림(표정 대신), 없으면 색 블록 + 눈
        if (applyArtIcon(this.icon, this.ctx, artKeys.geminiIcon)) this.icon.replaceChildren();
        this.bubble.textContent = line.text;
        this.root.className = `show ${line.mood}`;
      } else {
        this.root.classList.remove('show');
      }
    });
    // 런이 끝나 실험장으로 돌아가면 숨긴다
    bus.on('overlay', ({ open }) => {
      if (open) this.root.classList.remove('show');
    });
  }
}
