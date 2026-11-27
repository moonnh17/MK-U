/** 패턴 바탕(시간표·채널링·돌진)과 공통 도구 */
import { bus } from '../../core/events';
import { shake } from '../../entities/juice';
import type { Vec2 } from '../../core/actions';
import { DelayedBlast, Beams, RectBlast, Ring, SafeZoneBlast, Zone } from '../../entities/hazard';
import type { Rect } from '../../entities/hazard';
import { gapBulletAngles, predictPoint } from '../../systems/bossGeometry';
import { playFx } from '../../skills/skillFx';
import type { SpriteRef } from '../../types/data';
import type { BossHost, PatternRun } from '../host';
import { burst, coil, crackle, easeOut, land, lob, motes, shockRing, sparkAround } from '../bossFx';
import type Phaser from 'phaser';

/** 패턴이 다루는 보스 */
export interface BossBody {
  pos(): Vec2;
  radius(): number;
  setVelocity(x: number, y: number): void;
  /** 이번 프레임에 벽에 막혔는지 */
  blocked(): boolean;
  /** 순간이동 */
  teleport(x: number, y: number): void;
  setAlpha(a: number): void;
  /** 몸짓: 가로·세로 배율과 기울기(rad, +는 시계 방향). 패턴이 끝나면 컨트롤러가 되돌린다 */
  shape(sx: number, sy: number, lean: number): void;
  /** sec 동안 피해를 받지 않는다 (공중에 뜬 동안 등) */
  invuln?(sec: number): void;
  /** 지금 모습 그대로 잔상을 남긴다 (보스 색으로 빛나며 사라짐) */
  ghost(alpha: number, sec: number): void;
  color: number;
  /** 이펙트 그림의 색 (불티·충격파·잔상). 그림이 없으면 color */
  fxColor: number;
}

export interface PatternCtx {
  boss: BossBody;
  host: BossHost;
  /** 수치 (강화 단계면 `키Enraged` 우선, 피해는 챕터 배율·자기 강화 반영) */
  v(key: string): number;
  /** 자기 강화 (전장의 함성): sec 동안 피해 ×damageMul, 이동 ×speedMul */
  buff(sec: number, damageMul: number, speedMul: number): void;
  /** 분신 소환 (수치는 'clones' 패턴 values) */
  summonClones(): void;
  /** 이 패턴이 부를 적 (데이터의 summon) */
  summonId?: string;
  /** 적 무리 소환 (보상 없음). free가 아니면 살아 있는 동안 이 패턴은 다시 쓰지 않는다 */
  summon(enemyIds: readonly string[], free?: boolean): void;
  /** 이펙트 그림 (없으면 도형) */
  art(slot: string): SpriteRef | undefined;
  /** 지금 살아 있는 이 보스의 소환수 수 */
  minionCount(enemyId: string): number;
  /** 핵 노출: sec 동안 멈추고 받는 피해 ×mul */
  expose(sec: number, mul: number): void;
  /** 지나갈 수 없는 잔해 (개수 상한·갇힘 방지는 컨트롤러가) */
  rubble(at: Vec2, radius: number): void;
}

/** 시간표대로 일을 하는 패턴 바탕 */
export abstract class Timed implements PatternRun {
  protected t = 0;
  private readonly steps: { at: number; fn: () => void; done: boolean }[] = [];
  constructor(protected readonly c: PatternCtx) {
    c.boss.setVelocity(0, 0);
  }
  protected at(sec: number, fn: () => void): void {
    this.steps.push({ at: sec, fn, done: false });
  }
  update(dt: number): void {
    this.t += dt;
    for (const s of this.steps) {
      if (!s.done && this.t >= s.at) {
        s.done = true;
        s.fn();
      }
    }
    this.tick(dt);
  }
  protected tick(_dt: number): void {
    this.c.boss.setVelocity(0, 0);
  }
  destroy(): void {
    this.c.boss.setVelocity(0, 0);
  }
}

/**
 * 주문형 패턴 바탕 (전기환띠): 잠깐 웅크렸다(0.12초) 팔을 치켜들며 솟고, 그 뒤로는 몸이 떨리며 둘레에 전기가 튄다.
 * pulse()를 부르면 그 순간 몸이 한 번 부풀었다 돌아온다 (파문·낙뢰 한 발마다).
 */
export abstract class Channeled extends Timed {
  private crackT = 0;
  private pulseAt = -1;

  protected pulse(): void {
    this.pulseAt = this.t;
  }

  protected override tick(dt: number): void {
    const c = this.c;
    c.boss.setVelocity(0, 0);
    const t = this.t;
    const hum = Math.sin(t * 48) * 0.025;
    const p = this.pulseAt >= 0 ? 1 - easeOut((t - this.pulseAt) / 0.25) : 0;
    if (t < 0.12) {
      const e = t / 0.12;
      c.boss.shape(1 + 0.1 * e, 1 - 0.1 * e, 0);
    } else {
      const r = 1 - easeOut((t - 0.12) / 0.35);
      c.boss.shape(1 - 0.08 * r + hum + 0.1 * p, 1 + 0.14 * r - hum - 0.08 * p, 0);
    }
    this.crackT -= dt;
    if (t >= 0.12 && this.crackT <= 0) {
      this.crackT = 0.09;
      sparkAround(c.host.scene, c.host.rng, c.boss.pos(), c.boss.radius(), c.boss.fxColor);
    }
  }
}

/** 보스에서 목표까지 번개가 이어진다 (낙뢰가 어디로 떨어질지 잇는 연출) */
export function zap(c: PatternCtx, to: Vec2): void {
  const p = c.boss.pos();
  crackle(c.host.scene, c.host.rng, { x: p.x, y: p.y - c.boss.radius() * 0.6 }, to, c.boss.fxColor, 0.16, 1);
}

export function angleTo(a: Vec2, b: Vec2): number {
  return Math.atan2(b.y - a.y, b.x - a.x);
}

/** 예고선 → 돌진. trail이면 지나간 자리에 마기 영역 (원혼 돌진 / 청뢰 돌진) */
export class Dash extends Timed {
  /** 돌진을 마쳤다 (연속 돌진·마기 강타가 다음 동작으로 넘어간다) */
  finished = false;
  dir: Vec2 = { x: 1, y: 0 };
  dashing = false;
  private traveled = 0;
  private hit = false;
  private sinceTrail = 0;
  private readonly line: Phaser.GameObjects.Graphics;
  private sinceArt = 0;
  private sinceGhost = 0;
  /** 멈춘 뒤 지난 시간 (착지 몸짓) */
  private sinceStop = -1;
  private readonly angle: number;

  bodyPose(): 'dashReady' | 'dash' | 'dashEnd' {
    return this.dashing ? 'dash' : this.finished ? 'dashEnd' : 'dashReady';
  }

  constructor(
    c: PatternCtx,
    private readonly trail: boolean,
    /** 플레이어와 이만큼 가까워지면 멈춘다 (0이면 끝까지) */
    private readonly stopDist = 0,
  ) {
    super(c);
    const p = c.boss.pos();
    const a = angleTo(p, c.host.playerPos());
    this.angle = a;
    this.dir = { x: Math.cos(a), y: Math.sin(a) };
    this.line = c.host.scene.add.graphics().setDepth(2);
    this.drawLine(0);
    this.at(c.v('windupSec'), () => {
      this.line.clear();
      this.dashing = true;
      bus.emit('sfx', { id: 'dash' });
      // 박차고 나간다: 뒤로 튀는 불티 + 발밑 충격파
      const b = c.boss.pos();
      burst(c.host.scene, c.host.rng, b, c.boss.fxColor, 14, [80, 160], 0.35, { angle: a + Math.PI, spread: 1.6 }, c.boss.radius() * 0.6);
      shockRing(c.host.scene, b, c.boss.radius() * 1.6, c.boss.fxColor, 0.3);
      shake(c.host.scene, 'light');
    });
  }

  /** 돌진 예고선: 준비 동안 끝까지 뻗어 나가며 진해진다 */
  private drawLine(k: number): void {
    const c = this.c;
    const p = c.boss.pos();
    const len = c.v('length') * Math.min(1, k * 1.6);
    const end = { x: p.x + this.dir.x * len, y: p.y + this.dir.y * len };
    this.line.clear();
    this.line.lineStyle(c.boss.radius() * 2, c.boss.color, 0.1 + 0.18 * k).lineBetween(p.x, p.y, end.x, end.y);
    this.line.lineStyle(1, c.boss.color, 0.4 + 0.5 * k).lineBetween(p.x, p.y, end.x, end.y);
  }

  protected override tick(dt: number): void {
    const c = this.c;
    if (!this.dashing) {
      c.boss.setVelocity(0, 0);
      if (!this.finished) {
        // 준비: 예고선이 뻗고, 몸을 웅크려 뒤로 젖히며 기를 모은다
        const k = this.t / c.v('windupSec');
        this.drawLine(k);
        coil(c.boss, k, this.angle, 1.3);
        this.sinceArt -= dt;
        if (this.sinceArt <= 0) {
          this.sinceArt = 0.08;
          motes(c.host.scene, c.host.rng, c.boss.pos(), c.boss.fxColor, 3, c.boss.radius() * 2.2, 0.3);
        }
      } else {
        // 멈춘 뒤: 납작하게 내려앉았다가 일어난다
        this.sinceStop += dt;
        land(c.boss, this.sinceStop, 0.35, 1.2);
      }
      return;
    }
    const speed = c.v('speed');
    const pl0 = c.host.playerPos();
    const b0 = c.boss.pos();
    const near = this.stopDist > 0 && Math.hypot(pl0.x - b0.x, pl0.y - b0.y) <= this.stopDist + c.boss.radius();
    if (this.traveled >= c.v('length') || (this.traveled > 4 && c.boss.blocked()) || near) {
      this.dashing = false;
      this.finished = true;
      this.sinceStop = 0;
      c.boss.setVelocity(0, 0);
      // 미끄러지며 멈춤: 앞으로 흩어지는 먼지
      burst(c.host.scene, c.host.rng, b0, c.boss.fxColor, 12, [50, 110], 0.4, { angle: this.angle, spread: 2.2 }, c.boss.radius() * 0.5);
      shake(c.host.scene, 'light');
      return;
    }
    c.boss.setVelocity(this.dir.x * speed, this.dir.y * speed);
    // 달리는 동안: 진행 방향으로 늘어나고 잔상을 남긴다
    c.boss.shape(1.14, 0.9, (Math.abs(this.dir.x) < 0.2 ? 0 : Math.sign(this.dir.x)) * 0.12);
    this.sinceGhost -= dt;
    if (this.sinceGhost <= 0) {
      this.sinceGhost = 0.05;
      c.boss.ghost(0.35, 0.25);
    }
    this.traveled += speed * dt;
    const p = c.boss.pos();
    const trailArt = c.art('dashTrail');
    this.sinceArt -= dt;
    if (trailArt && this.sinceArt <= 0) {
      this.sinceArt = 0.07;
      playFx(c.host.scene, trailArt, p.x, p.y, { rotation: Math.atan2(this.dir.y, this.dir.x), depth: 2, fadeSec: 0.35 });
    }
    const pl = c.host.playerPos();
    if (!this.hit && Math.hypot(pl.x - p.x, pl.y - p.y) <= c.boss.radius() + c.host.playerRadius) {
      this.hit = c.host.hurtPlayer(c.v('damage'));
    }
    if (this.trail) {
      this.sinceTrail += speed * dt;
      if (this.sinceTrail >= c.v('trailEvery')) {
        this.sinceTrail = 0;
        c.host.addHazard(
          new Zone(c.host.scene, p, c.v('trailRadius'), c.v('trailSec'), c.v('trailDamage'), c.v('trailTickSec'), c.boss.color, 0, c.v('trailDelaySec'), c.art('zone')),
        );
      }
    }
  }

  override destroy(): void {
    super.destroy();
    this.line.destroy();
  }
}


export const rad = (deg: number): number => (deg * Math.PI) / 180;

/** 예고 원 → 폭발 (방 안으로 자른다) */
export function blast(c: PatternCtx, at: Vec2, radius: number, delaySec: number, damage: number): void {
  c.host.addHazard(new DelayedBlast(c.host.scene, clampTo(at, c, radius / 2), radius, delaySec, damage, c.boss.color, { warn: c.art('blastWarn'), hit: c.art('blastHit') }));
}

/** 플레이어의 지금 위치·이동으로 sec 뒤 자리를 예측한다. 생성할 때 정해져 예고를 보고 피할 수 있다 */
export function predict(c: PatternCtx, sec: number, error = 0): Vec2 {
  const a = c.host.rng.range(0, Math.PI * 2);
  const r = error > 0 ? c.host.rng.range(0, error) : 0;
  const at = predictPoint(c.host.playerPos(), c.host.playerVel(), sec);
  return clampTo({ x: at.x + Math.cos(a) * r, y: at.y + Math.sin(a) * r }, c, 8);
}

interface BeamOpts {
  center?: Vec2;
  angle: number;
  telegraphSec: number;
  liveSec: number;
  width: number;
  damage: number;
  length?: number;
  count?: number;
  spin?: number;
  spinDelaySec?: number;
  tickSec?: number;
  onHit?: () => void;
  art?: SpriteRef;
  /** 예고선을 번개로 (전기환띠) */
  bolt?: boolean;
  /** 켜진 광선은 패턴이 따로 그린다 (판정만) */
  bare?: boolean;
}

export const FULL_BEAM = 700;

/** 직선 광선. center를 주면 그 자리에 고정, 없으면 보스를 따라간다. 방향은 생성할 때 고정 */
export function beam(c: PatternCtx, o: BeamOpts): void {
  const at = o.center;
  c.host.addHazard(
    new Beams(c.host.scene, {
      center: at ? () => at : () => c.boss.pos(),
      count: o.count ?? 1,
      length: o.length ?? FULL_BEAM,
      width: o.width,
      spin: o.spin ?? 0,
      spinDelaySec: o.spinDelaySec,
      startAngle: o.angle,
      telegraphSec: o.telegraphSec,
      liveSec: o.liveSec,
      damage: o.damage,
      tickSec: o.tickSec ?? 1,
      onHit: o.onHit,
      art: o.art ?? c.art('beam'),
      warnArt: c.art('beamWarn'),
      color: c.boss.color,
      bolt: o.bolt ? { rng: c.host.rng, color: c.boss.fxColor } : undefined,
      bare: o.bare,
    }),
  );
}

interface RingOpts {
  center: Vec2;
  fromR: number;
  toR: number;
  moveSec: number;
  thickness: number;
  damage: number;
  telegraphSec?: number;
  gapAngle?: number;
  gapDeg?: number;
  /** 번개 고리로 그린다 (전기환띠·적뢰) */
  bolt?: boolean;
  /** 지진 고리로 그린다 (마기골렘). 튀는 조각은 debris·debris2 그림 */
  quake?: boolean;
}

/** 움직이는 고리. gap을 주면 그 각도로 통과할 수 있다 */
export function ring(c: PatternCtx, o: RingOpts): void {
  const { bolt, quake, ...spec } = o;
  const bits = [c.art('debris'), c.art('debris2')].filter((x): x is SpriteRef => !!x);
  c.host.addHazard(
    new Ring(c.host.scene, {
      telegraphSec: 0,
      holdSec: 0,
      tickSec: 0,
      color: c.boss.color,
      ...spec,
      bolt: bolt ? { rng: c.host.rng, color: c.boss.fxColor } : undefined,
      quake: quake ? { rng: c.host.rng, color: c.boss.fxColor, bits } : undefined,
    }),
  );
  const start = c.art('ringStart');
  if (start) playFx(c.host.scene, start, o.center.x, o.center.y, { w: Math.max(o.fromR, 30) * 2.4 });
}

/** 부채꼴 탄막 */
export function fan(c: PatternCtx, from: Vec2, base: number, n: number, spreadDeg: number, speed: number, range: number, damage: number, refractable = true): void {
  const spread = rad(spreadDeg);
  for (let k = 0; k < n; k++) c.host.fireEnemyBullet(from, n === 1 ? base : base - spread / 2 + (spread * k) / (n - 1), speed, range, damage, refractable, c.art('bullet'));
}

/** 연속된 gap발을 비운 원형 탄막 */
export function gapCircle(c: PatternCtx, from: Vec2, n: number, gap: number, speed: number, range: number, damage: number): void {
  for (const a of gapBulletAngles(n, c.host.rng.int(0, n - 1), gap)) c.host.fireEnemyBullet(from, a, speed, range, damage, true, c.art('bullet'));
}

/** 방을 가로지르는 띠 예고 → 강타. 세로·가로 그림이 다르다. bolt면 예고 동안 띠에 번개가 지글거린다 */
export function faultBand(c: PatternCtx, rect: Rect, vertical: boolean, delaySec: number, damage: number, bolt = false): void {
  c.host.addHazard(new RectBlast(c.host.scene, rect, delaySec, damage, c.boss.color, c.art(vertical ? 'bandV' : 'bandH'), bolt ? { rng: c.host.rng, color: c.boss.fxColor } : undefined));
}

/** 플레이어를 지나 방을 가로지르는 띠 */
export function rectAt(a: Rect, at: Vec2, vertical: boolean, w: number): Rect {
  return vertical ? { x: at.x - w / 2, y: a.y, w, h: a.h } : { x: a.x, y: at.y - w / 2, w: a.w, h: w };
}

/** 표시된 안전 원 말고는 전부 맞는 광역기. 플레이어가 닿을 수 있는 자리에 원을 둔다 */
export function safeBlast(c: PatternCtx, circles: number, radius: number, delaySec: number, damage: number, center?: Vec2): void {
  const a = c.host.arena();
  const m = radius + 10;
  const from = center ?? c.host.playerPos();
  const safe: Vec2[] = [];
  for (let tries = 0; safe.length < circles && tries < 80; tries++) {
    const at = { x: c.host.rng.range(a.x + m, a.x + a.w - m), y: c.host.rng.range(a.y + m, a.y + a.h - m) };
    if (Math.hypot(at.x - from.x, at.y - from.y) > c.v('safeReach')) continue;
    if (safe.every((s) => Math.hypot(s.x - at.x, s.y - at.y) > radius * 3)) safe.push(at);
  }
  if (safe.length === 0) safe.push(clampTo(from, c, m));
  c.host.addHazard(new SafeZoneBlast(c.host.scene, a, safe, radius, delaySec, damage, c.boss.color, { safe: c.art('safe'), hit: c.art('safeHit') }));
  shake(c.host.scene, 'rumble', delaySec * 1000);
}

/** 맞으면 정신력이 낮을 때 잠시 움직일 수 없는 굵은 광선 (위압) */
export class Intimidate extends Timed {
  constructor(c: PatternCtx) {
    super(c);
    beam(c, {
      angle: angleTo(c.boss.pos(), c.host.playerPos()),
      telegraphSec: c.v('telegraphSec'),
      liveSec: c.v('liveSec'),
      width: c.v('width'),
      damage: c.v('damage'),
      onHit: () => {
        if (c.host.playerSanity() < c.v('sanityBelow')) c.host.rootPlayer(c.v('rootSec'));
      },
    });
  }
}


/** 방 안쪽 점으로 자른다 */
export function clampTo(p: Vec2, c: PatternCtx, margin: number): Vec2 {
  const a = c.host.arena();
  return { x: Math.min(a.x + a.w - margin, Math.max(a.x + margin, p.x)), y: Math.min(a.y + a.h - margin, Math.max(a.y + margin, p.y)) };
}

/** 플레이어 둘레 무작위 점 (첫 점은 플레이어 자리) */
export function around(c: PatternCtx, i: number, spread: number, margin: number): Vec2 {
  const p = c.host.playerPos();
  if (i === 0) return clampTo(p, c, margin);
  const a = c.host.rng.range(0, Math.PI * 2);
  const r = c.host.rng.range(spread * 0.3, spread);
  return clampTo({ x: p.x + Math.cos(a) * r, y: p.y + Math.sin(a) * r }, c, margin);
}

/** 발사구 불꽃: 쏘는 방향으로 불티 + 작은 충격파. 탄피 그림이 있으면 옆으로 튕겨 나간다 */
export function muzzle(c: PatternCtx, at: Vec2, angle: number, size = 1): void {
  burst(c.host.scene, c.host.rng, at, c.boss.fxColor, Math.round(6 * size), [80, 150], 0.22, { angle, spread: 0.9 });
  shockRing(c.host.scene, at, 7 * size, c.boss.fxColor, 0.18, 1);
  const casing = c.art('casing');
  if (casing) {
    const side = angle + (c.host.rng.chance(0.5) ? 1 : -1) * (Math.PI / 2 + c.host.rng.range(-0.4, 0.4));
    const d = c.host.rng.range(14, 26);
    lob(c.host.scene, casing, at, { x: at.x + Math.cos(side) * d, y: at.y + Math.sin(side) * d + 6 }, 0.35, 12, 6, undefined, c.host.rng.range(-12, 12));
  }
}
