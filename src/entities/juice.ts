/**
 * 타격감 연출 (Phaser): 피해 숫자, 맞은 자리 불꽃, 처치 파편·폭발, 플레이어 피격 번쩍임·낮은 체력 맥박, 화면 흔들림.
 * 수치는 data/juice.json, 계산은 systems/juice.ts. 이펙트 그림이 없으면 도형만 쓴다.
 */
import { getContext } from '../core/context';
import type Phaser from 'phaser';
import type { Vec2 } from '../core/actions';
import type { Rng } from '../core/rng';
import { hexColor } from '../core/scale';
import type { GameData } from '../data/index';
import { burst, damageNumberStyle, lowHpPulse, sparkKind, type DamageKind } from '../systems/juice';
import { screenToFixed } from '../systems/camera';
import type { JuiceData, ShakeLevel, TagId } from '../types/data';

/** 화면 흔들림 (세기는 데이터의 단계). rumble처럼 길이가 정해지지 않은 것은 ms로 */
export function shake(scene: Phaser.Scene, level: ShakeLevel, ms?: number): void {
  const s = getContext().data.juice.shake[level];
  // Phaser는 폭 × 세기 × 확대로 흔든다: 캔버스 배율이 두 번 곱해지므로 한 번 나눠 화면 기준 세기를 맞춘다
  const ctx = getContext();
  scene.cameras.main.shake(ms ?? s.ms, s.intensity / ctx.renderScale);
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

  /** 한 색깔의 입자가 사방으로 터지고 고리가 퍼진다 (보스 단계 전환·방 클리어) */
  colorBurst(at: Vec2, color: string, c: { particles: readonly [number, number]; particleSpeed: readonly [number, number]; particleLifeSec: number; particleSize: number; ringRadiusPx: number }): void {
    const col = hexColor(color);
    this.particles(at, c.particles, c.particleSpeed, c.particleLifeSec, c.particleSize, col);
    for (const delay of [0, 120]) {
      const ring = this.scene.add.circle(at.x, at.y, 6).setStrokeStyle(2, col, 1).setDepth(7);
      this.scene.tweens.add({ targets: ring, scale: c.ringRadiusPx / 6, alpha: 0, duration: c.particleLifeSec * 1000, delay, ease: 'Cubic.easeOut', onComplete: () => ring.destroy() });
    }
  }

  /** 지팡이: 끝에서 십자로 번쩍이고 파티클이 흩어진다 */
  sparkle(at: Vec2, color: string, c: { particles: readonly [number, number]; particleSpeed: readonly [number, number]; particleLifeSec: number; particleSize: number; flashPx: number; flashSec: number }): void {
    const col = hexColor(color);
    this.particles(at, c.particles, c.particleSpeed, c.particleLifeSec, c.particleSize, col);
    for (const [w, h, tint] of [[c.flashPx, 1.5, 0xffffff], [1.5, c.flashPx, 0xffffff], [c.flashPx * 0.55, c.flashPx * 0.55, col]] as const) {
      const r = this.scene.add.rectangle(at.x, at.y, w, h, tint, 0.9).setDepth(7).setBlendMode('ADD');
      this.scene.tweens.add({ targets: r, scaleX: 0.15, scaleY: 0.15, alpha: 0, duration: c.flashSec * 1000, ease: 'Quad.easeIn', onComplete: () => r.destroy() });
    }
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
    // 사망 동작 그림이 있으면 쓰러지는 몸을 잠깐 남긴다
    const dk = `${sprite.texture.key}.death`;
    if (this.scene.anims.exists(dk)) {
      const body = this.scene.add.sprite(at.x, at.y, sprite.texture.key).setOrigin(sprite.originX, sprite.originY).setScale(sprite.scaleX, sprite.scaleY).setFlipX(sprite.flipX).setDepth(2);
      body.play(dk);
      body.once('animationcomplete', () => this.scene.tweens.add({ targets: body, alpha: 0, duration: 400, onComplete: () => body.destroy() }));
    }
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
      shake(this.scene, 'light');
    } else {
      this.fxAnim(this.j.fx.poof.spriteKey, at);
    }
  }

  /** 보스 처치 연쇄 폭발 하나: center 둘레 spread 안 아무 데나 */
  explosionNear(center: Vec2, spread: number): void {
    const at = { x: center.x + this.rng.range(-spread, spread), y: center.y + this.rng.range(-spread, spread) };
    this.fxAnim(this.j.fx.explosion.spriteKey, at);
    this.particles(at, this.j.death.shards, this.j.death.shardSpeed, this.j.death.shardLifeSec, this.j.death.shardSize, hexColor(this.j.fx.explosion.color));
    shake(this.scene, 'light');
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
    // 화면 고정 오브젝트도 카메라 확대를 받으므로 보이는 화면 테두리를 지역 좌표로 바꿔 그린다
    const z = cam.zoom;
    // edgePx는 기준 해상도 px, 그리는 좌표는 캔버스 px ÷ 확대
    const r = getContext().renderScale;
    const tl = screenToFixed(0, 0, cam.width, cam.height, z);
    const w = cam.width / z;
    const h = cam.height / z;
    // 바깥쪽이 진하고 안쪽으로 옅어지는 테두리
    for (let i = 0; i < p.edgePx; i += 2) {
      this.edge.lineStyle((2 * r) / z, c, alpha * (1 - i / p.edgePx));
      this.edge.strokeRect(tl.x + (i * r) / z, tl.y + (i * r) / z, w - (i * 2 * r) / z, h - (i * 2 * r) / z);
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
