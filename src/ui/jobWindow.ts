/**
 * 직업 선택 장치 창 (DOM). 3직업을 보여 주고 마기학자만 고를 수 있다(마기법사·전사는 잠김).
 * PC: 클릭 또는 1/2/3, Esc로 닫기. 모바일: 탭.
 */
import type { GameContext } from '../core/context';
import { bus } from '../core/events';
import { jobChoices } from '../systems/lab';

export class JobWindow {
  private readonly root: HTMLDivElement;

  constructor(private readonly ctx: GameContext) {
    this.root = document.createElement('div');
    this.root.id = 'job-window';
    this.root.addEventListener('pointerdown', (e) => e.stopPropagation());
    document.body.appendChild(this.root);
    bus.on('jobWindowShow', ({ selected }) => this.show(selected));
    bus.on('modal', ({ kind }) => {
      if (kind !== 'job') this.hide();
    });
  }

  private show(selected: string | null): void {
    const t = this.ctx.t;
    const mobile = this.ctx.uiMode === 'mobile';
    this.root.className = mobile ? 'mobile' : 'pc';
    this.root.replaceChildren();

    const head = document.createElement('div');
    head.className = 'cw-head';
    head.innerHTML = '<b></b><small></small>';
    head.querySelector('b')!.textContent = t('job.title');
    head.querySelector('small')!.textContent = t(mobile ? 'job.hint.mobile' : 'job.hint.pc');

    const list = document.createElement('div');
    list.className = 'cw-list';
    jobChoices(this.ctx.data.jobs.jobs).forEach((j, i) => {
      const el = document.createElement('div');
      el.className = 'cw-card';
      if (!j.enabled) el.classList.add('locked');
      if (j.id === selected) el.classList.add('selected');
      const top = document.createElement('div');
      top.className = 'cw-top';
      top.textContent = `${mobile ? '' : `${i + 1}  `}${j.enabled ? (j.id === selected ? t('job.selected') : '') : t('job.locked')}`;
      const name = document.createElement('div');
      name.className = 'cw-name';
      name.textContent = t(j.nameKey);
      const desc = document.createElement('div');
      desc.className = 'cw-desc';
      desc.textContent = t('job.advancements', { list: j.advancementKeys.map((k) => t(k)).join(' / ') });
      el.append(top, name, desc);
      if (j.enabled) el.addEventListener('click', () => bus.emit('labJobPicked', { jobId: j.id }));
      list.appendChild(el);
    });

    const close = document.createElement('button');
    close.className = 'cw-reroll';
    close.textContent = t('job.close');
    close.addEventListener('click', () => bus.emit('jobWindowClose', {}));
    this.root.append(head, list, close);
    this.root.style.display = 'flex';
  }

  private hide(): void {
    this.root.style.display = 'none';
    this.root.replaceChildren();
  }
}
