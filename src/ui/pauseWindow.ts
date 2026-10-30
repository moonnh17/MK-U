/**
 * 일시정지 창 (DOM): 계속하기 / 소리 켜기·끄기. 런 중 일시정지(Esc·모바일 일시정지 버튼)로 열린다.
 */
import type { GameContext } from '../core/context';
import { bus } from '../core/events';

export class PauseWindow {
  private readonly root: HTMLDivElement;
  private readonly sound: HTMLButtonElement;
  private readonly hint: HTMLElement;

  constructor(private readonly ctx: GameContext) {
    const t = ctx.t;
    this.root = document.createElement('div');
    this.root.id = 'pause-window';
    this.root.addEventListener('pointerdown', (e) => e.stopPropagation());
    const box = document.createElement('div');
    box.className = 'pw-box';
    const title = document.createElement('b');
    title.textContent = t('pause.title');
    const resume = document.createElement('button');
    resume.textContent = t('pause.resume');
    resume.addEventListener('click', () => {
      bus.emit('sfx', { id: 'uiClick' });
      bus.emit('pauseResume', {});
    });
    this.sound = document.createElement('button');
    this.sound.addEventListener('click', () => {
      bus.emit('muteToggle', {});
      bus.emit('sfx', { id: 'uiClick' });
    });
    const hint = document.createElement('small');
    hint.textContent = t('pause.hint');
    this.hint = hint;
    box.append(title, resume, this.sound, hint);
    this.root.appendChild(box);
    document.body.appendChild(this.root);
    bus.on('modal', ({ kind }) => {
      this.root.style.display = kind === 'pause' ? 'flex' : 'none';
      if (kind === 'pause') this.refresh();
    });
    bus.on('muteChanged', () => this.refresh());
  }

  private refresh(): void {
    this.sound.textContent = this.ctx.t(this.ctx.save.data.muted ? 'pause.soundOff' : 'pause.soundOn');
    // 키보드 안내는 PC에서만
    this.hint.style.display = this.ctx.uiMode === 'mobile' ? 'none' : '';
  }
}
