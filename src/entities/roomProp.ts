import Phaser from 'phaser';
import { damageProp } from '../systems/roomProps';
import type { StatueKind } from '../types/data';

/** 부서지는 상자·폭발 통. 벽처럼 막지만 공격하면 부서진다 */
export class BreakableProp {
  readonly sprite: Phaser.GameObjects.Image;
  private hp: number;
  dead = false;

  constructor(
    scene: Phaser.Scene,
    readonly kind: 'crate' | 'barrel',
    key: string,
    x: number,
    y: number,
    hp: number,
    group: Phaser.Physics.Arcade.StaticGroup,
  ) {
    this.hp = hp;
    this.sprite = scene.add.image(x, y, key).setDepth(1.5);
    this.sprite.setData('prop', this);
    group.add(this.sprite);
  }

  get x(): number {
    return this.sprite.x;
  }

  get y(): number {
    return this.sprite.y;
  }

  /** 부서지면 true */
  damage(amount: number): boolean {
    if (this.dead) return false;
    const r = damageProp(this.hp, amount);
    this.hp = r.hp;
    if (!r.broken) {
      // 맞았다는 표시
      this.sprite.setTint(0xffffff).setAlpha(0.7);
      this.sprite.scene.time.delayedCall(60, () => {
        if (!this.dead) this.sprite.clearTint().setAlpha(1);
      });
      return false;
    }
    this.dead = true;
    return true;
  }

  destroy(): void {
    this.sprite.destroy();
  }
}

/** 일회용 석상: 가까이서 상호작용하면 효과를 주고 꺼진다 */
export class Statue {
  readonly sprite: Phaser.GameObjects.Image;
  used = false;

  constructor(
    scene: Phaser.Scene,
    readonly kind: StatueKind,
    key: string,
    x: number,
    y: number,
    group: Phaser.Physics.Arcade.StaticGroup,
  ) {
    this.sprite = scene.add.image(x, y, key).setDepth(1.5);
    group.add(this.sprite);
  }

  get x(): number {
    return this.sprite.x;
  }

  get y(): number {
    return this.sprite.y;
  }

  use(): void {
    this.used = true;
    this.sprite.setTint(0x777777).setAlpha(0.6);
  }
}
