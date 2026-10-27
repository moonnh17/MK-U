import Phaser from 'phaser';
import { hexColor } from '../core/scale';
import type { WeaponItem } from '../systems/weapons';
import type { PickupsData } from '../types/data';

export type PickupKind = 'energy' | 'coin';

/** 에너지 구슬·코인. 가까이 가면 끌려오고, 닿으면 획득된다. */
export class Pickup {
  readonly sprite: Phaser.GameObjects.Image;
  collected = false;

  constructor(
    scene: Phaser.Scene,
    readonly kind: PickupKind,
    x: number,
    y: number,
    data: PickupsData,
  ) {
    const ref = kind === 'energy' ? data.energyOrb : data.coin;
    this.sprite = scene.add.image(x, y, ref.spriteKey).setDepth(2);
  }

  /** 획득했으면 true */
  update(dt: number, player: { x: number; y: number }, data: PickupsData): boolean {
    if (this.collected) return false;
    const dx = player.x - this.sprite.x;
    const dy = player.y - this.sprite.y;
    const dist = Math.hypot(dx, dy);
    if (dist <= data.collectRadius) {
      this.collected = true;
      this.sprite.destroy();
      return true;
    }
    if (dist <= data.magnetRadius) {
      const step = Math.min(dist, data.magnetSpeed * dt);
      this.sprite.x += (dx / dist) * step;
      this.sprite.y += (dy / dist) * step;
    }
    return false;
  }

  destroy(): void {
    this.collected = true;
    this.sprite.destroy();
  }
}

/** 바닥에 놓인 무기. F(모바일: 줍기)로 교환한다. 일반 등급이 아니면 등급 색 고리 */
export class FloorWeapon {
  readonly sprite: Phaser.GameObjects.Image;
  private readonly glow: Phaser.GameObjects.Arc | null;

  constructor(
    scene: Phaser.Scene,
    readonly item: WeaponItem,
    spriteKey: string,
    x: number,
    y: number,
    gradeColor: string | null = null,
  ) {
    this.glow = gradeColor ? scene.add.circle(x, y, 8).setStrokeStyle(1, hexColor(gradeColor), 0.9).setDepth(1) : null;
    this.sprite = scene.add.image(x, y, spriteKey).setDepth(2);
    scene.tweens.add({ targets: this.sprite, y: y - 2, duration: 600, yoyo: true, repeat: -1 });
  }

  get x(): number {
    return this.sprite.x;
  }

  get y(): number {
    return this.sprite.y;
  }

  destroy(): void {
    this.sprite.scene.tweens.killTweensOf(this.sprite);
    this.sprite.destroy();
    this.glow?.destroy();
  }
}
