/**
 * 결산 화면 (DOM). 런이 끝나면(사망·클리어) 뜬다. 결정은 RunScene이 이미 저장에 더해 두었다.
 * 결과 · 전투 기록(보스 초상화) · 최종 빌드 · 이번 런의 기억 · 마기력 결정(항목별로 숫자가 올라간 뒤 합계).
 * 확인(PC: 버튼·Space·F, 모바일: 버튼) → 다음 런 (M5-C부터는 실험장).
 */
import type { GameContext } from '../core/context';
import { bus } from '../core/events';
import { findSkill } from '../systems/skills';
import { formatPlayTime } from '../systems/runRecord';

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

    // 결과
    const title = st.runClear ? t('screen.runClear') : s.outcome.type === 'dead' ? t('screen.death') : t('screen.chapterClear', { chapter: s.outcome.chapter });
    const head = el('div', 'st-head');
    head.append(el('b', '', title), el('span', '', `${t('settlement.reached', { chapter: s.stage.chapter, stage: s.stage.stage })} · ${t('settlement.time', { time: formatPlayTime(r.playSec) })}`));

    // 전투 기록
    const bosses = el('div', 'st-bosses');
    const killed = [...r.bossKills.map((b) => b.id), ...r.hiddenBossKills];
    if (killed.length === 0) bosses.append(el('span', 'st-dim', t('settlement.noBoss')));
    for (const id of killed) {
      const def = d.enemies.enemies.find((e) => e.id === id);
      if (!def) continue;
      const b = el('div', 'st-boss');
      const face = el('span', 'st-face');
      face.style.background = def.color;
      b.append(face, el('span', '', t(def.nameKey)));
      bosses.appendChild(b);
    }
    const combat = section(
      t('settlement.combat'),
      el('div', '', [t('settlement.kills', { n: r.kills }), t('settlement.eliteKills', { n: r.eliteKills }), t('settlement.spires', { n: r.spires })].join(' · ')),
      el('div', 'st-dim', t('settlement.bosses')),
      bosses,
    );

    // 최종 빌드
    const job = d.jobs.jobs.find((j) => j.id === p.job);
    const adv = job?.advancements.find((a) => a.id === p.advancement);
    const skills = Object.entries(p.loadout.owned)
      .sort((a, b) => a[1].order - b[1].order)
      .map(([id, o]) => {
        const def = findSkill(d.skills, id);
        return `${t(o.awakened ? def.awakening.nameKey : def.nameKey)} Lv${o.level}${o.awakened ? '★' : ''}`;
      });
    const ult = d.ultimates.ultimates.find((u) => u.id === p.ultimate.id);
    const weapons = p.weapons.slots.filter((w) => w !== null).map((w) => t(d.weapons.weapons.find((x) => x.id === w!.defId)!.nameKey));
    const items = p.items.map((id) => t(d.items.items.find((x) => x.id === id)?.nameKey ?? id));
    const none = t('settlement.none');
    const build = section(
      t('settlement.build'),
      el('div', '', t('settlement.job', { job: job ? t(job.nameKey) : p.job, adv: adv ? t(adv.nameKey) : t('settlement.noAdv') })),
      el('div', 'st-dim', skills.join(' · ') || none),
      el('div', 'st-dim', t('settlement.ultimate', { name: ult ? t(p.ultimate.awakened && ult.awakening ? ult.awakening.nameKey : ult.nameKey) : none })),
      el('div', 'st-dim', t('settlement.weapons', { list: weapons.join(', ') || none })),
      el('div', 'st-dim', t('settlement.items', { list: items.join(', ') || none })),
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
    const left = el('div', 'st-col');
    left.append(combat, build, memories);
    const right = el('div', 'st-col');
    right.append(crystals);
    body.append(left, right);
    this.root.append(el('div', 'st-title', t('settlement.title')), head, body, confirm, el('div', 'st-dim', t('settlement.hint')));
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
