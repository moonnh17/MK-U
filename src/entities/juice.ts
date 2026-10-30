/**
 * 타격감 연출 (Phaser): 피해 숫자, 맞은 자리 불꽃, 처치 파편·폭발, 플레이어 피격 번쩍임·낮은 체력 맥박, 화면 흔들림.
 * 수치는 data/juice.json, 계산은 systems/juice.ts. 이펙트 그림이 없으면 도형만 쓴다.
 */
import type Phaser from 'phaser';
import type { Vec2 } from '../core/actions';
import { getContext } from '../core/context';
import type { Rng } from '../core/rng';
import { hexColor } from '../core/scale';
import type { GameData } from '../data/index';
import { burst, damageNumberStyle, lowHpPulse, sparkKind, type DamageKind } from '../systems/juice';
import type { JuiceData, ShakeLevel, TagId } from '../types/data';

/** 화면 흔들림 (세기는 데이터의 단계). rumble처럼 길이가 정해지지 않은 것은 ms로 */
export function shake(scene: Phaser.Scene, level: ShakeLevel, ms?: number): void {
  const s = getContext().data.juice.shake[level];
  scene.cameras.main.shake(ms ?? s.ms, s.intensity);
}

/** 불꽃 종류 → 이펙트 그림 */
const SPARK_FX = { tech: 'hitTech', magic: 'hitMagic', physical: 'hitPhysical', default: 'hitPhysical' } as const;

export class Juice {
  private readonly j: JuiceData;
  private numbers: Phaser.GameObjects.Text[] = [];
  private readonly edge: Phaser.GameObjects.Graphics;
  private flashLeft = 0;
  private time = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    data: GameData,
    private readonly rng: Rng,
  ) {
    this.j = data.juice;
    // 화면 가장자리 붉은 테두리 (일식 어둠 위)
    this.edge = scene.add.graphics().setScrollFactor(0).setDepth(17);
  }

  /** 맞은 적 위로 튀어 오르는 피해 숫자 (동시 max개, 넘으면 오래된 것부터 지운다) */
  damageNumber(at: Vec2, amount: number, kind: DamageKind, boss: boolean): void {
    const d = this.j.damageNumbers;
    if (!d.enabled || amount <= 0) return;
    const st = damageNumberStyle(kind, boss, d);
    const x = at.x + this.rng.range(-d.spreadPx, d.spreadPx);
    const t = this.scene.add
      .text(x, at.y, st.text(amount), { fontFamily: 'monospace', fontSize: `${st.size}px`, color: st.color, stroke: '#000000', strokeThickness: 2, resolution: 4 })
      .setOrigin(0.5, 1)
      .setDepth(8);
    this.numbers.push(t);
    while (this.numbers.length > d.max) this.numbers.shift()!.destroy();
    // 위로 튀었다가(치명은 크게 부풀었다) 사라진다
    if (kind === 'crit') this.scene.tweens.add({ targets: t, scale: { from: 1.6, to: 1 }, duration: 120 });
    this.scene.tweens.add({
      targets: t,
      y: at.y - d.risePx,
      alpha: { from: 1, to: 0 },
      duration: d.riseSec * 1000,
      ease: 'Cubic.easeOut',
      onComplete: () => {
        this.numbers = this.numbers.filter((x) => x !== t);
        t.destroy();
      },
    });
  }

  /** 맞은 자리: 태그 색 불꽃 몇 개 + 이펙트 그림(있으면) */
  hitSpark(at: Vec2, tags: readonly TagId[]): void {
    const sp = this.j.sparks;
    const kind = sparkKind(tags);
    this.particles(at, sp.count, sp.speed, sp.lifeSec, sp.size, hexColor(sp.colors[kind]));
    this.fxImage(this.j.fx[SPARK_FX[kind]].spriteKey, at, sp.fxSec, 0.7, 1.15);
  }

  /**
   * 처치: 적 모습이 하얗게 번쩍이며 부풀어 사라지고 파편이 흩어진다.
   * big(엘리트·정예·보스): 파편이 많고 폭발 그림 + 흔들림
   */
  death(sprite: Phaser.GameObjects.Sprite, color: string, big: boolean): void {
    const d = this.j.death;
    const at = { x: sprite.x, y: sprite.y };
    const ghost = this.scene.add
      .image(at.x, at.y, sprite.texture.key, sprite.frame.name)
      .setOrigin(sprite.originX, sprite.originY)
      .setScale(sprite.scaleX, sprite.scaleY)
      .setFlipX(sprite.flipX)
      .setTintFill(0xffffff)
      .setDepth(6);
    this.scene.tweens.add({ targets: ghost, alpha: 0, scaleX: sprite.scaleX * 1.4, scaleY: sprite.scaleY * 0.6, duration: d.flashSec * 1000 * 3, onComplete: () => ghost.destroy() });
    this.particles(at, big ? d.eliteShards : d.shards, d.shardSpeed, d.shardLifeSec, d.shardSize, hexColor(color));
    if (big) {
      this.fxAnim(this.j.fx.explosion.spriteKey, at);
      this.fxImage(this.j.fx.eliteBurst.spriteKey, at, 0.35, 0.6, 1.3);
      shake(this.scene, 'medium');
    } else {
      this.fxImage(this.j.fx.hitPhysical.spriteKey, at, 0.2, 0.8, 1.4);
    }
  }

  /** 보스 처치 연쇄 폭발 하나: center 둘레 spread 안 아무 데나 */
  explosionNear(center: Vec2, spread: number): void {
    const at = { x: center.x + this.rng.range(-spread, spread), y: center.y + this.rng.range(-spread, spread) };
    this.fxAnim(this.j.fx.explosion.spriteKey, at);
    this.particles(at, this.j.death.shards, this.j.death.shardSpeed, this.j.death.shardLifeSec, this.j.death.shardSize, hexColor(this.j.fx.explosion.color));
    shake(this.scene, 'medium');
  }

  /** 보스 착지: 바닥 먼지 고리 + 파편 */
  landing(at: Vec2, radius: number): void {
    const ring = this.scene.add.circle(at.x, at.y, radius).setStrokeStyle(2, 0xffffff, 0.8).setDepth(2);
    this.scene.tweens.add({ targets: ring, scale: 2.4, alpha: 0, duration: 380, onComplete: () => ring.destroy() });
    this.particles(at, this.j.death.eliteShards, this.j.death.shardSpeed, this.j.death.shardLifeSec, this.j.death.shardSize, 0xb0a090);
  }

  /** 플레이어 피격: 가장자리 붉은 번쩍임 */
  hurt(): void {
    this.flashLeft = this.j.playerHurt.flashSec;
  }

  /** 매 프레임: 가장자리 번쩍임 + 낮은 체력 맥박 */
  update(dt: number, hpRatio: number): void {
    const p = this.j.playerHurt;
    this.time += dt;
    this.flashLeft = Math.max(0, this.flashLeft - dt);
    const alpha = Math.max(p.flashAlpha * (this.flashLeft / p.flashSec), lowHpPulse(this.time, hpRatio, p));
    this.edge.clear();
    if (alpha <= 0.01) return;
    const cam = this.scene.cameras.main;
    const c = hexColor(p.color);
    // 바깥쪽이 진하고 안쪽으로 옅어지는 테두리
    for (let i = 0; i < p.edgePx; i += 2) {
      this.edge.lineStyle(2, c, alpha * (1 - i / p.edgePx));
      this.edge.strokeRect(i, i, cam.width - i * 2, cam.height - i * 2);
    }
  }

  private particles(at: Vec2, count: readonly [number, number], speed: readonly [number, number], life: number, size: number, color: number): void {
    for (const v of burst(this.rng, count, speed)) {
      const r = this.scene.add.rectangle(at.x, at.y, size, size, color).setDepth(7);
      this.scene.tweens.add({ targets: r, x: at.x + v.vx * life, y: at.y + v.vy * life, alpha: 0, duration: life * 1000, ease: 'Quad.easeOut', onComplete: () => r.destroy() });
    }
  }

  /** 한 장짜리 이펙트 그림: 커지며 사라진다 (그림이 없으면 아무것도 안 함) */
  private fxImage(key: string, at: Vec2, sec: number, from: number, to: number): void {
    if (!this.scene.textures.exists(key)) return;
    const img = this.scene.add.image(at.x, at.y, key).setDepth(7).setRotation(this.rng.range(0, Math.PI * 2)).setScale(from);
    this.scene.tweens.add({ targets: img, scale: to, alpha: 0, duration: sec * 1000, ease: 'Quad.easeOut', onComplete: () => img.destroy() });
  }

  /** 여러 프레임 이펙트 그림을 한 번 재생 */
  private fxAnim(key: string, at: Vec2): void {
    const s = this.scene;
    if (!s.textures.exists(key)) return;
    const anim = `${key}.fx`;
    if (!s.anims.exists(anim)) s.anims.create({ key: anim, frames: s.anims.generateFrameNumbers(key, {}), frameRate: 18, repeat: 0 });
    const spr = s.add.sprite(at.x, at.y, key).setDepth(7);
    spr.play(anim);
    spr.once('animationcomplete', () => spr.destroy());
  }
}
