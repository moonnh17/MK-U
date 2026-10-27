import Phaser from 'phaser';
import { getContext, type GameContext } from '../core/context';
import { debugClearRoom, toggleDebugFlag } from '../core/debug';
import { bus } from '../core/events';
import { DebugPanel } from '../ui/debugPanel';
import { buildDebugSkills } from '../ui/debugSkills';
import { Hud } from '../ui/hud';
import { TouchSkills } from '../ui/touchSkills';

/** HUD·미니맵·알림·사망/클리어 화면·디버그 표시. Run 씬 위에 겹쳐 돈다. */
export class UIScene extends Phaser.Scene {
  private ctx!: GameContext;
  private hud!: Hud;
  private toastText!: Phaser.GameObjects.Text;
  private overlay!: Phaser.GameObjects.Container;
  private overlayTitle!: Phaser.GameObjects.Text;
  private debugPanel!: DebugPanel;
  private touchSkills!: TouchSkills;
  private touchSkillLabels: string[] = [];
  private unsubs: (() => void)[] = [];

  constructor() {
    super('UI');
  }

  create(): void {
    this.ctx = getContext();
    const { ui } = this.ctx.data;
    const W = ui.baseWidth;
    const H = ui.baseHeight;
    this.hud = new Hud(this, this.ctx);

    this.toastText = this.add
      .text(W / 2, H * 0.3, '', {
        fontFamily: 'sans-serif',
        fontSize: `${ui.hud.fontSize}px`,
        color: '#ffffff',
        backgroundColor: '#000000aa',
        padding: { x: 4, y: 2 },
      })
      .setOrigin(0.5)
      .setVisible(false);

    this.buildOverlay(W, H);

    this.debugPanel = new DebugPanel(
      document.body,
      {
        revealMap: this.ctx.t('debug.revealMap'),
        invincible: this.ctx.t('debug.invincible'),
        clearRoom: this.ctx.t('debug.clearRoom'),
      },
      {
        toggle: (name) => toggleDebugFlag(this.ctx, name),
        clearRoom: () => debugClearRoom(this.ctx),
      },
    );
    this.debugPanel.addSection(this.ctx.t('debug.skills'), buildDebugSkills(this.ctx));
    this.debugPanel.setVisible(this.ctx.debug);
    this.touchSkillLabels = ['1', '2', '3', '4', this.ctx.t('mobile.ultimate')];
    this.touchSkills = new TouchSkills(this.ctx.touch, ui, this.touchSkillLabels);

    this.unsubs.push(
      bus.on('uiModeChanged', () => this.relayout()),
      bus.on('debugToggled', ({ on }) => this.debugPanel.setVisible(on)),
      bus.on('command', ({ action }) => {
        this.hud.flash(action);
        if (action === 'map' && !this.ctx.session?.outcome) this.hud.toggleMinimap();
      }),
      bus.on('toast', ({ text }) => this.showToast(text)),
      bus.on('overlay', ({ open }) => this.showOverlay(open)),
    );
    const onResize = () => this.relayout();
    window.addEventListener('resize', onResize);
    this.unsubs.push(() => window.removeEventListener('resize', onResize));
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.unsubs.forEach((u) => u()));

    this.relayout();
  }

  private buildOverlay(W: number, H: number): void {
    const fs = this.ctx.data.ui.hud.fontSize;
    const shade = this.add.rectangle(0, 0, W, H, 0x000000, 0.7).setOrigin(0);
    this.overlayTitle = this.add
      .text(W / 2, H * 0.38, '', { fontFamily: 'sans-serif', fontSize: `${fs * 2}px`, color: '#ffffff' })
      .setOrigin(0.5);
    const { width: btnW, height: btnH } = this.ctx.data.ui.hud.overlayButton;
    const btn = this.add
      .rectangle(W / 2, H * 0.58, btnW, btnH, 0x2a3a4a)
      .setStrokeStyle(1, 0xffffff)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => bus.emit('restartRequested', {}));
    const btnText = this.add
      .text(W / 2, H * 0.58, this.ctx.t('screen.restart'), { fontFamily: 'sans-serif', fontSize: `${fs}px`, color: '#ffffff' })
      .setOrigin(0.5);
    const hint = this.add
      .text(W / 2, H * 0.58 + btnH, this.ctx.t('screen.restartHint'), {
        fontFamily: 'sans-serif',
        fontSize: `${fs - 2}px`,
        color: '#aaaaaa',
      })
      .setOrigin(0.5, 0);
    this.overlay = this.add.container(0, 0, [shade, this.overlayTitle, btn, btnText, hint]).setDepth(10).setVisible(false);
  }

  private showOverlay(open: boolean): void {
    const outcome = this.ctx.session?.outcome;
    if (open && outcome) {
      this.overlayTitle.setText(
        outcome.type === 'dead' ? this.ctx.t('screen.death') : this.ctx.t('screen.chapterClear', { chapter: outcome.chapter }),
      );
    }
    this.overlay.setVisible(open);
  }

  private showToast(text: string): void {
    this.tweens.killTweensOf(this.toastText);
    this.toastText.setText(text).setAlpha(1).setVisible(true);
    this.tweens.add({
      targets: this.toastText,
      alpha: 0,
      delay: this.ctx.data.ui.toastSec * 700,
      duration: this.ctx.data.ui.toastSec * 300,
      onComplete: () => this.toastText.setVisible(false),
    });
  }

  override update(): void {
    const s = this.ctx.session;
    if (s) {
      this.hud.update(s, this.time.now);
      if (this.ctx.uiMode === 'mobile') this.touchSkills.update(s.skillView, this.touchSkillLabels);
    }

    if (this.ctx.debug) {
      this.debugPanel.setToggle('revealMap', this.ctx.debugFlags.revealMap);
      this.debugPanel.setToggle('invincible', this.ctx.debugFlags.invincible);
      const t = this.ctx.t;
      this.debugPanel.setInfo(
        [
          `${t('debug.fps')} ${Math.round(this.game.loop.actualFps)}`,
          `${t('debug.seed')} ${this.ctx.config.seed}`,
          `${t('debug.room')} ${s?.currentRoomId ?? '-'}`,
          `${t('debug.enemies')} ${s?.enemiesAlive ?? 0}`,
          `${t('debug.energy')} ${Math.floor(s?.player.energy ?? 0)}`,
          `${t('debug.uiMode')} ${this.ctx.uiMode}`,
          t('debug.schoolPicks', { hectar: s?.player.schoolPicks.hectar ?? 0, acro: s?.player.schoolPicks.acro ?? 0 }),
        ].join('  '),
      );
    }
  }

  /** 모바일에서는 터치 버튼(CSS px) 위치를 게임 좌표로 바꿔 HUD가 버튼을 피하게 한다. */
  private relayout(): void {
    const ctx = this.ctx;
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
