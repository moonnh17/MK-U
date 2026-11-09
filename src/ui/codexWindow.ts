/**
 * 도감 단말 (DOM). 실험장에서 조사하면 열린다.
 * 탭: 몬스터 · 캐릭터 · 아이템(무기 포함). 왼쪽은 묶음별 칸, 오른쪽은 고른 칸의 기록.
 * 만나지 않은 칸은 실루엣과 ???만 보이고, 고르면 '아직 기록이 없다'만 나온다.
 */
import type { GameContext } from '../core/context';
import { skillTextValues } from './skillText';
import { bus } from '../core/events';
import type { GameData } from '../data/index';
import { playerArtKey, artKeys } from '../systems/art';
import { gradeEnergyMultiplier, gradeMultiplier } from '../systems/damage';
import { CODEX_SORTS, codexLore, codexProgress, codexSections, isKnown, sortedCodexSections, type CodexEntry, type CodexSection, type CodexSort, type CodexTab } from '../systems/codex';
import { itemChance, itemSources, pct, weaponChance, weaponSources, type DropSource, type GradeRates } from '../systems/dropRates';
import { scaleEffect } from '../systems/items';
import { findSkill, skillValues } from '../systems/skills';
import { tagBadges } from '../systems/tags';
import { plainWeapon, weaponStats } from '../systems/weapons';
import type { BossCore, ItemDef, TagId } from '../types/data';
import { applyArtIcon } from './artIcon';
import { munEmblemSvg } from './munEmblem';
import { itemDescParams } from './itemCard';
import { weaponInfoLines } from './weaponInfo';

const TABS: CodexTab[] = ['monsters', 'characters', 'items', 'weapons'];
/** 머리말에서 불꽃이 피어오르는 등급과 불꽃 수 */
const SPARK_GRADES: ReadonlySet<string> = new Set(['legendary', 'unique']);
const SPARKS = 12;
/** 목록 칸 테두리 불꽃 수 */
const CELL_SPARKS = 9;

/** 스킬 설명 한 단계 (Lv1~3, 각성) */
interface SkillVariant {
  label: string;
  title: string;
  desc: string;
  note: string;
  awakened?: boolean;
  /** 이 단계의 태그 (각성하면 바뀔 수 있다) */
  tags?: readonly TagId[];
}

/** 아이템의 늘 켜진 수치 효과를 그림 옆 수치 칸으로 (발동형·조건부 효과는 설명에만) */
function itemStatRows(def: ItemDef, d: GameData, t: GameContext['t']): [string, string][] {
  const pc = (v: number) => `${v > 0 ? '+' : ''}${Math.round(v * 1000) / 10}%`;
  const flat = (v: number) => `${v > 0 ? '+' : ''}${v}`;
  const rows: [string, string][] = [];
  for (const raw of def.effects) {
    const e = scaleEffect(raw, d.groupMultipliers);
    if (e.kind === 'damage') rows.push([t(`codex.istat.damage.${e.scope}`), pc(e.value)]);
    else if (e.kind === 'maxHp' || e.kind === 'maxSanity' || e.kind === 'pellets' || e.kind === 'maxEnergy') rows.push([t(`codex.istat.${e.kind}`), flat(e.value)]);
    else if (e.kind === 'moveSpeed' || e.kind === 'enemyTaken' || e.kind === 'coinGain' || e.kind === 'energyGain' || e.kind === 'area' || e.kind === 'buffDuration') rows.push([t(`codex.istat.${e.kind}`), pc(e.value)]);
    // 쿨타임 감소·받는 피해 감소는 값이 양수일 때 줄어드는 쪽
    else if (e.kind === 'skillCooldown' || e.kind === 'damageTaken' || e.kind === 'chargeTime') rows.push([t(`codex.istat.${e.kind}`), pc(-e.value)]);
    else if (e.kind === 'skillDamage') rows.push([t('codex.istat.skillDamage', { skill: t(findSkill(d.skills, e.skillId).nameKey) }), pc(e.value)]);
    else if (e.kind === 'lifesteal' || e.kind === 'critChance' || e.kind === 'critDamage') rows.push([t(`codex.istat.${e.kind}`), pc(e.value)]);
    else if (e.kind === 'dodgeCdReduce') rows.push([t('codex.istat.dodgeCdReduce'), pc(-e.value)]);
    else if (e.kind === 'ultimateCooldown') rows.push([t('codex.istat.ultimateCooldown'), pc(-e.value)]);
  }
  return rows;
}

/** 공격 정의의 숫자를 설명 문구 값으로 편다 (ring.shots → ring_shots, chain[0] → chain_0) */
function flatNumbers(o: object, prefix = ''): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(o)) {
    if (typeof v === 'number') out[prefix + k] = v;
    else if (v && typeof v === 'object') Object.assign(out, flatNumbers(v as object, `${prefix}${k}_`));
  }
  return out;
}

export class CodexWindow {
  private readonly root: HTMLDivElement;
  private tab: CodexTab = 'monsters';
  /** 목록 정렬 (탭을 바꿔도 유지) */
  private sort: CodexSort = 'default';
  /** 기본 정렬에서의 순서 = 도감 번호 (몬스터는 데이터의 codexNo) */
  private baseNo = new Map<string, number>();
  private selected: CodexEntry | null = null;
  /** 지금 그리는 기록의 그림 옆 칸 */
  private side!: HTMLElement;
  /** 기록 대신 다른 보기(보스 패턴·획득 확률)를 펼쳤는지 (다른 칸을 고르면 기록 보기로 돌아간다) */
  private altView = false;
  private shownKey = '';

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
    this.baseNo = new Map(codexSections(this.ctx.data, this.tab).flatMap((s) => s.entries).map((e, i) => [`${e.kind}:${e.id}`, i + 1]));
    const sections = sortedCodexSections(this.ctx.data, this.tab, this.sort, (e) => Number(this.no(e)), (e) => this.name(e));
    const flat = sections.flatMap((s) => s.entries);
    this.selected ??= flat[0] ?? null;
    const index = flat.findIndex((e) => e.kind === this.selected?.kind && e.id === this.selected.id);
    const key = `${this.selected?.kind}:${this.selected?.id}`;
    if (key !== this.shownKey) this.altView = false;
    this.shownKey = key;

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
    const progress = this.el('div', 'cx-progress');
    const bar = this.el('i', '');
    bar.style.setProperty('--p', `${p.total ? (p.known / p.total) * 100 : 0}%`);
    progress.append(this.el('span', '', t('codex.progress', { known: p.known, total: p.total })), bar);
    const unlock = this.el('button', 'cx-btn cx-unlock', t('codex.unlockAll'));
    unlock.addEventListener('click', () => this.unlockAll());
    head.append(this.el('b', 'cx-heading', t('codex.title')), tabs, unlock, progress, close);

    const list = this.el('div', 'cx-list');
    const scroll = this.el('div', 'cx-scroll');
    for (const s of sections) {
      scroll.appendChild(this.sectionHead(s));
      const grid = this.el('div', 'cx-grid');
      for (const e of s.entries) grid.appendChild(this.cell(e, flat.indexOf(e)));
      scroll.appendChild(grid);
    }
    list.append(this.el('div', 'cx-list-title', t('codex.list', { tab: t(`codex.tab.${this.tab}`) })));
    // 정렬: 기본 / 도감 번호순 / 이름순 / 세계관 분류 (캐릭터 탭은 없음)
    if (codexLore(this.ctx.data, this.tab)) {
      const bar = this.el('div', 'cx-sort');
      for (const id of CODEX_SORTS) {
        const b = this.el('button', `cx-sort-btn${this.sort === id ? ' on' : ''}`, t(`codex.sort.${id}`));
        b.addEventListener('click', () => {
          this.sort = id;
          this.render();
        });
        bar.appendChild(b);
      }
      list.appendChild(bar);
    }
    list.appendChild(scroll);
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

  /**
   * 목록의 묶음 머리말. 등급 묶음은 등급 색 글씨, 전설·유니크는 불꽃이 피어오른다.
   * 아이템·무기의 등급 묶음 옆 작은 '확률' 단추: 그 묶음 칸의 획득 확률 보기를 연다
   */
  private sectionHead(s: CodexSection): HTMLElement {
    const t = this.ctx.t;
    const head = this.el('div', 'cx-section');
    const title = this.el('span', 'cx-stitle', t(s.titleKey));
    const grade = s.grade && this.ctx.data.groupMultipliers.grades.find((g) => g.id === s.grade);
    if (grade) {
      head.classList.add('graded', `grade-${grade.id}`);
      head.style.setProperty('--grade', grade.color);
      if (SPARK_GRADES.has(grade.id)) {
        // 그림 위치·박자는 칸 번호로 정한다 (꾸밈이라 시드 RNG를 쓰지 않아도 매번 같게)
        for (let i = 0; i < SPARKS; i++) {
          const sp = this.el('i', 'cx-spark');
          sp.style.left = `${(i * 37) % 100}%`;
          sp.style.animationDelay = `${((i * 0.29) % 1.6).toFixed(2)}s`;
          sp.style.animationDuration = `${(1.1 + ((i * 0.17) % 0.7)).toFixed(2)}s`;
          sp.style.setProperty('--drift', `${((i % 3) - 1) * 5}px`);
          title.appendChild(sp);
        }
      }
    }
    head.appendChild(title);
    if (grade && (this.tab === 'items' || this.tab === 'weapons')) {
      const b = this.el('button', 'cx-rate-btn', t('codex.rateShort'));
      b.addEventListener('click', () => {
        if (!s.entries.some((e) => e.kind === this.selected?.kind && e.id === this.selected.id)) this.selected = s.entries[0] ?? this.selected;
        this.shownKey = `${this.selected?.kind}:${this.selected?.id}`;
        this.altView = true;
        this.render();
      });
      head.appendChild(b);
    }
    return head;
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
    const name = this.el('small', '', known ? this.name(e) : '???');
    const mun = known ? this.mun(e, 18) : null;
    if (mun) name.prepend(mun);
    c.append(icon, this.el('i', '', this.no(e)), name);
    if (a.ring) c.style.setProperty('--ring', a.ring);
    if (a.grade && SPARK_GRADES.has(a.grade)) {
      // 전설·유니크: 테두리에서 등급 색 불꽃이 피어오른다 (왼쪽 변·오른쪽 변·아랫변을 돌아가며)
      c.classList.add('fx-spark');
      const fx = this.el('span', 'cx-cell-fx');
      for (let k = 0; k < CELL_SPARKS; k++) {
        const sp = this.el('i', 'cx-spark');
        const side = k % 3;
        sp.style.left = side === 0 ? '0%' : side === 1 ? '100%' : `${(k * 37) % 100}%`;
        sp.style.bottom = side === 2 ? '0%' : `${(k * 29) % 90}%`;
        sp.style.animationDelay = `${((k * 0.37) % 1.6).toFixed(2)}s`;
        sp.style.setProperty('--drift', `${side === 0 ? -4 : side === 1 ? 4 : 0}px`);
        fx.appendChild(sp);
      }
      c.appendChild(fx);
    } else if (a.grade === 'mythic') {
      // 신화: 칸 뒤에서 빛줄기가 사방으로 뿜어져 나온다
      c.classList.add('fx-mythic');
      c.appendChild(this.el('span', 'cx-rays'));
    }
    c.addEventListener('click', () => {
      this.selected = e;
      this.render();
    });
    return c;
  }

  private art(e: CodexEntry): { key: string; color: string; ring?: string; grade?: string } {
    const d = this.ctx.data;
    const grade = (g: string) => d.groupMultipliers.grades.find((x) => x.id === g)?.color;
    if (e.kind === 'enemy') {
      const def = d.enemies.enemies.find((x) => x.id === e.id)!;
      return { key: def.spriteKey, color: def.color };
    }
    if (e.kind === 'job') return { key: playerArtKey(this.ctx.artLoaded, d.player.spriteKey, e.id, null), color: d.player.color };
    if (e.kind === 'school') return { key: artKeys.playerSchool(e.id), color: d.player.color };
    if (e.kind === 'item') {
      const def = d.items.items.find((x) => x.id === e.id)!;
      return { key: def.spriteKey, color: def.color, ring: grade(def.grade), grade: def.grade };
    }
    const w = d.weapons.weapons.find((x) => x.id === e.id)!;
    return { key: w.spriteKey, color: w.color, ring: grade(w.grade), grade: w.grade };
  }

  /** 도감 번호: 몬스터·아이템·무기는 데이터의 codexNo(게임에 추가된 순서), 나머지는 기본 정렬 순서 (정렬을 바꿔도 그대로) */
  private no(e: CodexEntry): string {
    const d = this.ctx.data;
    const n = e.kind === 'enemy' ? d.enemies.enemies.find((x) => x.id === e.id)?.codexNo : e.kind === 'item' ? d.items.items.find((x) => x.id === e.id)?.codexNo : e.kind === 'weapon' ? d.weapons.weapons.find((x) => x.id === e.id)?.codexNo : undefined;
    return String(n ?? this.baseNo.get(`${e.kind}:${e.id}`) ?? 0).padStart(3, '0');
  }

  /** 몬스터 위협 등급 문양 (1~6문, 미분류). title에 '2문급' 같은 이름 */
  private mun(e: CodexEntry, size: number): HTMLElement | null {
    if (e.kind !== 'enemy') return null;
    const d = this.ctx.data;
    const def = d.enemies.enemies.find((x) => x.id === e.id);
    if (def?.codexNo === undefined) return null;
    // 문양: 숫자 등급은 1~6, unknown과 미분류는 같은 문양 / 이름은 N문·N문급·unknown·미분류를 구별한다
    const grade = typeof def.mun === 'number' ? String(def.mun) : 'unknown';
    const span = this.el('span', `cx-mun mun-${grade}`);
    span.innerHTML = munEmblemSvg(grade, d.enemies.munGrades[grade]!, size, typeof def.mun === 'number' && !def.munClass);
    const t = this.ctx.t;
    span.title = typeof def.mun === 'number' ? t(def.munClass ? 'codex.munClass' : 'codex.mun', { n: def.mun }) : t(def.mun === 'unknown' ? 'codex.mun.unknown' : 'codex.mun.unclassified');
    return span;
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
    chips.appendChild(this.el('span', 'cx-no', t('codex.no', { n: this.no(e) })));
    const hero = this.el('div', 'cx-hero');
    const icon = this.el('span', `cx-big${known ? '' : ' unknown'}`);
    const a = this.art(e);
    // 보스 패턴 보기: 2단계에서 모습이 바뀌는 보스는 그 모습으로
    const phase2 = artKeys.bossPhase(a.key, 2);
    applyArtIcon(icon, this.ctx, e.kind === 'enemy' && this.altView && this.ctx.data.art.sprites[phase2] ? phase2 : a.key, a.color);
    this.side = this.el('div', 'cx-side');
    const stage = this.el('div', 'cx-stage');
    stage.appendChild(icon);
    hero.append(stage, this.side);
    const record = this.el('div', 'cx-record');
    record.appendChild(this.el('div', 'cx-sub', t('codex.record')));
    const name = this.el('b', 'cx-name', known ? this.name(e) : '???');
    const mun = known ? this.mun(e, 34) : null;
    if (mun) name.append(mun, this.el('span', 'cx-mun-label', mun.title));
    box.append(chips, name, hero, record);
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
    if (rows.length === 0) return;
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
    this.stats([
      [t('codex.stat.hp'), String(def.maxHp)],
      [t('codex.stat.speed'), String(def.moveSpeed)],
      [t('codex.stat.contact'), String(def.contactDamage)],
    ]);
    const flavor = () => this.flavor(box, def.flavor, 'cx-flavor');
    if (!boss) {
      box.appendChild(this.el('p', 'cx-desc', t(`codex.enemy.${id}`)));
      flavor();
      box.appendChild(this.el('div', 'cx-sub', t('codex.sub.attacks')));
      if (!def.attacks?.length) box.appendChild(this.el('p', 'cx-desc dim', t('codex.noAttack')));
      for (const a of def.attacks ?? []) {
        box.appendChild(this.card(t(`codex.attackName.${id}.${a.id}`), t(`codex.attack.${id}.${a.id}`, skillTextValues(flatNumbers(a))), [t('codex.chip.damage', { n: a.damage })]));
      }
      return;
    }
    this.altToggle('codex.showPatterns');
    const phaseName = (i: number) => (i === 0 ? t(`boss.enraged.${id}`) : t(`boss.unlock.${id}.${i}`));
    if (!this.altView) {
      box.appendChild(this.el('p', 'cx-desc', t(`codex.enemy.${id}`)));
      flavor();
      const flow = [t('codex.phase.start')];
      if (boss.enrageAt > 0) flow.push(t('codex.phase.enrage', { hp: Math.round(boss.enrageAt * 100), name: phaseName(0) }));
      (boss.unlocks ?? []).forEach((hp, i) => flow.push(t('codex.phase.enrage', { hp: Math.round(hp * 100), name: phaseName(i + 1) })));
      if (flow.length > 1) {
        box.appendChild(this.el('div', 'cx-sub', t('codex.sub.phaseFlow')));
        const steps = this.el('div', 'cx-flow');
        for (const f of flow) steps.appendChild(this.el('span', '', f));
        box.appendChild(steps);
      }
      return;
    }
    box.querySelector('.cx-sub')!.textContent = t('codex.sub.patterns');
    type P = BossCore['patterns'][number];
    const groups: [string, (p: P) => boolean][] = [
      [t('codex.group.base'), (p) => p.phase === 1 && !p.inherit && (p.unlock ?? 0) === 0 && p.hpBelow === undefined],
      [t('codex.group.phase', { name: phaseName(0), hp: Math.round(boss.enrageAt * 100) }), (p) => p.phase === 2],
      ...(boss.unlocks ?? []).map((hp, i): [string, (p: P) => boolean] => [t('codex.group.phase', { name: phaseName(i + 1), hp: Math.round(hp * 100) }), (p) => !p.inherit && p.unlock === i + 1]),
      ...boss.patterns.filter((p) => p.hpBelow !== undefined).map((x): [string, (p: P) => boolean] => [t('codex.group.low', { hp: Math.round(x.hpBelow! * 100) }), (p) => p === x]),
      [t('codex.group.inherit'), (p) => !!p.inherit],
    ];
    for (const [title, test] of groups) {
      const list = boss.patterns.filter(test);
      if (list.length === 0) continue;
      box.appendChild(this.el('div', 'cx-group', title));
      for (const p of list) {
        const tags: string[] = [];
        if (p.values.damage) tags.push(t('codex.chip.damage', { n: p.values.damage }));
        if (p.reach === 'melee') tags.push(t('codex.chip.melee'));
        if (p.summon) tags.push(t('codex.chip.summon'));
        box.appendChild(this.card(t(`boss.pattern.${p.id}`), t(`codex.pattern.${p.id}`, skillTextValues(p.values)), tags));
      }
    }
  }

  /** 스킬 한 줄: 아이콘 + 설명, 아래 Lv1~3·각성 단추로 그 자리에서 설명만 바꾼다 (기록 스크롤은 그대로) */
  private skillRow(iconKey: string, color: string, variants: SkillVariant[]): HTMLElement {
    const line = this.el('div', 'cx-skill');
    const icon = this.el('span', 'cx-mini');
    applyArtIcon(icon, this.ctx, iconKey, color);
    const text = this.el('div', '');
    const title = this.el('b', '');
    const desc = this.el('span', '');
    const note = this.el('small', '');
    const tagRow = this.el('div', 'cw-badges cx-skill-tags');
    const tabs = this.el('div', 'cx-lv');
    const show = (i: number) => {
      const v = variants[i]!;
      title.textContent = v.title;
      desc.textContent = v.desc;
      note.textContent = v.note;
      tagRow.replaceChildren(
        ...tagBadges(v.tags ?? [], this.ctx.data.tags).map((b) => {
          const el = this.el('span', '', this.ctx.t(b.nameKey));
          el.style.background = b.color;
          return el;
        }),
      );
      tabs.querySelectorAll('button').forEach((b, k) => b.classList.toggle('on', k === i));
      line.classList.toggle('awakened', !!v.awakened);
    };
    variants.forEach((v, i) => {
      const b = this.el('button', '', v.label);
      b.addEventListener('click', () => show(i));
      tabs.appendChild(b);
    });
    text.append(title, tagRow, desc, note, tabs);
    line.append(icon, text);
    show(0);
    return line;
  }

  /** 테스트 버전: 모든 몬스터·아이템·무기를 기록하고 저장한다 */
  private unlockAll(): void {
    const d = this.ctx.data;
    const save = this.ctx.save.data;
    save.codex = {
      enemies: d.enemies.enemies.map((e) => e.id),
      items: d.items.items.map((x) => x.id),
      weapons: d.weapons.weapons.map((w) => w.id),
    };
    this.ctx.save.write();
    this.render();
  }

  /** 그림 옆 '기록 보기 ↔ 다른 보기' 단추 */
  private altToggle(showKey: string): void {
    const b = this.el('button', `cx-toggle${this.altView ? ' on' : ''}`, this.ctx.t(this.altView ? 'codex.showRecord' : showKey));
    b.addEventListener('click', () => {
      this.altView = !this.altView;
      this.render();
    });
    this.side.appendChild(b);
  }

  /**
   * 획득 확률 보기: 이 칸이 한 번 뽑을 때 나올 확률(출처별) + 출처별 등급 확률표.
   * fixed: 상자에서 나오지 않고 정해진 곳에서만 얻는 경우 그 출처 문구
   */
  private rateView(box: HTMLElement, fixed: string | null, sources: DropSource[], chanceOf: (r: GradeRates, s: DropSource) => number, noteKey: string): void {
    const t = this.ctx.t;
    const d = this.ctx.data;
    const sub = box.querySelector('.cx-sub')!;
    sub.textContent = t('codex.showRates');
    const back = this.el('button', 'cx-rate-btn back', t('codex.showRecord'));
    back.addEventListener('click', () => {
      this.altView = false;
      this.render();
    });
    sub.appendChild(back);
    const src = (s: DropSource) => t(s.key, s.vars);
    if (fixed) box.appendChild(this.el('p', 'cx-desc', t('codex.rate.fixed', { source: fixed })));
    else {
      const list = this.el('div', 'cx-rates');
      for (const s of sources) {
        const row = this.el('div', 'cx-rate');
        row.append(this.el('span', '', src(s)), this.el('b', '', pct(chanceOf(s.rates, s))));
        list.appendChild(row);
      }
      box.append(this.el('div', 'cx-group', t('codex.rate.this')), list);
    }
    box.appendChild(this.el('div', 'cx-group', t('codex.rate.grades')));
    const table = this.el('table', 'cx-grade-table');
    const head = this.el('tr', '');
    head.appendChild(this.el('th', '', ''));
    // 신화는 가중치 표 밖의 고정 확률이라 표 아래 한 줄로 따로 보인다
    const grades = d.groupMultipliers.grades.filter((g) => g.id !== 'mythic');
    for (const g of grades) {
      const th = this.el('th', '', t(g.nameKey));
      th.style.setProperty('--grade', g.color);
      head.appendChild(th);
    }
    table.appendChild(head);
    for (const s of sources) {
      const tr = this.el('tr', '');
      tr.appendChild(this.el('td', '', src(s)));
      for (const g of grades) tr.appendChild(this.el('td', s.shares[g.id] > 0 ? '' : 'zero', pct(s.shares[g.id])));
      table.appendChild(tr);
    }
    const wrap = this.el('div', 'cx-table-wrap');
    wrap.appendChild(table);
    box.append(wrap, this.el('p', 'cx-desc dim cx-note', t('codex.rate.mythic', { pct: d.loot.mythicChance * 100 })), this.el('p', 'cx-desc dim cx-note', t(noteKey, { n: d.items.transferPerPickup })));
  }

  /** 플레이버 문구 문단. 문구가 이미 따옴표로 시작하면(인용 + 출처) 더 붙이지 않는다 */
  private flavor(box: HTMLElement, key: string | undefined, cls: string): void {
    if (!key) return;
    const text = this.ctx.t(key);
    box.appendChild(this.el('p', cls, /^["“]/.test(text) ? text : `“${text}”`));
  }

  /** 패턴 한 칸: 이름 + 꼬리표, 아래 설명 */
  private card(name: string, desc: string, tags: string[]): HTMLElement {
    const c = this.el('div', 'cx-card');
    const head = this.el('div', 'cx-card-head');
    head.appendChild(this.el('b', '', name));
    for (const x of tags) head.appendChild(this.el('span', 'cx-tag', x));
    c.append(head, this.el('p', '', desc));
    return c;
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
    this.block(box, 'codex.sub.ultimate', [`${t(ult.nameKey)} — ${t(ult.descKey, skillTextValues(ult.values))}`]);
    // 숙련 (전사): 레벨 단추로 Lv1~3 설명을 바꿔 본다
    const masteries = d.skills.skills.filter((s) => s.job === id && s.kind === 'mastery').map((s) => findSkill(d.skills, s.id));
    this.block(
      box,
      'inventory.mastery',
      masteries.map((s) =>
        this.skillRow(
          artKeys.skillIcon(s.id),
          s.color,
          s.levels.map((_, i) => ({ label: `Lv${i + 1}`, title: t(s.nameKey), desc: t(s.descKey, skillTextValues(skillValues(s, { level: i + 1, awakened: false }).values)), note: '' })),
        ),
      ),
    );
    this.block(box, 'codex.sub.advancements', job.advancements.map((a) => `${t(a.nameKey)} — ${t(`codex.school.${a.id}`)}`));
  }

  private schoolDetail(id: string, box: HTMLElement, chips: HTMLElement): void {
    const t = this.ctx.t;
    const d = this.ctx.data;
    const adv = d.jobs.jobs.flatMap((j) => j.advancements).find((a) => a.id === id)!;
    this.chip(chips, t('codex.school.chip'), adv.color);
    box.appendChild(this.el('p', 'cx-desc', t(`codex.school.${id}`)));
    const itemName = (iid?: string) => t(d.items.items.find((x) => x.id === iid)?.nameKey ?? '-');
    const skills = d.skills.skills.filter((s) => s.school === id).map((s) => findSkill(d.skills, s.id));
    this.block(
      box,
      'codex.sub.skills',
      skills.map((s) => {
        const passive = s.kind !== 'active';
        const cd = (sec: number) => (passive ? '' : t('inventory.detailCooldown', { sec: Math.round(sec * 10) / 10 }));
        const levels = s.levels.map((_, i): SkillVariant => {
          const v = skillValues(s, { level: i + 1, awakened: false });
          return { label: `Lv${i + 1}`, title: `${t(s.nameKey)}${passive ? ` (${t(`card.${s.kind}`)})` : ''}`, desc: t(s.descKey, skillTextValues(v.values)), note: cd(v.cooldownSec), tags: s.tags };
        });
        if (!s.awakening) return this.skillRow(artKeys.skillIcon(s.id), s.color, levels);
        const aw = skillValues(s, { level: s.levels.length, awakened: true });
        const awakened: SkillVariant = {
          label: t('codex.lv.awakened'),
          awakened: true,
          title: `★ ${t(s.awakening.nameKey)}`,
          tags: s.awakening.tags,
          desc: t(s.awakening.descKey, skillTextValues(aw.values)),
          note: [cd(aw.cooldownSec), t('codex.needItem', { item: itemName(s.awakening.requiredItem) })].filter(Boolean).join(' · '),
        };
        return this.skillRow(artKeys.skillIcon(s.id), s.color, [...levels, awakened]);
      }),
    );
    const ult = d.ultimates.ultimates.find((u) => u.id === adv.ultimate);
    if (ult) {
      const variants: SkillVariant[] = [{ label: t('codex.lv.base'), title: t(ult.nameKey), desc: t(ult.descKey, skillTextValues(ult.values)), note: '', tags: ult.tags }];
      if (ult.awakening)
        variants.push({
          label: t('codex.lv.awakened'),
          awakened: true,
          title: `★ ${t(ult.awakening.nameKey)}`,
          tags: ult.awakening.tags,
          desc: t(ult.awakening.descKey, skillTextValues({ ...ult.values, ...ult.awakening.values })),
          note: t('codex.needItem', { item: itemName(ult.awakening.requiredItem) }),
        });
      this.block(box, 'codex.sub.ultimate', [this.skillRow(artKeys.ultimateIcon(ult.id), ult.color, variants)]);
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
        ? t('codex.source.bossSure', { name: bossName(def.bossId) })
        : def.pool === 'hiddenBoss'
          ? t('codex.source.hiddenBoss', { name: bossName(def.bossId) })
          : t(`codex.source.${def.pool}`);
    this.chip(chips, source);
    this.stats(itemStatRows(def, d, t));
    this.badges(def.tags);
    if (this.altView) {
      this.rateView(box, def.pool === 'normal' ? null : source, itemSources(d), (r) => itemChance(d, id, r), 'codex.rate.noteItem');
      return;
    }
    // 무기처럼: 일반 능력은 기록에, 그 아래 추가 능력을 굵은 제목과 함께
    const params = itemDescParams(def, d.groupMultipliers);
    if (def.descKey) box.appendChild(this.el('p', 'cx-desc', t(def.descKey, params)));
    if (def.abilityDescKey) {
      // 제목: 능력 이름, 없으면 버프 이름(화면 왼쪽 버프 목록과 같은 이름). 태세처럼 둘이면 '/'로
      const bk = `item.${id}.buff`;
      const names = def.abilityNameKey ? [t(def.abilityNameKey)] : [bk, `${bk}.attack`, `${bk}.defense`].filter((k) => t(k) !== k).map((k) => t(k));
      if (names.length) box.appendChild(this.el('b', 'cx-buff-name', names.join(' / ')));
      box.appendChild(this.el('p', 'cx-desc', t(def.abilityDescKey, params)));
    }
    this.flavor(box, def.flavor, 'cx-flavor small');
    const links: string[] = [];
    for (const s of d.skills.skills.filter((x) => x.awakening?.requiredItem === id)) links.push(t('codex.link.skill', { skill: t(s.nameKey), name: t(s.awakening!.nameKey) }));
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
    // 무기 분류 (산탄·레이저 등)
    for (const c of w.classes) this.chip(chips, t(d.weapons.classes.find((x) => x.id === c)?.nameKey ?? c));
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
    const st = weaponStats(w, plainWeapon(w), gradeMultiplier(w.grade, d.groupMultipliers), gradeEnergyMultiplier(w.grade, d.groupMultipliers));
    const r1 = (v: number) => String(Math.round(v * 10) / 10);
    this.stats([
      [t('codex.wstat.damage'), r1(st.damage)],
      [t('codex.wstat.interval'), t('codex.wstat.sec', { n: Math.round(st.fireIntervalSec * 100) / 100 })],
      [t('codex.wstat.energy'), r1(st.energyCost)],
      [t('codex.wstat.range'), String(w.range)],
      ...(st.critChance > 0 ? [[t('codex.wstat.crit'), `${Math.round(st.critChance * 100)}%`] as [string, string]] : []),
    ]);
    this.badges(w.tags);
    if (this.altView) {
      // 상자·상인에서 나오지 않는 무기(보스·히든보스·합성 전용)는 얻는 곳만 보인다. 신화 무기는 신화 판정으로 나온다
      const fixed = !w.droppable && w.grade !== 'mythic' ? source : null;
      this.rateView(box, fixed, weaponSources(d), (r, s) => weaponChance(d, id, r, s.exclude), 'codex.rate.noteWeapon');
      return;
    }
    // 무기는 설명 문구가 없어 '기록' 머리말 없이 성능만 보인다
    box.querySelector('.cx-sub')?.remove();
    const lines = weaponInfoLines(this.ctx, plainWeapon(w));
    this.block(box, 'codex.sub.weapon', lines.filter((l) => !l.title).map((l) => l.text));
    // 이름 있는 특수공격은 따로: 굵은 제목 + 설명 (아이템 버프 이름과 같은 모양)
    for (const l of lines.filter((x) => x.title)) box.append(this.el('b', 'cx-buff-name', l.title), this.el('p', 'cx-desc', l.desc));
    this.flavor(box, w.flavor, 'cx-flavor small');
  }
}
