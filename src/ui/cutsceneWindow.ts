/**
 * 컷인 → 설명창 (DOM). 게임이 멈춘 동안 뜬다. PC는 아무 키, 모바일은 화면 탭으로 넘긴다.
 * 컷인 도중에 넘기면 바로 설명창으로 간다. 마지막 장을 넘기면 cutsceneDone.
 */
import type { GameContext } from '../core/context';
import { bus } from '../core/events';
import type { CutIcon, CutIn, CutPage } from './cutscenePages';

/** 연속 입력으로 장이 한꺼번에 넘어가지 않게 */
const ADVANCE_GUARD_MS = 350;

export class CutsceneWindow {
  private readonly root: HTMLDivElement;
  private pages: CutPage[] = [];
  private index = -1;
  private open = false;
  private shownAt = 0;
  private timers: number[] = [];

  constructor(private readonly ctx: GameContext) {
    this.root = document.createElement('div');
    this.root.id = 'cutscene';
    document.body.appendChild(this.root);
    const next = (e: Event) => {
      if (!this.open) return;
      e.preventDefault();
      e.stopPropagation();
      this.advance();
    };
    window.addEventListener('keydown', next, true);
    this.root.addEventListener('pointerdown', next);
    bus.on('cutsceneShow', ({ cut, pages }) => this.show(cut, pages));
  }

  private show(cut: CutIn, pages: CutPage[]): void {
    this.pages = pages;
    this.index = -1;
    this.open = true;
    this.shownAt = performance.now();
    this.root.replaceChildren();
    // 앞 연출(전직의 학파 색 전환 등)이 남지 않게
    this.root.className = '';
    this.root.style.display = 'flex';
    this.root.style.setProperty('--flash', cut.flash);
    this.playCut(cut);
  }

  private advance(): void {
    if (performance.now() - this.shownAt < ADVANCE_GUARD_MS) return;
    this.shownAt = performance.now();
    this.clearTimers();
    this.index++;
    if (this.index >= this.pages.length) {
      this.close();
      return;
    }
    this.renderPage(this.pages[this.index]!);
  }

  private close(): void {
    this.open = false;
    this.root.style.display = 'none';
    this.root.replaceChildren();
    bus.emit('cutsceneDone', {});
  }

  private later(ms: number, fn: () => void): void {
    this.timers.push(window.setTimeout(fn, ms));
  }

  private clearTimers(): void {
    for (const id of this.timers) clearTimeout(id);
    this.timers = [];
  }

  private icon(i: CutIcon, cls = ''): HTMLDivElement {
    const el = document.createElement('div');
    el.className = `cs-icon ${cls}`;
    el.style.borderColor = i.color;
    el.style.color = i.color;
    el.textContent = i.label;
    return el;
  }

  private stage(): HTMLDivElement {
    const s = document.createElement('div');
    s.className = 'cs-stage';
    this.root.appendChild(s);
    return s;
  }

  /** 픽셀 파편: from 요소 자리에서 사방(또는 to 자리)으로 날아간다 */
  private shards(stage: HTMLElement, from: HTMLElement, color: string, n: number, to?: HTMLElement): void {
    const sr = stage.getBoundingClientRect();
    const fr = from.getBoundingClientRect();
    const tr = to?.getBoundingClientRect();
    for (let i = 0; i < n; i++) {
      const p = document.createElement('i');
      p.className = 'cs-shard';
      p.style.background = color;
      p.style.left = `${fr.left - sr.left + fr.width / 2}px`;
      p.style.top = `${fr.top - sr.top + fr.height / 2}px`;
      stage.appendChild(p);
      const a = (i / n) * Math.PI * 2;
      const dx = tr ? tr.left - fr.left + (tr.width - fr.width) / 2 : Math.cos(a) * (60 + Math.random() * 60);
      const dy = tr ? tr.top - fr.top + (tr.height - fr.height) / 2 : Math.sin(a) * (60 + Math.random() * 60);
      requestAnimationFrame(() => {
        p.style.transform = `translate(${dx}px, ${dy}px)`;
        p.style.opacity = tr ? '1' : '0';
      });
      this.later(900, () => p.remove());
    }
  }

  private playCut(cut: CutIn): void {
    const stage = this.stage();
    const hint = document.createElement('div');
    hint.className = 'cs-hint';
    hint.textContent = this.ctx.t(this.ctx.uiMode === 'mobile' ? 'cut.next.mobile' : 'cut.next.pc');
    this.root.appendChild(hint);

    if (cut.kind === 'skillAwakening') {
      const ic = this.icon(cut.icon, 'cs-zoom');
      stage.appendChild(ic);
      this.later(350, () => {
        this.root.classList.add('cs-flash');
        this.shards(stage, ic, cut.flash, 14);
      });
      this.later(700, () => this.root.classList.remove('cs-flash'));
      this.later(1600, () => this.advance());
      return;
    }

    if (cut.kind === 'ultimateAwakening') {
      const row = document.createElement('div');
      row.className = 'cs-row';
      const a = cut.from.map((i) => this.icon(i, 'cs-merge'));
      row.append(...a);
      stage.appendChild(row);
      this.root.classList.add('cs-glow');
      this.later(500, () => row.classList.add('merged'));
      this.later(1000, () => {
        row.replaceChildren(this.icon(cut.to, 'cs-zoom big'));
        this.root.classList.add('cs-flash');
      });
      this.later(1350, () => this.root.classList.remove('cs-flash'));
      this.later(2200, () => this.advance());
      return;
    }

    // 전직: 암전 → 실루엣이 엠블럼으로 → 반대 학파 아이콘이 깨져 파편이 내 스킬로 → +1 → 학파 색 전환
    this.root.classList.add('cs-black');
    const top = document.createElement('div');
    top.className = 'cs-row';
    const broken = cut.broken.map((i) => this.icon(i));
    top.append(...broken);
    const mid = document.createElement('div');
    mid.className = 'cs-silhouette';
    const bottom = document.createElement('div');
    bottom.className = 'cs-row';
    const gains = cut.gains.map((g) => {
      const el = this.icon(g);
      el.dataset.plus = String(g.plus);
      return el;
    });
    bottom.append(...gains);
    stage.append(top, mid, bottom);
    this.later(500, () => {
      mid.classList.add('emblem');
      mid.style.background = cut.emblem.color;
      mid.textContent = cut.emblem.label;
    });
    this.later(1200, () => broken.forEach((b) => b.classList.add('crack')));
    this.later(1600, () => {
      broken.forEach((b, i) => {
        const target = gains[i % Math.max(1, gains.length)];
        this.shards(stage, b, b.style.borderColor, 6, target);
        b.classList.add('gone');
      });
    });
    gains.forEach((g, i) =>
      this.later(2300 + i * 250, () => {
        const plus = document.createElement('span');
        plus.className = 'cs-plus';
        plus.textContent = `+${g.dataset.plus}`;
        g.appendChild(plus);
      }),
    );
    this.later(2400 + gains.length * 250, () => {
      this.root.classList.remove('cs-black');
      this.root.classList.add('cs-tint');
    });
    this.later(3400 + gains.length * 250, () => this.advance());
  }

  private renderPage(p: CutPage): void {
    this.root.classList.remove('cs-flash', 'cs-black', 'cs-glow');
    const keepTint = this.root.classList.contains('cs-tint');
    this.root.replaceChildren();
    if (!keepTint) this.root.classList.remove('cs-tint');
    const box = document.createElement('div');
    box.className = 'cs-page';
    box.style.borderColor = p.accent;
    const title = document.createElement('div');
    title.className = 'cs-title';
    title.style.color = p.accent;
    title.textContent = p.title;
    box.appendChild(title);
    for (const line of p.lines) {
      const l = document.createElement('div');
      l.className = 'cs-line';
      l.textContent = line;
      box.appendChild(l);
    }
    const hint = document.createElement('div');
    hint.className = 'cs-hint';
    hint.textContent = `${this.index + 1}/${this.pages.length} · ${this.ctx.t(this.ctx.uiMode === 'mobile' ? 'cut.next.mobile' : 'cut.next.pc')}`;
    this.root.append(box, hint);
  }
}
