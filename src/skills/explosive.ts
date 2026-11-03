import { loopArt, playFx } from './skillFx';
import { bus } from '../core/events';
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
  /** 터질 때 재생할 이펙트 (없으면 원) */
  blasts?: SpriteRef[];
  /** 날아가며 남기는 궤적 */
  trail?: SpriteRef;
}

/** 목표 지점까지 날아가 폭발하는 투사체. 가는 길에 적에 닿으면 그 자리에서 터진다. */
const TRAIL_EVERY_SEC = 0.07;

export class Explosive implements SkillObject {
  private trailIn = 0;
  readonly owner: string;
  readonly createdAt: number;
  private readonly img: Phaser.GameObjects.Sprite;
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
    this.img = host.sprite(this.x, this.y, spec.sprite).setDepth(5).setRotation(Math.atan2(dy, dx));
    loopArt(this.img, spec.sprite);
  }

  update(dt: number, host: SkillHost): boolean {
    const step = Math.min(this.left, this.spec.speed * dt);
    this.x += this.dir.x * step;
    this.y += this.dir.y * step;
    this.left -= step;
    this.img.setPosition(this.x, this.y);
    if (this.spec.trail) {
      this.trailIn -= dt;
      if (this.trailIn <= 0) {
        this.trailIn = TRAIL_EVERY_SEC;
        playFx(host.scene, this.spec.trail, this.x, this.y, { rotation: this.img.rotation, depth: 4 });
      }
    }
    const touching = host.enemies().some((e) => Math.hypot(e.sprite.x - this.x, e.sprite.y - this.y) <= e.radius + this.spec.sprite.size / 2);
    if (this.left > 0 && !touching) return true;
    this.explode(host);
    return false;
  }

  private explode(host: SkillHost): void {
    const r = this.spec.radius;
    bus.emit('sfx', { id: 'explosion', size: r });
    host.blastProps({ x: this.x, y: this.y }, r, this.spec.base);
    for (const e of [...host.enemies()]) {
      if (Math.hypot(e.sprite.x - this.x, e.sprite.y - this.y) <= r + e.radius) host.hit(e, this.spec.base, this.spec.tags);
    }
    if (this.spec.blasts?.length) {
      for (const b of this.spec.blasts) playFx(host.scene, b, this.x, this.y, { w: r * 2.2 });
    } else host.fx(host.scene.add.circle(this.x, this.y, r, hexColor(this.spec.sprite.color), 0.35).setDepth(6), 0.25);
  }

  destroy(): void {
    this.img.destroy();
  }
}
