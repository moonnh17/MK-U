/**
 * 도감 단말 (DOM). 실험장에서 조사하면 열린다.
 * 탭: 몬스터 · 캐릭터 · 아이템(무기 포함). 왼쪽은 묶음별 칸, 오른쪽은 고른 칸의 기록.
 * 만나지 않은 칸은 실루엣과 ???만 보이고, 고르면 '아직 기록이 없다'만 나온다.
 */
import type { GameContext } from '../core/context';
import { bus } from '../core/events';
import { artKeys } from '../systems/art';
import { codexProgress, codexSections, isKnown, type CodexEntry, type CodexTab } from '../systems/codex';
import { findSkill } from '../systems/skills';
import { tagBadges } from '../systems/tags';
import { plainWeapon } from '../systems/weapons';
import type { BossCore, TagId } from '../types/data';
import { applyArtIcon } from './artIcon';
import { itemDescParams } from './itemCard';
import { weaponInfoLines } from './weaponInfo';

const TABS: CodexTab[] = ['monsters', 'characters', 'items'];

function fmt(values: Record<string, number>): Record<string, string> {
  return Object.fromEntries(Object.entries(values).map(([k, v]) => [k, String(Math.round(v * 10) / 10)]));
}

export class CodexWindow {
  private readonly root: HTMLDivElement;
  private tab: CodexTab = 'monsters';
  private selected: CodexEntry | null = null;
  /** 지금 그리는 기록의 그림 옆 칸 */
  private side!: HTMLElement;

  constructor(private readonly ctx: GameContext) {
    this.root = document.createElement('div');
    this.root.id = 'codex-window';
    this.root.addEventListener('pointerdown', (e) => e.stopPropagation());
    document.body.appendChild(this.root);
    bus.on('codexShow', () => this.render());
    bus.on('modal', ({ kind }) => {
      if (kind !== 'codex') this.root.style.display = 'none';
    });
  }

  private el(tag: string, cls: string, text = ''): HTMLElement {
    const x = document.createElement(tag);
    x.className = cls;
    x.textContent = text;
    return x;
  }

  private render(): void {
    const t = this.ctx.t;
    // 다시 그려도 목록 스크롤은 그대로 둔다 (같은 탭일 때)
    const keepScroll = this.root.dataset.tab === this.tab ? (this.root.querySelector('.cx-scroll')?.scrollTop ?? 0) : 0;
    this.root.dataset.tab = this.tab;
    this.root.className = this.ctx.uiMode;
    this.root.replaceChildren();
    const sections = codexSections(this.ctx.data, this.tab);
    const flat = sections.flatMap((s) => s.entries);
    this.selected ??= flat[0] ?? null;
    const index = flat.findIndex((e) => e.kind === this.selected?.kind && e.id === this.selected.id);

    const head = this.el('div', 'cx-head');
    const tabs = this.el('div', 'cx-tabs');
    for (const id of TABS) {
      const b = this.el('button', `cx-btn${this.tab === id ? ' on' : ''}`, t(`codex.tab.${id}`));
      b.addEventListener('click', () => {
        this.tab = id;
        this.selected = null;
        this.render();
      });
      tabs.appendChild(b);
    }
    const p = codexProgress(this.ctx.data, this.ctx.save.data, this.tab);
    const close = this.el('button', 'cx-btn', t('codex.close'));
    close.addEventListener('click', () => bus.emit('codexClose', {}));
    head.append(this.el('b', 'cx-heading', t('codex.title')), tabs, this.el('span', 'cx-progress', t('codex.progress', { known: p.known, total: p.total })), close);

    const list = this.el('div', 'cx-list');
    const scroll = this.el('div', 'cx-scroll');
    for (const s of sections) {
      scroll.appendChild(this.el('div', 'cx-section', t(s.titleKey)));
      const grid = this.el('div', 'cx-grid');
      for (const e of s.entries) grid.appendChild(this.cell(e, flat.indexOf(e)));
      scroll.appendChild(grid);
    }
    list.append(this.el('div', 'cx-list-title', t('codex.list', { tab: t(`codex.tab.${this.tab}`) })), scroll);
    const body = this.el('div', 'cx-body');
    body.append(this.detail(index), list);

    const foot = this.el('div', 'cx-foot');
    const step = (d: number) => () => {
      this.selected = flat[(index + d + flat.length) % flat.length] ?? null;
      this.render();
    };
    const prev = this.el('button', 'cx-btn cx-arrow', '◀');
    prev.addEventListener('click', step(-1));
    const next = this.el('button', 'cx-btn cx-arrow', '▶');
    next.addEventListener('click', step(1));
    foot.append(prev, this.el('span', 'cx-page', `${index + 1} / ${flat.length}`), next, this.el('span', 'cx-hint', t(this.ctx.uiMode === 'mobile' ? 'codex.hint.mobile' : 'codex.hint.pc')));

    const frame = this.el('div', 'cx-frame');
    frame.append(head, body, foot);
    this.root.appendChild(frame);
    this.root.style.display = 'flex';
    scroll.scrollTop = keepScroll;
    scroll.querySelector('.cx-cell.on')?.scrollIntoView({ block: 'nearest' });
  }

  private known(e: CodexEntry): boolean {
    if (e.kind === 'job') return true;
    return isKnown(this.ctx.save.data, e);
  }

  /** 잠긴 직업: 이름은 보이지만 흐리게 */
  private locked(e: CodexEntry): boolean {
    return e.kind === 'job' && !this.ctx.data.jobs.jobs.find((j) => j.id === e.id)?.enabled;
  }

  private cell(e: CodexEntry, i: number): HTMLElement {
    const known = this.known(e);
    const on = this.selected?.kind === e.kind && this.selected.id === e.id;
    const c = this.el('button', `cx-cell${known ? '' : ' unknown'}${this.locked(e) ? ' locked' : ''}${on ? ' on' : ''}`);
    const icon = this.el('span', 'cx-icon');
    const a = this.art(e);
    applyArtIcon(icon, this.ctx, a.key, a.color);
    c.append(icon, this.el('i', '', String(i + 1).padStart(3, '0')), this.el('small', '', known ? this.name(e) : '???'));
    if (a.ring) c.style.setProperty('--ring', a.ring);
    c.addEventListener('click', () => {
      this.selected = e;
      this.render();
    });
    return c;
  }

  private art(e: CodexEntry): { key: string; color: string; ring?: string } {
    const d = this.ctx.data;
    const grade = (g: string) => d.groupMultipliers.grades.find((x) => x.id === g)?.color;
    if (e.kind === 'enemy') {
      const def = d.enemies.enemies.find((x) => x.id === e.id)!;
      return { key: def.spriteKey, color: def.color };
    }
    if (e.kind === 'job') return { key: d.player.spriteKey, color: d.player.color };
    if (e.kind === 'school') return { key: artKeys.playerSchool(e.id), color: d.player.color };
    if (e.kind === 'item') {
      const def = d.items.items.find((x) => x.id === e.id)!;
      return { key: def.spriteKey, color: def.color, ring: grade(def.grade) };
    }
    const w = d.weapons.weapons.find((x) => x.id === e.id)!;
    return { key: w.spriteKey, color: w.color, ring: grade(w.grade) };
  }

  private name(e: CodexEntry): string {
    const d = this.ctx.data;
    const t = this.ctx.t;
    if (e.kind === 'enemy') return t(d.enemies.enemies.find((x) => x.id === e.id)!.nameKey);
    if (e.kind === 'job') return t(d.jobs.jobs.find((x) => x.id === e.id)!.nameKey);
    if (e.kind === 'school') return t(`job.adv.${e.id}`);
    if (e.kind === 'item') return t(d.items.items.find((x) => x.id === e.id)!.nameKey);
    return t(d.weapons.weapons.find((x) => x.id === e.id)!.nameKey);
  }

  // ---------- 오른쪽 기록 ----------

  /** 위: 번호·분류, 이름, 그림 + 수치 / 아래: 설명과 세부 항목 (길면 이 칸만 스크롤) */
  private detail(index: number): HTMLElement {
    const t = this.ctx.t;
    const box = this.el('div', 'cx-detail');
    const e = this.selected;
    if (!e) return box;
    const known = this.known(e);
    const chips = this.el('div', 'cx-chips');
    chips.appendChild(this.el('span', 'cx-no', t('codex.no', { n: String(index + 1).padStart(3, '0') })));
    const hero = this.el('div', 'cx-hero');
    const icon = this.el('span', `cx-big${known ? '' : ' unknown'}`);
    const a = this.art(e);
    applyArtIcon(icon, this.ctx, a.key, a.color);
    this.side = this.el('div', 'cx-side');
    hero.append(icon, this.side);
    const record = this.el('div', 'cx-record');
    record.appendChild(this.el('div', 'cx-sub', t('codex.record')));
    box.append(chips, this.el('b', 'cx-name', known ? this.name(e) : '???'), hero, record);
    if (!known) {
      record.appendChild(this.el('p', 'cx-desc dim', t(e.kind === 'enemy' ? 'codex.unknown.enemy' : 'codex.unknown.item')));
      return box;
    }
    if (e.kind === 'enemy') this.enemyDetail(e.id, record, chips);
    else if (e.kind === 'job') this.jobDetail(e.id, record, chips);
    else if (e.kind === 'school') this.schoolDetail(e.id, record, chips);
    else if (e.kind === 'item') this.itemDetail(e.id, record, chips);
    else this.weaponDetail(e.id, record, chips);
    return box;
  }

  private chip(parent: HTMLElement, text: string, color?: string): void {
    const c = this.el('span', 'cx-chip', text);
    if (color) c.style.setProperty('--chip', color);
    parent.appendChild(c);
  }

  /** 그림 옆 수치 칸 */
  private stats(rows: [string, string][]): void {
    const g = this.el('div', 'cx-stats');
    for (const [k, v] of rows) {
      const s = this.el('div', 'cx-stat');
      s.append(this.el('span', '', k), this.el('b', '', v));
      g.appendChild(s);
    }
    this.side.appendChild(g);
  }

  private block(box: HTMLElement, titleKey: string, lines: (string | HTMLElement)[]): void {
    if (lines.length === 0) return;
    box.appendChild(this.el('div', 'cx-sub', this.ctx.t(titleKey)));
    const ul = this.el('ul', 'cx-lines');
    for (const l of lines) {
      const li = this.el('li', '');
      if (typeof l === 'string') li.textContent = l;
      else li.appendChild(l);
      ul.appendChild(li);
    }
    box.appendChild(ul);
  }

  private badges(tags: readonly TagId[]): void {
    if (tags.length === 0) return;
    const row = this.el('div', 'cw-badges');
    for (const b of tagBadges(tags, this.ctx.data.tags)) {
      const s = this.el('span', '', this.ctx.t(b.nameKey));
      s.style.background = b.color;
      row.appendChild(s);
    }
    this.side.appendChild(row);
  }

  private enemyDetail(id: string, box: HTMLElement, chips: HTMLElement): void {
    const t = this.ctx.t;
    const d = this.ctx.data;
    const def = d.enemies.enemies.find((x) => x.id === id)!;
    const boss = [...d.bosses.bosses, ...d.bosses.hiddenBosses].find((b) => b.id === id);
    this.chip(chips, t(`codex.rank.${def.rank}`), def.rank === 'normal' ? undefined : d.enemies.enemies.find((x) => x.id === id)!.color);
    const stage = d.bosses.bosses.find((b) => b.id === id);
    this.chip(chips, stage ? t('codex.bossStage', { chapter: stage.chapter, stage: stage.stage }) : def.rank === 'hiddenBoss' ? t('codex.anyChapter') : t('codex.chapter', { n: def.chapter }));
    box.appendChild(this.el('p', 'cx-desc', t(`codex.enemy.${id}`)));
    this.stats([
      [t('codex.stat.hp'), String(def.maxHp)],
      [t('codex.stat.speed'), String(def.moveSpeed)],
      [t('codex.stat.contact'), String(def.contactDamage)],
    ]);
    if (!boss) return;
    const phase: string[] = [];
    if (boss.enrageAt > 0) phase.push(t('codex.phase.enrage', { hp: Math.round(boss.enrageAt * 100), name: t(`boss.enraged.${id}`) }));
    (boss.unlocks ?? []).forEach((hp, i) => phase.push(t('codex.phase.enrage', { hp: Math.round(hp * 100), name: t(`boss.unlock.${id}.${i + 1}`) })));
    this.block(box, 'codex.sub.phases', phase);
    const names = (filter: (p: BossCore['patterns'][number]) => boolean) => boss.patterns.filter(filter).map((p) => t(`boss.pattern.${p.id}`)).join(' · ');
    const lines: string[] = [];
    const base = names((p) => p.phase === 1 && !p.inherit && (p.unlock ?? 0) === 0 && p.hpBelow === undefined);
    if (base) lines.push(t('codex.patterns.base', { list: base }));
    const enraged = names((p) => p.phase === 2);
    if (enraged) lines.push(t('codex.patterns.enraged', { list: enraged }));
    (boss.unlocks ?? []).forEach((_, i) => {
      const at = names((p) => !p.inherit && p.unlock === i + 1);
      if (at) lines.push(t('codex.patterns.unlock', { name: t(`boss.unlock.${id}.${i + 1}`), list: at }));
    });
    for (const p of boss.patterns.filter((x) => x.hpBelow !== undefined)) lines.push(t('codex.patterns.low', { hp: Math.round(p.hpBelow! * 100), list: t(`boss.pattern.${p.id}`) }));
    const inherit = names((p) => !!p.inherit);
    if (inherit) lines.push(t('codex.patterns.inherit', { list: inherit }));
    this.block(box, 'codex.sub.patterns', lines);
  }

  private jobDetail(id: string, box: HTMLElement, chips: HTMLElement): void {
    const t = this.ctx.t;
    const d = this.ctx.data;
    const job = d.jobs.jobs.find((x) => x.id === id)!;
    this.chip(chips, t(job.enabled ? 'codex.job.open' : 'job.locked'));
    box.appendChild(this.el('p', 'cx-desc', t(`codex.job.${id}`)));
    if (!job.enabled) {
      this.block(box, 'codex.sub.advancements', job.advancements.map((a) => t(a.nameKey)));
      return;
    }
    this.stats([
      [t('codex.stat.hp'), String(d.player.maxHp)],
      [t('codex.stat.energy'), String(d.player.energy.max)],
      [t('codex.stat.sanity'), String(d.player.sanity.base)],
    ]);
    const ult = d.ultimates.ultimates.find((u) => u.id === job.startUltimate)!;
    this.block(box, 'codex.sub.ultimate', [`${t(ult.nameKey)} — ${t(ult.descKey, fmt(ult.values))}`]);
    this.block(box, 'codex.sub.advancements', job.advancements.map((a) => `${t(a.nameKey)} — ${t(`codex.school.${a.id}`)}`));
  }

  private schoolDetail(id: string, box: HTMLElement, chips: HTMLElement): void {
    const t = this.ctx.t;
    const d = this.ctx.data;
    const adv = d.jobs.jobs.flatMap((j) => j.advancements).find((a) => a.id === id)!;
    this.chip(chips, t('codex.school.chip'), adv.color);
    box.appendChild(this.el('p', 'cx-desc', t(`codex.school.${id}`)));
    const skills = d.skills.skills.filter((s) => s.school === id);
    const row = (sid: string) => {
      const s = findSkill(d.skills, sid);
      const line = this.el('div', 'cx-skill');
      const icon = this.el('span', 'cx-mini');
      applyArtIcon(icon, this.ctx, artKeys.skillIcon(sid), s.color);
      const text = this.el('div', '');
      const item = d.items.items.find((x) => x.id === s.awakening.requiredItem);
      text.append(
        this.el('b', '', `${t(s.nameKey)}${s.kind === 'passive' ? ` (${t('card.passive')})` : ''}`),
        this.el('span', '', t(s.descKey, fmt(s.levels[0]!.values))),
        this.el('small', '', t('codex.awaken', { name: t(s.awakening.nameKey), item: item ? t(item.nameKey) : '-' })),
      );
      line.append(icon, text);
      return line;
    };
    this.block(box, 'codex.sub.skills', skills.map((s) => row(s.id)));
    const ult = d.ultimates.ultimates.find((u) => u.id === adv.ultimate);
    if (ult) {
      const item = d.items.items.find((x) => x.id === ult.awakening?.requiredItem);
      const lines = [`${t(ult.nameKey)} — ${t(ult.descKey, fmt(ult.values))}`];
      if (ult.awakening) lines.push(t('codex.awaken', { name: t(ult.awakening.nameKey), item: item ? t(item.nameKey) : '-' }));
      this.block(box, 'codex.sub.ultimate', lines);
    }
    const dodge = d.player.dodge.schools[id];
    if (dodge) this.block(box, 'codex.sub.dodge', [`${t(dodge.nameKey)} — ${t(dodge.descKey)}`]);
  }

  private itemDetail(id: string, box: HTMLElement, chips: HTMLElement): void {
    const t = this.ctx.t;
    const d = this.ctx.data;
    const def = d.items.items.find((x) => x.id === id)!;
    const grade = d.groupMultipliers.grades.find((g) => g.id === def.grade);
    this.chip(chips, grade ? t(grade.nameKey) : def.grade, grade?.color);
    const bossName = (bid?: string) => t(d.enemies.enemies.find((x) => x.id === bid)?.nameKey ?? '');
    const source =
      def.pool === 'boss'
        ? t('codex.source.boss', { name: bossName(def.bossId), chance: Math.round((def.dropChance ?? 1) * 100) })
        : def.pool === 'hiddenBoss'
          ? t('codex.source.hiddenBoss', { name: bossName(def.bossId) })
          : t(`codex.source.${def.pool}`);
    this.chip(chips, source);
    box.appendChild(this.el('p', 'cx-desc', t(def.descKey, itemDescParams(def, d.groupMultipliers))));
    this.badges(def.tags);
    const links: string[] = [];
    for (const s of d.skills.skills.filter((x) => x.awakening.requiredItem === id)) links.push(t('codex.link.skill', { skill: t(s.nameKey), name: t(s.awakening.nameKey) }));
    for (const u of d.ultimates.ultimates.filter((x) => x.awakening?.requiredItem === id)) links.push(t('codex.link.skill', { skill: t(u.nameKey), name: t(u.awakening!.nameKey) }));
    const nm = (iid: string) => t(d.items.items.find((x) => x.id === iid)?.nameKey ?? '');
    const wn = (wid: string) => t(d.weapons.weapons.find((x) => x.id === wid)?.nameKey ?? '');
    for (const s of d.items.sets.filter((x) => x.materials.includes(id) || x.result === id)) links.push(t('codex.link.set', { list: s.materials.map(nm).join(' + '), result: nm(s.result) }));
    for (const s of d.items.weaponSets.filter((x) => x.item === id)) links.push(t('codex.link.set', { list: `${wn(s.weapon)} + ${nm(s.item)}`, result: wn(s.result) }));
    this.block(box, 'codex.sub.links', links);
  }

  private weaponDetail(id: string, box: HTMLElement, chips: HTMLElement): void {
    const t = this.ctx.t;
    const d = this.ctx.data;
    const w = d.weapons.weapons.find((x) => x.id === id)!;
    const grade = d.groupMultipliers.grades.find((g) => g.id === w.grade);
    this.chip(chips, grade ? t(grade.nameKey) : w.grade, grade?.color);
    this.chip(chips, t(`weapon.category.${w.category}`));
    const hidden = d.bosses.hiddenBosses.find((b) => b.weaponId === id);
    const set = d.items.weaponSets.find((s) => s.result === id);
    const name = (eid: string) => t(d.enemies.enemies.find((x) => x.id === eid)?.nameKey ?? '');
    const source = w.bossId
      ? t('codex.source.bossWeapon', { name: name(w.bossId), chance: Math.round(d.loot.bossWeaponChance * 100) })
      : hidden
        ? t('codex.source.hiddenBoss', { name: name(hidden.id) })
        : set
          ? t('codex.source.weaponSet')
          : w.droppable
            ? t('codex.source.weapon')
            : t('codex.source.special');
    this.chip(chips, source);
    this.badges(w.tags);
    this.block(box, 'codex.sub.weapon', weaponInfoLines(this.ctx, plainWeapon(w)).map((l) => l.text));
  }
}
