/**
 * 미모사 제미니 일반 스토리 대화 (DOM). 게임을 멈춘 동안 큰 초상화 + 아래 대화창.
 * PC는 아무 키, 모바일은 화면 탭으로 한 문장씩 넘기고, 마지막 문장을 넘기면 storyDone.
 */
import type { GameContext } from '../core/context';
import { bus } from '../core/events';

/** 연속 입력으로 문장이 한꺼번에 넘어가지 않게 */
const ADVANCE_GUARD_MS = 300;

export class StoryWindow {
  private readonly root: HTMLDivElement;
  private readonly text: HTMLDivElement;
  private lines: string[] = [];
  private index = 0;
  private open = false;
  private shownAt = 0;

  constructor(private readonly ctx: GameContext) {
    const t = ctx.t;
    this.root = document.createElement('div');
    this.root.id = 'story';
    this.root.style.setProperty('--gemini', ctx.data.gemini.color);
    const portrait = document.createElement('div');
    portrait.className = 'sw-portrait';
    portrait.innerHTML = '<i></i><i></i>';
    const box = document.createElement('div');
    box.className = 'sw-box';
    const name = document.createElement('b');
    name.textContent = t('gemini.name');
    this.text = document.createElement('div');
    this.text.className = 'sw-text';
    const hint = document.createElement('small');
    hint.textContent = t('gemini.story.hint');
    box.append(name, this.text, hint);
    this.root.append(portrait, box);
    document.body.appendChild(this.root);

    const next = (e: Event) => {
      if (!this.open) return;
      e.preventDefault();
      e.stopPropagation();
      this.advance();
    };
    window.addEventListener('keydown', next, true);
    this.root.addEventListener('pointerdown', next);
    bus.on('storyShow', ({ lines }) => this.show(lines));
  }

  private show(lines: string[]): void {
    if (lines.length === 0) {
      bus.emit('storyDone', {});
      return;
    }
    this.lines = lines;
    this.index = 0;
    this.open = true;
    this.shownAt = performance.now();
    this.text.textContent = lines[0]!;
    this.root.style.display = 'flex';
  }

  private advance(): void {
    if (performance.now() - this.shownAt < ADVANCE_GUARD_MS) return;
    this.shownAt = performance.now();
    this.index++;
    if (this.index < this.lines.length) {
      this.text.textContent = this.lines[this.index]!;
      return;
    }
    this.open = false;
    this.root.style.display = 'none';
    bus.emit('storyDone', {});
  }
}
