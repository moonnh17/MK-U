/**
 * 챕터1 보스 패턴. 패턴 id → 실행 객체. 수치는 bosses.json의 values(강화 단계는 `키Enraged`).
 * 패턴은 보스를 멈추거나 돌진시키고, 피해는 entities/hazard.ts의 위험 지대·적 탄으로 준다.
 */
import type Phaser from 'phaser';
import type { Vec2 } from '../core/actions';
import { DelayedBlast, Beams, EdgeBand, Ring, SectorBlast, Zone } from '../entities/hazard';
import type { BossHost, PatternRun } from './host';

/** 패턴이 다루는 보스 */
export interface BossBody {
  pos(): Vec2;
  radius(): number;
  setVelocity(x: number, y: number): void;
  /** 이번 프레임에 벽에 막혔는지 */
  blocked(): boolean;
  color: number;
}

export interface PatternCtx {
  boss: BossBody;
  host: BossHost;
  /** 수치 (강화 단계면 `키Enraged` 우선) */
  v(key: string): number;
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
  private dir: Vec2 = { x: 1, y: 0 };
  private traveled = 0;
  private dashing = false;
  private hit = false;
  private sinceTrail = 0;
  private readonly line: Phaser.GameObjects.Graphics;

  constructor(
    c: PatternCtx,
    private readonly trail: boolean,
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
    if (this.traveled >= c.v('length') || (this.traveled > 4 && c.boss.blocked())) {
      this.dashing = false;
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
};

export function makePattern(id: string, c: PatternCtx): PatternRun | null {
  return PATTERNS[id]?.(c) ?? null;
}

export const BOSS_PATTERN_IDS = Object.keys(PATTERNS);
