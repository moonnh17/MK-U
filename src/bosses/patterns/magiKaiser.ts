/** 마기카이저 패턴 */
import { shake } from '../../entities/juice';
import type { Vec2 } from '../../core/actions';
import { playFx } from '../../skills/skillFx';
import type { SpriteRef } from '../../types/data';
import type { PatternRun } from '../host';
import { burst, coil, debris, easeOut, lunge, motes, shockRing } from '../bossFx';
import { Timed, Channeled, angleTo, Dash, rad, blast, predict, beam, ring, safeBlast, muzzle } from './base';
import type { PatternCtx } from './base';
import { Heavy } from './magiGolem';

/** 어깨 유도 미사일: 양쪽 어깨에서 번갈아 */
export class HomingMissiles extends Timed {
  private kickAt = -1;

  constructor(c: PatternCtx) {
    super(c);
    const n = c.v('count');
    for (let i = 0; i < n; i++) {
      this.at(i * c.v('intervalSec'), () => {
        const p = c.boss.pos();
        const side = i % 2 === 0 ? 1 : -1;
        const a = angleTo(p, c.host.playerPos());
        const from = { x: p.x + Math.cos(a + Math.PI / 2) * side * c.boss.radius(), y: p.y + Math.sin(a + Math.PI / 2) * side * c.boss.radius() };
        const fa = a + side * rad(c.v('spreadDeg'));
        c.host.fireEnemyMissile(from, fa, c.v('speed'), c.v('range'), c.v('damage'), c.v('turnRate'), c.art('missile'));
        muzzle(c, from, fa);
        this.kickAt = this.t;
      });
    }
  }

  protected override tick(): void {
    const c = this.c;
    c.boss.setVelocity(0, 0);
    // 쏠 때마다 어깨가 들썩인다
    const r = this.kickAt >= 0 ? 1 - easeOut((this.t - this.kickAt) / 0.12) : 0;
    c.boss.shape(1 + 0.04 * r, 1 - 0.04 * r, 0);
  }
}

/** 직선 레이저: 예고 뒤 고정된 방향으로 발사 (계속 쫓아오는 광선이 아니다). 포구로 기가 모였다가 쏘는 반동으로 젖힌다 */
export class LineLaser extends Timed {
  private readonly angle: number;
  private moteT = 0;

  constructor(c: PatternCtx) {
    super(c);
    const p = c.boss.pos();
    const a = angleTo(p, c.host.playerPos());
    this.angle = a;
    beam(c, { center: p, angle: a, telegraphSec: c.v('telegraphSec'), liveSec: c.v('liveSec'), width: c.v('width'), damage: c.v('damage') });
    this.at(c.v('telegraphSec'), () => {
      const m = this.muzzlePos();
      shockRing(c.host.scene, m, c.boss.radius() * 1.6, c.boss.fxColor, 0.3, 3);
      burst(c.host.scene, c.host.rng, m, c.boss.fxColor, 16, [120, 220], 0.3, { angle: a, spread: 0.6 });
      shake(c.host.scene, 'medium');
    });
  }

  private muzzlePos(): Vec2 {
    const p = this.c.boss.pos();
    const r = this.c.boss.radius() * 0.7;
    return { x: p.x + Math.cos(this.angle) * r, y: p.y + Math.sin(this.angle) * r };
  }

  protected override tick(dt: number): void {
    const c = this.c;
    c.boss.setVelocity(0, 0);
    const w = c.v('telegraphSec');
    if (this.t >= w) {
      lunge(c.boss, this.t - w, this.angle + Math.PI, 0.35, 1.2);
      return;
    }
    coil(c.boss, this.t / w, this.angle, 0.6);
    this.moteT -= dt;
    if (this.moteT <= 0) {
      this.moteT = 0.05;
      motes(c.host.scene, c.host.rng, this.muzzlePos(), c.boss.fxColor, 3, c.boss.radius() * 1.6, 0.25);
    }
  }
}

/** 지면 충격파: 틈은 플레이어 반대쪽. 보스를 돌아가야 지난다. 일어섰다 내려찍는다 */
export class GroundShock extends Heavy {
  constructor(c: PatternCtx) {
    super(c, c.v('windupSec'));
    this.at(c.v('windupSec'), () => {
      const p = c.boss.pos();
      const from = c.boss.radius();
      ring(c, { center: p, fromR: from, toR: c.v('maxRadius'), moveSec: (c.v('maxRadius') - from) / c.v('speed'), thickness: c.v('thickness'), damage: c.v('damage'), gapAngle: angleTo(p, c.host.playerPos()) + Math.PI, gapDeg: c.v('gapDeg'), quake: true });
      this.impact(1.3);
    });
  }
}

/** 지열 분출 (1단계): 예상 위치와 그 곁에 원형 폭발 3개 */
export class Geyser extends Timed {
  constructor(c: PatternCtx) {
    super(c);
    for (let i = 0; i < c.v('count'); i++) {
      this.at(i * c.v('stepSec'), () => {
        const at = predict(c, c.v('delaySec'), i === 0 ? 0 : c.v('spread'));
        blast(c, at, c.v('radius'), c.v('delaySec'), c.v('damage'));
        // 터질 자리 밑에서 열기가 끓어오른다
        this.at(this.t + c.v('delaySec') * 0.5, () => motes(c.host.scene, c.host.rng, at, c.boss.fxColor, 6, c.v('radius'), 0.3));
        this.at(this.t + c.v('delaySec'), () => {
          const bits = [c.art('debris'), c.art('debris2')].filter((x): x is SpriteRef => !!x);
          debris(c.host.scene, c.host.rng, at, bits, 5, [15, 40]);
        });
      });
    }
  }
}

/** 고속 돌진: 짧은 예고 뒤 길게 돌진하며 미사일을 흘리고, 끝나면 회복 구간 */
export class KaiserDash implements PatternRun {
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
    muzzle(c, c.boss.pos(), a, 0.7);
  }

  destroy(): void {
    this.dash.destroy();
  }
}

/** 불안정 레이저: 5방향 전개, 잠시 뒤 50% 확률로 회전 (방향도 무작위). 몸이 떨리며 붉은 전기가 튄다 */
export class UnstableLaser extends Channeled {
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
    this.at(c.v('telegraphSec'), () => {
      shockRing(c.host.scene, c.boss.pos(), c.boss.radius() * 2.4, c.boss.fxColor, 0.35, 3);
      burst(c.host.scene, c.host.rng, c.boss.pos(), c.boss.fxColor, 20, [100, 200], 0.35, undefined, c.boss.radius() * 0.5);
      shake(c.host.scene, 'medium');
      this.pulse();
    });
  }
}

/** 종말 명령: 중앙으로 가 끌어당기며 직선 → 교차 → 충격파 → 초광역 포격. 끝나면 과열로 핵 노출 */
export class DoomCommand extends Timed {
  private readonly center: Vec2;
  private moteT = 0;
  constructor(c: PatternCtx) {
    super(c);
    const a = c.host.arena();
    this.center = { x: a.x + a.w / 2, y: a.y + a.h / 2 };
    const o = () => ({ telegraphSec: c.v('beamTelegraphSec'), liveSec: c.v('beamLiveSec'), width: c.v('beamWidth'), damage: c.v('beamDamage') });
    this.at(c.v('lineAtSec'), () => beam(c, { ...o(), center: this.center, angle: angleTo(this.center, c.host.playerPos()) }));
    this.at(c.v('lineAtSec') + c.v('beamTelegraphSec'), () => this.flare(1));
    this.at(c.v('crossAtSec'), () => beam(c, { ...o(), center: this.center, count: 4, angle: angleTo(this.center, c.host.playerPos()) + Math.PI / 4 }));
    // 교차 광선이 터지는 순간 몸에서 교차 방출
    this.at(c.v('crossAtSec') + c.v('beamTelegraphSec'), () => {
      const cross = c.art('cross');
      if (cross) playFx(c.host.scene, cross, this.center.x, this.center.y, { w: c.boss.radius() * 4, depth: 7 });
      this.flare(1.3);
    });
    this.at(c.v('waveAtSec'), () => {
      ring(c, { center: this.center, fromR: c.boss.radius(), toR: c.v('maxRadius'), moveSec: (c.v('maxRadius') - c.boss.radius()) / c.v('speed'), thickness: c.v('thickness'), damage: c.v('beamDamage'), gapAngle: angleTo(this.center, c.host.playerPos()) + Math.PI, gapDeg: c.v('gapDeg'), quake: true });
      this.flare(1.3);
    });
    this.at(c.v('blastAtSec'), () => safeBlast(c, c.v('safeZones'), c.v('safeRadius'), c.v('delaySec'), c.v('damage')));
    // 초광역 포격: 방 곳곳에 포격망이 연달아 터진다
    const net = c.art('net');
    if (net) {
      for (let i = 0; i < 6; i++) {
        this.at(c.v('blastAtSec') + c.v('delaySec') + i * 0.08, () => {
          const at = { x: c.host.rng.range(a.x + 40, a.x + a.w - 40), y: c.host.rng.range(a.y + 40, a.y + a.h - 40) };
          playFx(c.host.scene, net, at.x, at.y, { w: 150, depth: 6 });
        });
      }
    }
    this.at(c.v('blastAtSec') + c.v('delaySec'), () => c.expose(c.v('exposeSec'), c.v('exposeMul')));
  }

  /** 명령을 내리는 순간: 몸에서 충격파·불티 */
  private flare(k: number): void {
    const c = this.c;
    shockRing(c.host.scene, c.boss.pos(), c.boss.radius() * 2 * k, c.boss.fxColor, 0.3, 3);
    burst(c.host.scene, c.host.rng, c.boss.pos(), c.boss.fxColor, Math.round(14 * k), [100, 190], 0.3, undefined, c.boss.radius() * 0.5);
    shake(c.host.scene, k > 1 ? 'medium' : 'light');
  }

  protected override tick(dt: number): void {
    const c = this.c;
    const b = c.boss.pos();
    const d = Math.hypot(this.center.x - b.x, this.center.y - b.y);
    if (this.t < c.v('moveSec') && d > 4) c.boss.setVelocity(((this.center.x - b.x) / d) * c.v('moveSpeed'), ((this.center.y - b.y) / d) * c.v('moveSpeed'));
    else c.boss.setVelocity(0, 0);
    if (this.t > c.v('pullSec')) return;
    const p = c.host.playerPos();
    const dp = Math.hypot(this.center.x - p.x, this.center.y - p.y);
    if (dp > 1) c.host.pushPlayer({ x: ((this.center.x - p.x) / dp) * c.v('pullSpeed'), y: ((this.center.y - p.y) / dp) * c.v('pullSpeed') });
    // 끌어당기는 동안 방 안의 기가 보스에게 빨려 든다
    this.moteT -= dt;
    if (this.moteT <= 0) {
      this.moteT = 0.05;
      motes(c.host.scene, c.host.rng, b, c.boss.fxColor, 4, 140, 0.45);
    }
  }
}

/** 계승: 악귀 분출. 대형 분출과 주변 연쇄 폭발, 집행자 호출 (상한까지만) */
export class RedEruption extends Timed {
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
