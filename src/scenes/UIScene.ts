import Phaser from 'phaser';
import { getContext } from '../core/context';
import { bus } from '../core/events';
import { Hud } from '../ui/hud';

/** HUD와 디버그 표시. Run 씬 위에 겹쳐 돈다. */
export class UIScene extends Phaser.Scene {
  private hud!: Hud;
  private debugText!: Phaser.GameObjects.Text;
  private unsubs: (() => void)[] = [];

  constructor() {
    super('UI');
  }

  create(): void {
    const ctx = getContext();
    this.hud = new Hud(this, ctx);
    this.debugText = this.add
      .text(ctx.data.ui.baseWidth / 2, ctx.data.ui.hud.margin, '', {
        fontFamily: 'monospace',
        fontSize: `${ctx.data.ui.hud.fontSize}px`,
        color: '#9cff9c',
        backgroundColor: '#000000aa',
      })
      .setOrigin(0.5, 0)
      .setVisible(ctx.debug);

    this.unsubs.push(
      bus.on('uiModeChanged', () => this.relayout()),
      bus.on('debugToggled', ({ on }) => this.debugText.setVisible(on)),
      bus.on('command', ({ action }) => {
        this.hud.flash(action);
        if (action === 'map') this.hud.toggleMinimap();
      }),
    );
    const onResize = () => this.relayout();
    window.addEventListener('resize', onResize);
    this.unsubs.push(() => window.removeEventListener('resize', onResize));
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.unsubs.forEach((u) => u()));

    this.relayout();
  }

  override update(): void {
    const ctx = getContext();
    if (!this.debugText.visible) return;
    this.debugText.setText(
      [
        `${ctx.t('debug.fps')} ${Math.round(this.game.loop.actualFps)}`,
        `${ctx.t('debug.seed')} ${ctx.config.seed}`,
        `${ctx.t('debug.uiMode')} ${ctx.uiMode}`,
      ].join('  '),
    );
  }

  /** 모바일에서는 터치 버튼(CSS px) 위치를 게임 좌표로 바꿔 HUD가 버튼을 피하게 한다. */
  private relayout(): void {
    const ctx = getContext();
    const layout = ctx.touch.currentLayout();
    if (ctx.uiMode !== 'mobile' || !layout) {
      this.hud.applyMode(ctx.uiMode, null, null);
      return;
    }
    const rect = this.game.canvas.getBoundingClientRect();
    const sx = ctx.data.ui.baseWidth / rect.width;
    const sy = ctx.data.ui.baseHeight / rect.height;
    const gap = ctx.data.ui.hud.margin;
    const pause = layout.pause;
    const map = layout.map;
    const barsX = (pause.x + pause.w - rect.left) * sx + gap;
    const minimapY = (map.y + map.h - rect.top) * sy + gap;
    this.hud.applyMode('mobile', barsX, minimapY);
  }
}
