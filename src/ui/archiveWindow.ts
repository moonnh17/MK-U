/**
 * 기억조각 보관대 (DOM). 실험장에서 조사하면 열린다.
 * 과거의 기억: 칸·순서·잠금만 (내용은 미공개)
 * 현재의 기억: 처음 본 컷씬·제미니 대사 다시 보기, 안 본 칸은 ???, 연출·대사 내용이 없는 칸은 준비 중
 * 실험체의 기억: 직업별 영구 강화 (마기학자만 열림), 초기화(전액 반환)
 */
import type { GameContext } from '../core/context';
import { bus } from '../core/events';
import { isSkillImplemented, isUltimateImplemented } from '../skills/registry';
import { geminiSlots } from '../systems/gemini';
import { cutsceneSlots, pastSlots } from '../systems/memories';
import { buyUpgrade, nextCost, resetUpgrades, spentOn, upgradeLevel } from '../systems/upgrades';
import type { UpgradeDef } from '../types/data';

type Tab = 'past' | 'present' | 'subject';

export class ArchiveWindow {
  private readonly root: HTMLDivElement;
  private tab: Tab = 'subject';
  private job: string;
  private open = false;

  constructor(private readonly ctx: GameContext) {
    this.root = document.createElement('div');
    this.root.id = 'archive-window';
    this.root.addEventListener('pointerdown', (e) => e.stopPropagation());
    document.body.appendChild(this.root);
    this.job = ctx.data.jobs.startJob;
    bus.on('archiveShow', () => {
      this.open = true;
      this.render();
    });
    bus.on('modal', ({ kind }) => {
      if (kind !== 'archive') this.hide();
    });
    // 디버그 결정 지급·저장 초기화 등으로 저장이 바뀌면 다시 그린다
    bus.on('saveChanged', () => {
      if (this.open && this.root.style.display !== 'none') this.render();
    });
    // 다시 보기를 마치면 창을 다시 보여 준다
    bus.on('cutsceneDone', () => {
      if (this.open) this.root.style.display = 'flex';
    });
    bus.on('storyDone', () => {
      if (this.open) this.root.style.display = 'flex';
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
    this.root.className = this.ctx.uiMode;
    this.root.replaceChildren();

    const head = this.el('div', 'iw-head');
    const tabs = this.el('div', 'iw-tabs');
    for (const id of ['past', 'present', 'subject'] as const) {
      const b = this.el('button', this.tab === id ? 'on' : '', t(`archive.tab.${id}`));
      b.addEventListener('click', () => {
        this.tab = id;
        this.render();
      });
      tabs.appendChild(b);
    }
    const close = this.el('button', '', t('archive.close'));
    close.addEventListener('click', () => bus.emit('archiveClose', {}));
    head.append(this.el('b', '', t('archive.title')), tabs, close);

    const body = this.tab === 'past' ? this.pastTab() : this.tab === 'present' ? this.presentTab() : this.subjectTab();
    this.root.append(head, body, this.el('div', 'iw-hint', t(this.ctx.uiMode === 'mobile' ? 'archive.hint.mobile' : 'archive.hint.pc')));
    this.root.style.display = 'flex';
  }

  private pastTab(): HTMLElement {
    const t = this.ctx.t;
    const mem = this.ctx.data.meta.memory;
    const have = this.ctx.save.data.pastShards;
    const wrap = this.el('div', 'ar-body');
    wrap.appendChild(this.el('div', 'iw-sub', t('archive.past.count', { have: Math.min(have, mem.pastSlots), slots: mem.pastSlots })));
    const grid = this.el('div', 'ar-grid');
    for (const s of pastSlots(mem.pastSlots, have)) {
      const cell = this.el('div', s.open ? 'ar-cell open' : 'ar-cell');
      cell.append(this.el('b', '', s.open ? t('archive.past.open', { n: s.index + 1 }) : t('archive.past.locked')));
      // 과거의 기억 내용은 미공개 설정이라 비워 둔다
      if (s.open) cell.append(this.el('small', '', t('archive.past.sealed')));
      grid.appendChild(cell);
    }
    wrap.appendChild(grid);
    return wrap;
  }

  private presentTab(): HTMLElement {
    const t = this.ctx.t;
    const seen = this.ctx.save.data.cutscenes;
    const wrap = this.el('div', 'ar-body');
    wrap.appendChild(this.el('div', 'iw-sub', t('archive.present.hint')));
    const grid = this.el('div', 'ar-grid');
    for (const s of cutsceneSlots(this.ctx.data, { skill: isSkillImplemented, ultimate: isUltimateImplemented })) {
      const saved = s.id ? seen[s.id] : undefined;
      const cell = this.el('div', saved ? 'ar-cell open' : 'ar-cell');
      cell.append(this.el('small', '', t(`archive.group.${s.group}`)));
      cell.append(this.el('b', '', !s.id ? t('archive.present.notReady') : saved ? t(s.nameKey) : t('archive.present.unseen')));
      if (saved) {
        cell.addEventListener('click', () => {
          // 저장해 둔 컷인·설명창 그대로 다시 본다 (보관대는 잠깐 숨김)
          this.root.style.display = 'none';
          bus.emit('cutsceneShow', { cut: saved.cut, pages: saved.pages });
        });
      }
      grid.appendChild(cell);
    }
    // 미모사 제미니: 스토리 대화·복선 미니 대사 (본 문장 그대로 다시 본다)
    const said = this.ctx.save.data.gemini;
    for (const s of geminiSlots(this.ctx.data.gemini, this.ctx.data.text)) {
      const saved = said[s.id];
      const cell = this.el('div', saved ? 'ar-cell open' : 'ar-cell');
      cell.append(this.el('small', '', t('archive.group.gemini')));
      cell.append(this.el('b', '', !s.ready ? t('archive.present.notReady') : saved ? t(s.nameKey) : t('archive.present.unseen')));
      if (saved) {
        cell.addEventListener('click', () => {
          this.root.style.display = 'none';
          bus.emit('storyShow', { lines: saved.lines.map((k) => t(k)) });
        });
      }
      grid.appendChild(cell);
    }
    wrap.appendChild(grid);
    return wrap;
  }

  private subjectTab(): HTMLElement {
    const t = this.ctx.t;
    const d = this.ctx.data;
    const save = this.ctx.save.data;
    const wrap = this.el('div', 'ar-body');
    // 직업 탭: 고를 수 있는 직업만 열림
    const jobs = this.el('div', 'iw-tabs');
    for (const j of d.jobs.jobs) {
      const b = this.el('button', j.id === this.job ? 'on' : '', j.enabled ? t(j.nameKey) : `${t(j.nameKey)} · ${t('archive.subject.locked')}`) as HTMLButtonElement;
      b.disabled = !j.enabled;
      b.addEventListener('click', () => {
        this.job = j.id;
        this.render();
      });
      jobs.appendChild(b);
    }
    const levels = save.upgrades[this.job];
    const list = this.el('div', 'ar-upgrades');
    for (const u of d.meta.upgrades) list.appendChild(this.upgradeRow(u, upgradeLevel(levels, u.id)));
    const spent = spentOn(levels, d.meta.upgrades);
    const reset = this.el('button', 'iw-drop', t('upgrade.reset', { n: spent })) as HTMLButtonElement;
    reset.disabled = spent === 0;
    reset.addEventListener('click', () => {
      const n = resetUpgrades(save, this.job, d.meta.upgrades);
      this.ctx.save.write();
      bus.emit('toast', { text: t('upgrade.resetDone', { n }) });
      bus.emit('saveChanged', {});
      this.render();
    });
    const foot = this.el('div', 'ar-foot');
    foot.append(this.el('b', 'ar-crystals', t('archive.crystals', { n: save.crystals })), reset);
    wrap.append(jobs, this.el('div', 'iw-sub', t('archive.subject.hint')), list, foot);
    return wrap;
  }

  private upgradeRow(u: UpgradeDef, lv: number): HTMLElement {
    const t = this.ctx.t;
    const save = this.ctx.save.data;
    const max = u.costs.length;
    const name = u.kind === 'stat' ? t(`stat.${u.stat}`) : t(`upgrade.${u.kind}`);
    const row = this.el('div', 'ar-row');
    const effect = u.kind === 'stat' ? t('upgrade.effect.stat', { name, v: u.perLevel }) : t(`upgrade.effect.${u.kind}`, { v: u.perLevel });
    const info = this.el('div', 'ar-info');
    info.append(this.el('b', '', name), this.el('small', '', `${effect} · ${t('upgrade.level', { lv, max })}`));
    const dots = this.el('span', 'ar-dots', '●'.repeat(lv) + '○'.repeat(max - lv));
    const cost = nextCost(u, lv);
    const buy = this.el('button', 'ar-buy', cost === null ? t('upgrade.max') : t('upgrade.buy', { cost })) as HTMLButtonElement;
    buy.disabled = cost === null || save.crystals < cost;
    buy.addEventListener('click', () => {
      if (!buyUpgrade(save, this.job, u)) return;
      this.ctx.save.write();
      bus.emit('saveChanged', {});
      this.render();
    });
    row.append(info, dots, buy);
    return row;
  }

  private hide(): void {
    this.open = false;
    this.root.style.display = 'none';
    this.root.replaceChildren();
  }
}
