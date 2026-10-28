/**
 * 일식 어둠 (식광): 화면 전체를 덮고 플레이어 둘레만 밝게 남긴다. 보스가 죽으면 걷힌다.
 * 화면에 고정된 렌더 텍스처를 매 프레임 칠하고, 플레이어 자리를 가장자리가 흐린 원으로 지운다.
 */
import type Phaser from 'phaser';
import { hexColor } from '../core/scale';

/** 지우는 원의 가장자리 단계 수 (안쪽일수록 많이 지운다) */
const SOFT_STEPS = 6;

export class Darkness {
  private readonly rt: Phaser.GameObjects.RenderTexture;
  private readonly brush: Phaser.GameObjects.Graphics;
  private readonly color: number;
  private fade = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly lightRadius: number,
    private readonly alpha: number,
    color: string,
    /** 어둠이 짙어지는 시간(초) */
    private readonly fadeSec = 0.8,
  ) {
    const cam = scene.cameras.main;
    this.color = hexColor(color);
    this.rt = scene.add.renderTexture(0, 0, cam.width, cam.height).setOrigin(0, 0).setScrollFactor(0).setDepth(15);
    // 원점 둘레에 바깥은 옅게, 안쪽은 진하게 겹친 원 (지울 때 그 진하기만큼 지워진다)
    this.brush = scene.make.graphics({}, false);
    for (let i = SOFT_STEPS; i >= 1; i--) {
      this.brush.fillStyle(0xffffff, 1 / SOFT_STEPS).fillCircle(0, 0, lightRadius * (0.7 + (0.3 * i) / SOFT_STEPS));
    }
  }

  /** 매 프레임: 플레이어 화면 좌표 */
  update(dt: number, screenX: number, screenY: number): void {
    this.fade = Math.min(1, this.fade + dt / this.fadeSec);
    this.rt.clear();
    this.rt.fill(this.color, this.alpha * this.fade);
    this.rt.erase(this.brush, screenX, screenY);
  }

  /** 걷힘: 서서히 사라진다 */
  lift(): void {
    this.scene.tweens.add({ targets: this.rt, alpha: 0, duration: 600, onComplete: () => this.destroy() });
  }

  destroy(): void {
    this.scene.tweens.killTweensOf(this.rt);
    this.rt.destroy();
    this.brush.destroy();
  }
}
