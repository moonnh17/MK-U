import Phaser from 'phaser';
import type { BleedState } from '../systems/tags';
import type { EnemyDef } from '../types/data';

/** 적 하나. 스프라이트에 `enemy` 데이터로 자신을 붙여 충돌 콜백에서 찾는다. */
export class Enemy {
  readonly sprite: Phaser.Physics.Arcade.Image;
  hp: number;
  /** 소환 직후 공격·접촉 피해가 없는 남은 시간(초) */
  warn: number;
  /** 마지막 접촉 피해 시각(ms) */
  lastContactAt = -Infinity;
  dead = false;
  /** 걸려 있는 출혈 */
  bleed: BleedState | null = null;

  constructor(
    scene: Phaser.Scene,
    readonly def: EnemyDef,
    x: number,
    y: number,
    warnSec: number,
  ) {
    this.hp = def.maxHp;
    this.warn = warnSec;
    this.sprite = scene.physics.add.image(x, y, def.spriteKey);
    this.sprite.setData('enemy', this);
    this.sprite.setDepth(3);
    if (def.ai === 'idle') this.sprite.setImmovable(true);
    if (warnSec > 0) this.sprite.setAlpha(0.4);
  }

  get radius(): number {
    return this.def.size / 2;
  }

  update(dt: number, target: { x: number; y: number }): void {
    if (this.dead) return;
    if (this.warn > 0) {
      this.warn -= dt;
      if (this.warn <= 0) this.sprite.setAlpha(1);
      this.sprite.setVelocity(0, 0);
      return;
    }
    if (this.def.ai === 'chase') {
      const dx = target.x - this.sprite.x;
      const dy = target.y - this.sprite.y;
      const len = Math.hypot(dx, dy) || 1;
      this.sprite.setVelocity((dx / len) * this.def.moveSpeed, (dy / len) * this.def.moveSpeed);
    } else {
      this.sprite.setVelocity(0, 0);
    }
  }

  /** 피해를 주고, 이번에 죽었으면 true */
  damage(amount: number): boolean {
    if (this.dead) return false;
    this.hp -= amount;
    this.sprite.setTintFill(0xffffff);
    this.sprite.scene.time.delayedCall(50, () => this.sprite.active && this.sprite.clearTint());
    if (this.hp <= 0) {
      this.dead = true;
      return true;
    }
    return false;
  }

  destroy(): void {
    this.dead = true;
    this.sprite.destroy();
  }
}
