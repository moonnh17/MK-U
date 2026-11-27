/**
 * 시네마틱 덮개 (UI 씬, 기준 해상도 좌표): 위아래 검은 띠(레터박스), 화면을 하얗게 덮는 막, 가운데 큰 글자.
 * 아크로 미모사 3페이즈 전환 연출이 bus 'cinema'로 부른다. 수치는 ui.json cinema.
 */
import Phaser from 'phaser';
import type { GameContext } from '../core/context';
import { bus } from '../core/events';

export class CinemaOverlay {
  private readonly top: Phaser.GameObjects.Rectangle;
  private readonly bottom: Phaser.GameObjects.Rectangle;
  private readonly white: Phaser.GameObjects.Rectangle;
  private readonly big: Phaser.GameObjects.Text;
  private readonly unsub: () => void;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly ctx: GameContext,
  ) {
    const { baseWidth: W, baseHeight: H } = ctx.data.ui;
    const C = ctx.data.ui.cinema;
    // 하얀 막 위에 레터박스 (하얘져도 위아래 검은 띠는 남는다)
    this.white = scene.add.rectangle(0, 0, W, H, 0xffffff, 1).setOrigin(0).setDepth(90).setAlpha(0);
    this.top = scene.add.rectangle(0, -C.barPx, W, C.barPx, 0x000000).setOrigin(0).setDepth(91);
    this.bottom = scene.add.rectangle(0, H, W, C.barPx, 0x000000).setOrigin(0).setDepth(91);
    this.big = scene.add
      .text(W / 2, H / 2, '', { fontFamily: 'serif', fontStyle: 'bold', fontSize: `${C.bigSize}px`, color: C.bigColor, stroke: C.bigStroke, strokeThickness: C.bigStrokePx })
      .setOrigin(0.5)
      .setShadow(0, 0, C.bigColor, C.bigGlowPx, true, true)
      .setDepth(92)
      .setAlpha(0);
    this.unsub = bus.on('cinema', (e) => this.apply(e));
  }

  private apply(e: { bars?: boolean; white?: number; ms?: number; big?: string | null }): void {
    const { baseHeight: H } = this.ctx.data.ui;
    const C = this.ctx.data.ui.cinema;
    const ms = e.ms ?? C.barSec * 1000;
    const tw = (targets: object, props: Record<string, number>, ease = 'Sine.easeInOut') => {
      this.scene.tweens.killTweensOf(targets);
      this.scene.tweens.add({ targets, ...props, duration: Math.max(1, ms), ease });
    };
    if (e.bars !== undefined) {
      tw(this.top, { y: e.bars ? 0 : -C.barPx });
      tw(this.bottom, { y: e.bars ? H - C.barPx : H });
    }
    if (e.white !== undefined) tw(this.white, { alpha: e.white });
    if (e.big !== undefined) {
      if (e.big) {
        this.big.setText(e.big).setScale(C.bigFromScale).setAlpha(0);
        this.scene.tweens.killTweensOf(this.big);
        this.scene.tweens.add({ targets: this.big, alpha: 1, scale: 1, duration: Math.max(1, ms), ease: 'Back.easeOut' });
      } else tw(this.big, { alpha: 0 });
    }
  }

  destroy(): void {
    this.unsub();
  }
}
