/**
 * 결산 화면 (DOM). 런이 끝나면(사망·클리어) 뜬다. 결정은 RunScene이 이미 저장에 더해 두었다.
 * 소울나이트 결산처럼 캐릭터를 앞세운다: 결과 띠 · 캐릭터와 큰 숫자 기록 · 장비·스킬·아이템 아이콘 · 처치한 보스 · 마기력 결정.
 * 확인(PC: 버튼·Space·F, 모바일: 버튼) → 다음 런 (M5-C부터는 실험장).
 */
import type { GameContext } from '../core/context';
import { bus } from '../core/events';
import { findSkill } from '../systems/skills';
import { formatPlayTime } from '../systems/runRecord';
import { artKeys } from '../systems/art';
import { applyArtIcon } from './artIcon';

export class SettlementWindow {
  private readonly root: HTMLDivElement;
  private timers: number[] = [];
  private frames: number[] = [];

  constructor(private readonly ctx: GameContext) {
    this.root = document.createElement('div');
    this.root.id = 'settlement';
    this.root.addEventListener('pointerdown', (e) => e.stopPropagation());
    document.body.appendChild(this.root);
    bus.on('overlay', ({ open }) => (open ? this.show() : this.hide()));
  }

  private show(): void {
    const s = this.ctx.session;
    const st = s?.settlement;
    if (!s || !st || !s.outcome) return;
    const t = this.ctx.t;
    const d = this.ctx.data;
    const p = s.player;
    const r = p.record;
    this.clearTimers();
    this.root.className = this.ctx.uiMode;
    this.root.replaceChildren();

    const el = (tag: string, cls: string, text = '') => {
      const x = document.createElement(tag);
      x.className = cls;
      x.textContent = text;
      return x;
    };
    const section = (title: string, ...children: HTMLElement[]) => {
      const sec = el('div', 'st-sec');
      sec.append(el('div', 'st-sub', title), ...children);
      return sec;
    };

    // 결과 띠
    const dead = s.outcome.type === 'dead';
    const title = st.runClear ? t('screen.runClear') : dead ? t('screen.death') : t('screen.chapterClear', { chapter: s.stage.chapter });
    const head = el('div', dead ? 'st-banner dead' : 'st-banner clear');
    head.append(el('b', '', title));

    const iconCell = (key: string, color: string | undefined, label: string, border?: string) => {
      const c = el('div', 'st-iconcell');
      c.title = label;
      if (border) c.style.borderColor = border;
      const i = el('span', '');
      applyArtIcon(i, this.ctx, key, color);
      c.appendChild(i);
      return c;
    };

    // 캐릭터
    const job = d.jobs.jobs.find((j) => j.id === p.job);
    const adv = job?.advancements.find((a) => a.id === p.advancement);
    const hero = el('div', 'st-hero');
    const face = el('span', dead ? 'st-heroface dead' : 'st-heroface');
    const schoolKey = p.advancement ? artKeys.playerSchool(p.advancement) : null;
    applyArtIcon(face, this.ctx, schoolKey && this.ctx.artLoaded.has(schoolKey) ? schoolKey : d.player.spriteKey, d.player.color);
    hero.append(face, el('b', '', job ? t(job.nameKey) : p.job), el('span', 'st-dim', adv ? t(adv.nameKey) : t('settlement.noAdv')));

    // 큰 숫자 기록
    const tile = (label: string, value: string) => {
      const x = el('div', 'st-tile');
      x.append(el('b', '', value), el('span', '', label));
      return x;
    };
    const tiles = el('div', 'st-tiles');
    const killed = [...r.bossKills.map((b) => b.id), ...r.hiddenBossKills];
    tiles.append(
      tile(t('settlement.stat.stage'), `${s.stage.chapter}-${s.stage.stage}`),
      tile(t('settlement.stat.time'), formatPlayTime(r.playSec)),
      tile(t('settlement.stat.kills'), String(r.kills)),
      tile(t('settlement.stat.elites'), String(r.eliteKills)),
      tile(t('settlement.stat.bosses'), String(killed.length)),
      tile(t('settlement.stat.spires'), String(r.spires)),
    );

    // 처치한 보스
    const bosses = el('div', 'st-bosses');
    if (killed.length === 0) bosses.append(el('span', 'st-dim', t('settlement.noBoss')));
    for (const id of killed) {
      const def = d.enemies.enemies.find((e) => e.id === id);
      if (def) bosses.appendChild(iconCell(def.spriteKey, def.color, t(def.nameKey)));
    }
    const combat = section(t('settlement.bosses'), bosses);

    // 최종 빌드: 아이콘으로
    const row = () => el('div', 'st-icons');
    const gear = row();
    for (const w of p.weapons.slots) {
      if (!w) continue;
      const def = d.weapons.weapons.find((x) => x.id === w.defId)!;
      gear.appendChild(iconCell(def.spriteKey, def.color, t(def.nameKey), d.groupMultipliers.grades.find((g) => g.id === w.grade)?.color));
    }
    const skillIcons = row();
    for (const [id, o] of Object.entries(p.loadout.owned).sort((a, b) => a[1].order - b[1].order)) {
      const def = findSkill(d.skills, id);
      const c = iconCell(artKeys.skillIcon(id), def.color, t(o.awakened ? def.awakening.nameKey : def.nameKey));
      c.appendChild(el('small', '', o.awakened ? '★' : `Lv${o.level}`));
      skillIcons.appendChild(c);
    }
    const ult = d.ultimates.ultimates.find((u) => u.id === p.ultimate.id);
    if (ult) skillIcons.appendChild(iconCell(artKeys.ultimateIcon(ult.id), ult.color, t(p.ultimate.awakened && ult.awakening ? ult.awakening.nameKey : ult.nameKey)));
    const itemIcons = row();
    for (const id of p.items) {
      const def = d.items.items.find((x) => x.id === id);
      if (def) itemIcons.appendChild(iconCell(def.spriteKey, def.color, t(def.nameKey), d.groupMultipliers.grades.find((g) => g.id === def.grade)?.color));
    }
    const none = () => el('span', 'st-dim', t('settlement.none'));
    const build = section(
      t('settlement.build'),
      el('div', 'st-mini', t('settlement.loadout')),
      gear.childElementCount ? gear : none(),
      el('div', 'st-mini', t('settlement.skills')),
      skillIcons.childElementCount ? skillIcons : none(),
      el('div', 'st-mini', t('settlement.itemsTitle')),
      itemIcons.childElementCount ? itemIcons : none(),
    );

    // 이번 런의 기억
    const mem: HTMLElement[] = [];
    if (r.shards > 0) mem.push(el('div', '', t('settlement.shards', { n: r.shards, have: st.shardsOwned, slots: d.meta.memory.pastSlots })));
    if (r.newCutscenes.length > 0) {
      const titles = r.newCutscenes.map((id) => this.ctx.save.data.cutscenes[id]?.pages[0]?.title ?? id);
      mem.push(el('div', 'st-dim', t('settlement.newCutscenes', { list: titles.join(' / ') })));
    }
    if (mem.length === 0) mem.push(el('div', 'st-dim', t('settlement.noMemories')));
    const memories = section(t('settlement.memories'), ...mem);

    // 마기력 결정: 항목별로 한 줄씩 숫자가 올라간다
    const list = el('div', 'st-crystals');
    const rows: { label: string; amount: number }[] = st.crystals.lines.map((l) => ({ label: t(`settlement.crystal.${l.key}`, { n: l.count }), amount: l.amount }));
    if (st.runClear) rows.push({ label: t('settlement.bonus', { mul: d.meta.crystals.clearMultiplier }), amount: st.crystals.bonus });
    rows.push({ label: t('settlement.total'), amount: st.crystals.total });
    const step = d.meta.settlement.lineStepSec * 1000;
    rows.forEach((row, i) => {
      const line = el('div', i === rows.length - 1 ? 'st-line total' : 'st-line');
      const num = el('span', 'st-num', '0');
      line.append(el('span', '', row.label), num);
      line.style.visibility = 'hidden';
      list.appendChild(line);
      this.timers.push(
        window.setTimeout(() => {
          line.style.visibility = 'visible';
          this.countUp(num, row.amount);
        }, i * step),
      );
    });
    const balance = el('div', 'st-balance', t('settlement.balance', { n: st.balance }));
    balance.style.visibility = 'hidden';
    this.timers.push(window.setTimeout(() => (balance.style.visibility = 'visible'), rows.length * step));
    const crystals = section(t('settlement.crystals'), list, balance);

    const confirm = el('button', 'st-confirm', t('settlement.confirm'));
    confirm.addEventListener('click', () => bus.emit('restartRequested', {}));

    const body = el('div', 'st-body');
    const left = el('div', 'st-col st-col-hero');
    left.append(hero, tiles);
    const mid = el('div', 'st-col');
    mid.append(build, combat);
    const right = el('div', 'st-col');
    right.append(crystals, memories);
    body.append(left, mid, right);
    this.root.append(head, body, confirm, el('div', 'st-dim', t('settlement.hint')));
    this.root.style.display = 'flex';
  }

  /** 숫자가 0에서 목표까지 올라간다 */
  private countUp(num: HTMLElement, to: number): void {
    const sec = this.ctx.data.meta.settlement.countSec;
    const start = performance.now();
    const tick = () => {
      const k = Math.min(1, (performance.now() - start) / (sec * 1000));
      num.textContent = String(Math.round(to * k));
      if (k < 1) this.frames.push(window.requestAnimationFrame(tick));
    };
    tick();
  }

  private clearTimers(): void {
    for (const id of this.timers) window.clearTimeout(id);
    for (const id of this.frames) window.cancelAnimationFrame(id);
    this.timers = [];
    this.frames = [];
  }

  private hide(): void {
    this.clearTimers();
    this.root.style.display = 'none';
    this.root.replaceChildren();
  }
}
