/**
 * 적 쪽 위험 지대(예고 원·장판 등). 플레이어만 피해를 받는다.
 * 근접·장판 공격이라 벡터굴절역장·칼 탄 베기의 대상이 아니다.
 */
import { bus } from '../core/events';
import { shake } from './juice';
import type Phaser from 'phaser';
import type { Vec2 } from '../core/actions';
import { loopArt, playFx } from '../skills/skillFx';
import { inGap } from '../systems/bossGeometry';
import type { SpriteRef } from '../types/data';
import { bounceStep } from '../systems/motion';
import type { Enemy } from './enemy';
import type { Rng } from '../core/rng';

export interface HazardHost {
  readonly scene: Phaser.Scene;
  playerPos(): Vec2;
  readonly playerRadius: number;
  /** 피해를 받았으면 true. attacker: 때린 적 (아이템 반사용) */
  /** mental: 정신 피해. 없으면 attacker의 mentalRatio로 정한다 */
  hurtPlayer(amount: number, attacker?: Enemy, mental?: number): boolean;
}

/** 일정 간격으로 피해를 주는 지대의 공통 처리 */
class Ticker {
  private timer = 0;
  constructor(private readonly tickSec: number) {}
  /** 플레이어가 안에 있으면 간격마다 피해. 맞혔으면 true */
  tick(dt: number, inside: boolean, host: HazardHost, damage: number, mental?: number): boolean {
    this.timer -= dt;
    if (!inside || this.timer > 0) return false;
    if (!host.hurtPlayer(damage, undefined, mental)) return false;
    this.timer = this.tickSec;
    return true;
  }
}

function flash(host: HazardHost, obj: Phaser.GameObjects.GameObject, ms = 150): void {
  host.scene.time.delayedCall(ms, () => obj.destroy());
}

/** 부채꼴 예고 → 강타 (융합악귀 할퀴기) */
export class SectorBlast implements Hazard {
  private readonly g: Phaser.GameObjects.Graphics;
  private left: number;
  private readonly delaySec: number;

  constructor(
    scene: Phaser.Scene,
    private readonly at: Vec2,
    private readonly angle: number,
    private readonly radius: number,
    private readonly arcDeg: number,
    delaySec: number,
    private readonly damage: number,
    private readonly color: number,
    private readonly hitArt?: SpriteRef,
  ) {
    this.left = delaySec;
    this.delaySec = Math.max(0.01, delaySec);
    this.g = scene.add.graphics().setDepth(2);
    this.draw();
  }

  /** 예고: 테두리는 처음부터, 안쪽은 칠 때까지 중심에서 차오른다 */
  private draw(): void {
    const half = (this.arcDeg * Math.PI) / 360;
    const k = 1 - Math.max(0, this.left) / this.delaySec;
    const { at, angle, radius, color } = this;
    this.g.clear();
    this.g.fillStyle(color, 0.12).slice(at.x, at.y, radius, angle - half, angle + half, false).fillPath();
    this.g.fillStyle(color, 0.18 + 0.12 * k).slice(at.x, at.y, Math.max(1, radius * k), angle - half, angle + half, false).fillPath();
    this.g.lineStyle(1, color, 0.6 + 0.4 * k).slice(at.x, at.y, radius, angle - half, angle + half, false).strokePath();
  }

  update(dt: number, host: HazardHost): boolean {
    this.left -= dt;
    if (this.left > 0) {
      this.draw();
      return true;
    }
    const p = host.playerPos();
    const d = Math.hypot(p.x - this.at.x, p.y - this.at.y);
    let diff = Math.atan2(p.y - this.at.y, p.x - this.at.x) - this.angle;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    if (d <= this.radius + host.playerRadius && Math.abs(diff) <= (this.arcDeg * Math.PI) / 360) host.hurtPlayer(this.damage);
    const half = (this.arcDeg * Math.PI) / 360;
    bus.emit('sfx', { id: 'bossSlam' });
    if (this.hitArt) {
      const mid = this.radius * 0.55;
      playFx(host.scene, this.hitArt, this.at.x + Math.cos(this.angle) * mid, this.at.y + Math.sin(this.angle) * mid, { w: this.radius * 1.3, rotation: this.angle });
      return false;
    }
    const f = host.scene.add.graphics().setDepth(6);
    f.fillStyle(this.color, 0.6).slice(this.at.x, this.at.y, this.radius, this.angle - half, this.angle + half, false).fillPath();
    flash(host, f);
    return false;
  }

  destroy(): void {
    this.g.destroy();
  }
}

/** 남아서 간격마다 피해를 주는 원 (원혼 돌진의 마기 영역) */
export class Zone implements Hazard {
  private readonly c: Phaser.GameObjects.Arc;
  private readonly art: Phaser.GameObjects.Sprite | null = null;
  private readonly ticker: Ticker;
  private left: number;

  constructor(
    scene: Phaser.Scene,
    private readonly at: Vec2,
    private readonly radius: number,
    liveSec: number,
    private readonly damage: number,
    tickSec: number,
    color: number,
    private readonly mental = 0,
    /** 이 시간 동안은 흐린 예고만 (피해 없음) */
    private delaySec = 0,
    art?: SpriteRef,
  ) {
    this.left = liveSec;
    this.ticker = new Ticker(tickSec);
    this.c = scene.add.circle(at.x, at.y, radius, color, art ? 0.12 : 0.3).setDepth(1);
    if (art) {
      this.art = scene.add.sprite(at.x, at.y, art.spriteKey).setDepth(1).setDisplaySize(radius * 2.4, radius * 2.4);
      loopArt(this.art, art);
    }
  }

  update(dt: number, host: HazardHost): boolean {
    if (this.delaySec > 0) {
      this.delaySec -= dt;
      this.c.setAlpha(0.35);
      this.art?.setAlpha(0.35);
      return true;
    }
    this.left -= dt;
    if (this.left <= 0) return false;
    this.c.setAlpha(Math.min(1, this.left));
    this.art?.setAlpha(Math.min(1, this.left));
    const p = host.playerPos();
    this.ticker.tick(dt, Math.hypot(p.x - this.at.x, p.y - this.at.y) <= this.radius + host.playerRadius, host, this.damage, this.mental);
    return true;
  }

  destroy(): void {
    this.c.destroy();
    this.art?.destroy();
  }
}

export interface RingSpec {
  center: Vec2;
  fromR: number;
  toR: number;
  /** 반지름이 fromR → toR로 바뀌는 시간 (0이면 고정) */
  moveSec: number;
  /** 예고(피해 없음) */
  telegraphSec: number;
  /** 움직임이 끝난 뒤 남아 있는 시간 */
  holdSec: number;
  thickness: number;
  damage: number;
  /** 0이면 한 번만 맞힌다 */
  tickSec: number;
  color: number;
  /** 통과할 수 있는 틈: 중심 각도와 벌어진 정도 */
  gapAngle?: number;
  gapDeg?: number;
  /** 번개 고리: 지글거리는 번개 선 + 빛 번짐 + 튀는 불티 (판정은 그대로) */
  bolt?: { rng: Rng; color: number };
  /** 지진 고리: 갈라진 땅 띠 + 빛나는 균열 + 앞머리에서 솟구치는 바위·먼지 (판정은 그대로) */
  quake?: { rng: Rng; color: number; bits: SpriteRef[] };
}

/** 고리: 퍼지는 고리(충격파) · 줄어드는 고리(수축 전류) · 고정 고리(전격 감옥). 틈이 있으면 그 각도는 지나갈 수 있다 */
export class Ring implements Hazard {
  private readonly g: Phaser.GameObjects.Graphics;
  private t = 0;
  private hitOnce = false;
  private readonly ticker: Ticker;
  /** 번개 고리: 꺾임 오프셋(각 점의 반지름 흔들림)을 잠깐씩 유지해 너무 떨리지 않게 */
  private jitter: number[] = [];
  private jitterLeft = 0;
  private sparkLeft = 0;
  /** 지진 고리: 각도마다 정해진 균열 모양 (퍼져도 같은 금이 따라간다) */
  private crack: number[] = [];

  constructor(
    scene: Phaser.Scene,
    private readonly s: RingSpec,
  ) {
    this.g = scene.add.graphics().setDepth(2);
    this.ticker = new Ticker(s.tickSec);
  }

  private radius(): number {
    const s = this.s;
    const m = this.t - s.telegraphSec;
    if (s.moveSec <= 0 || m <= 0) return m <= 0 ? s.fromR : s.toR;
    return s.fromR + (s.toR - s.fromR) * Math.min(1, m / s.moveSec);
  }

  update(dt: number, host: HazardHost): boolean {
    const s = this.s;
    this.t += dt;
    if (this.t > s.telegraphSec + s.moveSec + s.holdSec) return false;
    const r = this.radius();
    const live = this.t >= s.telegraphSec;
    const gapHalf = ((s.gapDeg ?? 0) * Math.PI) / 360;
    if (s.bolt) this.drawBolt(dt, host, r, live, gapHalf);
    else if (s.quake) this.drawQuake(dt, host, r, live, gapHalf);
    else if (gapHalf > 0) {
      this.g.clear().lineStyle(live ? s.thickness : 1, s.color, live ? 0.75 : 0.5);
      this.g.beginPath();
      this.g.arc(s.center.x, s.center.y, Math.max(1, r), s.gapAngle! + gapHalf, s.gapAngle! - gapHalf + Math.PI * 2, false);
      this.g.strokePath();
    } else this.g.clear().lineStyle(live ? s.thickness : 1, s.color, live ? 0.75 : 0.5).strokeCircle(s.center.x, s.center.y, Math.max(1, r));
    if (!live) return true;
    const p = host.playerPos();
    const onLine = Math.abs(Math.hypot(p.x - s.center.x, p.y - s.center.y) - r) <= s.thickness / 2 + host.playerRadius;
    const inside = onLine && !(gapHalf > 0 && inGap(Math.atan2(p.y - s.center.y, p.x - s.center.x), s.gapAngle!, s.gapDeg!));
    if (s.tickSec > 0) this.ticker.tick(dt, inside, host, s.damage);
    else if (inside && !this.hitOnce && host.hurtPlayer(s.damage)) this.hitOnce = true;
    return true;
  }

  /** 지진 고리: 빛 번짐 → 검은 지각 띠 → 빛나는 균열(흰 심) → 틈 양끝 빛기둥, 켜진 동안 앞머리에서 바위·결정이 튀고 먼지가 인다 */
  private drawQuake(dt: number, host: HazardHost, r: number, live: boolean, gapHalf: number): void {
    const s = this.s;
    const q = s.quake!;
    const c = s.center;
    const rr = Math.max(1, r);
    const from = gapHalf > 0 ? s.gapAngle! + gapHalf : 0;
    const span = Math.PI * 2 - gapHalf * 2;
    const N = 96;
    if (this.crack.length === 0) this.crack = Array.from({ length: N }, () => q.rng.range(-1, 1));
    const n = Math.max(12, Math.round((rr * span) / 6));
    const TAU = Math.PI * 2;
    const line = (amp: number) =>
      Array.from({ length: n + 1 }, (_, i) => {
        const a = from + (span * i) / n;
        const j = this.crack[Math.floor((((a % TAU) + TAU) % TAU) / TAU * N) % N]!;
        const rad = rr + j * amp;
        return { x: c.x + Math.cos(a) * rad, y: c.y + Math.sin(a) * rad };
      });
    const g = this.g.clear();
    if (!live) {
      g.lineStyle(1, q.color, 0.45).strokePoints(line(2));
      return;
    }
    const th = s.thickness;
    g.lineStyle(th + 16, q.color, 0.16);
    g.beginPath();
    g.arc(c.x, c.y, rr, from, from + span, false);
    g.strokePath();
    // 솟아오른 지각: 회갈색 바위 띠 + 바깥 모서리 밝은 선
    g.lineStyle(th * 1.5, 0x4a3c46, 0.95).strokePoints(line(th * 0.3));
    g.lineStyle(1, 0x9a8a96, 0.8).strokePoints(line(th * 0.3).map((p) => ({ x: c.x + (p.x - c.x) * (1 + (th * 0.7) / rr), y: c.y + (p.y - c.y) * (1 + (th * 0.7) / rr) })));
    const crack = line(th * 0.6);
    g.lineStyle(Math.max(3, th * 0.45), q.color, 0.95).strokePoints(crack);
    g.lineStyle(1, 0xffe8ff, 0.95).strokePoints(crack);
    if (gapHalf > 0) {
      for (const a of [from, from + span]) {
        const x = c.x + Math.cos(a) * rr;
        const y = c.y + Math.sin(a) * rr;
        g.fillStyle(q.color, 0.85).fillCircle(x, y, th * 0.45 + 2);
        g.fillStyle(0xffffff, 0.9).fillCircle(x, y, 1.5);
      }
    }
    this.sparkLeft -= dt;
    if (this.sparkLeft > 0) return;
    this.sparkLeft = 0.03;
    const scene = host.scene;
    for (let i = 0; i < 4; i++) {
      const a = from + q.rng.range(0, span);
      const x = c.x + Math.cos(a) * rr;
      const y = c.y + Math.sin(a) * rr;
      // 먼지
      const dust = scene.add.circle(x, y, 3, 0xb0a090, 0.4).setDepth(2.5);
      scene.tweens.add({ targets: dust, scale: 2.3, alpha: 0, y: y - 6, duration: 420, ease: 'Quad.easeOut', onComplete: () => dust.destroy() });
      // 균열에서 솟는 마기 불티
      const sp = scene.add.rectangle(x, y, 1, q.rng.range(4, 8), i % 2 ? 0xffffff : q.color).setDepth(6).setBlendMode('ADD');
      scene.tweens.add({ targets: sp, y: y - q.rng.range(10, 22), alpha: 0, duration: 320, ease: 'Cubic.easeOut', onComplete: () => sp.destroy() });
      if (i > 1 || q.bits.length === 0) continue;
      // 바위·결정 조각이 앞머리에서 튀어 오른다
      const ref = q.rng.pick(q.bits);
      const rock = scene.add.sprite(x, y, ref.spriteKey).setDepth(5);
      const size = q.rng.range(7, 12);
      rock.setDisplaySize(size, (size * rock.height) / Math.max(1, rock.width));
      const out = q.rng.range(4, 14);
      const tx = x + Math.cos(a) * out;
      const ty = y + Math.sin(a) * out;
      const h = q.rng.range(14, 26);
      const spin = q.rng.range(-8, 8);
      scene.tweens.addCounter({
        from: 0,
        to: 1,
        duration: 380,
        onUpdate: (tw) => {
          const k = tw.getValue() ?? 0;
          rock.setPosition(x + (tx - x) * k, y + (ty - y) * k - h * 4 * k * (1 - k)).setRotation(k * spin).setAlpha(k > 0.7 ? (1 - k) / 0.3 : 1);
        },
        onComplete: () => rock.destroy(),
      });
    }
  }

  /** 번개 고리: 빛 번짐 → 지글거리는 번개 두 겹(색·흰 심) → 틈 양끝 빛 마디, 켜진 동안 고리에서 불티가 튄다 */
  private drawBolt(dt: number, host: HazardHost, r: number, live: boolean, gapHalf: number): void {
    const s = this.s;
    const b = s.bolt!;
    const c = s.center;
    const rr = Math.max(1, r);
    const from = gapHalf > 0 ? s.gapAngle! + gapHalf : 0;
    const span = Math.PI * 2 - gapHalf * 2;
    const n = Math.max(8, Math.round((rr * span) / 7));
    this.jitterLeft -= dt;
    if (this.jitterLeft <= 0 || this.jitter.length !== n + 1) {
      this.jitterLeft = 0.05;
      this.jitter = Array.from({ length: n + 1 }, (_, i) => (i === 0 || i === n ? 0 : b.rng.range(-1, 1)));
    }
    const amp = live ? Math.max(2, s.thickness * 0.6) : 1.5;
    const pts = this.jitter.map((j, i) => {
      const a = from + (span * i) / n;
      const rad = rr + j * amp;
      return { x: c.x + Math.cos(a) * rad, y: c.y + Math.sin(a) * rad };
    });
    const g = this.g.clear();
    if (!live) {
      // 예고: 흐린 번개 선
      g.lineStyle(1, b.color, 0.35 + 0.25 * Math.sin(this.t * 30)).strokePoints(pts);
      return;
    }
    g.lineStyle(s.thickness + 6, b.color, 0.12);
    g.beginPath();
    g.arc(c.x, c.y, rr, from, from + span, false);
    g.strokePath();
    g.lineStyle(Math.max(2, s.thickness * 0.6), b.color, 0.85).strokePoints(pts);
    g.lineStyle(1, 0xffffff, 0.95).strokePoints(pts);
    if (gapHalf > 0) {
      for (const a of [from, from + span]) g.fillStyle(0xffffff, 0.9).fillCircle(c.x + Math.cos(a) * rr, c.y + Math.sin(a) * rr, 2.5);
    }
    this.sparkLeft -= dt;
    if (this.sparkLeft > 0) return;
    this.sparkLeft = 0.04;
    for (let i = 0; i < 4; i++) {
      const a = from + b.rng.range(0, span);
      const x = c.x + Math.cos(a) * rr;
      const y = c.y + Math.sin(a) * rr;
      const out = b.rng.chance(0.5) ? 1 : -1;
      const d = b.rng.range(10, 26) * out;
      const sp = host.scene.add.rectangle(x, y, b.rng.range(5, 10), 1, i % 2 === 0 ? 0xffffff : b.color).setDepth(6).setRotation(a).setBlendMode('ADD');
      host.scene.tweens.add({ targets: sp, x: x + Math.cos(a) * d, y: y + Math.sin(a) * d, alpha: 0, scaleX: 0.3, duration: 280, ease: 'Cubic.easeOut', onComplete: () => sp.destroy() });
    }
  }

  destroy(): void {
    this.g.destroy();
  }
}

/** 점과 선분 사이 거리 */
function segDist(p: Vec2, a: Vec2, b: Vec2): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t));
}

export interface BeamsSpec {
  center: () => Vec2;
  count: number;
  length: number;
  width: number;
  /** 회전 속도(rad/s) */
  spin: number;
  /** 켜진 뒤 이 시간이 지나야 돌기 시작한다 */
  spinDelaySec?: number;
  startAngle: number;
  telegraphSec: number;
  liveSec: number;
  damage: number;
  /** 정신 피해 */
  mental?: number;
  tickSec: number;
  color: number;
  /** 플레이어를 맞혔을 때 (위압) */
  onHit?: () => void;
  /** 켜진 광선 그림과 예고 그림 (길이·굵기에 맞춰 늘린다) */
  art?: SpriteRef;
  warnArt?: SpriteRef;
  /** 번개 광선: 예고선이 지글거리는 번개로 그려진다 */
  bolt?: { rng: Rng; color: number };
}

/** 광선 그림이 판정 굵기보다 이만큼 굵게 보인다 (빛 번짐) */
const BEAM_ART_WIDTH = 2.4;

/** 중심에서 뻗은 줄기들이 회전 (회전 번개). 대형 레이저라 굴절·탄 베기 불가 */
export class Beams implements Hazard {
  private readonly g: Phaser.GameObjects.Graphics;
  private t = 0;
  private readonly ticker: Ticker;
  private sprites: Phaser.GameObjects.Sprite[] = [];
  private spriteRef: SpriteRef | null = null;

  constructor(
    scene: Phaser.Scene,
    private readonly s: BeamsSpec,
  ) {
    this.g = scene.add.graphics().setDepth(2);
    this.ticker = new Ticker(s.tickSec);
  }

  update(dt: number, host: HazardHost): boolean {
    const s = this.s;
    this.t += dt;
    if (this.t > s.telegraphSec + s.liveSec) return false;
    const live = this.t >= s.telegraphSec;
    const base = s.startAngle + s.spin * Math.max(0, this.t - s.telegraphSec - (s.spinDelaySec ?? 0));
    const c = s.center();
    const p = host.playerPos();
    let inside = false;
    const art = live ? s.art : s.warnArt;
    this.setSprites(host, art ?? null);
    // 예고(그림 없음): 굵기만큼 흐린 띠가 칠 때까지 진해지고, 가운데 선이 맥박치며 밝아진다
    const k = live ? 1 : Math.min(1, this.t / Math.max(0.01, s.telegraphSec));
    const warnPlain = !live && !art;
    this.g.clear().lineStyle(live ? s.width : 1, s.color, art ? 0.25 : live ? 0.8 : 0.4 + 0.5 * k * (0.7 + 0.3 * Math.sin(this.t * 40)));
    for (let i = 0; i < s.count; i++) {
      const a = base + (i * Math.PI * 2) / s.count;
      const end = { x: c.x + Math.cos(a) * s.length, y: c.y + Math.sin(a) * s.length };
      if (warnPlain) {
        this.g.lineStyle(s.width, s.color, 0.06 + 0.16 * k).lineBetween(c.x, c.y, end.x, end.y);
        this.g.lineStyle(1, k > 0.75 ? 0xffffff : s.color, 0.4 + 0.5 * k * (0.7 + 0.3 * Math.sin(this.t * 40)));
      }
      if (warnPlain && s.bolt) {
        const n = Math.max(6, Math.round(s.length / 14));
        const nx = -Math.sin(a);
        const ny = Math.cos(a);
        const pts = Array.from({ length: n + 1 }, (_, j) => {
          const off = j === 0 || j === n ? 0 : s.bolt!.rng.range(-1, 1) * s.width * 0.45;
          return { x: c.x + ((end.x - c.x) * j) / n + nx * off, y: c.y + ((end.y - c.y) * j) / n + ny * off };
        });
        this.g.strokePoints(pts);
      } else this.g.lineBetween(c.x, c.y, end.x, end.y);
      this.sprites[i]?.setPosition(c.x, c.y).setRotation(a).setDisplaySize(s.length, live ? s.width * BEAM_ART_WIDTH : s.width);
      if (segDist(p, c, end) <= s.width / 2 + host.playerRadius) inside = true;
    }
    if (live && this.ticker.tick(dt, inside, host, s.damage, s.mental)) s.onHit?.();
    return true;
  }

  private setSprites(host: HazardHost, ref: SpriteRef | null): void {
    if (ref === this.spriteRef) return;
    this.spriteRef = ref;
    for (const sp of this.sprites) sp.destroy();
    this.sprites = ref
      ? Array.from({ length: this.s.count }, () => {
          const sp = host.scene.add.sprite(0, 0, ref.spriteKey).setOrigin(0, 0.5).setDepth(3);
          loopArt(sp, ref);
          return sp;
        })
      : [];
  }

  destroy(): void {
    this.g.destroy();
    for (const sp of this.sprites) sp.destroy();
  }
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
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
  private readonly warn: Phaser.GameObjects.Sprite | null = null;
  private left: number;

  constructor(
    scene: Phaser.Scene,
    private readonly at: Vec2,
    private readonly radius: number,
    private readonly delaySec: number,
    private readonly damage: number,
    private readonly color: number,
    private readonly art?: { warn?: SpriteRef; hit?: SpriteRef },
  ) {
    this.left = delaySec;
    this.ring = scene.add.circle(at.x, at.y, radius).setStrokeStyle(1, color, 0.9).setDepth(2);
    this.fill = scene.add.circle(at.x, at.y, 1, color, 0.3).setDepth(2);
    if (art?.warn) {
      this.warn = scene.add.sprite(at.x, at.y, art.warn.spriteKey).setDepth(2).setAlpha(0.6);
      this.warn.setDisplaySize(radius * 2, (radius * 2 * this.warn.height) / Math.max(1, this.warn.width));
      loopArt(this.warn, art.warn);
    }
  }

  update(dt: number, host: HazardHost): boolean {
    this.left -= dt;
    this.fill.setRadius(Math.max(1, this.radius * (1 - Math.max(0, this.left) / this.delaySec)));
    if (this.left > 0) return true;
    const p = host.playerPos();
    if (Math.hypot(p.x - this.at.x, p.y - this.at.y) <= this.radius + host.playerRadius) host.hurtPlayer(this.damage);
    bus.emit('sfx', { id: 'explosion', size: this.radius });
    if (this.art?.hit) {
      playFx(host.scene, this.art.hit, this.at.x, this.at.y, { w: this.radius * 2.4 });
      return false;
    }
    const flash = host.scene.add.circle(this.at.x, this.at.y, this.radius, this.color, 0.6).setDepth(6);
    host.scene.time.delayedCall(150, () => flash.destroy());
    return false;
  }

  destroy(): void {
    this.ring.destroy();
    this.fill.destroy();
    this.warn?.destroy();
  }
}

/** 방 벽에 bounces번 튕기는 원반 (성전사 방패 투척). 닿으면 피해, 튕김을 다 쓰면 사라진다 */
export class BouncingDisc implements Hazard {
  private readonly img: Phaser.GameObjects.Arc;
  private pos: Vec2;
  private vel: Vec2;
  private left: number;
  private life: number;

  constructor(
    scene: Phaser.Scene,
    from: Vec2,
    angle: number,
    speed: number,
    private readonly arena: Rect,
    bounces: number,
    private readonly radius: number,
    private readonly damage: number,
    maxSec: number,
    color: number,
  ) {
    this.pos = { ...from };
    this.vel = { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed };
    this.left = bounces;
    this.life = maxSec;
    this.img = scene.add.circle(from.x, from.y, radius, color, 0.9).setStrokeStyle(1, 0xffffff, 0.8).setDepth(5);
  }

  update(dt: number, host: HazardHost): boolean {
    this.life -= dt;
    const r = bounceStep(this.pos, this.vel, dt, this.arena, this.radius);
    this.pos = r.pos;
    this.vel = r.vel;
    this.left -= r.bounces;
    this.img.setPosition(this.pos.x, this.pos.y).setRotation(this.img.rotation + dt * 12);
    const p = host.playerPos();
    if (Math.hypot(p.x - this.pos.x, p.y - this.pos.y) <= this.radius + host.playerRadius) host.hurtPlayer(this.damage);
    return this.left >= 0 && this.life > 0;
  }

  destroy(): void {
    this.img.destroy();
  }
}

/** 사각형 예고 → 한 번 강타 (마기골렘 종말의 단층: 방을 가로지르는 띠) */
export class RectBlast implements Hazard {
  private readonly g: Phaser.GameObjects.Graphics;
  private left: number;

  constructor(
    scene: Phaser.Scene,
    private readonly rect: Rect,
    private readonly delaySec: number,
    private readonly damage: number,
    private readonly color: number,
    private readonly hitArt?: SpriteRef,
    /** 번개 띠: 예고 동안 띠 가운데로 번개가 지글거리며 점점 밝아진다 */
    private readonly bolt?: { rng: Rng; color: number },
  ) {
    this.left = delaySec;
    this.g = scene.add.graphics().setDepth(2);
  }

  update(dt: number, host: HazardHost): boolean {
    this.left -= dt;
    const r = this.rect;
    const k = 1 - Math.max(0, this.left) / this.delaySec;
    this.g.clear().lineStyle(1, this.color, 0.9).strokeRect(r.x, r.y, r.w, r.h).fillStyle(this.color, 0.1 + 0.25 * k).fillRect(r.x, r.y, r.w, r.h);
    if (this.bolt && this.left > 0) {
      const vertical = r.h > r.w;
      const len = vertical ? r.h : r.w;
      const n = Math.max(4, Math.round(len / 9));
      const amp = (vertical ? r.w : r.h) * 0.35;
      const pts = Array.from({ length: n + 1 }, (_, i) => {
        const j = i === 0 || i === n ? 0 : this.bolt!.rng.range(-1, 1) * amp;
        return vertical ? { x: r.x + r.w / 2 + j, y: r.y + (r.h * i) / n } : { x: r.x + (r.w * i) / n, y: r.y + r.h / 2 + j };
      });
      this.g.lineStyle(1, k > 0.6 ? 0xffffff : this.bolt.color, 0.25 + 0.6 * k).strokePoints(pts);
    }
    if (this.left > 0) return true;
    const p = host.playerPos();
    const pr = host.playerRadius;
    if (p.x + pr >= r.x && p.x - pr <= r.x + r.w && p.y + pr >= r.y && p.y - pr <= r.y + r.h) host.hurtPlayer(this.damage);
    bus.emit('sfx', { id: 'explosion', size: Math.max(r.w, r.h) / 2 });
    if (this.hitArt) playFx(host.scene, this.hitArt, r.x + r.w / 2, r.y + r.h / 2, { w: r.w * 1.3, h: r.h, grow: 1 });
    const flash = host.scene.add.rectangle(r.x + r.w / 2, r.y + r.h / 2, r.w, r.h, this.color, this.hitArt ? 0.25 : 0.6).setDepth(6);
    host.scene.time.delayedCall(150, () => flash.destroy());
    return false;
  }

  destroy(): void {
    this.g.destroy();
  }
}

/** 플레이어를 따라오는 그림자 원이 멈춘 뒤 그 자리에서 터진다 (식광 그림자 추적). followSec은 전체 시간 */
export class FollowBlast implements Hazard {
  private readonly ring: Phaser.GameObjects.Arc;
  private readonly fill: Phaser.GameObjects.Arc;
  private readonly mark: Phaser.GameObjects.Sprite | null = null;
  private locked = false;
  private pos: Vec2;
  private left: number;

  constructor(
    scene: Phaser.Scene,
    from: Vec2,
    private readonly radius: number,
    private readonly speed: number,
    private readonly followSec: number,
    private readonly damage: number,
    private readonly color: number,
    /** 터지기 전 이 시간은 자리에 고정된다 */
    private readonly lockSec = 0,
    private readonly art?: { track?: SpriteRef; lock?: SpriteRef; hit?: SpriteRef },
  ) {
    this.pos = { ...from };
    this.left = followSec;
    this.ring = scene.add.circle(from.x, from.y, radius).setStrokeStyle(1, color, 0.9).setDepth(2);
    this.fill = scene.add.circle(from.x, from.y, radius, color, 0.15).setDepth(2);
    if (art?.track) {
      this.mark = scene.add.sprite(from.x, from.y, art.track.spriteKey).setDepth(2).setDisplaySize(radius * 2.2, radius * 2.2);
      loopArt(this.mark, art.track);
    }
  }

  update(dt: number, host: HazardHost): boolean {
    this.left -= dt;
    const p = host.playerPos();
    const dx = p.x - this.pos.x;
    const dy = p.y - this.pos.y;
    const d = Math.hypot(dx, dy);
    const step = Math.min(d, this.speed * dt);
    if (d > 0 && this.left > this.lockSec) this.pos = { x: this.pos.x + (dx / d) * step, y: this.pos.y + (dy / d) * step };
    this.ring.setPosition(this.pos.x, this.pos.y);
    this.fill.setPosition(this.pos.x, this.pos.y).setAlpha(0.15 + 0.45 * (1 - Math.max(0, this.left) / this.followSec));
    this.mark?.setPosition(this.pos.x, this.pos.y);
    if (!this.locked && this.left <= this.lockSec) {
      this.locked = true;
      if (this.art?.lock && this.mark) {
        this.mark.anims.stop();
        this.mark.setTexture(this.art.lock.spriteKey, 0).setDisplaySize(this.radius * 2.2, this.radius * 2.2);
      }
    }
    if (this.left > 0) return true;
    if (Math.hypot(p.x - this.pos.x, p.y - this.pos.y) <= this.radius + host.playerRadius) host.hurtPlayer(this.damage);
    bus.emit('sfx', { id: 'explosion', size: this.radius });
    if (this.art?.hit) playFx(host.scene, this.art.hit, this.pos.x, this.pos.y, { w: this.radius * 2.4 });
    else flash(host, host.scene.add.circle(this.pos.x, this.pos.y, this.radius, this.color, 0.6).setDepth(6));
    return false;
  }

  destroy(): void {
    this.ring.destroy();
    this.fill.destroy();
    this.mark?.destroy();
  }
}

/** 방 전체 예고 → 안전지대 몇 곳 밖이면 큰 피해 (마기카이저 종말 명령) */
export class SafeZoneBlast implements Hazard {
  private readonly g: Phaser.GameObjects.Graphics;
  private safeMarks: Phaser.GameObjects.Sprite[] = [];
  private left: number;

  constructor(
    scene: Phaser.Scene,
    private readonly arena: Rect,
    private readonly safe: readonly Vec2[],
    private readonly safeRadius: number,
    private readonly delaySec: number,
    private readonly damage: number,
    private readonly color: number,
    private readonly art?: { safe?: SpriteRef; hit?: SpriteRef },
  ) {
    this.left = delaySec;
    this.g = scene.add.graphics().setDepth(2);
    if (art?.safe) this.safeMarks = safe.map((s) => scene.add.sprite(s.x, s.y, art.safe!.spriteKey).setDepth(2).setAlpha(0.8).setDisplaySize(safeRadius * 2.3, safeRadius * 2.3));
  }

  update(dt: number, host: HazardHost): boolean {
    this.left -= dt;
    const a = this.arena;
    const k = 1 - Math.max(0, this.left) / this.delaySec;
    this.g.clear().fillStyle(this.color, 0.1 + 0.3 * k).fillRect(a.x, a.y, a.w, a.h);
    for (const s of this.safe) {
      this.g.fillStyle(0xffffff, 0.25).fillCircle(s.x, s.y, this.safeRadius);
      this.g.lineStyle(2, 0xffffff, 0.9).strokeCircle(s.x, s.y, this.safeRadius);
    }
    if (this.left > 0) return true;
    const p = host.playerPos();
    const safe = this.safe.some((s) => Math.hypot(p.x - s.x, p.y - s.y) + host.playerRadius <= this.safeRadius);
    if (!safe) host.hurtPlayer(this.damage);
    const f = host.scene.add.rectangle(a.x + a.w / 2, a.y + a.h / 2, a.w, a.h, this.color, this.art?.hit ? 0.3 : 0.6).setDepth(6);
    flash(host, f, 250);
    if (this.art?.hit) playFx(host.scene, this.art.hit, a.x + a.w / 2, a.y + a.h / 2, { w: a.w, fadeSec: 0.45 });
    shake(host.scene, 'medium');
    return false;
  }

  destroy(): void {
    this.g.destroy();
    for (const m of this.safeMarks) m.destroy();
  }
}
