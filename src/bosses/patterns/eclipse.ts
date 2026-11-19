/** 식광 패턴 */
import { shake } from '../../entities/juice';
import { DelayedBlast, FollowBlast } from '../../entities/hazard';
import { playFx } from '../../skills/skillFx';
import { burst, coil, easeOut, lunge, motes, shockRing } from '../bossFx';
import { Timed, angleTo, rad, fan, safeBlast } from './base';
import type { PatternCtx } from './base';

/**
 * 구체 보스 몸짓 (식광): gatherSec 동안 둘레의 빛을 빨아들이며 움츠러들고(떨림),
 * release() 때 부풀며 터졌다 돌아온다. 그 뒤엔 천천히 맥동한다.
 */
abstract class Orb extends Timed {
  private releaseAt = -1;
  private moteT = 0;

  constructor(
    c: PatternCtx,
    private readonly gatherSec: number,
    private readonly gatherR = 2.6,
  ) {
    super(c);
  }

  protected release(size = 1): void {
    const c = this.c;
    this.releaseAt = this.t;
    const p = c.boss.pos();
    shockRing(c.host.scene, p, c.boss.radius() * 2.4 * size, c.boss.fxColor, 0.35, 3);
    burst(c.host.scene, c.host.rng, p, c.boss.fxColor, Math.round(18 * size), [100, 200], 0.35, undefined, c.boss.radius() * 0.6);
    shake(c.host.scene, size > 1 ? 'medium' : 'light');
  }

  protected override tick(dt: number): void {
    const c = this.c;
    c.boss.setVelocity(0, 0);
    if (this.releaseAt >= 0) {
      const r = 1 - easeOut((this.t - this.releaseAt) / 0.4);
      c.boss.shape(1 + 0.18 * r, 1 + 0.18 * r, 0);
      return;
    }
    if (this.t < this.gatherSec) {
      const e = easeOut(this.t / this.gatherSec);
      const wob = Math.sin(this.t * 55) * 0.02 * e;
      c.boss.shape(1 - 0.1 * e + wob, 1 - 0.1 * e - wob, 0);
      this.moteT -= dt;
      if (this.moteT <= 0) {
        this.moteT = 0.045;
        motes(c.host.scene, c.host.rng, c.boss.pos(), c.boss.fxColor, 3, c.boss.radius() * this.gatherR, 0.35);
      }
      return;
    }
    const b = Math.sin(this.t * 5) * 0.025;
    c.boss.shape(1 + b, 1 + b, 0);
  }
}

/** 그림자 추적: 발밑 장판이 잠깐 따라오다 고정되고, 고정된 뒤 터진다 */
export class ShadowChase extends Orb {
  constructor(c: PatternCtx) {
    super(c, c.v('followSec') + c.v('lockSec'));
    c.host.addHazard(new FollowBlast(c.host.scene, c.host.playerPos(), c.v('radius'), c.v('speed'), c.v('followSec') + c.v('lockSec'), c.v('damage'), c.boss.color, c.v('lockSec'), { track: c.art('followTrack'), lock: c.art('followLock'), hit: c.art('followHit') }));
    this.at(c.v('followSec') + c.v('lockSec'), () => this.release(0.8));
  }
}

/** 조준 부채꼴 탄막 (궤도 절단·일식의 파편·붉은 탄막) */
export class AimFan extends Timed {
  private angle = 0;
  private moteT = 0;

  constructor(c: PatternCtx) {
    super(c);
    this.angle = angleTo(c.boss.pos(), c.host.playerPos());
    this.at(c.v('windupSec'), () => {
      const p = c.boss.pos();
      const a = angleTo(p, c.host.playerPos());
      this.angle = a;
      fan(c, p, a, c.v('bullets'), c.v('spreadDeg'), c.v('speed'), c.v('range'), c.v('damage'), c.v('refractable') > 0);
      const bloom = c.art('release');
      if (bloom) playFx(c.host.scene, bloom, p.x, p.y, { w: c.boss.radius() * 3.2, depth: 6 });
      // 부채꼴로 쏟아지는 순간: 그 방향 불티 + 충격파
      burst(c.host.scene, c.host.rng, p, c.boss.fxColor, 14, [100, 190], 0.3, { angle: a, spread: rad(c.v('spreadDeg')) }, c.boss.radius() * 0.6);
      shockRing(c.host.scene, p, c.boss.radius() * 1.8, c.boss.fxColor, 0.25, 2);
      shake(c.host.scene, 'light');
    });
  }

  protected override tick(dt: number): void {
    const c = this.c;
    c.boss.setVelocity(0, 0);
    const w = c.v('windupSec');
    if (this.t >= w) {
      lunge(c.boss, this.t - w, this.angle + Math.PI, 0.25, 0.8);
      return;
    }
    coil(c.boss, this.t / w, this.angle, 0.7);
    this.moteT -= dt;
    if (this.moteT <= 0) {
      this.moteT = 0.05;
      motes(c.host.scene, c.host.rng, c.boss.pos(), c.boss.fxColor, 3, c.boss.radius() * 2, 0.22);
    }
  }
}

/** 광역 잠식·일식: 큰 폭발 예고, 표시된 안전 원 안에서만 피한다. 방 전체의 빛을 빨아들였다가 터뜨린다 */
export class SafeCircle extends Orb {
  constructor(c: PatternCtx) {
    super(c, c.v('delaySec'), 5);
    safeBlast(c, c.v('safeZones'), c.v('safeRadius'), c.v('delaySec'), c.v('damage'));
    this.at(c.v('delaySec'), () => this.release(1.6));
  }
}

/** 중력 붕괴: 플레이어를 끌어당긴 뒤 중심 폭발. 인력에 맞서 위험 반경 밖으로. 빨아들이다 핵이 무너지며 터진다 */
export class GravityCollapse extends Orb {
  constructor(c: PatternCtx) {
    super(c, c.v('pullSec'), 4);
    c.host.addHazard(new DelayedBlast(c.host.scene, c.boss.pos(), c.v('radius'), c.v('pullSec'), c.v('damage'), c.boss.color, { warn: c.art('blastWarn'), hit: c.art('blastHit') }));
    this.at(c.v('pullSec'), () => {
      const p = c.boss.pos();
      const core = c.art('collapse');
      if (core) playFx(c.host.scene, core, p.x, p.y, { w: c.v('radius') * 2.2, depth: 7 });
      this.release(1.5);
    });
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
