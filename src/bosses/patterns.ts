/**
 * 보스 패턴 (챕터1~3 보스·히든보스). 같은 동작은 패턴 id만 달리 해 다시 쓴다(예: 마기카이저 기계 펀치 = 대지 분쇄). 패턴 id → 실행 객체. 수치는 bosses.json의 values(강화 단계는 `키Enraged`).
 * 패턴은 보스를 멈추거나 돌진시키고, 피해는 entities/hazard.ts의 위험 지대·적 탄으로 준다.
 */
import type Phaser from 'phaser';
import type { Vec2 } from '../core/actions';
import { BouncingDisc, DelayedBlast, Beams, EdgeBand, FollowBlast, OrbitBlades, RectBlast, Ring, SafeZoneBlast, SectorBlast, Zone } from '../entities/hazard';
import type { BossHost, PatternRun } from './host';

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
  color: number;
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
  /** 적 무리 소환 (보상 없음, 살아 있는 동안 이 패턴은 다시 쓰지 않는다) */
  summon(enemyIds: readonly string[]): void;
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

function angleTo(a: Vec2, b: Vec2): number {
  return Math.atan2(b.y - a.y, b.x - a.x);
}

/** 악귀 할퀴기: 플레이어 쪽 부채꼴 2연속 */
class Claw extends Timed {
  constructor(c: PatternCtx) {
    super(c);
    const swipe = () => {
      const p = c.boss.pos();
      c.host.addHazard(
        new SectorBlast(c.host.scene, p, angleTo(p, c.host.playerPos()), c.v('radius'), c.v('arcDeg'), c.v('windupSec'), c.v('damage'), c.boss.color),
      );
    };
    this.at(0, swipe);
    this.at(c.v('secondDelaySec'), swipe);
  }
}

/** 예고선 → 돌진. trail이면 지나간 자리에 마기 영역 (원혼 돌진 / 청뢰 돌진) */
class Dash extends Timed {
  /** 돌진을 마쳤다 (연속 돌진·마기 강타가 다음 동작으로 넘어간다) */
  finished = false;
  private dir: Vec2 = { x: 1, y: 0 };
  private traveled = 0;
  private dashing = false;
  private hit = false;
  private sinceTrail = 0;
  private readonly line: Phaser.GameObjects.Graphics;

  constructor(
    c: PatternCtx,
    private readonly trail: boolean,
    /** 플레이어와 이만큼 가까워지면 멈춘다 (0이면 끝까지) */
    private readonly stopDist = 0,
  ) {
    super(c);
    const p = c.boss.pos();
    const a = angleTo(p, c.host.playerPos());
    this.dir = { x: Math.cos(a), y: Math.sin(a) };
    const len = c.v('length');
    this.line = c.host.scene.add.graphics().setDepth(2);
    this.line.lineStyle(c.boss.radius() * 2, c.boss.color, 0.25).lineBetween(p.x, p.y, p.x + this.dir.x * len, p.y + this.dir.y * len);
    this.at(c.v('windupSec'), () => {
      this.line.clear();
      this.dashing = true;
    });
  }

  protected override tick(dt: number): void {
    const c = this.c;
    if (!this.dashing) {
      c.boss.setVelocity(0, 0);
      return;
    }
    const speed = c.v('speed');
    const pl0 = c.host.playerPos();
    const b0 = c.boss.pos();
    const near = this.stopDist > 0 && Math.hypot(pl0.x - b0.x, pl0.y - b0.y) <= this.stopDist + c.boss.radius();
    if (this.traveled >= c.v('length') || (this.traveled > 4 && c.boss.blocked()) || near) {
      this.dashing = false;
      this.finished = true;
      c.boss.setVelocity(0, 0);
      return;
    }
    c.boss.setVelocity(this.dir.x * speed, this.dir.y * speed);
    this.traveled += speed * dt;
    const p = c.boss.pos();
    const pl = c.host.playerPos();
    if (!this.hit && Math.hypot(pl.x - p.x, pl.y - p.y) <= c.boss.radius() + c.host.playerRadius) {
      this.hit = c.host.hurtPlayer(c.v('damage'));
    }
    if (this.trail) {
      this.sinceTrail += speed * dt;
      if (this.sinceTrail >= c.v('trailEvery')) {
        this.sinceTrail = 0;
        c.host.addHazard(
          new Zone(c.host.scene, p, c.v('trailRadius'), c.v('trailSec'), c.v('trailDamage'), c.v('trailTickSec'), c.boss.color),
        );
      }
    }
  }

  override destroy(): void {
    super.destroy();
    this.line.destroy();
  }
}

/** 악귀 분출: 플레이어 쪽 부채꼴 탄 여러 번 (일반 탄: 굴절·탄 베기 가능) */
class Eruption extends Timed {
  constructor(c: PatternCtx) {
    super(c);
    for (let i = 0; i < c.v('volleys'); i++) {
      this.at(i * c.v('intervalSec'), () => {
        const p = c.boss.pos();
        const base = angleTo(p, c.host.playerPos());
        const n = c.v('bullets');
        const spread = (c.v('spreadDeg') * Math.PI) / 180;
        for (let k = 0; k < n; k++) {
          const a = n === 1 ? base : base - spread / 2 + (spread * k) / (n - 1);
          c.host.fireEnemyBullet(p, a, c.v('speed'), c.v('range'), c.v('damage'), true);
        }
      });
    }
  }
}

/** 원혼 폭발: 자기 둘레 예고 원 → 폭발 */
class SpiritBlast extends Timed {
  constructor(c: PatternCtx) {
    super(c);
    c.host.addHazard(new DelayedBlast(c.host.scene, c.boss.pos(), c.v('radius'), c.v('delaySec'), c.v('damage'), c.boss.color));
  }
}

/** 낙뢰 추적: 플레이어 자리에 예고 원이 연달아 */
class LightningChase extends Timed {
  constructor(c: PatternCtx) {
    super(c);
    for (let i = 0; i < c.v('strikes'); i++) {
      this.at(i * c.v('intervalSec'), () =>
        c.host.addHazard(new DelayedBlast(c.host.scene, c.host.playerPos(), c.v('radius'), c.v('delaySec'), c.v('damage'), c.boss.color)),
      );
    }
  }
}

/** 전격 파문: 보스에서 퍼지는 고리 */
class ShockRipple extends Timed {
  constructor(c: PatternCtx) {
    super(c);
    for (let i = 0; i < c.v('rings'); i++) {
      this.at(i * c.v('ringGapSec'), () => {
        const from = c.boss.radius();
        const to = c.v('maxRadius');
        c.host.addHazard(
          new Ring(c.host.scene, {
            center: c.boss.pos(),
            fromR: from,
            toR: to,
            moveSec: (to - from) / c.v('speed'),
            telegraphSec: 0,
            holdSec: 0,
            thickness: c.v('thickness'),
            damage: c.v('damage'),
            tickSec: 0,
            color: c.boss.color,
          }),
        );
      });
    }
  }
}

/** 회전 번개: 보스에서 뻗은 줄기가 돈다 (대형 레이저: 굴절 불가) */
class SpinLightning extends Timed {
  constructor(c: PatternCtx) {
    super(c);
    c.host.addHazard(
      new Beams(c.host.scene, {
        center: () => c.boss.pos(),
        count: c.v('beams'),
        length: c.v('length'),
        width: c.v('width'),
        spin: c.v('spinSpeed') * (c.host.rng.chance(0.5) ? 1 : -1),
        startAngle: c.host.rng.range(0, Math.PI * 2),
        telegraphSec: c.v('telegraphSec'),
        liveSec: c.v('liveSec'),
        damage: c.v('damage'),
        tickSec: c.v('tickSec'),
        color: c.boss.color,
      }),
    );
  }
}

/** 전격 감옥: 플레이어 둘레에 고리 벽 */
class Prison extends Timed {
  constructor(c: PatternCtx) {
    super(c);
    const r = c.v('radius');
    c.host.addHazard(
      new Ring(c.host.scene, {
        center: c.host.playerPos(),
        fromR: r,
        toR: r,
        moveSec: 0,
        telegraphSec: c.v('telegraphSec'),
        holdSec: c.v('liveSec'),
        thickness: c.v('thickness'),
        damage: c.v('damage'),
        tickSec: c.v('tickSec'),
        color: c.boss.color,
      }),
    );
  }
}

/** 뇌전 봉쇄: 방 가장자리부터 띠가 자란다 */
class EdgeLock extends Timed {
  constructor(c: PatternCtx) {
    super(c);
    c.host.addHazard(
      new EdgeBand(c.host.scene, c.host.arena(), c.v('width'), c.v('growSec'), c.v('liveSec'), c.v('damage'), c.v('tickSec'), c.boss.color),
    );
  }
}

/** 수축 전류: 바깥에서 보스 쪽으로 줄어드는 고리 */
class ShrinkCurrent extends Timed {
  constructor(c: PatternCtx) {
    super(c);
    c.host.addHazard(
      new Ring(c.host.scene, {
        center: c.boss.pos(),
        fromR: c.v('startRadius'),
        toR: c.boss.radius(),
        moveSec: c.v('shrinkSec'),
        telegraphSec: 0,
        holdSec: 0,
        thickness: c.v('thickness'),
        damage: c.v('damage'),
        tickSec: 0,
        color: c.boss.color,
      }),
    );
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
      c.host.scene.cameras.main.shake(250, 0.006);
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
      c.host.scene.cameras.main.shake(150, 0.005);
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

// ---------- 챕터2 보스 ----------

/** 척력 방출 (헥타르 수석 연구원): 자기 둘레에서 빠르게 퍼지는 고리 */
class Repulse extends Timed {
  constructor(c: PatternCtx) {
    super(c);
    this.at(c.v('windupSec'), () => {
      const from = c.boss.radius();
      const to = c.v('maxRadius');
      c.host.addHazard(
        new Ring(c.host.scene, {
          center: c.boss.pos(),
          fromR: from,
          toR: to,
          moveSec: (to - from) / c.v('speed'),
          telegraphSec: 0,
          holdSec: 0,
          thickness: c.v('thickness'),
          damage: c.v('damage'),
          tickSec: 0,
          color: c.boss.color,
        }),
      );
    });
  }
}

/** 마기 탄막 (헥타르 수석 연구원): 회전하는 나선 (일반 탄: 굴절·탄 베기 가능) */
class SpiralBarrage extends Timed {
  constructor(c: PatternCtx) {
    super(c);
    const start = c.host.rng.range(0, Math.PI * 2);
    const arms = c.v('arms');
    const dir = c.host.rng.chance(0.5) ? 1 : -1;
    for (let i = 0; i < c.v('volleys'); i++) {
      this.at(i * c.v('intervalSec'), () => {
        for (let k = 0; k < arms; k++) {
          const a = start + dir * i * c.v('stepRad') + (k * Math.PI * 2) / arms;
          c.host.fireEnemyBullet(c.boss.pos(), a, c.v('speed'), c.v('range'), c.v('damage'), true);
        }
      });
    }
  }
}

/** 반물질 폭발 (헥타르 수석 연구원): 플레이어 자리 큰 예고 원 (강화: 2연속) */
class Antimatter extends Timed {
  constructor(c: PatternCtx) {
    super(c);
    for (let i = 0; i < c.v('count'); i++) {
      this.at(i * c.v('gapSec'), () =>
        c.host.addHazard(new DelayedBlast(c.host.scene, clampTo(c.host.playerPos(), c, c.v('radius') / 2), c.v('radius'), c.v('delaySec'), c.v('damage'), c.boss.color)),
      );
    }
  }
}

/** 헥타르 전투원 호출 (헥타르 수석 연구원): 살아 있는 동안 다시 부르지 않는다 */
class CallTroopers extends Timed {
  constructor(c: PatternCtx) {
    super(c);
    this.at(c.v('windupSec'), () => {
      const id = c.summonId;
      if (id) c.summon(Array.from({ length: c.v('count') }, () => id));
    });
  }
}

/** 대지 분쇄 (마기골렘): 앞쪽 큰 부채꼴 */
class EarthCrush extends Timed {
  constructor(c: PatternCtx) {
    super(c);
    const p = c.boss.pos();
    c.host.addHazard(new SectorBlast(c.host.scene, p, angleTo(p, c.host.playerPos()), c.v('radius'), c.v('arcDeg'), c.v('windupSec'), c.v('damage'), c.boss.color));
  }
}

/** 마기 포격 (마기골렘): 플레이어 둘레에 포격 예고 원 여러 개 */
class Bombard extends Timed {
  constructor(c: PatternCtx) {
    super(c);
    for (let i = 0; i < c.v('shells'); i++) {
      this.at(i * c.v('stepSec'), () =>
        c.host.addHazard(new DelayedBlast(c.host.scene, around(c, i, c.v('spread'), c.v('radius')), c.v('radius'), c.v('delaySec'), c.v('damage'), c.boss.color)),
      );
    }
  }
}

/** 파멸 광선 (마기골렘): 굵은 레이저가 천천히 돈다 (대형 레이저: 굴절 불가) */
class RuinBeam extends Timed {
  constructor(c: PatternCtx) {
    super(c);
    const p = c.boss.pos();
    c.host.addHazard(
      new Beams(c.host.scene, {
        center: () => c.boss.pos(),
        count: 1,
        length: c.v('length'),
        width: c.v('width'),
        spin: c.v('spinSpeed') * (c.host.rng.chance(0.5) ? 1 : -1),
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

/** 파성 돌진 (마기골렘): 긴 돌진, 벽에 부딪히면 멈추고 핵이 드러난다 */
class BreakerDash implements PatternRun {
  private readonly dash: Dash;
  private checked = false;

  constructor(private readonly c: PatternCtx) {
    this.dash = new Dash(c, false);
  }

  update(dt: number): void {
    this.dash.update(dt);
    if (!this.dash.finished || this.checked) return;
    this.checked = true;
    if (this.c.boss.blocked()) {
      this.c.expose(this.c.v('exposeSec'), this.c.v('exposeMul'));
      this.c.host.scene.cameras.main.shake(200, 0.008);
    }
  }

  destroy(): void {
    this.dash.destroy();
  }
}

/** 폐허의 군세 (마기골렘): 지금 챕터 일반 적을 부른다 */
class RuinLegion extends Timed {
  constructor(c: PatternCtx) {
    super(c);
    this.at(c.v('windupSec'), () => {
      const roster = c.host.chapterRoster();
      if (roster.length > 0) c.summon(Array.from({ length: c.v('count') }, () => c.host.rng.pick(roster)));
    });
  }
}

/** 지각 균열 (마기골렘 광폭화): 플레이어 쪽으로 뻗는 직선 균열 여러 줄 */
class CrustCrack extends Timed {
  constructor(c: PatternCtx) {
    super(c);
    const p = c.boss.pos();
    const base = angleTo(p, c.host.playerPos());
    const n = c.v('lines');
    const spread = (c.v('spreadDeg') * Math.PI) / 180;
    for (let i = 0; i < n; i++) {
      const a = n === 1 ? base : base - spread / 2 + (spread * i) / (n - 1);
      c.host.addHazard(
        new Beams(c.host.scene, {
          center: () => p,
          count: 1,
          length: c.v('length'),
          width: c.v('width'),
          spin: 0,
          startAngle: a,
          telegraphSec: c.v('telegraphSec'),
          liveSec: c.v('liveSec'),
          damage: c.v('damage'),
          tickSec: c.v('tickSec'),
          color: c.boss.color,
        }),
      );
    }
  }
}

/** 붕괴 지대 (마기골렘 광폭화): 방 곳곳에 낙석 예고 원 */
class CollapseZone extends Timed {
  constructor(c: PatternCtx) {
    super(c);
    const a = c.host.arena();
    const r = c.v('radius');
    for (let i = 0; i < c.v('rocks'); i++) {
      this.at(i * c.v('stepSec'), () => {
        const at = { x: c.host.rng.range(a.x + r, a.x + a.w - r), y: c.host.rng.range(a.y + r, a.y + a.h - r) };
        c.host.addHazard(new DelayedBlast(c.host.scene, at, r, c.v('delaySec'), c.v('damage'), c.boss.color));
      });
    }
  }
}

/** 종말의 단층 (마기골렘 광폭화): 플레이어를 지나 방을 가로지르는 넓은 띠 (가로·세로 무작위) */
class DoomFault extends Timed {
  constructor(c: PatternCtx) {
    super(c);
    const a = c.host.arena();
    const p = c.host.playerPos();
    const w = c.v('width');
    const rect = c.host.rng.chance(0.5) ? { x: a.x, y: p.y - w / 2, w: a.w, h: w } : { x: p.x - w / 2, y: a.y, w, h: a.h };
    c.host.addHazard(new RectBlast(c.host.scene, rect, c.v('delaySec'), c.v('damage'), c.boss.color));
  }
}

// ---------- 챕터3 보스 ----------

/** 그림자 추적 (식광): 플레이어 발밑에서 따라오는 그림자가 잠시 뒤 터진다 */
class ShadowChase extends Timed {
  constructor(c: PatternCtx) {
    super(c);
    c.host.addHazard(new FollowBlast(c.host.scene, c.host.playerPos(), c.v('radius'), c.v('speed'), c.v('followSec'), c.v('damage'), c.boss.color));
  }
}

/** 고리 탄막: 회전하며 퍼지는 원형 탄 (식광 일식의 파편 / 마기카이저 붉은 탄막: refractable 0이면 굴절·탄 베기 불가) */
class RingBarrage extends Timed {
  constructor(c: PatternCtx) {
    super(c);
    const start = c.host.rng.range(0, Math.PI * 2);
    const n = c.v('bullets');
    for (let i = 0; i < c.v('volleys'); i++) {
      this.at(i * c.v('intervalSec'), () => {
        for (let k = 0; k < n; k++) {
          const a = start + i * c.v('rotRad') + (k * Math.PI * 2) / n;
          c.host.fireEnemyBullet(c.boss.pos(), a, c.v('speed'), c.v('range'), c.v('damage'), c.v('refractable') > 0);
        }
      });
    }
  }
}

/** 중력 붕괴 (식광): 플레이어를 보스 쪽으로 끌어당긴 뒤 중심 폭발 */
class GravityCollapse extends Timed {
  constructor(c: PatternCtx) {
    super(c);
    c.host.addHazard(new DelayedBlast(c.host.scene, c.boss.pos(), c.v('radius'), c.v('pullSec'), c.v('damage'), c.boss.color));
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

/** 궤도 절단 (식광 강화): 보스 둘레를 도는 칼날, 궤도가 넓어졌다 좁아진다 */
class OrbitCut extends Timed {
  constructor(c: PatternCtx) {
    super(c);
    c.host.addHazard(
      new OrbitBlades(c.host.scene, {
        center: () => c.boss.pos(),
        blades: c.v('blades'),
        minRadius: c.v('minRadius'),
        maxRadius: c.v('maxRadius'),
        breathSec: c.v('breathSec'),
        spin: c.v('spinSpeed') * (c.host.rng.chance(0.5) ? 1 : -1),
        bladeRadius: c.v('bladeRadius'),
        telegraphSec: c.v('telegraphSec'),
        liveSec: c.v('liveSec'),
        damage: c.v('damage'),
        color: c.boss.color,
      }),
    );
  }
}

/** 유도 미사일 (마기카이저): 플레이어 쪽으로 휘는 탄 (일반 탄: 굴절·탄 베기 가능) */
class HomingMissiles extends Timed {
  constructor(c: PatternCtx) {
    super(c);
    const n = c.v('count');
    for (let i = 0; i < n; i++) {
      this.at(i * c.v('intervalSec'), () => {
        const p = c.boss.pos();
        // 양옆으로 벌려 쏜 뒤 휘어 들어온다
        const a = angleTo(p, c.host.playerPos()) + (i % 2 === 0 ? 1 : -1) * (0.6 + 0.3 * Math.floor(i / 2));
        c.host.fireEnemyMissile(p, a, c.v('speed'), c.v('range'), c.v('damage'), c.v('turnRate'));
      });
    }
  }
}

/** 직선 레이저 (마기카이저): 예고선 → 플레이어 쪽으로 굵은 레이저 */
class LineLaser extends Timed {
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

/** 양팔 교차 (마기카이저): 플레이어 양옆에서 시작한 레이저 두 줄이 안쪽으로 좁혀 와 엇갈린다 */
class CrossLaser extends Timed {
  constructor(c: PatternCtx) {
    super(c);
    const p = c.boss.pos();
    const base = angleTo(p, c.host.playerPos());
    const off = (c.v('offsetDeg') * Math.PI) / 180;
    for (const side of [-1, 1]) {
      c.host.addHazard(
        new Beams(c.host.scene, {
          center: () => c.boss.pos(),
          count: 1,
          length: c.v('length'),
          width: c.v('width'),
          spin: -side * c.v('spinSpeed'),
          startAngle: base + side * off,
          telegraphSec: c.v('telegraphSec'),
          liveSec: c.v('liveSec'),
          damage: c.v('damage'),
          tickSec: c.v('tickSec'),
          color: c.boss.color,
        }),
      );
    }
  }
}

/** 종말 명령 (마기카이저): 방 전체 예고, 안전지대 몇 곳만 남기고 대폭발 */
class DoomCommand extends Timed {
  constructor(c: PatternCtx) {
    super(c);
    const a = c.host.arena();
    const r = c.v('safeRadius');
    const m = r + 10;
    const safe: Vec2[] = [];
    for (let tries = 0; safe.length < c.v('safeZones') && tries < 60; tries++) {
      const at = { x: c.host.rng.range(a.x + m, a.x + a.w - m), y: c.host.rng.range(a.y + m, a.y + a.h - m) };
      // 안전지대끼리 겹치지 않게
      if (safe.every((s) => Math.hypot(s.x - at.x, s.y - at.y) > r * 3)) safe.push(at);
    }
    c.host.addHazard(new SafeZoneBlast(c.host.scene, a, safe, r, c.v('delaySec'), c.v('damage'), c.boss.color));
    c.host.scene.cameras.main.shake(c.v('delaySec') * 1000, 0.002);
  }
}

const PATTERNS: Readonly<Record<string, (c: PatternCtx) => PatternRun>> = {
  claw: (c) => new Claw(c),
  spiritDash: (c) => new Dash(c, true),
  eruption: (c) => new Eruption(c),
  spiritBlast: (c) => new SpiritBlast(c),
  lightningChase: (c) => new LightningChase(c),
  shockRipple: (c) => new ShockRipple(c),
  spinLightning: (c) => new SpinLightning(c),
  prison: (c) => new Prison(c),
  blueDash: (c) => new Dash(c, false),
  edgeLock: (c) => new EdgeLock(c),
  shrinkCurrent: (c) => new ShrinkCurrent(c),
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
  repulse: (c) => new Repulse(c),
  spiralBarrage: (c) => new SpiralBarrage(c),
  antimatter: (c) => new Antimatter(c),
  callTroopers: (c) => new CallTroopers(c),
  earthCrush: (c) => new EarthCrush(c),
  bombard: (c) => new Bombard(c),
  ruinBeam: (c) => new RuinBeam(c),
  breakerDash: (c) => new BreakerDash(c),
  ruinLegion: (c) => new RuinLegion(c),
  crustCrack: (c) => new CrustCrack(c),
  collapseZone: (c) => new CollapseZone(c),
  doomFault: (c) => new DoomFault(c),
  sunspotFall: (c) => new Bombard(c),
  shadowChase: (c) => new ShadowChase(c),
  eclipseShards: (c) => new RingBarrage(c),
  gravityCollapse: (c) => new GravityCollapse(c),
  orbitCut: (c) => new OrbitCut(c),
  wideErosion: (c) => new EdgeLock(c),
  kaiserBarrage: (c) => new Eruption(c),
  homingMissiles: (c) => new HomingMissiles(c),
  lineLaser: (c) => new LineLaser(c),
  kaiserPunch: (c) => new EarthCrush(c),
  groundShock: (c) => new Repulse(c),
  kaiserDash: (c) => new Dash(c, false),
  spinLaser: (c) => new SpinLightning(c),
  crossLaser: (c) => new CrossLaser(c),
  redBarrage: (c) => new RingBarrage(c),
  doomCommand: (c) => new DoomCommand(c),
};

export function makePattern(id: string, c: PatternCtx): PatternRun | null {
  return PATTERNS[id]?.(c) ?? null;
}

export const BOSS_PATTERN_IDS = Object.keys(PATTERNS);
