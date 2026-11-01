/**
 * 캐릭터 정보창 (DOM). 열려 있는 동안 게임은 멈춘다. RPG 정보창처럼 한 화면에 모은다.
 * 왼쪽: 캐릭터(모습·체력·정신력·에너지·무기·버프) / 가운데: 능력치 6종과 그 의미·지금 효과 /
 * 오른쪽: 스킬(장착 4칸 + 패시브 + 궁극기 + 보관), 아이템, 설명 칸.
 * 스킬 교체: 끌어다 놓기(PC) 또는 스킬 탭 → 칸 탭. 모바일은 화면이 낮아 세 칸을 탭으로 나눈다.
 */
import { applyArtIcon } from './artIcon';
import type { GameContext } from '../core/context';
import { bus } from '../core/events';
import { conversionLines } from './cutscenePages';
import { artKeys } from '../systems/art';
import { statSheetLines } from '../systems/statSheet';
import { weaponInfoLines } from './weaponInfo';
import { findSkill, skillValues, storedSkills } from '../systems/skills';
import { skillTags, tagBadges } from '../systems/tags';
import { emptyHanded, type WeaponItem } from '../systems/weapons';
import { STAT_IDS, type TagId } from '../types/data';
import { itemDescParams } from './itemCard';

type Target = number | 'passive';
type Tab = 'character' | 'skill' | 'items';

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
  private tab: Tab = 'character';

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
    const p = this.ctx.session?.player;
    if (!p) return;
    const mobile = this.ctx.uiMode === 'mobile';
    this.root.className = this.ctx.uiMode;
    this.root.replaceChildren();
    this.detailEl = null;

    const head = document.createElement('div');
    head.className = 'iw-head';
    const title = document.createElement('b');
    title.textContent = t('inventory.character');
    const close = document.createElement('button');
    close.textContent = t('inventory.close');
    close.addEventListener('click', () => bus.emit('inventoryCloseRequest', {}));
    head.appendChild(title);
    if (mobile) {
      const tabs = document.createElement('div');
      tabs.className = 'iw-tabs';
      for (const id of ['character', 'skill', 'items'] as const) {
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
      head.appendChild(tabs);
    }
    head.appendChild(close);

    const body = document.createElement('div');
    body.className = 'iw-sheet';
    if (mobile) {
      if (this.tab === 'character') body.append(this.characterPanel(), this.statsPanel());
      else if (this.tab === 'skill') body.append(this.skillPanel());
      else body.append(this.itemPanel());
    } else {
      const right = document.createElement('div');
      right.className = 'iw-col iw-col-right';
      right.append(this.skillPanel(), this.itemPanel());
      body.append(this.characterPanel(), this.statsPanel(), right);
    }
    this.root.append(head, body);
    this.refreshDetail();
  }

  private panel(titleText: string, cls = ''): HTMLDivElement {
    const el = document.createElement('div');
    el.className = `iw-panel ${cls}`;
    const h = document.createElement('div');
    h.className = 'iw-panel-title';
    h.textContent = titleText;
    el.appendChild(h);
    return el;
  }

  /** 체력·정신력·에너지 막대 */
  private meter(label: string, value: number, max: number, color: string): HTMLDivElement {
    const row = document.createElement('div');
    row.className = 'iw-meter';
    const name = document.createElement('span');
    name.textContent = label;
    const track = document.createElement('div');
    track.className = 'iw-meter-track';
    const fill = document.createElement('i');
    fill.style.width = `${max > 0 ? Math.min(100, (value / max) * 100) : 0}%`;
    fill.style.background = color;
    track.appendChild(fill);
    const num = document.createElement('b');
    num.textContent = `${Math.ceil(value)} / ${Math.round(max)}`;
    row.append(name, track, num);
    return row;
  }

  /** 왼쪽: 캐릭터 모습과 상태, 무기 */
  private characterPanel(): HTMLDivElement {
    const t = this.ctx.t;
    const d = this.ctx.data;
    const s = this.ctx.session!;
    const p = s.player;
    const el = this.panel(t('inventory.tab.character'), 'iw-char');
    const job = d.jobs.jobs.find((j) => j.id === p.job);
    const adv = job?.advancements.find((a) => a.id === p.advancement);
    const hero = document.createElement('div');
    hero.className = 'iw-hero';
    const face = document.createElement('span');
    face.className = 'iw-face';
    const schoolKey = p.advancement ? artKeys.playerSchool(p.advancement) : null;
    applyArtIcon(face, this.ctx, schoolKey && this.ctx.artLoaded.has(schoolKey) ? schoolKey : d.player.spriteKey, d.player.color);
    const who = document.createElement('div');
    who.className = 'iw-who';
    who.append(this.line('iw-job', job ? t(job.nameKey) : p.job), this.line('iw-adv', adv ? t(adv.nameKey) : t('settlement.noAdv'), adv?.color), this.line('iw-coins', t('inventory.coins', { coins: p.coins })));
    hero.append(face, who);
    const bars = d.ui.hud.bars;
    el.append(hero, this.meter(t('inventory.hp'), p.hp, p.maxHp, bars.hpColor), this.meter(t('inventory.sanity'), p.sanity, p.sanityMax, bars.sanityColor), this.meter(t('inventory.energy'), p.energy, p.energyMax, bars.energyColor));

    const weapons = document.createElement('div');
    weapons.className = 'iw-weapons';
    ([0, 1] as const).forEach((i) => weapons.appendChild(this.weaponCard(i, p.weapons.slots[i], p.weapons.active === i)));
    el.append(this.line('iw-sub', t('inventory.weapons')), weapons);
    if (emptyHanded(p.weapons)) {
      const fist = d.weapons.weapons.find((w) => w.id === d.weapons.fistWeapon)!;
      el.appendChild(this.line('iw-hint', t('inventory.emptyHands', { fist: t(fist.nameKey) })));
    }
    el.append(this.line('iw-sub', t('inventory.buffs')), this.line('iw-desc', s.buffs.length ? s.buffs.map((b) => `${b.label} ${Math.ceil(b.leftSec)}`).join(' · ') : t('inventory.noBuffs')));
    return el;
  }

  /** 가운데: 능력치 — 값, 무슨 뜻인지, 지금 얼마나 효과를 주는지 */
  private statsPanel(): HTMLDivElement {
    const t = this.ctx.t;
    const d = this.ctx.data;
    const s = this.ctx.session!;
    const el = this.panel(t('inventory.statsTitle'), 'iw-statsheet');
    for (const id of STAT_IDS) {
      const row = document.createElement('div');
      row.className = 'iw-statrow';
      const icon = document.createElement('span');
      icon.className = 'iw-staticon';
      applyArtIcon(icon, this.ctx, artKeys.statIcon(id));
      const main = document.createElement('div');
      main.className = 'iw-statmain';
      const top = document.createElement('div');
      top.className = 'iw-stattop';
      const value = Math.round(s.effStats[id] * 10) / 10;
      const bonus = Math.round((value - s.player.stats[id]) * 10) / 10;
      const num = document.createElement('b');
      num.textContent = String(value);
      if (bonus !== 0) {
        const extra = document.createElement('small');
        extra.textContent = ` (${s.player.stats[id]} ${bonus > 0 ? '+' : ''}${bonus})`;
        extra.className = bonus > 0 ? 'up' : 'down';
        num.appendChild(extra);
      }
      top.append(this.line('iw-statname', t(`stat.${id}`)), num);
      main.append(top, this.line('iw-statdesc', t(`stat.${id}.desc`)));
      const fx = document.createElement('div');
      fx.className = 'iw-statfx';
      for (const l of statSheetLines(id, s.effStats, d.stats, d.tags, d.player.sanity)) {
        const chip = document.createElement('span');
        chip.textContent = t(l.key, { v: l.value });
        fx.appendChild(chip);
      }
      main.appendChild(fx);
      row.append(icon, main);
      el.appendChild(row);
    }
    return el;
  }

  /** 오른쪽 위: 스킬 칸과 보관 목록 */
  private skillPanel(): HTMLDivElement {
    const t = this.ctx.t;
    const d = this.ctx.data;
    const p = this.ctx.session!.player;
    const el = this.panel(t('inventory.skills'), 'iw-skills');
    const equipRow = document.createElement('div');
    equipRow.className = 'iw-row';
    p.loadout.active.forEach((id, i) => equipRow.appendChild(this.slot(t('inventory.active') + ` ${i + 1}`, id, i)));
    equipRow.appendChild(this.slot(t('inventory.passive'), p.loadout.passive, 'passive'));
    const ult = d.ultimates.ultimates.find((u) => u.id === p.ultimate.id);
    const ultEl = document.createElement('div');
    ultEl.className = 'iw-slot fixed';
    const ultSmall = document.createElement('small');
    ultSmall.textContent = t('inventory.ultimate');
    ultEl.appendChild(ultSmall);
    if (ult) {
      const icon = document.createElement('span');
      icon.className = 'iw-skillicon';
      applyArtIcon(icon, this.ctx, artKeys.ultimateIcon(ult.id));
      ultEl.append(icon, this.line('iw-name', t(p.ultimate.awakened && ult.awakening ? ult.awakening.nameKey : ult.nameKey)));
    }
    ultEl.addEventListener('click', () => this.showDetail('ultimate'));
    ultEl.addEventListener('mouseenter', () => this.showDetail('ultimate'));
    equipRow.appendChild(ultEl);
    const storedRow = document.createElement('div');
    storedRow.className = 'iw-row stored';
    const stored = storedSkills(p.loadout);
    if (stored.length === 0) storedRow.appendChild(this.line('iw-none', t('inventory.none')));
    for (const id of stored) storedRow.appendChild(this.skillCard(id));
    el.append(equipRow, this.line('iw-sub', t('inventory.stored')), storedRow, this.line('iw-hint', t('inventory.hint')));
    if (this.ctx.uiMode === 'mobile') el.appendChild(this.makeDetail());
    // 전직 후 스킬 변환 기록
    if (p.advancementLog) {
      el.append(this.line('iw-sub', t('inventory.advancementLog', { adv: t(`job.adv.${p.advancementLog.school}`) })), this.line('iw-log', conversionLines(p.advancementLog, this.ctx).join(' · ')));
    }
    return el;
  }

  /** 오른쪽 아래: 아이템 아이콘 + 설명 칸 */
  private itemPanel(): HTMLDivElement {
    const t = this.ctx.t;
    const d = this.ctx.data;
    const p = this.ctx.session!.player;
    const el = this.panel(t('inventory.items'), 'iw-itemspanel');
    const grid = document.createElement('div');
    grid.className = 'iw-itemgrid';
    if (p.items.length === 0) grid.appendChild(this.line('iw-none', t('inventory.noItems')));
    for (const id of p.items) {
      const def = d.items.items.find((x) => x.id === id);
      if (!def) continue;
      const grade = d.groupMultipliers.grades.find((g) => g.id === def.grade);
      const cell = document.createElement('button');
      cell.className = 'iw-itemcell';
      cell.style.borderColor = grade?.color ?? '#ffffff';
      cell.title = t(def.nameKey);
      const icon = document.createElement('span');
      applyArtIcon(icon, this.ctx, def.spriteKey, def.color);
      cell.appendChild(icon);
      const show = () => this.showDetail(`item:${id}`);
      cell.addEventListener('click', show);
      cell.addEventListener('mouseenter', show);
      grid.appendChild(cell);
    }
    el.append(grid, this.makeDetail());
    return el;
  }

  private makeDetail(): HTMLDivElement {
    this.detailEl = document.createElement('div');
    this.detailEl.className = 'iw-detail';
    return this.detailEl;
  }

  /** 다시 그린 뒤 설명 칸을 채운다 */
  private refreshDetail(): void {
    if (!this.detailEl) return;
    const p = this.ctx.session?.player;
    this.showDetail(this.detailId ?? this.selected ?? p?.loadout.active.find((x) => x !== null) ?? null);
  }

  /** 무기 한 칸: 아이콘·이름·등급·수치·옵션·고유 효과·장착 보너스 + 버리기 */
  private weaponCard(slot: 0 | 1, item: WeaponItem | null, holding: boolean): HTMLDivElement {
    const t = this.ctx.t;
    const d = this.ctx.data;
    const el = document.createElement('div');
    el.className = 'iw-weaponcard';
    el.classList.toggle('holding', holding && !!item);
    const small = document.createElement('small');
    small.textContent = t('inventory.slot', { n: slot + 1 }) + (holding && item ? ` · ${t('inventory.holding')}` : '');
    el.appendChild(small);
    if (!item) {
      el.appendChild(this.line('iw-empty', t('inventory.empty')));
      return el;
    }
    const def = d.weapons.weapons.find((w) => w.id === item.defId)!;
    const grade = d.groupMultipliers.grades.find((g) => g.id === item.grade);
    if (grade) el.style.borderColor = grade.color;
    const top = document.createElement('div');
    top.className = 'iw-weapontop';
    const icon = document.createElement('span');
    icon.className = 'iw-weaponicon';
    applyArtIcon(icon, this.ctx, def.spriteKey, def.color);
    const names = document.createElement('div');
    names.append(this.line('iw-name', t(def.nameKey), grade?.color), this.line('iw-grade', grade ? t(grade.nameKey) : ''));
    top.append(icon, names);
    el.appendChild(top);
    for (const l of weaponInfoLines(this.ctx, item)) el.appendChild(this.line(l.sig ? 'iw-desc sig' : 'iw-desc', l.text));
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
    const icon = document.createElement('span');
    icon.className = 'iw-skillicon';
    applyArtIcon(icon, this.ctx, artKeys.skillIcon(id));
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
    el.append(icon, name, lv, req);
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
      box.appendChild(this.line('iw-hint', t('inventory.itemHint')));
      return;
    }
    if (id.startsWith('item:')) {
      const def = d.items.items.find((x) => x.id === id.slice(5));
      if (!def) return;
      const grade = d.groupMultipliers.grades.find((g) => g.id === def.grade);
      box.append(this.line('iw-dname', t(def.nameKey), grade?.color), this.line('iw-dmeta', grade ? t(grade.nameKey) : ''), this.line('iw-desc', t(def.descKey, itemDescParams(def, d.groupMultipliers))));
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
