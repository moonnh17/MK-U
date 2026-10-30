/**
 * 포탈 이동 화면 (UI 씬, 런 씬이 다시 시작돼도 이어진다): 어두운 보라 바탕에 가운데서 바깥으로 빛줄기가 쏟아진다.
 * bus 'warp' on으로 덮고, off면 서서히 걷힌다. 스테이지 끝 카드는 이 화면 위에서 고른다.
 */
import type Phaser from 'phaser';
import type { GameContext } from '../core/context';
import { bus } from '../core/events';
import { hexColor } from '../core/scale';
import { Rng } from '../core/rng';

interface Streak {
  angle: number;
  dist: number;
  speed: number;
  len: number;
}

export class Warp {
  private readonly g: Phaser.GameObjects.Graphics;
  private streaks: Streak[] = [];
  private alpha = 0;
  private target = 0;
  private readonly rng: Rng;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly ctx: GameContext,
  ) {
    this.g = scene.add.graphics().setDepth(29);
    this.rng = Rng.derive(ctx.config.seed, 'warp');
    bus.on('warp', ({ on }) => {
      this.target = on ? 1 : 0;
      if (on && this.streaks.length === 0) this.streaks = Array.from({ length: ctx.data.juice.portal.streaks }, () => this.spawn(true));
    });
  }

  private spawn(anywhere: boolean): Streak {
    return { angle: this.rng.range(0, Math.PI * 2), dist: anywhere ? this.rng.range(0, 260) : this.rng.range(0, 20), speed: this.rng.range(160, 420), len: this.rng.range(8, 30) };
  }

  update(dt: number): void {
    const p = this.ctx.data.juice.portal;
    // 덮을 때는 빠르게, 걷을 때는 천천히
    const rate = this.target > this.alpha ? 1 / p.fadeInSec : 1 / p.fadeOutSec;
    this.alpha = this.target > this.alpha ? Math.min(this.target, this.alpha + rate * dt) : Math.max(this.target, this.alpha - rate * dt);
    this.g.clear();
    if (this.alpha <= 0) {
      this.streaks = [];
      return;
    }
    const W = this.ctx.data.ui.baseWidth;
    const H = this.ctx.data.ui.baseHeight;
    const cx = W / 2;
    const cy = H / 2;
    this.g.fillStyle(hexColor(p.bgColor), this.alpha).fillRect(0, 0, W, H);
    // 가운데 빛
    this.g.fillStyle(hexColor(p.color), 0.35 * this.alpha).fillCircle(cx, cy, 26);
    this.g.fillStyle(0xffffff, 0.5 * this.alpha).fillCircle(cx, cy, 8);
    const c = hexColor(p.color);
    for (const s of this.streaks) {
      s.dist += s.speed * dt * (1 + s.dist / 120);
      if (s.dist > 300) Object.assign(s, this.spawn(false));
      const x0 = cx + Math.cos(s.angle) * s.dist;
      const y0 = cy + Math.sin(s.angle) * s.dist;
      const l = s.len * (0.4 + s.dist / 140);
      this.g.lineStyle(1 + s.dist / 140, s.dist > 120 ? 0xffffff : c, Math.min(1, s.dist / 60) * this.alpha);
      this.g.lineBetween(x0, y0, x0 + Math.cos(s.angle) * l, y0 + Math.sin(s.angle) * l);
    }
  }
}
