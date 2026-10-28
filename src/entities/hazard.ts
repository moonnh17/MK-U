/**
 * 적 쪽 위험 지대(예고 원·장판 등). 플레이어만 피해를 받는다.
 * 근접·장판 공격이라 벡터굴절역장·칼 탄 베기의 대상이 아니다.
 */
import type Phaser from 'phaser';
import type { Vec2 } from '../core/actions';
import { bounceStep } from '../systems/motion';
import type { Enemy } from './enemy';

export interface HazardHost {
  readonly scene: Phaser.Scene;
  playerPos(): Vec2;
  readonly playerRadius: number;
  /** 피해를 받았으면 true. attacker: 때린 적 (아이템 반사용) */
  hurtPlayer(amount: number, attacker?: Enemy): boolean;
}

/** 일정 간격으로 피해를 주는 지대의 공통 처리 */
class Ticker {
  private timer = 0;
  constructor(private readonly tickSec: number) {}
  /** 플레이어가 안에 있으면 간격마다 피해. 맞힐 수 있는 순간이면 true */
  tick(dt: number, inside: boolean, host: HazardHost, damage: number): void {
    this.timer -= dt;
    if (!inside || this.timer > 0) return;
    if (host.hurtPlayer(damage)) this.timer = this.tickSec;
  }
}

function flash(host: HazardHost, obj: Phaser.GameObjects.GameObject, ms = 150): void {
  host.scene.time.delayedCall(ms, () => obj.destroy());
}

/** 부채꼴 예고 → 강타 (융합악귀 할퀴기) */
export class SectorBlast implements Hazard {
  private readonly g: Phaser.GameObjects.Graphics;
  private left: number;

  constructor(
    scene: Phaser.Scene,
    private readonly at: Vec2,
    private readonly angle: number,
    private readonly radius: number,
    private readonly arcDeg: number,
    delaySec: number,
    private readonly damage: number,
    private readonly color: number,
  ) {
    this.left = delaySec;
    const half = (arcDeg * Math.PI) / 360;
    this.g = scene.add.graphics().setDepth(2);
    this.g.fillStyle(color, 0.22).slice(at.x, at.y, radius, angle - half, angle + half, false).fillPath();
    this.g.lineStyle(1, color, 0.9).slice(at.x, at.y, radius, angle - half, angle + half, false).strokePath();
  }

  update(dt: number, host: HazardHost): boolean {
    this.left -= dt;
    if (this.left > 0) return true;
    const p = host.playerPos();
    const d = Math.hypot(p.x - this.at.x, p.y - this.at.y);
    let diff = Math.atan2(p.y - this.at.y, p.x - this.at.x) - this.angle;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    if (d <= this.radius + host.playerRadius && Math.abs(diff) <= (this.arcDeg * Math.PI) / 360) host.hurtPlayer(this.damage);
    const half = (this.arcDeg * Math.PI) / 360;
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
  ) {
    this.left = liveSec;
    this.ticker = new Ticker(tickSec);
    this.c = scene.add.circle(at.x, at.y, radius, color, 0.3).setDepth(1);
  }

  update(dt: number, host: HazardHost): boolean {
    this.left -= dt;
    if (this.left <= 0) return false;
    this.c.setAlpha(Math.min(1, this.left));
    const p = host.playerPos();
    this.ticker.tick(dt, Math.hypot(p.x - this.at.x, p.y - this.at.y) <= this.radius + host.playerRadius, host, this.damage);
    return true;
  }

  destroy(): void {
    this.c.destroy();
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
}

/** 고리: 퍼지는 고리(전격 파문) · 줄어드는 고리(수축 전류) · 고정 고리(전격 감옥) */
export class Ring implements Hazard {
  private readonly g: Phaser.GameObjects.Graphics;
  private t = 0;
  private hitOnce = false;
  private readonly ticker: Ticker;

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
    this.g.clear().lineStyle(live ? s.thickness : 1, s.color, live ? 0.75 : 0.5).strokeCircle(s.center.x, s.center.y, Math.max(1, r));
    if (!live) return true;
    const p = host.playerPos();
    const inside = Math.abs(Math.hypot(p.x - s.center.x, p.y - s.center.y) - r) <= s.thickness / 2 + host.playerRadius;
    if (s.tickSec > 0) this.ticker.tick(dt, inside, host, s.damage);
    else if (inside && !this.hitOnce && host.hurtPlayer(s.damage)) this.hitOnce = true;
    return true;
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
  startAngle: number;
  telegraphSec: number;
  liveSec: number;
  damage: number;
  tickSec: number;
  color: number;
}

/** 중심에서 뻗은 줄기들이 회전 (회전 번개). 대형 레이저라 굴절·탄 베기 불가 */
export class Beams implements Hazard {
  private readonly g: Phaser.GameObjects.Graphics;
  private t = 0;
  private readonly ticker: Ticker;

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
    const base = s.startAngle + (live ? s.spin * (this.t - s.telegraphSec) : 0);
    const c = s.center();
    const p = host.playerPos();
    let inside = false;
    this.g.clear().lineStyle(live ? s.width : 1, s.color, live ? 0.8 : 0.4);
    for (let i = 0; i < s.count; i++) {
      const a = base + (i * Math.PI * 2) / s.count;
      const end = { x: c.x + Math.cos(a) * s.length, y: c.y + Math.sin(a) * s.length };
      this.g.lineBetween(c.x, c.y, end.x, end.y);
      if (segDist(p, c, end) <= s.width / 2 + host.playerRadius) inside = true;
    }
    if (live) this.ticker.tick(dt, inside, host, s.damage);
    return true;
  }

  destroy(): void {
    this.g.destroy();
  }
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 방 가장자리에서 안쪽으로 자라는 띠 (뇌전 봉쇄). 다 자란 뒤부터 피해 */
export class EdgeBand implements Hazard {
  private readonly g: Phaser.GameObjects.Graphics;
  private t = 0;
  private readonly ticker: Ticker;

  constructor(
    scene: Phaser.Scene,
    private readonly arena: Rect,
    private readonly width: number,
    private readonly growSec: number,
    private readonly liveSec: number,
    private readonly damage: number,
    tickSec: number,
    private readonly color: number,
  ) {
    this.g = scene.add.graphics().setDepth(1);
    this.ticker = new Ticker(tickSec);
  }

  update(dt: number, host: HazardHost): boolean {
    this.t += dt;
    if (this.t > this.growSec + this.liveSec) return false;
    const live = this.t >= this.growSec;
    const w = this.width * Math.min(1, this.t / this.growSec);
    const a = this.arena;
    this.g.clear().fillStyle(this.color, live ? 0.4 : 0.15);
    this.g.fillRect(a.x, a.y, a.w, w).fillRect(a.x, a.y + a.h - w, a.w, w);
    this.g.fillRect(a.x, a.y, w, a.h).fillRect(a.x + a.w - w, a.y, w, a.h);
    const p = host.playerPos();
    const r = host.playerRadius;
    const inside = p.x - r < a.x + w || p.x + r > a.x + a.w - w || p.y - r < a.y + w || p.y + r > a.y + a.h - w;
    if (live) this.ticker.tick(dt, inside, host, this.damage);
    return true;
  }

  destroy(): void {
    this.g.destroy();
  }
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
  private left: number;

  constructor(
    scene: Phaser.Scene,
    private readonly at: Vec2,
    private readonly radius: number,
    private readonly delaySec: number,
    private readonly damage: number,
    private readonly color: number,
  ) {
    this.left = delaySec;
    this.ring = scene.add.circle(at.x, at.y, radius).setStrokeStyle(1, color, 0.9).setDepth(2);
    this.fill = scene.add.circle(at.x, at.y, 1, color, 0.3).setDepth(2);
  }

  update(dt: number, host: HazardHost): boolean {
    this.left -= dt;
    this.fill.setRadius(Math.max(1, this.radius * (1 - Math.max(0, this.left) / this.delaySec)));
    if (this.left > 0) return true;
    const p = host.playerPos();
    if (Math.hypot(p.x - this.at.x, p.y - this.at.y) <= this.radius + host.playerRadius) host.hurtPlayer(this.damage);
    const flash = host.scene.add.circle(this.at.x, this.at.y, this.radius, this.color, 0.6).setDepth(6);
    host.scene.time.delayedCall(150, () => flash.destroy());
    return false;
  }

  destroy(): void {
    this.ring.destroy();
    this.fill.destroy();
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
  ) {
    this.left = delaySec;
    this.g = scene.add.graphics().setDepth(2);
  }

  update(dt: number, host: HazardHost): boolean {
    this.left -= dt;
    const r = this.rect;
    const k = 1 - Math.max(0, this.left) / this.delaySec;
    this.g.clear().lineStyle(1, this.color, 0.9).strokeRect(r.x, r.y, r.w, r.h).fillStyle(this.color, 0.1 + 0.25 * k).fillRect(r.x, r.y, r.w, r.h);
    if (this.left > 0) return true;
    const p = host.playerPos();
    const pr = host.playerRadius;
    if (p.x + pr >= r.x && p.x - pr <= r.x + r.w && p.y + pr >= r.y && p.y - pr <= r.y + r.h) host.hurtPlayer(this.damage);
    const flash = host.scene.add.rectangle(r.x + r.w / 2, r.y + r.h / 2, r.w, r.h, this.color, 0.6).setDepth(6);
    host.scene.time.delayedCall(150, () => flash.destroy());
    return false;
  }

  destroy(): void {
    this.g.destroy();
  }
}
