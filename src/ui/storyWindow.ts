/**
 * 미모사 제미니 일반 스토리 대화 (DOM). 게임을 멈춘 동안 큰 전신 그림 + 아래 대화창.
 * 한 글자씩 나오고, 클릭·Enter·Space: 출력 중이면 전체 표시, 다 나왔으면 다음 문장. 마지막 문장을 넘기거나 건너뛰면 storyDone.
 * 대화 중 키 누름은 게임으로 넘기지 않는다(떼기는 넘겨서 누르고 있던 키가 남지 않게).
 */
import type { GameContext } from '../core/context';
import { bus } from '../core/events';
import { artKeys } from '../systems/art';
import { plainLength, type StoryLine } from '../systems/gemini';
import { applyArtIcon } from './artIcon';
import { renderMarked } from './markedText';

/** 연속 입력으로 문장이 한꺼번에 넘어가지 않게 */
const ADVANCE_GUARD_MS = 120;
const ADVANCE_KEYS = new Set(['Enter', 'NumpadEnter', 'Space']);

export class StoryWindow {
  private readonly root: HTMLDivElement;
  private readonly figure: HTMLDivElement;
  private readonly name: HTMLElement;
  private readonly count: HTMLElement;
  private readonly text: HTMLDivElement;
  private lines: StoryLine[] = [];
  private index = 0;
  private open = false;
  private shownAt = 0;
  /** 지금 문장에서 보이는 글자 수 / 전체 글자 수 */
  private typed = 0;
  private total = 0;
  private timer: number | null = null;

  constructor(private readonly ctx: GameContext) {
    const t = ctx.t;
    const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, txt = '') => {
      const e = document.createElement(tag);
      e.className = cls;
      e.textContent = txt;
      return e;
    };
    this.root = document.createElement('div');
    this.root.id = 'story';
    this.root.style.setProperty('--gemini', ctx.data.gemini.color);
    this.figure = el('div', 'sw-figure');
    const box = el('div', 'sw-box');
    const head = el('div', 'sw-head');
    this.name = el('b', 'sw-name');
    this.count = el('span', 'sw-count');
    head.append(this.name, this.count);
    this.text = el('div', 'sw-text');
    const foot = el('div', 'sw-foot');
    const skip = el('button', 'sw-btn', t('gemini.story.skip'));
    const next = el('button', 'sw-btn', t('gemini.story.next'));
    const btns = el('div', 'sw-btns');
    btns.append(skip, next);
    foot.append(el('small', '', t('gemini.story.hint')), btns);
    box.append(head, this.text, foot);
    this.root.append(el('div', 'sw-link', t('gemini.story.link')), this.figure, box);
    document.body.appendChild(this.root);

    window.addEventListener(
      'keydown',
      (e) => {
        if (!this.open) return;
        e.preventDefault();
        e.stopPropagation();
        if (ADVANCE_KEYS.has(e.code) && !e.repeat) this.advance();
      },
      true,
    );
    this.root.addEventListener('pointerdown', (e) => {
      if (!this.open) return;
      e.preventDefault();
      e.stopPropagation();
      const b = (e.target as HTMLElement).closest('button');
      if (b === skip) this.close();
      else this.advance();
    });
    bus.on('storyShow', ({ lines }) => this.show(lines));
  }

  private show(lines: StoryLine[]): void {
    if (lines.length === 0) {
      bus.emit('storyDone', {});
      return;
    }
    // 전신 그림이 없으면 상반신 초상화
    if (!applyArtIcon(this.figure, this.ctx, artKeys.geminiFull)) applyArtIcon(this.figure, this.ctx, artKeys.geminiPortrait, this.ctx.data.gemini.color);
    this.lines = lines;
    this.open = true;
    this.root.style.display = 'block';
    this.setLine(0);
  }

  private setLine(i: number): void {
    this.index = i;
    this.shownAt = performance.now();
    const line = this.lines[i]!;
    this.name.textContent = line.speaker;
    this.count.textContent = `${i + 1} / ${this.lines.length}`;
    this.typed = 0;
    this.total = plainLength(line.text);
    this.stopTyping();
    renderMarked(this.text, line.text, 0);
    this.timer = window.setInterval(() => {
      this.typed++;
      renderMarked(this.text, line.text, this.typed);
      if (this.typed >= this.total) this.stopTyping();
    }, this.ctx.data.gemini.typeCharSec * 1000);
  }

  private stopTyping(): void {
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
  }

  private advance(): void {
    if (performance.now() - this.shownAt < ADVANCE_GUARD_MS) return;
    this.shownAt = performance.now();
    if (this.typed < this.total) {
      // 출력 중: 지금 문장을 전부 보인다
      this.stopTyping();
      this.typed = this.total;
      renderMarked(this.text, this.lines[this.index]!.text, this.total);
      return;
    }
    if (this.index + 1 < this.lines.length) this.setLine(this.index + 1);
    else this.close();
  }

  private close(): void {
    if (!this.open) return;
    this.stopTyping();
    this.open = false;
    this.root.style.display = 'none';
    bus.emit('storyDone', {});
  }
}
