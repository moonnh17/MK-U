/**
 * 카드 선택창 (DOM). 게임이 멈춘 동안 화면 위에 뜬다.
 * PC: 카드 3장 가로, 클릭하면 바로 고른다(1/2/3 키는 RunScene이 명령으로 받는다).
 * 모바일: 큰 카드 3장 세로, 탭으로 고른 뒤 '확정'(오터치 방지).
 */
import { applyArtIcon } from './artIcon';
import type { GameContext } from '../core/context';
import { bus } from '../core/events';
import type { AnyCard } from '../systems/cards';
import { describeCard } from './cardView';

export class CardWindow {
  private readonly root: HTMLDivElement;
  private selected = -1;

  constructor(private readonly ctx: GameContext) {
    this.root = document.createElement('div');
    this.root.id = 'card-window';
    this.root.addEventListener('pointerdown', (e) => e.stopPropagation());
    document.body.appendChild(this.root);
    bus.on('cardsShow', ({ titleKey, cards, reroll }) => this.show(titleKey, cards, reroll));
    bus.on('modal', ({ kind }) => {
      if (kind !== 'cards') this.hide();
    });
  }

  private show(titleKey: string, cards: AnyCard[], reroll: { cost: number; enabled: boolean; used: boolean } | null): void {
    const t = this.ctx.t;
    const player = this.ctx.session?.player;
    if (!player) return;
    const mobile = this.ctx.uiMode === 'mobile';
    this.selected = -1;
    this.root.className = mobile ? 'mobile' : 'pc';
    this.root.replaceChildren();

    const head = document.createElement('div');
    head.className = 'cw-head';
    head.innerHTML = `<b></b><small></small>`;
    head.querySelector('b')!.textContent = t(titleKey);
    head.querySelector('small')!.textContent = t(mobile ? 'card.hint.mobile' : 'card.hint.pc');
    this.root.appendChild(head);

    const list = document.createElement('div');
    list.className = 'cw-list';
    const confirm = document.createElement('button');
    confirm.className = 'cw-confirm';
    confirm.textContent = t('card.confirm');
    confirm.disabled = true;
    confirm.addEventListener('click', () => {
      if (this.selected >= 0) bus.emit('cardPick', { index: this.selected });
    });

    cards.forEach((card, i) => {
      const v = describeCard(card, player, this.ctx);
      const el = document.createElement('div');
      el.className = 'cw-card';
      el.style.borderColor = v.accent;
      const top = document.createElement('div');
      top.className = 'cw-top';
      top.textContent = mobile ? v.kindLabel : `${i + 1}  ${v.kindLabel}`;
      const name = document.createElement('div');
      name.className = 'cw-name';
      name.textContent = v.name;
      // 큰 아이콘: 카드에서 가장 먼저 눈에 들어오게 (그림이 없으면 색 칸, artOnly면 칸을 비운다)
      const hero = document.createElement('div');
      hero.className = 'cw-hero';
      hero.style.borderColor = v.accent;
      const heroArt = document.createElement('span');
      if (v.icon && (applyArtIcon(heroArt, this.ctx, v.icon.key, v.icon.color) || !v.icon.artOnly)) hero.appendChild(heroArt);
      else hero.classList.add('empty');
      const sub = document.createElement('div');
      sub.className = 'cw-sub';
      sub.textContent = [v.subName, v.school].filter(Boolean).join(' · ');
      const badges = document.createElement('div');
      badges.className = 'cw-badges';
      for (const b of v.badges) {
        const s = document.createElement('span');
        s.textContent = t(b.nameKey);
        s.style.background = b.color;
        badges.appendChild(s);
      }
      const level = document.createElement('div');
      level.className = 'cw-level';
      level.textContent = v.levelText;
      const desc = document.createElement('div');
      desc.className = 'cw-desc';
      desc.textContent = v.desc;
      if (mobile) {
        // 모바일 가로 화면은 높이가 낮아 한 장을 두 줄로: [이름·레벨] [종류·계열·배지 / 설명]
        const left = document.createElement('div');
        left.className = 'cw-left';
        const leftText = document.createElement('div');
        leftText.className = 'cw-left-text';
        leftText.append(name, level);
        left.append(hero, leftText);
        const meta = document.createElement('div');
        meta.className = 'cw-meta';
        top.textContent = [v.kindLabel, sub.textContent].filter(Boolean).join(' · ');
        meta.append(top, badges);
        const right = document.createElement('div');
        right.className = 'cw-right';
        right.append(meta, desc);
        el.append(left, right);
      } else {
        el.append(top, hero, name, sub, level, badges, desc);
      }
      el.addEventListener('click', () => {
        if (!mobile) {
          bus.emit('cardPick', { index: i });
          return;
        }
        this.selected = i;
        for (const c of list.children) c.classList.toggle('selected', c === el);
        confirm.disabled = false;
      });
      list.appendChild(el);
    });
    this.root.appendChild(list);
    const bar = document.createElement('div');
    bar.className = 'cw-bar';
    // 리롤: 카드창마다 1회, 코인 (아이템 선택 카드에는 없다)
    if (reroll) {
      const rr = document.createElement('button');
      rr.className = 'cw-reroll';
      rr.textContent = reroll.used ? t('card.rerollUsed') : t('card.reroll', { cost: reroll.cost });
      rr.disabled = !reroll.enabled;
      rr.addEventListener('click', () => bus.emit('cardReroll', {}));
      bar.appendChild(rr);
    }
    if (mobile) bar.appendChild(confirm);
    this.root.appendChild(bar);
    this.root.style.display = 'flex';
  }

  private hide(): void {
    this.root.style.display = 'none';
    this.root.replaceChildren();
  }
}
