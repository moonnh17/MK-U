/**
 * 미모사 제미니 미니 대사 (DOM). 화면 위쪽 가운데 말풍선(작은 도트 아이콘 + 이름 + 한 글자씩 나오는 문장), 게임은 멈추지 않는다.
 * 무엇을 언제 띄울지는 RunScene의 MiniQueue가 정하고, 여기는 geminiMini 이벤트대로 페이드만 한다.
 */
import type { GameContext } from '../core/context';
import { bus } from '../core/events';
import { artKeys } from '../systems/art';
import { plainLength } from '../systems/gemini';
import { applyArtIcon } from './artIcon';
import { renderMarked } from './markedText';

export class GeminiMini {
  private readonly root: HTMLDivElement;
  private readonly text: HTMLDivElement;
  private readonly icon: HTMLDivElement;
  /** 보스 체력바가 위에 떠 있다 */
  private low = false;
  private timer: number | null = null;

  constructor(private readonly ctx: GameContext) {
    this.root = document.createElement('div');
    this.root.id = 'gemini-mini';
    this.root.style.setProperty('--gemini', ctx.data.gemini.color);
    this.root.style.setProperty('--fade', `${ctx.data.gemini.mini.fadeSec}s`);
    const icon = document.createElement('div');
    icon.className = 'gm-icon';
    icon.innerHTML = '<i></i><i></i>';
    this.icon = icon;
    const body = document.createElement('div');
    body.className = 'gm-body';
    const name = document.createElement('b');
    name.className = 'gm-name';
    name.textContent = ctx.t('gemini.speaker');
    this.text = document.createElement('div');
    this.text.className = 'gm-text';
    body.append(name, this.text);
    this.root.append(icon, body);
    document.body.appendChild(this.root);
    bus.on('geminiMini', ({ line }) => {
      if (line) {
        // 게임 화면(캔버스) 위쪽 가운데에 붙인다 (창 비율이 달라 위아래가 비어도)
        const r = document.querySelector('canvas')?.getBoundingClientRect();
        if (r) this.root.style.top = `${Math.max(0, r.top) + 6 + (this.low ? (r.height / 270) * 22 : 0)}px`;
        // 아이콘 그림이 있으면 그림(표정 대신), 없으면 색 블록 + 눈
        if (applyArtIcon(this.icon, this.ctx, artKeys.geminiIcon)) this.icon.replaceChildren();
        this.type(line.text);
        this.root.className = `show ${line.mood}`;
      } else {
        this.stop();
        this.root.classList.remove('show');
      }
    });
    bus.on('bossBarShown', ({ shown }) => {
      this.low = shown;
    });
    // 런이 끝나 실험장으로 돌아가면 숨긴다
    bus.on('overlay', ({ open }) => {
      if (open) this.root.classList.remove('show');
    });
  }

  private type(text: string): void {
    this.stop();
    const total = plainLength(text);
    let n = 0;
    renderMarked(this.text, text, 0);
    this.timer = window.setInterval(() => {
      renderMarked(this.text, text, ++n);
      if (n >= total) this.stop();
    }, this.ctx.data.gemini.typeCharSec * 1000);
  }

  private stop(): void {
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
  }
}
