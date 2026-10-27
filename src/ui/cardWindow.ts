/**
 * 카드 선택창 (DOM). 게임이 멈춘 동안 화면 위에 뜬다.
 * PC: 카드 3장 가로, 클릭하면 바로 고른다(1/2/3 키는 RunScene이 명령으로 받는다).
 * 모바일: 큰 카드 3장 세로, 탭으로 고른 뒤 '확정'(오터치 방지).
 */
import type { GameContext } from '../core/context';
import { bus } from '../core/events';
import type { Card } from '../systems/cards';
import { describeCard } from './cardView';

export class CardWindow {
  private readonly root: HTMLDivElement;
  private selected = -1;

  constructor(private readonly ctx: GameContext) {
    this.root = document.createElement('div');
    this.root.id = 'card-window';
    this.root.addEventListener('pointerdown', (e) => e.stopPropagation());
    document.body.appendChild(this.root);
    bus.on('cardsShow', ({ titleKey, cards }) => this.show(titleKey, cards));
    bus.on('modal', ({ kind }) => {
      if (kind !== 'cards') this.hide();
    });
  }

  private show(titleKey: string, cards: Card[]): void {
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
      name.style.color = v.accent;
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
        left.append(name, level);
        const meta = document.createElement('div');
        meta.className = 'cw-meta';
        top.textContent = [v.kindLabel, sub.textContent].filter(Boolean).join(' · ');
        meta.append(top, badges);
        const right = document.createElement('div');
        right.className = 'cw-right';
        right.append(meta, desc);
        el.append(left, right);
      } else {
        el.append(top, name, sub, badges, level, desc);
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
    if (mobile) this.root.appendChild(confirm);
    this.root.style.display = 'flex';
  }

  private hide(): void {
    this.root.style.display = 'none';
    this.root.replaceChildren();
  }
}
