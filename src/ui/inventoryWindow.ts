/**
 * 인벤토리 (DOM). 열려 있는 동안 게임은 멈춘다.
 * 스킬 탭: 장착 4칸 + 패시브 1칸 + 궁극기(고정) + 보관 목록. 각 스킬의 Lv·각성·요구 스탯 진행도.
 *   교체: 끌어다 놓기(PC) 또는 스킬 탭 → 칸 탭(모바일·PC 공통).
 * 아이템 탭: 무기 2칸(버리기), 얻은 아이템, 현재 버프, 코인, 현재 스탯 6종.
 */
import { applyArtIcon } from './artIcon';
import type { GameContext } from '../core/context';
import { bus } from '../core/events';
import { conversionLines } from './cutscenePages';
import { gradeMultiplier } from '../systems/damage';
import { findSkill, skillValues, storedSkills } from '../systems/skills';
import { skillTags, tagBadges } from '../systems/tags';
import { emptyHanded, weaponStats, type WeaponItem } from '../systems/weapons';
import { STAT_IDS, type TagId } from '../types/data';
import { itemDescParams } from './itemCard';

type Target = number | 'passive';
type Tab = 'skill' | 'items';

const DRAG_START_PX = 6;

export class InventoryWindow {
  private readonly root: HTMLDivElement;
  private readonly notice: HTMLDivElement;
  private open = false;
  private selected: string | null = null;
  /** 설명 칸에 보이는 스킬 ('ultimate'이면 궁극기). 누르거나(모바일) 마우스를 올리면(PC) 바뀐다 */
  private detailId: string | null = null;
  private detailEl: HTMLDivElement | null = null;
  private drag: { id: string; x: number; y: number; ghost: HTMLDivElement | null } | null = null;
  private noticeTimer = 0;
  private tab: Tab = 'skill';

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
    const tabs = document.createElement('div');
    tabs.className = 'iw-tabs';
    for (const id of ['skill', 'items'] as const) {
      const b = document.createElement('button');
      b.textContent = t(`inventory.tab.${id}`);
      b.classList.toggle('on', this.tab === id);
      b.addEventListener('click', () => {
        this.tab = id;
        this.selected = null;
        this.render();
      });
      tabs.appendChild(b);
    }
    const close = document.createElement('button');
    close.textContent = t('inventory.close');
    close.addEventListener('click', () => bus.emit('inventoryCloseRequest', {}));
    head.append(title, tabs, close);
    if (this.tab === 'items') {
      this.root.append(head, this.itemsTab());
      return;
    }

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
    ultEl.querySelector('.iw-name')!.textContent = ult ? t(p.ultimate.awakened && ult.awakening ? ult.awakening.nameKey : ult.nameKey) : '';
    ultEl.addEventListener('click', () => this.showDetail('ultimate'));
    ultEl.addEventListener('mouseenter', () => this.showDetail('ultimate'));
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

    this.detailEl = document.createElement('div');
    this.detailEl.className = 'iw-detail';
    this.root.append(head, hint, equipRow, storedTitle, storedRow, this.detailEl);
    this.showDetail(this.detailId ?? this.selected ?? p.loadout.active.find((x) => x !== null) ?? null);
    // 전직 후 스킬 변환 기록
    if (p.advancementLog) {
      const logTitle = document.createElement('div');
      logTitle.className = 'iw-sub';
      logTitle.textContent = t('inventory.advancementLog', { adv: t(`job.adv.${p.advancementLog.school}`) });
      const logBody = document.createElement('div');
      logBody.className = 'iw-log';
      logBody.textContent = conversionLines(p.advancementLog, this.ctx).join(' · ');
      this.root.append(logTitle, logBody);
    }
  }

  /** 아이템 탭 */
  private itemsTab(): HTMLDivElement {
    const t = this.ctx.t;
    const d = this.ctx.data;
    const s = this.ctx.session!;
    const p = s.player;
    const body = document.createElement('div');
    body.className = 'iw-items';
    const section = (titleText: string, ...children: HTMLElement[]) => {
      const sec = document.createElement('div');
      sec.className = 'iw-sec';
      const h = document.createElement('div');
      h.className = 'iw-sub';
      h.textContent = titleText;
      sec.append(h, ...children);
      return sec;
    };
    const line = (cls: string, text: string, color?: string) => {
      const el = document.createElement('div');
      el.className = cls;
      el.textContent = text;
      if (color) el.style.color = color;
      return el;
    };

    // 무기 2칸
    const weapons = document.createElement('div');
    weapons.className = 'iw-row';
    ([0, 1] as const).forEach((i) => weapons.appendChild(this.weaponCard(i, p.weapons.slots[i], p.weapons.active === i)));
    const wsec = section(t('inventory.weapons'), weapons);
    if (emptyHanded(p.weapons)) {
      const fist = d.weapons.weapons.find((w) => w.id === d.weapons.fistWeapon)!;
      wsec.appendChild(line('iw-hint', t('inventory.emptyHands', { fist: t(fist.nameKey) })));
    }

    // 얻은 아이템
    const list = document.createElement('div');
    list.className = 'iw-itemlist';
    if (p.items.length === 0) list.appendChild(line('iw-none', t('inventory.noItems')));
    for (const id of p.items) {
      const def = d.items.items.find((x) => x.id === id);
      if (!def) continue;
      const grade = d.groupMultipliers.grades.find((g) => g.id === def.grade);
      const el = document.createElement('div');
      el.className = 'iw-item';
      const name = document.createElement('div');
      name.className = 'iw-name';
      const icon = document.createElement('span');
      icon.className = 'cw-icon';
      applyArtIcon(icon, this.ctx, def.spriteKey, def.color);
      name.append(icon, t(def.nameKey));
      name.style.color = grade?.color ?? '#ffffff';
      el.append(name, line('iw-grade', grade ? t(grade.nameKey) : ''), line('iw-desc', t(def.descKey, itemDescParams(def, d.groupMultipliers))));
      list.appendChild(el);
    }

    // 버프 · 코인 · 스탯
    const buffs = line('iw-desc', s.buffs.length ? s.buffs.map((b) => `${b.label} ${Math.ceil(b.leftSec)}`).join(' · ') : t('inventory.noBuffs'));
    const stats = document.createElement('div');
    stats.className = 'iw-stats';
    for (const id of STAT_IDS) stats.appendChild(line('iw-stat', `${t(`stat.${id}`)} ${Math.round(s.effStats[id] * 10) / 10}`));
    const status = document.createElement('div');
    status.className = 'iw-status';
    status.append(
      section(t('inventory.buffs'), buffs),
      section(t('inventory.coins', { coins: Math.floor(p.coins) })),
      section(t('inventory.stats'), stats),
    );

    body.append(wsec, section(t('inventory.items'), list), status);
    return body;
  }

  /** 무기 한 칸: 이름·등급·수치·옵션·고유 효과·장착 보너스 + 버리기 */
  private weaponCard(slot: 0 | 1, item: WeaponItem | null, holding: boolean): HTMLDivElement {
    const t = this.ctx.t;
    const d = this.ctx.data;
    const el = document.createElement('div');
    el.className = 'iw-slot iw-weapon';
    const small = document.createElement('small');
    small.textContent = t('inventory.slot', { n: slot + 1 }) + (holding && item ? ` · ${t('inventory.holding')}` : '');
    el.appendChild(small);
    if (!item) {
      const empty = document.createElement('div');
      empty.className = 'iw-empty';
      empty.textContent = t('inventory.empty');
      el.appendChild(empty);
      return el;
    }
    const def = d.weapons.weapons.find((w) => w.id === item.defId)!;
    const grade = d.groupMultipliers.grades.find((g) => g.id === item.grade);
    const st = weaponStats(def, item, gradeMultiplier(item.grade, d.groupMultipliers));
    const add = (cls: string, text: string, color?: string) => {
      const x = document.createElement('div');
      x.className = cls;
      x.textContent = text;
      if (color) x.style.color = color;
      el.appendChild(x);
    };
    add('iw-name', t(def.nameKey), grade?.color);
    add('iw-grade', grade ? t(grade.nameKey) : '');
    add('iw-desc', t('inventory.weaponStats', { damage: Math.round(st.damage * 10) / 10, interval: Math.round(st.fireIntervalSec * 100) / 100, energy: st.energyCost }));
    for (const o of item.options) {
      const odef = d.weapons.options.find((x) => x.id === o.id);
      if (odef) add('iw-desc', t(odef.nameKey, { value: o.id === 'energyCost' ? o.value : Math.round(o.value * 100) }));
    }
    const sig = def.signature;
    if (sig) {
      const params: Record<string, string | number> = { every: sig.every };
      if (sig.kind !== 'space') params.dmg = sig.damageMul;
      if (sig.kind === 'bigSmash') params.rad = sig.radiusMul;
      add('iw-desc sig', t(`weapon.sigDesc.${sig.kind}`, params));
    }
    const bonus = def.equipBonus;
    for (const [k, v] of Object.entries(bonus?.stats ?? {})) add('iw-desc sig', t('weapon.bonus.stat', { stat: t(`stat.${k}`), value: v ?? 0 }));
    if (bonus?.rangedDamage) add('iw-desc sig', t('weapon.bonus.ranged', { value: Math.round(bonus.rangedDamage * 100) }));
    if (bonus?.meleeDamage) add('iw-desc sig', t('weapon.bonus.melee', { value: Math.round(bonus.meleeDamage * 100) }));
    const drop = document.createElement('button');
    drop.className = 'iw-drop';
    drop.textContent = t('inventory.drop');
    drop.addEventListener('click', () => bus.emit('inventoryDropWeapon', { slot }));
    el.appendChild(drop);
    return el;
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
      this.detailId = id;
      this.onSkillTap(id);
    });
    el.addEventListener('mouseenter', () => this.showDetail(id));
    return el;
  }

  /** 설명 칸: 이름·계열·레벨·태그·쿨타임, 지금 효과(수치), 다음 레벨, 각성 조건과 각성 효과 / 궁극기 */
  private showDetail(id: string | null): void {
    const box = this.detailEl;
    if (!box) return;
    this.detailId = id;
    box.replaceChildren();
    const t = this.ctx.t;
    const d = this.ctx.data;
    const p = this.ctx.session?.player;
    if (!p || !id) {
      box.appendChild(this.line('iw-hint', t('inventory.detailHint')));
      return;
    }
    if (id === 'ultimate') {
      const u = d.ultimates.ultimates.find((x) => x.id === p.ultimate.id);
      if (!u) return;
      const aw = p.ultimate.awakened && u.awakening;
      box.append(
        this.line('iw-dname', t(aw ? u.awakening!.nameKey : u.nameKey), u.color),
        this.line('iw-dmeta', t('inventory.ultimate')),
        this.badges(u.tags),
        this.line('iw-desc', t(aw ? u.awakening!.descKey : u.descKey, fmt(aw ? { ...u.values, ...u.awakening!.values } : u.values))),
      );
      if (u.awakening && !p.ultimate.awakened) box.append(this.line('iw-dsub', t('inventory.detailAwakened')), this.line('iw-desc dim', t(u.awakening.descKey, fmt({ ...u.values, ...u.awakening.values }))));
      return;
    }
    const owned = p.loadout.owned[id];
    if (!owned) return;
    const def = findSkill(d.skills, id);
    const sv = skillValues(def, owned);
    const meta = [t(`school.${def.school}`), t(def.kind === 'passive' ? 'card.passive' : 'card.active'), `Lv${owned.level}`];
    if (def.kind !== 'passive') meta.push(t('inventory.detailCooldown', { sec: Math.round(sv.cooldownSec * 10) / 10 }));
    box.append(
      this.line('iw-dname', owned.awakened ? `★ ${t(def.awakening.nameKey)}` : t(def.nameKey)),
      this.line('iw-dmeta', meta.join(' · ')),
      this.badges(skillTags(def, owned.awakened)),
      this.line('iw-desc', t(owned.awakened ? def.awakening.descKey : def.descKey, fmt(sv.values))),
    );
    if (!owned.awakened && owned.level < d.skills.maxLevel) {
      const next = skillValues(def, { level: owned.level + 1, awakened: false });
      box.append(this.line('iw-dsub', t('inventory.detailNext', { level: owned.level + 1 })), this.line('iw-desc dim', t(def.descKey, fmt(next.values))));
    }
    if (!owned.awakened) {
      const a = def.awakening;
      const met = p.stats[a.requiredStat] >= a.requiredValue && owned.level >= d.skills.maxLevel;
      const req = this.line('iw-dsub', t('inventory.detailAwaken', { stat: t(`stat.${a.requiredStat}`), value: p.stats[a.requiredStat], need: a.requiredValue, level: d.skills.maxLevel }));
      req.classList.toggle('met', met);
      const after = skillValues(def, { level: d.skills.maxLevel, awakened: true });
      box.append(req, this.line('iw-desc dim', `${t(a.nameKey)} — ${t(a.descKey, fmt(after.values))}`));
    }
  }

  private line(cls: string, text: string, color?: string): HTMLDivElement {
    const el = document.createElement('div');
    el.className = cls;
    el.textContent = text;
    if (color) el.style.color = color;
    return el;
  }

  private badges(tags: readonly TagId[]): HTMLDivElement {
    const row = document.createElement('div');
    row.className = 'cw-badges';
    for (const b of tagBadges(tags, this.ctx.data.tags)) {
      const s = document.createElement('span');
      s.textContent = this.ctx.t(b.nameKey);
      s.style.background = b.color;
      row.appendChild(s);
    }
    return row;
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

/** 설명 문구에 넣을 수치 (소수점 정리) */
function fmt(values: Record<string, number>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(values)) out[k] = String(Math.round(v * 100) / 100);
  return out;
}
