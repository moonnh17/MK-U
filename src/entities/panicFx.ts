/**
 * 패닉 연출: 주변이 어두워지고(Darkness 재사용), 화면이 떨리며, 검은 선들이 시야를 가린다.
 */
import type Phaser from 'phaser';
import type { Rng } from '../core/rng';
import { zigzag } from '../systems/dodge';
import type { SanityConfig } from '../types/data';
import { Darkness } from './darkness';

export class PanicFx {
  private readonly dark: Darkness;
  private readonly lines: Phaser.GameObjects.Graphics;
  private lineIn = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly c: SanityConfig['panic'],
    private readonly rng: Rng,
    private readonly renderScale: number,
  ) {
    this.dark = new Darkness(scene, c.lightRadius, c.darkAlpha, c.darkColor, c.fadeSec);
    this.lines = scene.add.graphics().setDepth(16);
  }

  /** screenX·Y: 플레이어의 화면 고정 좌표 (Darkness와 같다) */
  update(dt: number, screenX: number, screenY: number): void {
    this.dark.update(dt, screenX, screenY);
    const cam = this.scene.cameras.main;
    // Phaser 흔들림은 캔버스 배율이 두 번 곱해지므로 한 번 나눈다 (juice의 shake와 같다)
    if (!cam.shakeEffect.isRunning) cam.shake(this.c.shakeMs, this.c.shakeIntensity / this.renderScale);
    this.lineIn -= dt;
    if (this.lineIn > 0) return;
    this.lineIn = this.c.lineEverySec;
    const v = cam.worldView;
    const g = this.lines.clear();
    const r = this.rng;
    const point = (edge: number) => {
      const t = r.range(0, 1);
      if (edge === 0) return { x: v.x + v.width * t, y: v.y };
      if (edge === 1) return { x: v.x + v.width * t, y: v.y + v.height };
      if (edge === 2) return { x: v.x, y: v.y + v.height * t };
      return { x: v.x + v.width, y: v.y + v.height * t };
    };
    for (let i = 0; i < this.c.lines; i++) {
      const e = r.int(0, 3);
      const pts = zigzag(point(e), point((e + r.int(1, 3)) % 4), this.c.lineSegments, this.c.lineAmpPx, r);
      g.lineStyle(r.range(this.c.lineWidthPx[0], this.c.lineWidthPx[1]), 0x000000, this.c.lineAlpha).strokePoints(pts);
    }
  }

  destroy(): void {
    this.dark.lift();
    this.lines.destroy();
  }
}
