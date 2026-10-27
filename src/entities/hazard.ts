/**
 * 적 쪽 위험 지대(예고 원·장판 등). 플레이어만 피해를 받는다.
 * 근접·장판 공격이라 벡터굴절역장·칼 탄 베기의 대상이 아니다.
 */
import type Phaser from 'phaser';
import type { Vec2 } from '../core/actions';

export interface HazardHost {
  readonly scene: Phaser.Scene;
  playerPos(): Vec2;
  readonly playerRadius: number;
  /** 피해를 받았으면 true */
  hurtPlayer(amount: number): boolean;
}

export interface Hazard {
  /** false면 제거된다 */
  update(dt: number, host: HazardHost): boolean;
  destroy(): void;
}

/** 예고 원이 delaySec 동안 차오른 뒤 터진다 (폭발 엘리트) */
export class DelayedBlast implements Hazard {
  private readonly ring: Phaser.GameObjects.Arc;
  private readonly fill: Phaser.GameObjects.Arc;
  private left: number;

  constructor(
    scene: Phaser.Scene,
    private readonly at: Vec2,
    private readonly radius: number,
    private readonly delaySec: number,
    private readonly damage: number,
    private readonly color: number,
  ) {
    this.left = delaySec;
    this.ring = scene.add.circle(at.x, at.y, radius).setStrokeStyle(1, color, 0.9).setDepth(2);
    this.fill = scene.add.circle(at.x, at.y, 1, color, 0.3).setDepth(2);
  }

  update(dt: number, host: HazardHost): boolean {
    this.left -= dt;
    this.fill.setRadius(Math.max(1, this.radius * (1 - Math.max(0, this.left) / this.delaySec)));
    if (this.left > 0) return true;
    const p = host.playerPos();
    if (Math.hypot(p.x - this.at.x, p.y - this.at.y) <= this.radius + host.playerRadius) host.hurtPlayer(this.damage);
    const flash = host.scene.add.circle(this.at.x, this.at.y, this.radius, this.color, 0.6).setDepth(6);
    host.scene.time.delayedCall(150, () => flash.destroy());
    return false;
  }

  destroy(): void {
    this.ring.destroy();
    this.fill.destroy();
  }
}
