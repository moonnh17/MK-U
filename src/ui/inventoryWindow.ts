/**
 * 인벤토리 — 스킬 탭 (DOM, 최소 버전). 열려 있는 동안 게임은 멈춘다.
 * 장착 4칸 + 패시브 1칸 + 궁극기(고정) + 보관 목록. 각 스킬의 Lv·각성·요구 스탯 진행도.
 * 교체: 끌어다 놓기(PC) 또는 스킬 탭 → 칸 탭(모바일·PC 공통). 아이템 탭은 M4~M5.
 */
import type { GameContext } from '../core/context';
import { bus } from '../core/events';
import { findSkill, storedSkills } from '../systems/skills';

type Target = number | 'passive';

const DRAG_START_PX = 6;

export class InventoryWindow {
  private readonly root: HTMLDivElement;
  private readonly notice: HTMLDivElement;
  private open = false;
  private selected: string | null = null;
  private drag: { id: string; x: number; y: number; ghost: HTMLDivElement | null } | null = null;
  private noticeTimer = 0;

  constructor(private readonly ctx: GameContext) {
    this.root = document.createElement('div');
    this.root.id = 'inventory-window';
    this.root.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.root.addEventListener('pointermove', (e) => this.onMove(e));
    this.root.addEventListener('pointerup', (e) => this.onUp(e));
    document.body.appendChild(this.root);

    this.notice = document.createElement('div');
    this.notice.id = 'stored-notice';
    this.notice.addEventListener('pointerdown', (e) => e.stopPropagation());
    document.body.appendChild(this.notice);

    bus.on('modal', ({ kind }) => {
      this.open = kind === 'inventory';
      this.selected = null;
      if (this.open) {
        this.notice.style.display = 'none';
        this.render();
      }
      this.root.style.display = this.open ? 'flex' : 'none';
    });
    bus.on('inventoryChanged', () => {
      if (this.open) this.render();
    });
    bus.on('storedNotice', ({ skillId }) => this.showNotice(skillId));
  }

  private render(): void {
    const t = this.ctx.t;
    const d = this.ctx.data;
    const p = this.ctx.session?.player;
    if (!p) return;
    this.root.className = this.ctx.uiMode;
    this.root.replaceChildren();

    const head = document.createElement('div');
    head.className = 'iw-head';
    const title = document.createElement('b');
    title.textContent = t('inventory.title');
    const close = document.createElement('button');
    close.textContent = t('inventory.close');
    close.addEventListener('click', () => bus.emit('inventoryCloseRequest', {}));
    head.append(title, close);

    const hint = document.createElement('div');
    hint.className = 'iw-hint';
    hint.textContent = t('inventory.hint');

    const equipRow = document.createElement('div');
    equipRow.className = 'iw-row';
    p.loadout.active.forEach((id, i) => equipRow.appendChild(this.slot(t('inventory.active') + ` ${i + 1}`, id, i)));
    equipRow.appendChild(this.slot(t('inventory.passive'), p.loadout.passive, 'passive'));
    const ult = d.ultimates.ultimates.find((u) => u.id === p.ultimate.id);
    const ultEl = document.createElement('div');
    ultEl.className = 'iw-slot fixed';
    ultEl.innerHTML = '<small></small><div class="iw-name"></div>';
    ultEl.querySelector('small')!.textContent = t('inventory.ultimate');
    ultEl.querySelector('.iw-name')!.textContent = ult ? t(ult.nameKey) : '';
    equipRow.appendChild(ultEl);

    const storedTitle = document.createElement('div');
    storedTitle.className = 'iw-sub';
    storedTitle.textContent = t('inventory.stored');
    const storedRow = document.createElement('div');
    storedRow.className = 'iw-row stored';
    const stored = storedSkills(p.loadout);
    if (stored.length === 0) {
      const none = document.createElement('div');
      none.className = 'iw-none';
      none.textContent = t('inventory.none');
      storedRow.appendChild(none);
    }
    for (const id of stored) storedRow.appendChild(this.skillCard(id));

    this.root.append(head, hint, equipRow, storedTitle, storedRow);
  }

  /** 장착 칸 (놓을 수 있는 자리) */
  private slot(label: string, id: string | null, target: Target): HTMLDivElement {
    const el = document.createElement('div');
    el.className = 'iw-slot';
    el.dataset.target = String(target);
    const small = document.createElement('small');
    small.textContent = label;
    el.appendChild(small);
    if (id) el.appendChild(this.skillCard(id));
    else {
      const empty = document.createElement('div');
      empty.className = 'iw-empty';
      empty.textContent = this.ctx.t('inventory.empty');
      el.appendChild(empty);
    }
    el.addEventListener('click', () => this.onSlotTap(target));
    return el;
  }

  /** 스킬 한 장: 이름·Lv 점·각성·요구 스탯 진행도 */
  private skillCard(id: string): HTMLDivElement {
    const t = this.ctx.t;
    const d = this.ctx.data;
    const p = this.ctx.session!.player;
    const def = findSkill(d.skills, id);
    const owned = p.loadout.owned[id]!;
    const sb = d.ui.hud.skillbar;
    const el = document.createElement('div');
    el.className = 'iw-skill';
    if (this.selected === id) el.classList.add('selected');
    el.dataset.skill = id;
    el.style.borderColor = owned.awakened ? sb.awakenedColor : (sb.levelColors[owned.level - 1] ?? sb.emptyColor);
    const name = document.createElement('div');
    name.className = 'iw-name';
    name.textContent = owned.awakened ? t(def.awakening.nameKey) : t(def.nameKey);
    const lv = document.createElement('div');
    lv.className = 'iw-lv';
    lv.textContent = `Lv${owned.level} ${'●'.repeat(owned.level)}${'○'.repeat(d.skills.maxLevel - owned.level)}`;
    if (owned.awakened) lv.textContent += ` ★${t('inventory.awakened')}`;
    const req = document.createElement('div');
    req.className = 'iw-req';
    const a = def.awakening;
    req.textContent = t('inventory.requirement', { stat: t(`stat.${a.requiredStat}`), value: p.stats[a.requiredStat], need: a.requiredValue });
    req.classList.toggle('met', p.stats[a.requiredStat] >= a.requiredValue);
    el.append(name, lv, req);
    el.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      this.drag = { id, x: e.clientX, y: e.clientY, ghost: null };
    });
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      this.onSkillTap(id);
    });
    return el;
  }

  private onSkillTap(id: string): void {
    // 이미 고른 스킬이 있고 이 스킬이 장착 칸에 있으면 그 칸으로 교체
    if (this.selected && this.selected !== id) {
      const target = this.targetOf(id);
      if (target !== null && this.tryEquip(this.selected, target)) return;
    }
    this.selected = this.selected === id ? null : id;
    this.render();
  }

  private onSlotTap(target: Target): void {
    if (this.selected) this.tryEquip(this.selected, target);
  }

  /** 이 스킬이 장착된 칸 (보관 중이면 null) */
  private targetOf(id: string): Target | null {
    const lo = this.ctx.session!.player.loadout;
    if (lo.passive === id) return 'passive';
    const i = lo.active.indexOf(id);
    return i === -1 ? null : i;
  }

  private tryEquip(id: string, target: Target): boolean {
    const def = findSkill(this.ctx.data.skills, id);
    const ok = target === 'passive' ? def.kind === 'passive' : def.kind === 'active';
    if (!ok) return false;
    this.selected = null;
    bus.emit('inventoryEquip', { skillId: id, target });
    return true;
  }

  private onMove(e: PointerEvent): void {
    const dr = this.drag;
    if (!dr) return;
    if (!dr.ghost) {
      if (Math.hypot(e.clientX - dr.x, e.clientY - dr.y) < DRAG_START_PX) return;
      dr.ghost = document.createElement('div');
      dr.ghost.className = 'iw-ghost';
      const def = findSkill(this.ctx.data.skills, dr.id);
      dr.ghost.textContent = this.ctx.t(def.nameKey);
      document.body.appendChild(dr.ghost);
    }
    dr.ghost.style.left = `${e.clientX}px`;
    dr.ghost.style.top = `${e.clientY}px`;
  }

  private onUp(e: PointerEvent): void {
    const dr = this.drag;
    this.drag = null;
    if (!dr?.ghost) return;
    dr.ghost.remove();
    // 끌어다 놓기: 손을 뗀 곳의 칸으로
    const under = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>('[data-target]');
    const raw = under?.dataset.target;
    if (raw !== undefined) this.tryEquip(dr.id, raw === 'passive' ? 'passive' : Number(raw));
    // 끌었으면 이어지는 click은 선택으로 치지 않는다
    const swallow = (ev: Event) => ev.stopPropagation();
    window.addEventListener('click', swallow, { capture: true, once: true });
    setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), 0);
  }

  /** 새 스킬이 칸이 없어 보관됐을 때: 알림 + 바로 여는 버튼 */
  private showNotice(skillId: string): void {
    const t = this.ctx.t;
    const def = findSkill(this.ctx.data.skills, skillId);
    this.notice.replaceChildren();
    const text = document.createElement('span');
    text.textContent = t('inventory.storedNotice', { skill: t(def.nameKey) });
    const btn = document.createElement('button');
    btn.textContent = t('inventory.openButton');
    btn.addEventListener('click', () => {
      this.notice.style.display = 'none';
      bus.emit('inventoryOpenRequest', {});
    });
    this.notice.append(text, btn);
    this.notice.style.display = 'flex';
    window.clearTimeout(this.noticeTimer);
    this.noticeTimer = window.setTimeout(() => (this.notice.style.display = 'none'), this.ctx.data.ui.storedNoticeSec * 1000);
  }
}
