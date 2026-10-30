/**
 * 컷인 → 설명창 (DOM). 게임이 멈춘 동안 뜬다. PC는 아무 키, 모바일은 화면 탭으로 넘긴다.
 * 컷인 도중에 넘기면 바로 설명창으로 간다. 마지막 장을 넘기면 cutsceneDone.
 */
import { applyArtIcon } from './artIcon';
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
  private raf = 0;

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
    cancelAnimationFrame(this.raf);
  }

  private icon(i: CutIcon, cls = ''): HTMLDivElement {
    const el = document.createElement('div');
    el.className = `cs-icon ${cls}`;
    el.style.borderColor = i.color;
    el.style.color = i.color;
    // 아이콘 그림이 있으면 글자 대신 그림
    el.textContent = applyArtIcon(el, this.ctx, i.key) ? '' : i.label;
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

    // 전직: 암전 → 입자가 사방에서 캐릭터로 빨려 들어감 → 번쩍이며 새 모습 → 이어서 스킬 변환
    this.root.classList.add('cs-black');
    const ad = this.ctx.data.juice.advancement;
    const actor = this.actor(cut.actorFrom);
    stage.appendChild(actor);
    bus.emit('sfx', { id: 'advCharge' });
    this.converge(actor, cut.flash, ad.chargeSec, ad.particles, () => {
      bus.emit('sfx', { id: 'advBurst' });
      this.root.classList.add('cs-flash');
      this.later(350, () => this.root.classList.remove('cs-flash'));
      const next = this.actor(cut.actorTo);
      actor.replaceWith(next);
      next.style.filter = `drop-shadow(0 0 22px ${cut.flash})`;
      const wave = document.createElement('div');
      wave.className = 'cs-wave';
      this.root.appendChild(wave);
      this.later(900, () => wave.remove());
      this.later(ad.burstHoldSec * 1000, () => {
        stage.replaceChildren();
        this.playConversion(stage, cut);
      });
    });
  }

  /** 플레이어 그림(첫 프레임)을 크게 */
  private actor(key: string): HTMLDivElement {
    const el = document.createElement('div');
    el.className = 'cs-actor';
    const s = this.ctx.data.art.sprites[key];
    const h = Math.min(window.innerHeight * 0.42, 220);
    el.style.height = `${h}px`;
    el.style.width = `${s ? (h * s.frameWidth) / s.frameHeight : h * 0.6}px`;
    applyArtIcon(el, this.ctx, key, '#e8e2d0');
    return el;
  }

  /** 화면 전체에서 입자가 소용돌이치며 actor로 빨려 들어간다. 끝으로 갈수록 빠르고 많고 캐릭터가 밝게 떨린다 */
  private converge(actor: HTMLElement, color: string, sec: number, count: number, done: () => void): void {
    const canvas = document.createElement('canvas');
    canvas.className = 'cs-canvas';
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    this.root.appendChild(canvas);
    const g = canvas.getContext('2d');
    const r = actor.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const far = Math.hypot(canvas.width, canvas.height) * 0.65;
    const parts = Array.from({ length: count }, (_, i) => ({
      angle: Math.random() * Math.PI * 2,
      dist: far * (0.5 + Math.random() * 0.5),
      // 뒤로 갈수록 몰려 들어온다
      delay: Math.pow(i / count, 0.6) * 0.72,
      dur: 0.16 + Math.random() * 0.14,
      spin: (Math.random() < 0.5 ? -1 : 1) * (1.2 + Math.random() * 1.8),
      size: 1.5 + Math.random() * 3,
      white: Math.random() < 0.35,
    }));
    const pos = (p: (typeof parts)[number], t: number) => {
      const e = t * t;
      const d = p.dist * (1 - e);
      const a = p.angle + p.spin * e;
      return { x: cx + Math.cos(a) * d, y: cy + Math.sin(a) * d };
    };
    const start = performance.now();
    const frame = (now: number) => {
      const k = Math.min(1, (now - start) / (sec * 1000));
      if (g) {
        g.clearRect(0, 0, canvas.width, canvas.height);
        g.lineCap = 'round';
        // 캐릭터 뒤 빛
        const glow = g.createRadialGradient(cx, cy, 0, cx, cy, 40 + 260 * k * k);
        glow.addColorStop(0, color);
        glow.addColorStop(1, 'transparent');
        g.globalAlpha = 0.15 + 0.6 * k * k;
        g.fillStyle = glow;
        g.fillRect(0, 0, canvas.width, canvas.height);
        for (const p of parts) {
          const t = (k - p.delay) / p.dur;
          if (t <= 0 || t >= 1) continue;
          const a = pos(p, t);
          const b = pos(p, Math.max(0, t - 0.07));
          g.globalAlpha = Math.min(1, t * 4);
          g.strokeStyle = p.white ? '#ffffff' : color;
          g.lineWidth = p.size;
          g.beginPath();
          g.moveTo(a.x, a.y);
          g.lineTo(b.x, b.y);
          g.stroke();
        }
      }
      const shakePx = k * k * 7;
      actor.style.transform = `translate(${(Math.random() - 0.5) * shakePx}px, ${(Math.random() - 0.5) * shakePx}px) scale(${1 + k * 0.12})`;
      actor.style.filter = `brightness(${1 + 5 * k * k}) drop-shadow(0 0 ${6 + 34 * k}px ${color})`;
      if (k >= 1) {
        canvas.remove();
        done();
        return;
      }
      this.raf = requestAnimationFrame(frame);
    };
    this.raf = requestAnimationFrame(frame);
  }

  /** 전직 뒷부분: 실루엣이 엠블럼으로 → 반대 학파 아이콘이 깨져 파편이 내 스킬로 → +1 → 학파 색 전환 */
  private playConversion(stage: HTMLElement, cut: Extract<CutIn, { kind: 'advancement' }>): void {
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
