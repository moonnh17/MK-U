/** 전기환띠 패턴 */
import { shake } from '../../entities/juice';
import { Ring } from '../../entities/hazard';
import type { Rect } from '../../entities/hazard';
import { playFx } from '../../skills/skillFx';
import type { PatternRun } from '../host';
import { burst, crackle, shockRing } from '../bossFx';
import { Channeled, zap, angleTo, Dash, blast, predict, beam, ring, gapCircle, faultBand, rectAt } from './base';
import type { PatternCtx } from './base';

/** 낙뢰 추적: 예상 이동 경로를 따라 순차 낙뢰. 자리는 시작할 때 정해진다 */
export class LightningChase extends Channeled {
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
export class ShockRipple extends Channeled {
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
export class SpinBeam extends Channeled {
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
export class Prison extends Channeled {
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
export class LockGrid extends Channeled {
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
export class ShrinkCurrent extends Channeled {
  constructor(c: PatternCtx) {
    super(c);
    const p = c.boss.pos();
    this.at(0.12, () => this.pulse());
    ring(c, { center: p, fromR: c.v('startRadius'), toR: c.boss.radius(), moveSec: c.v('shrinkSec'), thickness: c.v('thickness'), damage: c.v('damage'), gapAngle: c.host.rng.range(0, Math.PI * 2), gapDeg: c.v('gapDeg'), bolt: true });
    if (c.v('extraBeam') > 0) beam(c, { angle: angleTo(p, c.host.playerPos()), telegraphSec: c.v('beamTelegraphSec'), liveSec: c.v('beamLiveSec'), width: c.v('beamWidth'), damage: c.v('damage'), bolt: true });
  }
}

/** 교차 절단: 대각선 광선 뒤 십자 광선. 첫 안전 자리가 다음엔 위험해진다 */
export class CrossCut extends Channeled {
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
export class ChaseField extends Channeled {
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
export class BlueDash implements PatternRun {
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
