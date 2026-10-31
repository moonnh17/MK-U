/**
 * 바닥 무기·진열대 앞에 서면 화면 아래에 뜨는 무기·카드 정보.
 * 줍거나 사기 전에 스탯과 효과를 볼 수 있게 한다. 누르는 것은 없다(게임을 막지 않는다).
 */
import { applyArtIcon } from './artIcon';
import type { GameContext } from '../core/context';
import { bus } from '../core/events';
import type { Card } from '../systems/cards';
import type { WeaponItem } from '../systems/weapons';
import { describeCard } from './cardView';
import { weaponInfoLines } from './weaponInfo';

export class WeaponTip {
  private readonly root: HTMLDivElement;

  constructor(private readonly ctx: GameContext) {
    this.root = document.createElement('div');
    this.root.id = 'weapon-tip';
    document.body.appendChild(this.root);
    bus.on('weaponTip', ({ item }) => this.show(item));
    bus.on('cardTip', ({ card }) => this.showCard(card));
    bus.on('modal', ({ kind }) => {
      if (kind) this.show(null);
    });
  }

  /** 상점 진열대 앞: 카드 내용과 태그 */
  private showCard(card: Card | null): void {
    const session = this.ctx.session;
    if (!card || !session) {
      this.root.style.display = 'none';
      return;
    }
    const v = describeCard(card, session.player, this.ctx);
    this.root.replaceChildren();
    this.root.style.borderColor = v.accent;
    const icon = document.createElement('span');
    icon.className = 'wt-icon';
    applyArtIcon(icon, this.ctx, v.icon?.key);
    const body = document.createElement('div');
    body.className = 'wt-body';
    const name = document.createElement('div');
    name.className = 'wt-name';
    name.textContent = `${v.name} · ${v.levelText}`;
    name.style.color = v.accent;
    const kind = document.createElement('div');
    kind.className = 'wt-line';
    kind.textContent = [v.kindLabel, v.school, ...v.badges.map((b) => this.ctx.t(b.nameKey))].filter(Boolean).join(' · ');
    const desc = document.createElement('div');
    desc.className = 'wt-line sig';
    desc.textContent = v.desc;
    body.append(name, kind, desc);
    this.root.append(icon, body);
    this.root.style.display = 'flex';
  }

  private show(item: WeaponItem | null): void {
    if (!item) {
      this.root.style.display = 'none';
      return;
    }
    const d = this.ctx.data;
    const t = this.ctx.t;
    const def = d.weapons.weapons.find((w) => w.id === item.defId)!;
    const grade = d.groupMultipliers.grades.find((g) => g.id === item.grade);
    this.root.replaceChildren();
    this.root.style.borderColor = grade?.color ?? '#ffffff';
    const icon = document.createElement('span');
    icon.className = 'wt-icon';
    applyArtIcon(icon, this.ctx, def.spriteKey, def.color);
    const body = document.createElement('div');
    body.className = 'wt-body';
    const name = document.createElement('div');
    name.className = 'wt-name';
    name.textContent = `${t(def.nameKey)} · ${grade ? t(grade.nameKey) : ''}`;
    name.style.color = grade?.color ?? '#ffffff';
    body.appendChild(name);
    for (const l of weaponInfoLines(this.ctx, item)) {
      const row = document.createElement('div');
      row.className = l.sig ? 'wt-line sig' : 'wt-line';
      row.textContent = l.text;
      body.appendChild(row);
    }
    this.root.append(icon, body);
    this.root.style.display = 'flex';
  }
}
