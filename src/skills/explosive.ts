import type Phaser from 'phaser';
import type { Vec2 } from '../core/actions';
import { hexColor } from '../core/scale';
import type { SpriteRef, TagId } from '../types/data';
import type { SkillHost, SkillObject } from './host';

export interface ExplosiveSpec {
  owner: string;
  from: Vec2;
  to: Vec2;
  speed: number;
  /** 폭발 반지름(범위 보정 적용 후) */
  radius: number;
  base: number;
  tags: readonly TagId[];
  sprite: SpriteRef;
}

/** 목표 지점까지 날아가 폭발하는 투사체. 가는 길에 적에 닿으면 그 자리에서 터진다. */
export class Explosive implements SkillObject {
  readonly owner: string;
  readonly createdAt: number;
  private readonly img: Phaser.GameObjects.Image;
  private x: number;
  private y: number;
  private left: number;
  private readonly dir: Vec2;

  constructor(
    host: SkillHost,
    private readonly spec: ExplosiveSpec,
  ) {
    this.owner = spec.owner;
    this.createdAt = host.scene.time.now;
    this.x = spec.from.x;
    this.y = spec.from.y;
    const dx = spec.to.x - spec.from.x;
    const dy = spec.to.y - spec.from.y;
    this.left = Math.hypot(dx, dy);
    this.dir = this.left > 0 ? { x: dx / this.left, y: dy / this.left } : { x: 0, y: 0 };
    this.img = host.sprite(this.x, this.y, spec.sprite).setDepth(5);
  }

  update(dt: number, host: SkillHost): boolean {
    const step = Math.min(this.left, this.spec.speed * dt);
    this.x += this.dir.x * step;
    this.y += this.dir.y * step;
    this.left -= step;
    this.img.setPosition(this.x, this.y);
    const touching = host.enemies().some((e) => Math.hypot(e.sprite.x - this.x, e.sprite.y - this.y) <= e.radius + this.spec.sprite.size / 2);
    if (this.left > 0 && !touching) return true;
    this.explode(host);
    return false;
  }

  private explode(host: SkillHost): void {
    const r = this.spec.radius;
    for (const e of [...host.enemies()]) {
      if (Math.hypot(e.sprite.x - this.x, e.sprite.y - this.y) <= r + e.radius) host.hit(e, this.spec.base, this.spec.tags);
    }
    host.fx(host.scene.add.circle(this.x, this.y, r, hexColor(this.spec.sprite.color), 0.35).setDepth(6), 0.25);
  }

  destroy(): void {
    this.img.destroy();
  }
}
