/**
 * 전투 시작 / 방 클리어 띠 (UI 씬).
 * 시작: 양옆에서 검은 띠가 닫히며 붉은 글자가 내리꽂힌다. 클리어: 금빛 띠가 가운데서 펼쳐지고 글자가 한 자씩 떨어진다.
 */
import type Phaser from 'phaser';
import type { GameContext } from '../core/context';
import { bus } from '../core/events';
import { hexColor } from '../core/scale';

export class CombatBanner {
  constructor(
    private readonly scene: Phaser.Scene,
    private readonly ctx: GameContext,
  ) {
    bus.on('combatBanner', ({ kind }) => (kind === 'start' ? this.start() : this.clear()));
  }

  private textStyle(size: number, color: string): Phaser.Types.GameObjects.Text.TextStyle {
    return { fontFamily: 'sans-serif', fontStyle: 'bold', fontSize: `${size}px`, color, stroke: '#000000', strokeThickness: 4 };
  }

  private start(): void {
    const s = this.scene;
    const c = this.ctx.data.juice.combatStart;
    const { baseWidth: W, baseHeight: H } = this.ctx.data.ui;
    const y = Math.round(H * 0.2);
    const col = hexColor(c.color);
    const ms = c.sec * 1000;
    const left = s.add.rectangle(-W / 2, y, W / 2, c.bandPx, 0x000000, 0.8).setOrigin(0, 0.5).setDepth(31);
    const right = s.add.rectangle(W, y, W / 2, c.bandPx, 0x000000, 0.8).setOrigin(0, 0.5).setDepth(31);
    const top = s.add.rectangle(W / 2, y - c.bandPx / 2, 0, 1.5, col).setDepth(31);
    const bottom = s.add.rectangle(W / 2, y + c.bandPx / 2, 0, 1.5, col).setDepth(31);
    const t = s.add.text(W / 2, y, this.ctx.t('room.start'), this.textStyle(c.size, c.color)).setOrigin(0.5).setDepth(32).setScale(3).setAlpha(0);
    s.tweens.add({ targets: left, x: 0, duration: ms * 0.16, ease: 'Cubic.easeOut' });
    s.tweens.add({ targets: right, x: W / 2, duration: ms * 0.16, ease: 'Cubic.easeOut' });
    s.tweens.add({ targets: [top, bottom], width: W, duration: ms * 0.22, ease: 'Cubic.easeOut' });
    s.tweens.add({ targets: t, scale: 1, alpha: 1, duration: ms * 0.16, delay: ms * 0.08, ease: 'Back.easeIn' });
    // 빠져나간다
    s.tweens.add({ targets: left, x: -W / 2, duration: ms * 0.2, delay: ms * 0.8, ease: 'Cubic.easeIn' });
    s.tweens.add({ targets: right, x: W, duration: ms * 0.2, delay: ms * 0.8, ease: 'Cubic.easeIn' });
    s.tweens.add({
      targets: [t, top, bottom],
      alpha: 0,
      duration: ms * 0.2,
      delay: ms * 0.8,
      onComplete: () => [left, right, top, bottom, t].forEach((o) => o.destroy()),
    });
  }

  private clear(): void {
    const s = this.scene;
    const c = this.ctx.data.juice.roomClear;
    const { baseWidth: W, baseHeight: H } = this.ctx.data.ui;
    const y = Math.round(H * 0.2);
    const col = hexColor(c.color);
    const ms = c.sec * 1000;
    const band = s.add.rectangle(W / 2, y, W, c.bandPx, 0x000000, 0.72).setDepth(31).setScale(1, 0);
    const shine = s.add.rectangle(W / 2, y, 2, c.bandPx, 0xffffff, 0.9).setDepth(31).setScale(1, 0);
    const top = s.add.rectangle(W / 2, y - c.bandPx / 2, 0, 1.5, col).setDepth(31);
    const bottom = s.add.rectangle(W / 2, y + c.bandPx / 2, 0, 1.5, col).setDepth(31);
    s.tweens.add({ targets: band, scaleY: 1, duration: ms * 0.1, ease: 'Cubic.easeOut' });
    s.tweens.add({ targets: shine, scaleY: 1, scaleX: W / 2, alpha: 0, duration: ms * 0.3, ease: 'Cubic.easeOut' });
    s.tweens.add({ targets: [top, bottom], width: W, duration: ms * 0.2, ease: 'Cubic.easeOut' });
    // 글자가 한 자씩 위에서 떨어진다
    const word = [...this.ctx.t('room.clear')];
    const gap = c.size * 0.82;
    const letters = word.map((ch, i) => {
      const x = W / 2 + (i - (word.length - 1) / 2) * gap;
      const t = s.add.text(x, y - 26, ch, this.textStyle(c.size, c.color)).setOrigin(0.5).setDepth(32).setAlpha(0);
      s.tweens.add({ targets: t, y, alpha: 1, duration: ms * 0.14, delay: ms * 0.05 + i * ms * 0.04, ease: 'Bounce.easeOut' });
      return t;
    });
    s.tweens.add({
      targets: [band, top, bottom, ...letters],
      alpha: 0,
      duration: ms * 0.2,
      delay: ms * 0.8,
      onComplete: () => [band, shine, top, bottom, ...letters].forEach((o) => o.destroy()),
    });
  }
}
