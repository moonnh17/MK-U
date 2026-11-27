/** 아크로·헥타르 미모사의 위험 지대: 공간 베기 선, 각인(디버프), 되감기 파편, 실험 샘플(디버프) */
import Phaser from 'phaser';
import type { Vec2 } from '../../core/actions';
import { bus } from '../../core/events';
import { shake } from '../../entities/juice';
import type { Hazard, HazardHost } from '../../entities/hazard';
import { loopArt, playFx } from '../../skills/skillFx';
import { segmentDist, type CutLine } from '../../systems/acroMimosa';
import type { SpriteRef } from '../../types/data';

/** 공간 베기: 가는 예고 선이 짙어지다가 한 번에 갈라진다 */
export class CutHazard implements Hazard {
  private readonly g: Phaser.GameObjects.Graphics;
  private left: number;
  private flash = 0;

  constructor(
    scene: Phaser.Scene,
    private readonly line: CutLine,
    private readonly warnSec: number,
    private readonly width: number,
    private readonly length: number,
    private readonly damage: number,
    private readonly color: number,
    private readonly slash?: { ref: SpriteRef; px: number },
  ) {
    this.left = warnSec;
    this.g = scene.add.graphics().setDepth(2.2);
  }

  private ends(): [Vec2, Vec2] {
    const dx = Math.cos(this.line.angle) * (this.length / 2);
    const dy = Math.sin(this.line.angle) * (this.length / 2);
    return [
      { x: this.line.x - dx, y: this.line.y - dy },
      { x: this.line.x + dx, y: this.line.y + dy },
    ];
  }

  update(dt: number, host: HazardHost): boolean {
    const [a, b] = this.ends();
    if (this.flash > 0) {
      this.flash -= dt;
      const k = Math.max(0, this.flash / 0.18);
      this.g.clear().lineStyle(this.width * (0.6 + k), 0xffffff, 0.9 * k).lineBetween(a.x, a.y, b.x, b.y);
      this.g.lineStyle(this.width * 2 * k, this.color, 0.5 * k).lineBetween(a.x, a.y, b.x, b.y);
      return this.flash > 0;
    }
    this.left -= dt;
    const k = 1 - Math.max(0, this.left) / this.warnSec;
    this.g.clear().lineStyle(1 + k * 2, this.color, 0.25 + 0.6 * k).lineBetween(a.x, a.y, b.x, b.y);
    if (this.left > 0) return true;
    if (segmentDist(host.playerPos(), this.line, this.length) <= this.width / 2 + host.playerRadius) host.hurtPlayer(this.damage);
    bus.emit('sfx', { id: 'spaceRupture' });
    if (this.slash) {
      const p = host.playerPos();
      // 베인 자리: 선 위에서 플레이어와 가장 가까운 점
      const dx = Math.cos(this.line.angle);
      const dy = Math.sin(this.line.angle);
      const t = Math.max(-this.length / 2, Math.min(this.length / 2, (p.x - this.line.x) * dx + (p.y - this.line.y) * dy));
      playFx(host.scene, this.slash.ref, this.line.x + dx * t, this.line.y + dy * t, { w: this.slash.px, rotation: this.line.angle, depth: 6 }).setBlendMode('ADD');
    }
    this.flash = 0.18;
    return true;
  }

  destroy(): void {
    this.g.destroy();
  }
}

/**
 * 표식 하나: 예고 원이 차오른 뒤 터진다. 맞으면 피해 + onHit (디버프 아이템을 주는 쪽이 한 패턴에 한 번만 주도록 판단).
 * 각인(아크로)·실험 샘플(헥타르)이 같이 쓴다. linger > 0이면 터진 자리에 그만큼 남아 밟아도 맞는다(샘플 웅덩이).
 */
export class MarkHazard implements Hazard {
  private readonly ring: Phaser.GameObjects.Arc;
  private readonly fill: Phaser.GameObjects.Arc;
  private readonly art: Phaser.GameObjects.Sprite | null = null;
  private readonly flyer: Phaser.GameObjects.Image | null = null;
  private left: number;
  private linger: number;
  private hit = false;

  constructor(
    scene: Phaser.Scene,
    private readonly at: Vec2,
    private readonly radius: number,
    private readonly warnSec: number,
    lingerSec: number,
    private readonly damage: number,
    private readonly color: number,
    private readonly onHit: () => void,
    opts: { mark?: SpriteRef; markPx?: number; burst?: SpriteRef; burstPx?: number; flyFrom?: Vec2; flyKey?: string; flyPx?: number; flightPx?: number } = {},
  ) {
    this.left = warnSec;
    this.linger = lingerSec;
    this.ring = scene.add.circle(at.x, at.y, radius).setStrokeStyle(1, color, 0.9).setDepth(2);
    this.fill = scene.add.circle(at.x, at.y, 1, color, 0.3).setDepth(2);
    if (opts.mark) {
      this.art = scene.add.sprite(at.x, at.y, opts.mark.spriteKey).setDepth(2.1).setAlpha(0.7).setBlendMode('ADD');
      const px = opts.markPx ?? radius * 2;
      this.art.setDisplaySize(px, (px * this.art.height) / Math.max(1, this.art.width));
      loopArt(this.art, opts.mark);
    }
    // 날아오는 물건 (실험 샘플): 던진 자리에서 포물선으로
    if (opts.flyFrom && opts.flyKey && scene.textures.exists(opts.flyKey)) {
      const from = opts.flyFrom;
      const img = scene.add.image(from.x, from.y, opts.flyKey).setDepth(6);
      img.setDisplaySize(opts.flyPx ?? 12, opts.flyPx ?? 12);
      this.flyer = img;
      const h = opts.flightPx ?? 40;
      scene.tweens.addCounter({
        from: 0,
        to: 1,
        duration: warnSec * 1000,
        onUpdate: (tw) => {
          const t = tw.getValue() ?? 0;
          img.setPosition(from.x + (at.x - from.x) * t, from.y + (at.y - from.y) * t - Math.sin(Math.PI * t) * h).setAngle(t * 540);
        },
      });
    }
    this.burst = opts.burst ? { ref: opts.burst, px: opts.burstPx ?? radius * 3 } : null;
  }

  private readonly burst: { ref: SpriteRef; px: number } | null;

  private touching(host: HazardHost): boolean {
    const p = host.playerPos();
    return Math.hypot(p.x - this.at.x, p.y - this.at.y) <= this.radius + host.playerRadius;
  }

  update(dt: number, host: HazardHost): boolean {
    if (this.left > 0) {
      this.left -= dt;
      this.fill.setRadius(Math.max(1, this.radius * (1 - Math.max(0, this.left) / this.warnSec)));
      if (this.left > 0) return true;
      // 터짐
      this.flyer?.destroy();
      this.art?.destroy();
      bus.emit('sfx', { id: 'explosion', size: this.radius });
      if (this.burst) playFx(host.scene, this.burst.ref, this.at.x, this.at.y, { w: this.burst.px, depth: 6 }).setBlendMode('ADD');
      if (this.touching(host)) this.strike(host);
      this.fill.setRadius(this.radius).setAlpha(this.linger > 0 ? 0.55 : 0.2);
      return this.linger > 0;
    }
    this.linger -= dt;
    this.fill.setAlpha(0.35 + 0.2 * Math.sin(this.linger * 10));
    if (!this.hit && this.touching(host)) this.strike(host);
    return this.linger > 0;
  }

  /** 맞았을 때만 디버프 (회피 무적 등으로 막히면 고인 동안 다시 판정) */
  private strike(host: HazardHost): void {
    if (this.hit) return;
    if (this.damage > 0 && !host.hurtPlayer(this.damage)) return;
    this.hit = true;
    shake(host.scene, 'light');
    this.onHit();
  }

  destroy(): void {
    this.ring.destroy();
    this.fill.destroy();
    this.art?.destroy();
    this.flyer?.destroy();
  }
}

/** 되감기: 퍼진 파편이 멈췄다가 처음 자리로 되돌아오며 지나간다 (파편마다 한 번만 맞힌다) */
export class RewindShards implements Hazard {
  private readonly shards: { sp: Phaser.GameObjects.Sprite; a: number; d: number; hit: boolean }[] = [];
  private t = 0;
  private readonly outSec: number;
  private readonly backSec: number;

  constructor(
    scene: Phaser.Scene,
    private readonly origin: Vec2,
    count: number,
    base: number,
    private readonly speed: number,
    private readonly range: number,
    private readonly freezeSec: number,
    returnSpeed: number,
    private readonly damage: number,
    ref: SpriteRef,
    px: number,
  ) {
    this.outSec = range / speed;
    this.backSec = (range * 1.15) / returnSpeed;
    for (let i = 0; i < count; i++) {
      const a = base + (i * Math.PI * 2) / count;
      const sp = scene.add.sprite(origin.x, origin.y, ref.spriteKey).setDepth(5).setRotation(a + Math.PI / 2);
      sp.setDisplaySize(px, (px * sp.height) / Math.max(1, sp.width));
      loopArt(sp, ref);
      this.shards.push({ sp, a, d: 0, hit: false });
    }
  }

  update(dt: number, host: HazardHost): boolean {
    this.t += dt;
    const freezeAt = this.outSec;
    const backAt = freezeAt + this.freezeSec;
    for (const s of this.shards) {
      if (this.t < freezeAt) s.d = this.speed * this.t;
      else if (this.t < backAt) {
        s.d = this.range;
        // 멈춘 동안 붉게 떨린다 (되감기 전조)
        s.sp.setTint(Math.sin(this.t * 40) > 0 ? 0xffffff : 0xff4a5a);
      } else {
        s.d = this.range - ((this.t - backAt) / this.backSec) * this.range * 1.15;
        s.sp.clearTint().setRotation(s.a - Math.PI / 2);
      }
      const x = this.origin.x + Math.cos(s.a) * s.d;
      const y = this.origin.y + Math.sin(s.a) * s.d;
      s.sp.setPosition(x, y);
      if (!s.hit) {
        const p = host.playerPos();
        if (Math.hypot(p.x - x, p.y - y) <= 4 + host.playerRadius) {
          s.hit = true;
          host.hurtPlayer(this.damage);
        }
      }
    }
    if (Math.abs(this.t - backAt) < dt) bus.emit('sfx', { id: 'warp' });
    return this.t < backAt + this.backSec;
  }

  destroy(): void {
    for (const s of this.shards) s.sp.destroy();
  }
}
