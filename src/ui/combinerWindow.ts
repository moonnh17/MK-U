/**
 * 아이템 조합기 창 (DOM). 넣을 수 있는 가진 아이템을 늘어놓고, 같은 등급 2개를 고르면 '조합'.
 * 하나를 고르면 다른 등급은 흐려진다. 닫기·ESC로 나간다.
 */
import { applyArtIcon } from './artIcon';
import type { GameContext } from '../core/context';
import { bus } from '../core/events';
import { combineGrade } from '../systems/items';

export class CombinerWindow {
  private readonly root: HTMLDivElement;

  constructor(private readonly ctx: GameContext) {
    this.root = document.createElement('div');
    this.root.id = 'combiner-window';
    this.root.addEventListener('pointerdown', (e) => e.stopPropagation());
    document.body.appendChild(this.root);
    bus.on('combinerShow', ({ items }) => this.show(items));
    bus.on('modal', ({ kind }) => {
      if (kind !== 'combiner') this.root.style.display = 'none';
    });
  }

  private show(items: string[]): void {
    const t = this.ctx.t;
    const data = this.ctx.data;
    const gradeColor = (g: string) => data.groupMultipliers.grades.find((x) => x.id === g)?.color ?? '#fff';
    const picked: string[] = [];
    this.root.replaceChildren();
    this.root.style.display = 'flex';

    const head = document.createElement('div');
    head.className = 'cw-head';
    const title = document.createElement('b');
    title.textContent = t('combiner.title');
    const hint = document.createElement('small');
    hint.textContent = t('combiner.hint');
    head.append(title, hint);

    const list = document.createElement('div');
    list.className = 'cb-list';
    const status = document.createElement('div');
    status.className = 'cb-status';
    const buttons = document.createElement('div');
    buttons.className = 'cb-buttons';
    const confirm = document.createElement('button');
    confirm.className = 'cw-confirm';
    confirm.textContent = t('combiner.confirm');
    const close = document.createElement('button');
    close.className = 'cw-confirm';
    close.textContent = t('combiner.close');
    close.addEventListener('click', () => bus.emit('combinerClose', {}));
    confirm.addEventListener('click', () => {
      if (picked.length === 2) bus.emit('combinerPick', { a: picked[0]!, b: picked[1]! });
    });
    buttons.append(confirm, close);

    const tiles = new Map<string, HTMLDivElement>();
    const gradeOf = (id: string) => data.items.items.find((x) => x.id === id)!.grade;
    const refresh = () => {
      const g = picked[0] ? gradeOf(picked[0]) : null;
      for (const [id, el] of tiles) {
        el.classList.toggle('selected', picked.includes(id));
        el.classList.toggle('off', !!g && gradeOf(id) !== g);
      }
      confirm.disabled = picked.length !== 2;
      const to = g ? combineGrade(g) : null;
      status.textContent = g && to ? t('combiner.preview', { from: t(`grade.${g}`), to: t(`grade.${to}`) }) : t('combiner.pickTwo');
    };

    if (items.length === 0) {
      status.textContent = t('combiner.none');
      confirm.disabled = true;
    }
    for (const id of items) {
      const def = data.items.items.find((x) => x.id === id);
      if (!def) continue;
      const el = document.createElement('div');
      el.className = 'cb-item';
      el.style.borderColor = gradeColor(def.grade);
      const icon = document.createElement('span');
      icon.className = 'cb-icon';
      applyArtIcon(icon, this.ctx, def.spriteKey, def.color);
      const name = document.createElement('div');
      name.className = 'cb-name';
      name.textContent = t(def.nameKey);
      const grade = document.createElement('div');
      grade.className = 'cb-grade';
      grade.textContent = t(`grade.${def.grade}`);
      grade.style.color = gradeColor(def.grade);
      el.append(icon, name, grade);
      el.addEventListener('click', () => {
        const i = picked.indexOf(id);
        if (i >= 0) picked.splice(i, 1);
        else if (picked.length < 2 && (!picked[0] || gradeOf(picked[0]) === def.grade)) picked.push(id);
        refresh();
      });
      tiles.set(id, el);
      list.appendChild(el);
    }
    if (items.length > 0) refresh();
    this.root.append(head, list, status, buttons);
  }
}
