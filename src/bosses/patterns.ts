/**
 * 보스 패턴 (챕터1~3 보스·히든보스). 같은 동작은 패턴 id만 달리 해 다시 쓴다(예: 마기카이저 기계 펀치 = 악귀 할퀴기). 패턴 id → 실행 객체.
 * 패턴마다 예고 → 위치·방향 고정 → 판정 → 잔류 순서를 지킨다. 패턴이 끝나도 깔아 둔 위험 지대는 끝까지 간다. 수치는 bosses.json의 values(강화 단계는 `키Enraged`).
 * 패턴은 보스를 멈추거나 돌진시키고, 피해는 entities/hazard.ts의 위험 지대·적 탄으로 준다.
 */
import { bus } from '../core/events';
import { shake } from '../entities/juice';
import type Phaser from 'phaser';
import type { Vec2 } from '../core/actions';
import { BouncingDisc, DelayedBlast, Beams, FollowBlast, RectBlast, Ring, SafeZoneBlast, SectorBlast, Zone, type Rect } from '../entities/hazard';
import { gapBulletAngles, predictPoint } from '../systems/bossGeometry';
import { playFx } from '../skills/skillFx';
import type { SpriteRef } from '../types/data';
import type { BossHost, PatternRun } from './host';
import { burst, clamp01, coil, crackle, debris, easeOut, land, lob, lunge, motes, shockRing, sparkAround } from './bossFx';

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
abstract class Timed implements PatternRun {
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
abstract class Channeled extends Timed {
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
function zap(c: PatternCtx, to: Vec2): void {
  const p = c.boss.pos();
  crackle(c.host.scene, c.host.rng, { x: p.x, y: p.y - c.boss.radius() * 0.6 }, to, c.boss.fxColor, 0.16, 1);
}

function angleTo(a: Vec2, b: Vec2): number {
  return Math.atan2(b.y - a.y, b.x - a.x);
}

/** 예고선 → 돌진. trail이면 지나간 자리에 마기 영역 (원혼 돌진 / 청뢰 돌진) */
class Dash extends Timed {
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

// ---------- 히든보스 ----------

/** 방 안쪽 점으로 자른다 */
function clampTo(p: Vec2, c: PatternCtx, margin: number): Vec2 {
  const a = c.host.arena();
  return { x: Math.min(a.x + a.w - margin, Math.max(a.x + margin, p.x)), y: Math.min(a.y + a.h - margin, Math.max(a.y + margin, p.y)) };
}

/** 플레이어 둘레 무작위 점 (첫 점은 플레이어 자리) */
function around(c: PatternCtx, i: number, spread: number, margin: number): Vec2 {
  const p = c.host.playerPos();
  if (i === 0) return clampTo(p, c, margin);
  const a = c.host.rng.range(0, Math.PI * 2);
  const r = c.host.rng.range(spread * 0.3, spread);
  return clampTo({ x: p.x + Math.cos(a) * r, y: p.y + Math.sin(a) * r }, c, margin);
}

/** 전장의 함성 (선조의 잔상): 포효 후 자기 강화 */
class WarCry extends Timed {
  constructor(c: PatternCtx) {
    super(c);
    this.at(c.v('windupSec'), () => {
      c.buff(c.v('buffSec'), c.v('damageMul'), c.v('speedMul'));
      const p = c.boss.pos();
      const ring = c.host.scene.add.circle(p.x, p.y, c.boss.radius()).setStrokeStyle(3, c.boss.color, 0.9).setDepth(6);
      c.host.scene.tweens.add({ targets: ring, scale: 4, alpha: 0, duration: 400, onComplete: () => ring.destroy() });
      shake(c.host.scene, 'medium');
    });
  }
}

/** 소용돌이 돌진 (선조의 잔상): 다시 조준하며 여러 번 돌진 */
class WhirlDash implements PatternRun {
  private cur: Dash;
  private n = 1;
  private spin = 0;

  constructor(private readonly c: PatternCtx) {
    this.cur = new Dash(c, false);
  }

  update(dt: number): void {
    this.cur.update(dt);
    this.spin += dt * 20;
    this.c.boss.setAlpha(0.75 + 0.25 * Math.sin(this.spin));
    if (this.cur.finished && this.n < this.c.v('dashes')) {
      this.cur.destroy();
      this.cur = new Dash(this.c, false);
      this.n++;
    }
  }

  destroy(): void {
    this.cur.destroy();
    this.c.boss.setAlpha(1);
  }
}

/** 출혈 장판 (선조의 잔상): 예고 원 → 지속 피해 장판 */
class BleedField extends Timed {
  private readonly marks: Phaser.GameObjects.Arc[] = [];
  constructor(c: PatternCtx) {
    super(c);
    const r = c.v('radius');
    const spots = Array.from({ length: c.v('fields') }, (_, i) => around(c, i, c.v('spread'), r));
    for (const s of spots) this.marks.push(c.host.scene.add.circle(s.x, s.y, r).setStrokeStyle(1, c.boss.color, 0.8).setDepth(2));
    this.at(c.v('delaySec'), () => {
      for (const m of this.marks) m.destroy();
      this.marks.length = 0;
      for (const s of spots) c.host.addHazard(new Zone(c.host.scene, s, r, c.v('liveSec'), c.v('damage'), c.v('tickSec'), c.boss.color));
    });
  }
  override destroy(): void {
    super.destroy();
    for (const m of this.marks) m.destroy();
  }
}

/** 지면 파괴 (선조의 잔상): 플레이어 자리 내려찍기 → 지나갈 수 없는 잔해 */
class GroundBreak extends Timed {
  constructor(c: PatternCtx) {
    super(c);
    const at = clampTo(c.host.playerPos(), c, c.v('radius'));
    c.host.addHazard(new DelayedBlast(c.host.scene, at, c.v('radius'), c.v('delaySec'), c.v('damage'), c.boss.color));
    this.at(c.v('delaySec'), () => {
      c.rubble(at, c.v('rubbleRadius'));
      shake(c.host.scene, 'light');
    });
  }
}

/** 연속 내려찍기 (선조의 잔상 광폭): 플레이어 쪽으로 이어지는 강타 */
class EarthShatter extends Timed {
  constructor(c: PatternCtx) {
    super(c);
    const from = c.boss.pos();
    const a = angleTo(from, c.host.playerPos());
    for (let i = 0; i < c.v('count'); i++) {
      const at = clampTo({ x: from.x + Math.cos(a) * c.v('gap') * (i + 1), y: from.y + Math.sin(a) * c.v('gap') * (i + 1) }, c, c.v('radius'));
      this.at(i * c.v('stepSec'), () => c.host.addHazard(new DelayedBlast(c.host.scene, at, c.v('radius'), c.v('delaySec'), c.v('damage'), c.boss.color)));
    }
  }
}

/** 순간이동 탄막 (왕실특무마기법사): 사라졌다가 떨어진 곳에 나타나 원형 탄막 */
class BlinkBarrage extends Timed {
  constructor(c: PatternCtx) {
    super(c);
    const fade = c.v('fadeSec');
    c.boss.setAlpha(0.2);
    this.at(fade, () => {
      const a = c.host.arena();
      const pl = c.host.playerPos();
      const m = c.boss.radius() + 4;
      let best = c.boss.pos();
      let bestD = -1;
      for (let i = 0; i < 20; i++) {
        const p = { x: c.host.rng.range(a.x + m, a.x + a.w - m), y: c.host.rng.range(a.y + m, a.y + a.h - m) };
        const d = Math.hypot(p.x - pl.x, p.y - pl.y);
        if (d >= c.v('minDist')) {
          best = p;
          break;
        }
        if (d > bestD) {
          best = p;
          bestD = d;
        }
      }
      c.boss.teleport(best.x, best.y);
      c.boss.setAlpha(1);
    });
    for (let i = 0; i < c.v('rings'); i++) {
      this.at(fade + i * c.v('ringGapSec'), () => {
        const p = c.boss.pos();
        const n = c.v('bullets');
        for (let k = 0; k < n; k++) {
          const ang = ((k + (i % 2) * 0.5) * Math.PI * 2) / n;
          c.host.fireEnemyBullet(p, ang, c.v('speed'), c.v('range'), c.v('damage'), true);
        }
      });
    }
  }
  override destroy(): void {
    super.destroy();
    this.c.boss.setAlpha(1);
  }
}

/** 강력한 레이저 (왕실특무마기법사): 예고선 → 굵은 직선 (대형 레이저: 굴절 불가) */
class GreatLaser extends Timed {
  constructor(c: PatternCtx) {
    super(c);
    const p = c.boss.pos();
    c.host.addHazard(
      new Beams(c.host.scene, {
        center: () => p,
        count: 1,
        length: c.v('length'),
        width: c.v('width'),
        spin: 0,
        startAngle: angleTo(p, c.host.playerPos()),
        telegraphSec: c.v('telegraphSec'),
        liveSec: c.v('liveSec'),
        damage: c.v('damage'),
        tickSec: c.v('tickSec'),
        color: c.boss.color,
      }),
    );
  }
}

/** 분신 (왕실특무마기법사) */
class Clones extends Timed {
  constructor(c: PatternCtx) {
    super(c);
    this.at(0.3, () => c.summonClones());
  }
}

/** 마기 강타 (왕실특무마기법사 마기화): 플레이어에게 돌진 → 부채꼴 연타 */
class MagiStrike implements PatternRun {
  private readonly dash: Dash;
  private t = 0;
  private swipes = 0;

  constructor(private readonly c: PatternCtx) {
    this.dash = new Dash(c, false, c.v('stopDist'));
  }

  update(dt: number): void {
    const c = this.c;
    this.dash.update(dt);
    if (!this.dash.finished || this.swipes >= c.v('swipes')) return;
    this.t -= dt;
    if (this.t > 0) return;
    this.t = c.v('swipeGapSec');
    this.swipes++;
    const p = c.boss.pos();
    c.host.addHazard(
      new SectorBlast(c.host.scene, p, angleTo(p, c.host.playerPos()), c.v('radius'), c.v('arcDeg'), c.v('swipeWindupSec'), c.v('swipeDamage'), c.boss.color),
    );
  }

  destroy(): void {
    this.dash.destroy();
  }
}

/** 성검 낙하 (오리온의 성전사): 플레이어 둘레에 차례로 떨어지는 예고 원 */
class HolySwords extends Timed {
  constructor(c: PatternCtx) {
    super(c);
    for (let i = 0; i < c.v('swords'); i++) {
      this.at(i * c.v('stepSec'), () =>
        c.host.addHazard(new DelayedBlast(c.host.scene, around(c, i, c.v('spread'), c.v('radius')), c.v('radius'), c.v('delaySec'), c.v('damage'), c.boss.color)),
      );
    }
  }
}

/** 메이스 강타 (오리온의 성전사): 가까울 때 앞쪽 큰 부채꼴 */
class MaceSmash extends Timed {
  constructor(c: PatternCtx) {
    super(c);
    const p = c.boss.pos();
    c.host.addHazard(new SectorBlast(c.host.scene, p, angleTo(p, c.host.playerPos()), c.v('radius'), c.v('arcDeg'), c.v('windupSec'), c.v('damage'), c.boss.color));
  }
}

/** 방패 투척 (오리온의 성전사): 방 벽에 튕기는 방패 */
class ShieldThrow extends Timed {
  constructor(c: PatternCtx) {
    super(c);
    const p = c.boss.pos();
    c.host.addHazard(
      new BouncingDisc(c.host.scene, p, angleTo(p, c.host.playerPos()), c.v('speed'), c.host.arena(), c.v('bounces'), c.v('radius'), c.v('damage'), c.v('maxSec'), c.boss.color),
    );
  }
}

/** 성검 십자 낙하 (오리온의 성전사 성광): 플레이어를 지나는 가로·세로 줄로 성검이 떨어진다 */
class Judgment extends Timed {
  constructor(c: PatternCtx) {
    super(c);
    const a = c.host.arena();
    const p = c.host.playerPos();
    const gap = c.v('gap');
    const r = c.v('radius');
    const spots: Vec2[] = [];
    for (let x = a.x + r; x <= a.x + a.w - r; x += gap) spots.push({ x, y: p.y });
    for (let y = a.y + r; y <= a.y + a.h - r; y += gap) spots.push({ x: p.x, y });
    // 플레이어에게서 가까운 것부터
    spots.sort((u, v) => Math.hypot(u.x - p.x, u.y - p.y) - Math.hypot(v.x - p.x, v.y - p.y));
    spots.forEach((s, i) => this.at(i * c.v('stepSec'), () => c.host.addHazard(new DelayedBlast(c.host.scene, s, r, c.v('delaySec'), c.v('damage'), c.boss.color))));
  }
}

// ---------- 공통 도구 ----------

const rad = (deg: number): number => (deg * Math.PI) / 180;

/** 예고 원 → 폭발 (방 안으로 자른다) */
function blast(c: PatternCtx, at: Vec2, radius: number, delaySec: number, damage: number): void {
  c.host.addHazard(new DelayedBlast(c.host.scene, clampTo(at, c, radius / 2), radius, delaySec, damage, c.boss.color, { warn: c.art('blastWarn'), hit: c.art('blastHit') }));
}

/** 플레이어의 지금 위치·이동으로 sec 뒤 자리를 예측한다. 생성할 때 정해져 예고를 보고 피할 수 있다 */
function predict(c: PatternCtx, sec: number, error = 0): Vec2 {
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
}

const FULL_BEAM = 700;

/** 직선 광선. center를 주면 그 자리에 고정, 없으면 보스를 따라간다. 방향은 생성할 때 고정 */
function beam(c: PatternCtx, o: BeamOpts): void {
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
function ring(c: PatternCtx, o: RingOpts): void {
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
function fan(c: PatternCtx, from: Vec2, base: number, n: number, spreadDeg: number, speed: number, range: number, damage: number, refractable = true): void {
  const spread = rad(spreadDeg);
  for (let k = 0; k < n; k++) c.host.fireEnemyBullet(from, n === 1 ? base : base - spread / 2 + (spread * k) / (n - 1), speed, range, damage, refractable, c.art('bullet'));
}

/** 연속된 gap발을 비운 원형 탄막 */
function gapCircle(c: PatternCtx, from: Vec2, n: number, gap: number, speed: number, range: number, damage: number): void {
  for (const a of gapBulletAngles(n, c.host.rng.int(0, n - 1), gap)) c.host.fireEnemyBullet(from, a, speed, range, damage, true, c.art('bullet'));
}

/** 방을 가로지르는 띠 예고 → 강타. 세로·가로 그림이 다르다. bolt면 예고 동안 띠에 번개가 지글거린다 */
function faultBand(c: PatternCtx, rect: Rect, vertical: boolean, delaySec: number, damage: number, bolt = false): void {
  c.host.addHazard(new RectBlast(c.host.scene, rect, delaySec, damage, c.boss.color, c.art(vertical ? 'bandV' : 'bandH'), bolt ? { rng: c.host.rng, color: c.boss.fxColor } : undefined));
}

/** 플레이어를 지나 방을 가로지르는 띠 */
function rectAt(a: Rect, at: Vec2, vertical: boolean, w: number): Rect {
  return vertical ? { x: at.x - w / 2, y: a.y, w, h: a.h } : { x: a.x, y: at.y - w / 2, w: a.w, h: w };
}

/** 표시된 안전 원 말고는 전부 맞는 광역기. 플레이어가 닿을 수 있는 자리에 원을 둔다 */
function safeBlast(c: PatternCtx, circles: number, radius: number, delaySec: number, damage: number, center?: Vec2): void {
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
class Intimidate extends Timed {
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

// ---------- 융합악귀 ----------

/** 악귀 할퀴기: 플레이어 쪽 넓은 부채꼴. 뒤로보다 옆으로 빠져야 한다 */
class Claw extends Timed {
  private readonly angle: number;
  private moteT = 0;

  constructor(c: PatternCtx) {
    super(c);
    const p = c.boss.pos();
    this.angle = angleTo(p, c.host.playerPos());
    const a = this.angle;
    c.host.addHazard(new SectorBlast(c.host.scene, p, a, c.v('radius'), c.v('arcDeg'), c.v('windupSec'), c.v('damage'), c.boss.color, c.art('sectorHit')));
    this.at(c.v('windupSec'), () => {
      // 휘두름: 원혼 세 줄기 할퀴기 + 잔상 + 호를 따라 바깥으로 튀는 불티
      const strike = c.art('strike');
      const mid = c.v('radius') * 0.55;
      if (strike) playFx(c.host.scene, strike, p.x + Math.cos(a) * mid, p.y + Math.sin(a) * mid, { w: c.v('radius') * 1.2, rotation: a, depth: 7 });
      c.boss.ghost(0.5, 0.3);
      burst(c.host.scene, c.host.rng, p, c.boss.fxColor, 26, [90, 180], 0.35, { angle: a, spread: rad(c.v('arcDeg')) }, c.v('radius') * 0.9);
      shake(c.host.scene, 'light');
    });
  }

  protected override tick(dt: number): void {
    const c = this.c;
    const w = c.v('windupSec');
    if (this.t < w) {
      // 준비: 웅크려 뒤로 젖히며 손끝에 기를 모은다
      c.boss.setVelocity(0, 0);
      coil(c.boss, this.t / w, this.angle);
      this.moteT -= dt;
      if (this.moteT <= 0) {
        this.moteT = 0.07;
        const p = c.boss.pos();
        motes(c.host.scene, c.host.rng, { x: p.x + Math.cos(this.angle) * 10, y: p.y + Math.sin(this.angle) * 10 }, c.boss.fxColor, 3, c.boss.radius() * 1.8, 0.3);
      }
      return;
    }
    // 내지른 직후 0.08초 앞으로 밀고 나가며 늘어났다가 돌아온다
    const since = this.t - w;
    const push = since < 0.08 ? 110 : 0;
    c.boss.setVelocity(Math.cos(this.angle) * push, Math.sin(this.angle) * push);
    lunge(c.boss, since, this.angle);
  }
}

/** 원혼 돌진: 돌진하며 양옆·뒤로 탄을 뿌리고 잔류 장판을 남긴 뒤, 핵이 드러난 채 잠깐 멈춘다 */
class SpiritDash implements PatternRun {
  private readonly dash: Dash;
  bodyPose = () => this.dash.bodyPose();
  private shot = 0;
  private recovered = false;

  constructor(private readonly c: PatternCtx) {
    this.dash = new Dash(c, true);
  }

  update(dt: number): void {
    const c = this.c;
    this.dash.update(dt);
    if (this.dash.finished && !this.recovered) {
      this.recovered = true;
      c.expose(c.v('exposeSec'), c.v('exposeMul'));
    }
    if (!this.dash.dashing) return;
    this.shot -= dt;
    if (this.shot > 0) return;
    this.shot = c.v('shotEverySec');
    const a = Math.atan2(this.dash.dir.y, this.dash.dir.x);
    for (const off of [Math.PI / 2, -Math.PI / 2, Math.PI]) c.host.fireEnemyBullet(c.boss.pos(), a + off, c.v('shotSpeed'), c.v('shotRange'), c.v('shotDamage'), true, c.art('bullet'));
  }

  destroy(): void {
    this.dash.destroy();
  }
}

/** 악귀 분출: 보스 중심 폭발과 함께 둘레에 악귀가 튀어나온다. 바짝 붙은 플레이어를 밀어낸다 */
class Eruption extends Timed {
  private moteT = 0;

  constructor(c: PatternCtx) {
    super(c);
    blast(c, c.boss.pos(), c.v('radius'), c.v('delaySec'), c.v('damage'));
    shake(c.host.scene, 'rumble', c.v('delaySec') * 1000);
    this.at(c.v('delaySec'), () => {
      // 터짐: 충격파 두 겹 + 사방으로 튀는 불티
      const p = c.boss.pos();
      shockRing(c.host.scene, p, c.v('radius') * 1.1, c.boss.fxColor, 0.4, 3);
      shockRing(c.host.scene, p, c.v('radius') * 0.7, 0xffffff, 0.25, 1);
      burst(c.host.scene, c.host.rng, p, c.boss.fxColor, 30, [100, 200], 0.45, undefined, c.boss.radius() * 0.5);
      shake(c.host.scene, 'medium');
    });
    this.at(c.v('delaySec'), () => {
      if (!c.summonId) return;
      // 따라 나오는 소환수와 합쳐 상한을 넘지 않는다
      const n = Math.min(c.v('count'), c.v('maxSummon') - c.minionCount(c.summonId));
      if (n > 0) c.summon(Array.from({ length: n }, () => c.summonId!), true);
    });
  }

  protected override tick(dt: number): void {
    const c = this.c;
    c.boss.setVelocity(0, 0);
    const d = c.v('delaySec');
    if (this.t >= d) {
      // 솟구쳤다가 내려앉는다
      lunge(c.boss, this.t - d, -Math.PI / 2, 0.4, 1.4);
      return;
    }
    // 준비: 땅으로 꺼지듯 납작해지며 떨고, 바닥의 기가 몸으로 빨려 든다
    const k = this.t / d;
    c.boss.shape(1 + 0.12 * k, 1 - 0.16 * k, Math.sin(this.t * 70) * 0.03 * k);
    this.moteT -= dt;
    if (this.moteT <= 0) {
      this.moteT = 0.05;
      motes(c.host.scene, c.host.rng, c.boss.pos(), c.boss.fxColor, 4, c.v('radius'), 0.35);
    }
  }
}

/** 원혼 폭발: 연속 두 발이 빈 원형 탄막. 틈을 찾아 지나간다 */
class SpiritBurst extends Timed {
  /** 몸 앞에서 커지는 원혼 구슬 (그림이 없으면 없음) */
  private orb: Phaser.GameObjects.Sprite | null = null;
  private orbScale = 1;
  private moteT = 0;

  constructor(c: PatternCtx) {
    super(c);
    const art = c.art('orb');
    if (art) {
      const p = c.boss.pos();
      this.orb = c.host.scene.add.sprite(p.x, p.y, art.spriteKey).setDepth(5).setBlendMode('ADD');
      // 보스 몸집만큼 커져야 몸의 빛에 묻히지 않는다
      const px = Math.max(art.size, c.boss.radius() * 1.8);
      this.orb.setDisplaySize(px, px);
      this.orbScale = this.orb.scaleX;
      this.orb.setScale(this.orbScale * 0.2);
    }
    this.at(c.v('windupSec'), () => {
      const p = c.boss.pos();
      gapCircle(c, p, c.v('bullets'), c.v('gap'), c.v('speed'), c.v('range'), c.v('damage'));
      // 구슬이 터지며 탄막이 퍼진다
      const orb = this.orb;
      this.orb = null;
      if (orb) c.host.scene.tweens.add({ targets: orb, scale: this.orbScale * 2.4, alpha: 0, duration: 220, ease: 'Cubic.easeOut', onComplete: () => orb.destroy() });
      const core = c.art('release');
      if (core) playFx(c.host.scene, core, p.x, p.y, { w: c.boss.radius() * 3.2, depth: 6 });
      shockRing(c.host.scene, p, c.boss.radius() * 2.4, c.boss.fxColor, 0.35, 2);
      burst(c.host.scene, c.host.rng, p, c.boss.fxColor, 18, [90, 170], 0.35);
      shake(c.host.scene, 'light');
    });
  }

  protected override tick(dt: number): void {
    const c = this.c;
    c.boss.setVelocity(0, 0);
    const w = c.v('windupSec');
    if (this.t >= w) {
      land(c.boss, this.t - w, 0.3, 0.8);
      return;
    }
    // 준비: 숨을 들이켜듯 부풀고, 구슬이 커지며 기가 모인다
    const k = this.t / w;
    c.boss.shape(1 - 0.05 * k, 1 + 0.08 * k, 0);
    const p = c.boss.pos();
    this.orb?.setPosition(p.x, p.y).setScale(this.orbScale * (0.2 + 0.9 * k)).setRotation(this.t * 6);
    this.moteT -= dt;
    if (this.moteT <= 0) {
      this.moteT = 0.05;
      motes(c.host.scene, c.host.rng, p, c.boss.fxColor, 3, c.boss.radius() * 2.5, 0.25);
    }
  }

  override destroy(): void {
    super.destroy();
    this.orb?.destroy();
  }
}

// ---------- 전기환띠 ----------

/** 낙뢰 추적: 예상 이동 경로를 따라 순차 낙뢰. 자리는 시작할 때 정해진다 */
class LightningChase extends Channeled {
  constructor(c: PatternCtx) {
    super(c);
    for (let i = 0; i < c.v('strikes'); i++) {
      const step = i * c.v('intervalSec');
      const at = predict(c, step + c.v('delaySec'));
      this.at(step, () => {
        blast(c, at, c.v('radius'), c.v('delaySec'), c.v('damage'));
        zap(c, at);
        this.pulse();
      });
    }
  }
}

/** 전격 파문: 틈이 있는 원형 탄막을 탄속을 바꿔 반복 */
class ShockRipple extends Channeled {
  constructor(c: PatternCtx) {
    super(c);
    for (let i = 0; i < c.v('rings'); i++) {
      this.at(0.12 + i * c.v('ringGapSec'), () => {
        const p = c.boss.pos();
        gapCircle(c, p, c.v('bullets'), c.v('gap'), c.v('speed') + i * c.v('speedStep'), c.v('range'), c.v('damage'));
        // 몸에서 전격 고리가 터져 나가며 탄막이 퍼진다
        const ring = c.art('ring');
        if (ring) playFx(c.host.scene, ring, p.x, p.y, { w: c.boss.radius() * 4 });
        shockRing(c.host.scene, p, c.boss.radius() * 3, c.boss.fxColor, 0.35, 2);
        burst(c.host.scene, c.host.rng, p, c.boss.fxColor, 14, [90, 170], 0.3, undefined, c.boss.radius() * 0.6);
        shake(c.host.scene, 'light');
        this.pulse();
      });
    }
  }
}

/** 회전 번개: 플레이어 쪽 긴 광선 예고 → 회전. 강화 시 반대쪽 광선 추가 */
class SpinBeam extends Channeled {
  constructor(c: PatternCtx) {
    super(c);
    this.at(c.v('telegraphSec'), () => {
      shockRing(c.host.scene, c.boss.pos(), c.boss.radius() * 2.5, c.boss.fxColor, 0.3, 2);
      shake(c.host.scene, 'light');
      this.pulse();
    });
    beam(c, {
      angle: angleTo(c.boss.pos(), c.host.playerPos()),
      count: c.v('beams'),
      telegraphSec: c.v('telegraphSec'),
      liveSec: c.v('liveSec'),
      width: c.v('width'),
      spin: c.v('spinSpeed') * (c.host.rng.chance(0.5) ? 1 : -1),
      damage: c.v('damage'),
      tickSec: c.v('tickSec'),
      bolt: true,
    });
  }
}

/** 전격 감옥: 플레이어 둘레 틈 있는 고리 + 안쪽 낙뢰. 열린 쪽으로 나가야 한다 */
class Prison extends Channeled {
  constructor(c: PatternCtx) {
    super(c);
    const center = c.host.playerPos();
    const r = c.v('radius');
    zap(c, center);
    c.host.addHazard(
      new Ring(c.host.scene, {
        center,
        fromR: r,
        toR: r,
        moveSec: 0,
        telegraphSec: c.v('telegraphSec'),
        holdSec: c.v('liveSec'),
        thickness: c.v('thickness'),
        damage: c.v('damage'),
        tickSec: c.v('tickSec'),
        color: c.boss.color,
        gapAngle: c.host.rng.range(0, Math.PI * 2),
        gapDeg: c.v('gapDeg'),
        bolt: { rng: c.host.rng, color: c.boss.fxColor },
      }),
    );
    const cage = c.art('cage');
    if (cage) playFx(c.host.scene, cage, center.x, center.y, { w: r * 2.3, fadeSec: 0.5 });
    // 고리가 닫히는 순간 가장자리를 따라 전기가 돈다
    this.at(c.v('telegraphSec'), () => {
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        const b = a + Math.PI / 5;
        crackle(c.host.scene, c.host.rng, { x: center.x + Math.cos(a) * r, y: center.y + Math.sin(a) * r }, { x: center.x + Math.cos(b) * r, y: center.y + Math.sin(b) * r }, c.boss.fxColor, 0.25);
      }
      this.pulse();
    });
    for (let i = 0; i < c.v('strikes'); i++) {
      this.at(c.v('telegraphSec') + i * c.v('strikeGapSec'), () => {
        const at = c.host.playerPos();
        blast(c, at, c.v('strikeRadius'), c.v('strikeDelaySec'), c.v('strikeDamage'));
        zap(c, at);
      });
    }
  }
}

/** 뇌전 봉쇄: 플레이어 양옆 세로 광선 2개, 시차를 두고 위아래 가로 광선 2개 */
class LockGrid extends Channeled {
  constructor(c: PatternCtx) {
    super(c);
    const a = c.host.arena();
    const p = c.host.playerPos();
    const off = c.v('offset');
    zap(c, p);
    // 띠가 칠 때 띠를 따라 번개가 내리친다
    const bolts = (r: Rect, vertical: boolean) => {
      for (let k = 0; k < 3; k++) {
        const j = (k - 1) * r.w * 0.25 * (vertical ? 1 : 0);
        const i = (k - 1) * r.h * 0.25 * (vertical ? 0 : 1);
        const from = vertical ? { x: r.x + r.w / 2 + j, y: r.y } : { x: r.x, y: r.y + r.h / 2 + i };
        const to = vertical ? { x: r.x + r.w / 2 + j, y: r.y + r.h } : { x: r.x + r.w, y: r.y + r.h / 2 + i };
        crackle(c.host.scene, c.host.rng, from, to, c.boss.fxColor, 0.22, k === 1 ? 2 : 1);
      }
    };
    for (const s of [-1, 1]) {
      const v = rectAt(a, { x: p.x + s * off, y: p.y }, true, c.v('width'));
      const h = rectAt(a, { x: p.x, y: p.y + s * off }, false, c.v('width'));
      faultBand(c, v, true, c.v('delaySec'), c.v('damage'), true);
      faultBand(c, h, false, c.v('delaySec') + c.v('lagSec'), c.v('damage'), true);
      this.at(c.v('delaySec'), () => bolts(v, true));
      this.at(c.v('delaySec') + c.v('lagSec'), () => bolts(h, false));
    }
    // 세로 띠가 칠 때 바닥에 뇌전 격자가 번진다, 가로 띠 때 한 번 더 울린다
    this.at(c.v('delaySec'), () => {
      const grid = c.art('grid');
      if (grid) playFx(c.host.scene, grid, p.x, p.y, { w: off * 3.4, depth: 2 });
      shake(c.host.scene, 'light');
      this.pulse();
    });
    this.at(c.v('delaySec') + c.v('lagSec'), () => {
      shake(c.host.scene, 'light');
      this.pulse();
    });
  }
}

/** 수축 전류: 큰 고리가 틈을 남긴 채 줄어든다. 강화 시 직선 광선이 겹친다 */
class ShrinkCurrent extends Channeled {
  constructor(c: PatternCtx) {
    super(c);
    const p = c.boss.pos();
    this.at(0.12, () => this.pulse());
    ring(c, { center: p, fromR: c.v('startRadius'), toR: c.boss.radius(), moveSec: c.v('shrinkSec'), thickness: c.v('thickness'), damage: c.v('damage'), gapAngle: c.host.rng.range(0, Math.PI * 2), gapDeg: c.v('gapDeg'), bolt: true });
    if (c.v('extraBeam') > 0) beam(c, { angle: angleTo(p, c.host.playerPos()), telegraphSec: c.v('beamTelegraphSec'), liveSec: c.v('beamLiveSec'), width: c.v('beamWidth'), damage: c.v('damage'), bolt: true });
  }
}

/** 교차 절단: 대각선 광선 뒤 십자 광선. 첫 안전 자리가 다음엔 위험해진다 */
class CrossCut extends Channeled {
  constructor(c: PatternCtx) {
    super(c);
    const o = { count: 4, telegraphSec: c.v('telegraphSec'), liveSec: c.v('liveSec'), width: c.v('width'), damage: c.v('damage'), bolt: true };
    const fire = () => {
      shockRing(c.host.scene, c.boss.pos(), c.boss.radius() * 2.2, c.boss.fxColor, 0.25, 2);
      shake(c.host.scene, 'light');
      this.pulse();
    };
    beam(c, { ...o, angle: Math.PI / 4 });
    this.at(c.v('telegraphSec'), fire);
    this.at(c.v('lagSec'), () => beam(c, { ...o, angle: 0 }));
    this.at(c.v('lagSec') + c.v('telegraphSec'), fire);
  }
}

/** 뇌전 추격진: 경로 낙뢰 뒤 플레이어 둘레 수축 고리의 틈으로 빠져나온다 (적뢰 추격진도 같다) */
class ChaseField extends Channeled {
  constructor(c: PatternCtx) {
    super(c);
    const n = c.v('strikes');
    for (let i = 0; i < n; i++) {
      const step = i * c.v('intervalSec');
      const at = predict(c, step + c.v('delaySec'));
      this.at(step, () => {
        blast(c, at, c.v('radius'), c.v('delaySec'), c.v('damage'));
        zap(c, at);
        this.pulse();
      });
    }
    this.at(n * c.v('intervalSec') + c.v('delaySec'), () =>
      ring(c, { center: c.host.playerPos(), fromR: c.v('ringRadius'), toR: c.v('ringEndRadius'), moveSec: c.v('ringSec'), thickness: c.v('thickness'), damage: c.v('damage'), gapAngle: c.host.rng.range(0, Math.PI * 2), gapDeg: c.v('gapDeg'), bolt: true }),
    );
  }
}

/** 청뢰 돌진: 직선 예고 → 돌진 → 도착 지점 폭발 */
class BlueDash implements PatternRun {
  private readonly dash: Dash;
  bodyPose = () => this.dash.bodyPose();
  private done = false;

  constructor(private readonly c: PatternCtx) {
    this.dash = new Dash(c, false);
  }

  update(dt: number): void {
    this.dash.update(dt);
    if (!this.dash.finished || this.done) return;
    this.done = true;
    const c = this.c;
    const p = c.boss.pos();
    blast(c, p, c.v('radius'), c.v('delaySec'), c.v('damage'));
    // 멈춘 자리에서 진행 방향으로 전격 해일이 밀려 나간다
    const wave = c.art('wave');
    if (wave) playFx(c.host.scene, wave, p.x + this.dash.dir.x * 20, p.y + this.dash.dir.y * 20, { w: c.v('radius') * 2.4, rotation: Math.atan2(this.dash.dir.y, this.dash.dir.x) + Math.PI }); // 그림이 왼쪽을 향한다
  }

  destroy(): void {
    this.dash.destroy();
  }
}

// ---------- 헥타르 수석 연구원 ----------

/** 척력 방출: 보스 중심 원형 공격. 너무 붙은 플레이어를 밀어낸다 */
class Repulse extends Timed {
  constructor(c: PatternCtx) {
    super(c);
    blast(c, c.boss.pos(), c.v('radius'), c.v('delaySec'), c.v('damage'));
  }
}

/** 드론 협공: 보스 둘레 드론 3기가 시작 때의 플레이어 자리를 조준해 부채꼴 사격 */
class DroneFire extends Timed {
  private readonly drones: { destroy(): void }[] = [];
  constructor(c: PatternCtx) {
    super(c);
    const b = c.boss.pos();
    const target = c.host.playerPos();
    const base = c.host.rng.range(0, Math.PI * 2);
    const spots = Array.from({ length: c.v('drones') }, (_, i) => {
      const a = base + (i * Math.PI * 2) / c.v('drones');
      return clampTo({ x: b.x + Math.cos(a) * c.v('offset'), y: b.y + Math.sin(a) * c.v('offset') }, c, 8);
    });
    const droneArt = c.art('drone');
    for (const s of spots) this.drones.push(droneArt ? c.host.scene.add.sprite(s.x, s.y, droneArt.spriteKey).setDepth(4) : c.host.scene.add.circle(s.x, s.y, 5, c.boss.color, 0.9).setStrokeStyle(1, 0xffffff, 0.8).setDepth(4));
    for (let r = 0; r < c.v('rounds'); r++) {
      this.at(c.v('windupSec') + r * c.v('roundGapSec'), () => {
        for (const s of spots) fan(c, s, angleTo(s, target), c.v('bullets'), c.v('spreadDeg'), c.v('speed'), c.v('range'), c.v('damage'));
      });
    }
  }
  override destroy(): void {
    super.destroy();
    for (const d of this.drones) d.destroy();
  }
}

/** 반물질 연쇄 포격: 플레이어 자리와 그 측면에 순차 폭발 */
class Antimatter extends Timed {
  constructor(c: PatternCtx) {
    super(c);
    const p = c.host.playerPos();
    const side = angleTo(c.boss.pos(), p) + Math.PI / 2;
    for (let i = 0; i < c.v('count'); i++) {
      // 0, +1, -1, +2, -2칸
      const k = Math.ceil(i / 2) * (i % 2 === 0 ? -1 : 1);
      blast(c, { x: p.x + Math.cos(side) * k * c.v('gap'), y: p.y + Math.sin(side) * k * c.v('gap') }, c.v('radius'), c.v('delaySec') + i * c.v('stepSec'), c.v('damage'));
    }
  }
}

/** 레일건 교차 사격: 고정 각도 광선 여러 줄, 시차를 두고 발동. 줄 사이 통로로 간다 */
class RailCross extends Timed {
  constructor(c: PatternCtx) {
    super(c);
    const base = angleTo(c.boss.pos(), c.host.playerPos());
    const n = c.v('lines');
    for (let i = 0; i < n; i++) {
      const a = base + rad(c.v('spreadDeg')) * (i / (n - 1) - 0.5);
      beam(c, { center: c.boss.pos(), angle: a, telegraphSec: c.v('telegraphSec') + i * c.v('stepSec'), liveSec: c.v('liveSec'), width: c.v('width'), damage: c.v('damage') });
    }
  }
}

/** 추적 지뢰 포위진: 시작 때 플레이어 둘레 원형 지뢰. 가운데 남거나 틈으로 나간다 */
class MineSiege extends Timed {
  constructor(c: PatternCtx) {
    super(c);
    const p = c.host.playerPos();
    const n = c.v('mines');
    const base = c.host.rng.range(0, Math.PI * 2);
    for (let i = 0; i < n; i++) {
      const a = base + (i * Math.PI * 2) / n;
      blast(c, { x: p.x + Math.cos(a) * c.v('circle'), y: p.y + Math.sin(a) * c.v('circle') }, c.v('radius'), c.v('delaySec') + i * c.v('stepSec'), c.v('damage'));
    }
  }
}

/** 벡터 역장: 예고 뒤 틈 있는 확장 충격파 */
class GapWave extends Timed {
  constructor(c: PatternCtx) {
    super(c);
    const from = c.boss.radius();
    const to = c.v('maxRadius');
    ring(c, { center: c.boss.pos(), fromR: from, toR: to, moveSec: (to - from) / c.v('speed'), telegraphSec: c.v('telegraphSec'), thickness: c.v('thickness'), damage: c.v('damage'), gapAngle: c.host.rng.range(0, Math.PI * 2), gapDeg: c.v('gapDeg') });
  }
}

/** 벼락 실증: 플레이어 기준 낙뢰 지점을 고정하고 순차 낙하 */
class BoltProof extends Timed {
  constructor(c: PatternCtx) {
    super(c);
    for (let i = 0; i < c.v('strikes'); i++) blast(c, around(c, i, c.v('spread'), c.v('radius')), c.v('radius'), c.v('delaySec') + i * c.v('stepSec'), c.v('damage'));
  }
}

/** 전투원 호출: 살아 있는 동안 다시 부르지 않는다 */
class CallTroopers extends Timed {
  constructor(c: PatternCtx) {
    super(c);
    this.at(c.v('windupSec'), () => {
      const id = c.summonId;
      if (id) c.summon(Array.from({ length: c.v('count') }, () => id));
    });
  }
}

// ---------- 마기골렘 ----------

/**
 * 무거운 몸짓 바탕 (마기골렘): riseSec 동안 몸을 일으키며 기를 끌어모으고,
 * impact()마다 쿵 내려앉으며 땅이 울리고 파편·먼지가 튄다. 그 사이엔 숨 쉬듯 미세하게 들썩인다.
 */
abstract class Heavy extends Timed {
  private impactAt = -1;
  private moteT = 0;

  constructor(
    c: PatternCtx,
    private readonly riseSec: number,
  ) {
    super(c);
  }

  /** 쿵: 납작하게 내려앉고, 발밑 충격파·먼지·파편 */
  protected impact(size = 1): void {
    const c = this.c;
    this.impactAt = this.t;
    const p = c.boss.pos();
    const foot = { x: p.x, y: p.y + c.boss.radius() * 0.6 };
    shockRing(c.host.scene, foot, c.boss.radius() * 2.2 * size, c.boss.fxColor, 0.35, 3);
    burst(c.host.scene, c.host.rng, foot, c.boss.fxColor, Math.round(16 * size), [70, 150], 0.4, undefined, c.boss.radius() * 0.5);
    debris(c.host.scene, c.host.rng, foot, [c.art('debris'), c.art('debris2')].filter((x): x is SpriteRef => !!x), Math.round(7 * size), [20, 60 * size]);
    shake(c.host.scene, size > 1 ? 'medium' : 'light');
  }

  protected override tick(dt: number): void {
    const c = this.c;
    c.boss.setVelocity(0, 0);
    const t = this.t;
    if (this.impactAt >= 0) {
      land(c.boss, t - this.impactAt, 0.4, 1.3);
      return;
    }
    if (t < this.riseSec) {
      // 일으킴: 위로 늘어나며 살짝 뒤로 젖히고, 둘레의 기가 몸으로 모인다
      const e = easeOut(t / this.riseSec);
      c.boss.shape(1 - 0.06 * e, 1 + 0.1 * e, 0);
      this.moteT -= dt;
      if (this.moteT <= 0) {
        this.moteT = 0.06;
        motes(c.host.scene, c.host.rng, c.boss.pos(), c.boss.fxColor, 3, c.boss.radius() * 2, 0.3);
      }
      return;
    }
    const b = Math.sin(t * 6) * 0.015;
    c.boss.shape(1 + b, 1 - b, 0);
  }
}

/** 대지 분쇄: 틈의 방향이 조금씩 바뀌는 확장 충격파 연속 */
class EarthCrush extends Heavy {
  constructor(c: PatternCtx) {
    super(c, c.v('windupSec'));
    const from = c.boss.radius();
    const to = c.v('maxRadius');
    let gap = angleTo(c.boss.pos(), c.host.playerPos());
    for (let i = 0; i < c.v('waves'); i++) {
      const g = gap;
      gap += rad(c.v('gapStepDeg')) * (c.host.rng.chance(0.5) ? 1 : -1);
      this.at(c.v('windupSec') + i * c.v('intervalSec'), () => {
        ring(c, { center: c.boss.pos(), fromR: from, toR: to, moveSec: (to - from) / c.v('speed'), thickness: c.v('thickness'), damage: c.v('damage'), gapAngle: g, gapDeg: c.v('gapDeg'), quake: true });
        this.impact(i === 0 ? 1.3 : 1);
      });
    }
  }
}

/** 마기 포격: 이동 방향과 오차를 섞은 낙하지점 (흑점 낙하·흑점 연쇄 낙하도 같다). 포탄이 보스에서 낙하지점까지 날아간다 */
class Bombard extends Timed {
  private recoilAt = -1;

  constructor(c: PatternCtx) {
    super(c);
    const shell = c.art('shell');
    for (let i = 0; i < c.v('shells'); i++) {
      const step = i * c.v('stepSec');
      this.at(step, () => {
        const at = predict(c, c.v('delaySec'), c.v('spread'));
        blast(c, at, c.v('radius'), c.v('delaySec'), c.v('damage'));
        if (shell) {
          const p = c.boss.pos();
          lob(c.host.scene, shell, { x: p.x, y: p.y - c.boss.radius() * 0.8 }, at, c.v('delaySec') * 0.95, 48, 14, undefined, 8, c.boss.fxColor);
          burst(c.host.scene, c.host.rng, { x: p.x, y: p.y - c.boss.radius() * 0.8 }, c.boss.fxColor, 4, [50, 90], 0.25, { angle: -Math.PI / 2, spread: 1.2 });
        }
        this.recoilAt = this.t;
      });
    }
  }

  protected override tick(): void {
    const c = this.c;
    c.boss.setVelocity(0, 0);
    // 쏠 때마다 움찔
    const r = this.recoilAt >= 0 ? 1 - easeOut((this.t - this.recoilAt) / 0.15) : 0;
    c.boss.shape(1 + 0.06 * r, 1 - 0.05 * r, 0);
  }
}

/** 파멸 광선: 중앙 광선을 피한 뒤 측면에 서면 양옆 후속 광선을 맞는다 */
class RuinBeam extends Heavy {
  private readonly angle: number;
  private fireAt = -1;

  constructor(c: PatternCtx) {
    super(c, c.v('telegraphSec'));
    const p = c.boss.pos();
    const a = angleTo(p, c.host.playerPos());
    this.angle = a;
    const o = { center: p, liveSec: c.v('liveSec'), width: c.v('width'), damage: c.v('damage') };
    beam(c, { ...o, angle: a, telegraphSec: c.v('telegraphSec') });
    for (const s of [-1, 1]) beam(c, { ...o, angle: a + s * rad(c.v('sideDeg')), telegraphSec: c.v('telegraphSec') + c.v('liveSec') + c.v('lagSec'), art: c.art('beamSide') });
    const fire = (k: number) => {
      this.fireAt = this.t;
      const q = c.boss.pos();
      shockRing(c.host.scene, q, c.boss.radius() * 1.8 * k, c.boss.fxColor, 0.3, 3);
      burst(c.host.scene, c.host.rng, q, c.boss.fxColor, 14, [90, 170], 0.3, { angle: a, spread: 1.2 });
      shake(c.host.scene, k > 1 ? 'medium' : 'light');
    };
    this.at(c.v('telegraphSec'), () => fire(1.3));
    this.at(c.v('telegraphSec') + c.v('liveSec') + c.v('lagSec'), () => fire(1));
  }

  protected override tick(dt: number): void {
    if (this.fireAt < 0) return super.tick(dt);
    // 쏜 반동: 뒤로 밀리며 젖혔다가 돌아온다
    const c = this.c;
    c.boss.setVelocity(0, 0);
    lunge(c.boss, this.t - this.fireAt, this.angle + Math.PI, 0.35, 1.2);
  }
}

/** 폐허의 군세: 지금 챕터 일반 적 + 틈 있는 충격파 */
class RuinLegion extends Heavy {
  constructor(c: PatternCtx) {
    super(c, c.v('windupSec'));
    this.at(c.v('windupSec'), () => {
      const roster = c.host.chapterRoster();
      if (roster.length > 0) c.summon(Array.from({ length: c.v('count') }, () => c.host.rng.pick(roster)));
      const from = c.boss.radius();
      ring(c, { center: c.boss.pos(), fromR: from, toR: c.v('maxRadius'), moveSec: (c.v('maxRadius') - from) / c.v('speed'), thickness: c.v('thickness'), damage: c.v('damage'), gapAngle: c.host.rng.range(0, Math.PI * 2), gapDeg: c.v('gapDeg'), quake: true });
      this.impact(1.3);
    });
  }
}

/** 파성 돌진: 긴 준비 → 돌진(양옆 보조 광선) → 도착 폭발 → 핵 노출 */
class BreakerDash implements PatternRun {
  private readonly dash: Dash;
  bodyPose = () => this.dash.bodyPose();
  private done = false;

  constructor(private readonly c: PatternCtx) {
    this.dash = new Dash(c, false);
    const p = c.boss.pos();
    const a = Math.atan2(this.dash.dir.y, this.dash.dir.x);
    for (const s of [-1, 1]) {
      const off = { x: p.x + Math.cos(a + Math.PI / 2) * s * c.v('sideOffset'), y: p.y + Math.sin(a + Math.PI / 2) * s * c.v('sideOffset') };
      beam(c, { center: off, angle: a, length: c.v('length'), telegraphSec: c.v('windupSec'), liveSec: c.v('sideLiveSec'), width: c.v('sideWidth'), damage: c.v('sideDamage') });
    }
  }

  update(dt: number): void {
    const c = this.c;
    this.dash.update(dt);
    if (!this.dash.finished || this.done) return;
    this.done = true;
    const p = c.boss.pos();
    blast(c, p, c.v('radius'), c.v('delaySec'), c.v('blastDamage'));
    c.expose(c.v('exposeSec'), c.v('exposeMul'));
    shake(c.host.scene, 'medium');
    // 부딪혀 멈추며 핵이 드러난다: 코어 충격파 + 파편
    const core = c.art('coreShock');
    if (core) playFx(c.host.scene, core, p.x, p.y, { w: c.v('radius') * 2.4, depth: 6 });
    debris(c.host.scene, c.host.rng, p, [c.art('debris'), c.art('debris2')].filter((x): x is SpriteRef => !!x), 10, [30, 80]);
  }

  destroy(): void {
    this.dash.destroy();
  }
}

/** 지각 균열: 플레이어 곁을 가로지르는 균열 3줄 (중앙 먼저, 양옆이 시차). 광폭화 시 발밑 폭발 추가 */
class CrustCrack extends Heavy {
  private readonly angle: number;
  private swingAt = -1;

  constructor(c: PatternCtx) {
    super(c, c.v('telegraphSec'));
    const p = c.host.playerPos();
    const a = angleTo(c.boss.pos(), p);
    this.angle = a;
    const o = { count: 2, liveSec: c.v('liveSec'), width: c.v('width'), damage: c.v('damage'), angle: a };
    beam(c, { ...o, center: p, telegraphSec: c.v('telegraphSec') });
    for (const s of [-1, 1]) {
      const off = { x: p.x + Math.cos(a + Math.PI / 2) * s * c.v('gap'), y: p.y + Math.sin(a + Math.PI / 2) * s * c.v('gap') };
      beam(c, { ...o, center: off, telegraphSec: c.v('telegraphSec') + c.v('lagSec') });
    }
    // 휘두르는 순간 균열 자리에서 지층이 깨져 솟는다
    this.at(c.v('telegraphSec'), () => {
      this.swingAt = this.t;
      const strata = c.art('strata');
      if (strata) playFx(c.host.scene, strata, p.x, p.y, { w: c.v('gap') * 3.2, depth: 2 });
      debris(c.host.scene, c.host.rng, p, [c.art('debris'), c.art('debris2')].filter((x): x is SpriteRef => !!x), 6, [20, 50]);
      shake(c.host.scene, 'medium');
    });
    if (c.v('footRadius') > 0) this.at(c.v('telegraphSec') + c.v('lagSec'), () => blast(c, c.host.playerPos(), c.v('footRadius'), c.v('footDelaySec'), c.v('damage')));
  }

  protected override tick(dt: number): void {
    if (this.swingAt < 0) {
      // 준비: 팔을 뒤로 당기며 젖힌다
      super.tick(dt);
      coil(this.c.boss, this.t / this.c.v('telegraphSec'), this.angle, 1.2);
      return;
    }
    this.c.boss.setVelocity(0, 0);
    lunge(this.c.boss, this.t - this.swingAt, this.angle, 0.35, 1.3);
  }
}

/** 붕괴 지대: 플레이어 둘레 장판 8개가 번갈아 폭발 + 보스 중심 틈 있는 충격파 */
class CollapseZone extends Heavy {
  constructor(c: PatternCtx) {
    super(c, c.v('waveAtSec'));
    const p = c.host.playerPos();
    const n = c.v('rocks');
    const base = c.host.rng.range(0, Math.PI * 2);
    // 플레이어 둘레에 고대 병기 여덟 기둥이 솟는다
    const lock = c.art('lock');
    if (lock) playFx(c.host.scene, lock, p.x, p.y, { w: c.v('circle') * 2.8, depth: 2 });
    for (let i = 0; i < n; i++) {
      const a = base + (i * Math.PI * 2) / n;
      blast(c, { x: p.x + Math.cos(a) * c.v('circle'), y: p.y + Math.sin(a) * c.v('circle') }, c.v('radius'), c.v('delaySec') + (i % 2) * c.v('lagSec'), c.v('damage'));
    }
    const from = c.boss.radius();
    this.at(c.v('waveAtSec'), () => {
      ring(c, { center: c.boss.pos(), fromR: from, toR: c.v('maxRadius'), moveSec: (c.v('maxRadius') - from) / c.v('speed'), thickness: c.v('thickness'), damage: c.v('damage'), gapAngle: angleTo(c.boss.pos(), c.host.playerPos()), gapDeg: c.v('gapDeg'), quake: true });
      this.impact(1.3);
    });
  }
}

/** 종말의 단층·적층: 세로 단층이 순차로 닫힌 뒤 가로 단층이 잇는다. 단층이 닫힐 때마다 주먹으로 땅을 친다 */
class DoomFault extends Heavy {
  constructor(c: PatternCtx) {
    super(c, c.v('delaySec'));
    const a = c.host.arena();
    const p = c.host.playerPos();
    const n = c.v('columns');
    const w = c.v('width');
    for (let i = 0; i < n; i++) {
      const at = { x: p.x + (i - (n - 1) / 2) * c.v('gap'), y: p.y };
      faultBand(c, rectAt(a, at, true, w), true, c.v('delaySec') + i * c.v('stepSec'), c.v('damage'));
      this.at(c.v('delaySec') + i * c.v('stepSec'), () => {
        this.impact(i === 0 ? 1.2 : 0.7);
        debris(c.host.scene, c.host.rng, at, [c.art('debris'), c.art('debris2')].filter((x): x is SpriteRef => !!x), 4, [15, 40]);
      });
    }
    const rows = c.v('rows');
    const after = c.v('delaySec') + n * c.v('stepSec');
    this.at(after, () => {
      const pl = c.host.playerPos();
      for (let i = 0; i < rows; i++) {
        faultBand(c, rectAt(a, { x: pl.x, y: pl.y + (i - (rows - 1) / 2) * c.v('rowGap') }, false, w), false, c.v('delaySec'), c.v('damage'));
      }
    });
  }
}

// ---------- 식광 ----------

/** 그림자 추적: 발밑 장판이 잠깐 따라오다 고정되고, 고정된 뒤 터진다 */
class ShadowChase extends Timed {
  constructor(c: PatternCtx) {
    super(c);
    c.host.addHazard(new FollowBlast(c.host.scene, c.host.playerPos(), c.v('radius'), c.v('speed'), c.v('followSec') + c.v('lockSec'), c.v('damage'), c.boss.color, c.v('lockSec'), { track: c.art('followTrack'), lock: c.art('followLock'), hit: c.art('followHit') }));
  }
}

/** 조준 부채꼴 탄막 (궤도 절단·일식의 파편·붉은 탄막) */
class AimFan extends Timed {
  constructor(c: PatternCtx) {
    super(c);
    this.at(c.v('windupSec'), () => {
      const p = c.boss.pos();
      fan(c, p, angleTo(p, c.host.playerPos()), c.v('bullets'), c.v('spreadDeg'), c.v('speed'), c.v('range'), c.v('damage'), c.v('refractable') > 0);
    });
  }
}

/** 광역 잠식·일식: 큰 폭발 예고, 표시된 안전 원 안에서만 피한다 */
class SafeCircle extends Timed {
  constructor(c: PatternCtx) {
    super(c);
    safeBlast(c, c.v('safeZones'), c.v('safeRadius'), c.v('delaySec'), c.v('damage'));
  }
}

/** 중력 붕괴: 플레이어를 끌어당긴 뒤 중심 폭발. 인력에 맞서 위험 반경 밖으로 */
class GravityCollapse extends Timed {
  constructor(c: PatternCtx) {
    super(c);
    c.host.addHazard(new DelayedBlast(c.host.scene, c.boss.pos(), c.v('radius'), c.v('pullSec'), c.v('damage'), c.boss.color, { warn: c.art('blastWarn'), hit: c.art('blastHit') }));
  }

  protected override tick(dt: number): void {
    super.tick(dt);
    if (this.t > this.c.v('pullSec')) return;
    const b = this.c.boss.pos();
    const p = this.c.host.playerPos();
    const d = Math.hypot(b.x - p.x, b.y - p.y);
    if (d < 1) return;
    const s = this.c.v('pullSpeed');
    this.c.host.pushPlayer({ x: ((b.x - p.x) / d) * s, y: ((b.y - p.y) / d) * s });
  }
}

// ---------- 마기카이저 ----------

/** 어깨 유도 미사일: 양쪽 어깨에서 번갈아 */
class HomingMissiles extends Timed {
  constructor(c: PatternCtx) {
    super(c);
    const n = c.v('count');
    for (let i = 0; i < n; i++) {
      this.at(i * c.v('intervalSec'), () => {
        const p = c.boss.pos();
        const side = i % 2 === 0 ? 1 : -1;
        const a = angleTo(p, c.host.playerPos());
        const from = { x: p.x + Math.cos(a + Math.PI / 2) * side * c.boss.radius(), y: p.y + Math.sin(a + Math.PI / 2) * side * c.boss.radius() };
        c.host.fireEnemyMissile(from, a + side * rad(c.v('spreadDeg')), c.v('speed'), c.v('range'), c.v('damage'), c.v('turnRate'), c.art('missile'));
      });
    }
  }
}

/** 직선 레이저: 예고 뒤 고정된 방향으로 발사 (계속 쫓아오는 광선이 아니다) */
class LineLaser extends Timed {
  constructor(c: PatternCtx) {
    super(c);
    const p = c.boss.pos();
    beam(c, { center: p, angle: angleTo(p, c.host.playerPos()), telegraphSec: c.v('telegraphSec'), liveSec: c.v('liveSec'), width: c.v('width'), damage: c.v('damage') });
  }
}

/** 지면 충격파: 틈은 플레이어 반대쪽. 보스를 돌아가야 지난다 */
class GroundShock extends Timed {
  constructor(c: PatternCtx) {
    super(c);
    this.at(c.v('windupSec'), () => {
      const p = c.boss.pos();
      const from = c.boss.radius();
      ring(c, { center: p, fromR: from, toR: c.v('maxRadius'), moveSec: (c.v('maxRadius') - from) / c.v('speed'), thickness: c.v('thickness'), damage: c.v('damage'), gapAngle: angleTo(p, c.host.playerPos()) + Math.PI, gapDeg: c.v('gapDeg') });
    });
  }
}

/** 지열 분출 (1단계): 예상 위치와 그 곁에 원형 폭발 3개 */
class Geyser extends Timed {
  constructor(c: PatternCtx) {
    super(c);
    for (let i = 0; i < c.v('count'); i++) {
      this.at(i * c.v('stepSec'), () => blast(c, predict(c, c.v('delaySec'), i === 0 ? 0 : c.v('spread')), c.v('radius'), c.v('delaySec'), c.v('damage')));
    }
  }
}

/** 고속 돌진: 짧은 예고 뒤 길게 돌진하며 미사일을 흘리고, 끝나면 회복 구간 */
class KaiserDash implements PatternRun {
  private readonly dash: Dash;
  bodyPose = () => this.dash.bodyPose();
  private shot = 0;
  private done = false;

  constructor(private readonly c: PatternCtx) {
    this.dash = new Dash(c, false);
  }

  update(dt: number): void {
    const c = this.c;
    this.dash.update(dt);
    if (this.dash.finished && !this.done) {
      this.done = true;
      c.expose(c.v('exposeSec'), c.v('exposeMul'));
    }
    if (!this.dash.dashing) return;
    this.shot -= dt;
    if (this.shot > 0) return;
    this.shot = c.v('missileEverySec');
    const a = Math.atan2(this.dash.dir.y, this.dash.dir.x) + (c.host.rng.chance(0.5) ? 1 : -1) * Math.PI / 2;
    c.host.fireEnemyMissile(c.boss.pos(), a, c.v('missileSpeed'), c.v('missileRange'), c.v('missileDamage'), c.v('turnRate'), c.art('missile'));
  }

  destroy(): void {
    this.dash.destroy();
  }
}

/** 불안정 레이저: 5방향 전개, 잠시 뒤 50% 확률로 회전 (방향도 무작위) */
class UnstableLaser extends Timed {
  constructor(c: PatternCtx) {
    super(c);
    const spins = c.host.rng.chance(c.v('spinChance'));
    beam(c, {
      angle: angleTo(c.boss.pos(), c.host.playerPos()),
      count: c.v('beams'),
      telegraphSec: c.v('telegraphSec'),
      liveSec: c.v('liveSec'),
      width: c.v('width'),
      damage: c.v('damage'),
      tickSec: c.v('tickSec'),
      spin: spins ? c.v('spinSpeed') * (c.host.rng.chance(0.5) ? 1 : -1) : 0,
      spinDelaySec: c.v('spinDelaySec'),
    });
  }
}

/** 종말 명령: 중앙으로 가 끌어당기며 직선 → 교차 → 충격파 → 초광역 포격. 끝나면 과열로 핵 노출 */
class DoomCommand extends Timed {
  private readonly center: Vec2;
  constructor(c: PatternCtx) {
    super(c);
    const a = c.host.arena();
    this.center = { x: a.x + a.w / 2, y: a.y + a.h / 2 };
    const o = () => ({ telegraphSec: c.v('beamTelegraphSec'), liveSec: c.v('beamLiveSec'), width: c.v('beamWidth'), damage: c.v('beamDamage') });
    this.at(c.v('lineAtSec'), () => beam(c, { ...o(), center: this.center, angle: angleTo(this.center, c.host.playerPos()) }));
    this.at(c.v('crossAtSec'), () => beam(c, { ...o(), center: this.center, count: 4, angle: angleTo(this.center, c.host.playerPos()) + Math.PI / 4 }));
    this.at(c.v('waveAtSec'), () => ring(c, { center: this.center, fromR: c.boss.radius(), toR: c.v('maxRadius'), moveSec: (c.v('maxRadius') - c.boss.radius()) / c.v('speed'), thickness: c.v('thickness'), damage: c.v('beamDamage'), gapAngle: angleTo(this.center, c.host.playerPos()) + Math.PI, gapDeg: c.v('gapDeg') }));
    this.at(c.v('blastAtSec'), () => safeBlast(c, c.v('safeZones'), c.v('safeRadius'), c.v('delaySec'), c.v('damage')));
    this.at(c.v('blastAtSec') + c.v('delaySec'), () => c.expose(c.v('exposeSec'), c.v('exposeMul')));
  }

  protected override tick(_dt: number): void {
    const c = this.c;
    const b = c.boss.pos();
    const d = Math.hypot(this.center.x - b.x, this.center.y - b.y);
    if (this.t < c.v('moveSec') && d > 4) c.boss.setVelocity(((this.center.x - b.x) / d) * c.v('moveSpeed'), ((this.center.y - b.y) / d) * c.v('moveSpeed'));
    else c.boss.setVelocity(0, 0);
    if (this.t > c.v('pullSec')) return;
    const p = c.host.playerPos();
    const dp = Math.hypot(this.center.x - p.x, this.center.y - p.y);
    if (dp > 1) c.host.pushPlayer({ x: ((this.center.x - p.x) / dp) * c.v('pullSpeed'), y: ((this.center.y - p.y) / dp) * c.v('pullSpeed') });
  }
}

/** 계승: 악귀 분출. 대형 분출과 주변 연쇄 폭발, 집행자 호출 (상한까지만) */
class RedEruption extends Timed {
  constructor(c: PatternCtx) {
    super(c);
    const p = c.boss.pos();
    blast(c, p, c.v('radius'), c.v('delaySec'), c.v('damage'));
    const n = c.v('blasts');
    for (let i = 0; i < n; i++) {
      const a = (i * Math.PI * 2) / n;
      blast(c, { x: p.x + Math.cos(a) * c.v('circle'), y: p.y + Math.sin(a) * c.v('circle') }, c.v('blastRadius'), c.v('delaySec') + (i + 1) * c.v('stepSec'), c.v('damage'));
    }
    this.at(c.v('delaySec'), () => {
      if (c.summonId && c.minionCount(c.summonId) < c.v('maxSummon')) c.summon([c.summonId], true);
    });
  }
}

const PATTERNS: Readonly<Record<string, (c: PatternCtx) => PatternRun>> = {
  // 융합악귀
  claw: (c) => new Claw(c),
  spiritDash: (c) => new SpiritDash(c),
  eruption: (c) => new Eruption(c),
  spiritBlast: (c) => new SpiritBurst(c),
  // 전기환띠
  lightningChase: (c) => new LightningChase(c),
  shockRipple: (c) => new ShockRipple(c),
  spinLightning: (c) => new SpinBeam(c),
  prison: (c) => new Prison(c),
  edgeLock: (c) => new LockGrid(c),
  shrinkCurrent: (c) => new ShrinkCurrent(c),
  crossCut: (c) => new CrossCut(c),
  chaseField: (c) => new ChaseField(c),
  blueDash: (c) => new BlueDash(c),
  // 헥타르 수석 연구원
  repulse: (c) => new Repulse(c),
  droneFire: (c) => new DroneFire(c),
  antimatter: (c) => new Antimatter(c),
  railCross: (c) => new RailCross(c),
  mineSiege: (c) => new MineSiege(c),
  vectorField: (c) => new GapWave(c),
  boltProof: (c) => new BoltProof(c),
  callTroopers: (c) => new CallTroopers(c),
  // 마기골렘
  earthCrush: (c) => new EarthCrush(c),
  bombard: (c) => new Bombard(c),
  ruinBeam: (c) => new RuinBeam(c),
  breakerDash: (c) => new BreakerDash(c),
  ruinLegion: (c) => new RuinLegion(c),
  crustCrack: (c) => new CrustCrack(c),
  collapseZone: (c) => new CollapseZone(c),
  doomFault: (c) => new DoomFault(c),
  golemIntimidate: (c) => new Intimidate(c),
  // 식광
  sunspotFall: (c) => new Bombard(c),
  orbitCut: (c) => new AimFan(c),
  shadowChase: (c) => new ShadowChase(c),
  eclipseShards: (c) => new AimFan(c),
  wideErosion: (c) => new SafeCircle(c),
  gravityCollapse: (c) => new GravityCollapse(c),
  totalEclipse: (c) => new SafeCircle(c),
  // 마기카이저
  lineLaser: (c) => new LineLaser(c),
  groundShock: (c) => new GroundShock(c),
  homingMissiles: (c) => new HomingMissiles(c),
  redBarrage: (c) => new AimFan(c),
  geyser: (c) => new Geyser(c),
  kaiserPunch: (c) => new Claw(c),
  kaiserDash: (c) => new KaiserDash(c),
  spinLaser: (c) => new SpinBeam(c),
  unstableLaser: (c) => new UnstableLaser(c),
  kaiserIntimidate: (c) => new Intimidate(c),
  doomCommand: (c) => new DoomCommand(c),
  redChase: (c) => new ChaseField(c),
  redFault: (c) => new DoomFault(c),
  redSunspots: (c) => new Bombard(c),
  redEruption: (c) => new RedEruption(c),
  // 히든보스
  warCry: (c) => new WarCry(c),
  whirlDash: (c) => new WhirlDash(c),
  bleedField: (c) => new BleedField(c),
  groundBreak: (c) => new GroundBreak(c),
  earthShatter: (c) => new EarthShatter(c),
  blinkBarrage: (c) => new BlinkBarrage(c),
  greatLaser: (c) => new GreatLaser(c),
  clones: (c) => new Clones(c),
  magiStrike: (c) => new MagiStrike(c),
  holySwords: (c) => new HolySwords(c),
  maceSmash: (c) => new MaceSmash(c),
  shieldThrow: (c) => new ShieldThrow(c),
  judgment: (c) => new Judgment(c),
};

export function makePattern(id: string, c: PatternCtx): PatternRun | null {
  return PATTERNS[id]?.(c) ?? null;
}

export const BOSS_PATTERN_IDS = Object.keys(PATTERNS);
