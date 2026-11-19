/** 헥타르 수석 연구원 패턴 */
import { shake } from '../../entities/juice';
import type { Vec2 } from '../../core/actions';
import { loopArt, playFx, stretchFx } from '../../skills/skillFx';
import { burst, lob, shockRing } from '../bossFx';
import type Phaser from 'phaser';
import { Channeled, zap, angleTo, rad, blast, FULL_BEAM, beam, ring, fan, clampTo, around, muzzle } from './base';
import type { PatternCtx } from './base';

/** 척력 방출: 보스 중심 원형 공격. 너무 붙은 플레이어를 밀어낸다 */
export class Repulse extends Channeled {
  constructor(c: PatternCtx) {
    super(c);
    blast(c, c.boss.pos(), c.v('radius'), c.v('delaySec'), c.v('damage'));
    this.at(c.v('delaySec'), () => {
      const p = c.boss.pos();
      shockRing(c.host.scene, p, c.v('radius') * 1.3, c.boss.fxColor, 0.35, 3);
      burst(c.host.scene, c.host.rng, p, c.boss.fxColor, 22, [120, 220], 0.35, undefined, c.boss.radius() * 0.5);
      shake(c.host.scene, 'medium');
      this.pulse();
    });
  }
}

/** 드론 협공: 보스 둘레 드론 3기가 시작 때의 플레이어 자리를 조준해 부채꼴 사격. 드론은 보스에서 날아가 자리 잡는다 */
export class DroneFire extends Channeled {
  private readonly drones: Phaser.GameObjects.GameObject[] = [];
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
    const scene = c.host.scene;
    for (const s of spots) {
      if (droneArt) {
        const d = scene.add.sprite(b.x, b.y, droneArt.spriteKey).setDepth(4);
        d.setDisplaySize(droneArt.size * 2, (droneArt.size * 2 * d.height) / Math.max(1, d.width));
        loopArt(d, droneArt);
        // 보스에서 떠올라 자리로 날아간 뒤 둥실거린다
        scene.tweens.add({ targets: d, x: s.x, y: s.y, duration: c.v('windupSec') * 700, ease: 'Cubic.easeOut', onComplete: () => scene.tweens.add({ targets: d, y: s.y - 3, duration: 300, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' }) });
        this.drones.push(d);
      } else this.drones.push(scene.add.circle(s.x, s.y, 5, c.boss.color, 0.9).setStrokeStyle(1, 0xffffff, 0.8).setDepth(4));
    }
    for (let r = 0; r < c.v('rounds'); r++) {
      this.at(c.v('windupSec') + r * c.v('roundGapSec'), () => {
        const muzzle = c.art('muzzle');
        for (const s of spots) {
          const a = angleTo(s, target);
          fan(c, s, a, c.v('bullets'), c.v('spreadDeg'), c.v('speed'), c.v('range'), c.v('damage'));
          if (muzzle) playFx(scene, muzzle, s.x + Math.cos(a) * 8, s.y + Math.sin(a) * 8, { w: 26, rotation: a, depth: 6 });
        }
        this.pulse();
      });
    }
  }
  override destroy(): void {
    super.destroy();
    const scene = this.c.host.scene;
    for (const d of this.drones) {
      const o = d as Phaser.GameObjects.Sprite;
      scene.tweens.killTweensOf(o);
      if (o.x !== undefined) burst(scene, this.c.host.rng, { x: o.x, y: o.y }, this.c.boss.fxColor, 5, [40, 80], 0.25);
      d.destroy();
    }
  }
}

/** 반물질 연쇄 포격: 플레이어 자리와 그 측면에 순차 폭발. 반물질 용기탄이 보스에서 날아가 떨어진다 */
export class Antimatter extends Channeled {
  constructor(c: PatternCtx) {
    super(c);
    const p = c.host.playerPos();
    const side = angleTo(c.boss.pos(), p) + Math.PI / 2;
    const can = c.art('canister');
    const n = c.v('count');
    for (let i = 0; i < n; i++) {
      // 0, +1, -1, +2, -2칸
      const k = Math.ceil(i / 2) * (i % 2 === 0 ? -1 : 1);
      const at = { x: p.x + Math.cos(side) * k * c.v('gap'), y: p.y + Math.sin(side) * k * c.v('gap') };
      const delay = c.v('delaySec') + i * c.v('stepSec');
      blast(c, at, c.v('radius'), delay, c.v('damage'));
      if (can) {
        this.at(i * 0.08, () => {
          const b = c.boss.pos();
          lob(c.host.scene, can, { x: b.x, y: b.y - c.boss.radius() }, at, delay - i * 0.08, 60, 12, undefined, 10, c.boss.fxColor);
          this.pulse();
        });
      }
    }
    // 마지막 폭발 뒤 줄을 따라 연쇄 격폭
    const chain = c.art('chain');
    if (chain) this.at(c.v('delaySec') + (n - 1) * c.v('stepSec'), () => playFx(c.host.scene, chain, p.x, p.y, { w: Math.max(140, c.v('gap') * (n + 1)), rotation: side, depth: 6 }));
  }
}

/** 방 안에서 from이 angle 방향으로 벽에 닿는 점 */
function wallHit(c: PatternCtx, from: Vec2, angle: number): Vec2 {
  const a = c.host.arena();
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  const tx = dx > 0 ? (a.x + a.w - from.x) / dx : dx < 0 ? (a.x - from.x) / dx : Infinity;
  const ty = dy > 0 ? (a.y + a.h - from.y) / dy : dy < 0 ? (a.y - from.y) / dy : Infinity;
  const t = Math.max(0, Math.min(tx, ty, FULL_BEAM));
  return { x: from.x + dx * t, y: from.y + dy * t };
}

/** 레일건 교차 사격: 고정 각도 광선 여러 줄, 시차를 두고 발동. 줄 사이 통로로 간다. 쏘는 모습은 플레이어 레일건 Lv3과 같다 */
export class RailCross extends Channeled {
  constructor(c: PatternCtx) {
    super(c);
    const from = c.boss.pos();
    const base = angleTo(from, c.host.playerPos());
    const n = c.v('lines');
    const rail = { beam: c.art('railBeam'), charge: c.art('railCharge'), end: c.art('railEnd'), wave: c.art('railWave') };
    for (let i = 0; i < n; i++) {
      const a = base + rad(c.v('spreadDeg')) * (i / (n - 1) - 0.5);
      beam(c, { center: from, angle: a, telegraphSec: c.v('telegraphSec') + i * c.v('stepSec'), liveSec: c.v('liveSec'), width: c.v('width'), damage: c.v('damage'), bare: !!rail.beam });
      this.at(c.v('telegraphSec') + i * c.v('stepSec'), () => {
        const scene = c.host.scene;
        const end = wallHit(c, from, a);
        // 플레이어 레일건 Lv3: 충전 빛 → 늘인 광선(굵기 = 반폭 × 3) → 끝점 폭발·파동
        if (rail.beam) stretchFx(scene, rail.beam, from, end, (c.v('width') / 2) * 3);
        if (rail.charge) playFx(scene, rail.charge, from.x, from.y);
        if (rail.end) playFx(scene, rail.end, end.x, end.y);
        if (rail.wave) playFx(scene, rail.wave, end.x, end.y, { rotation: a });
        shake(scene, 'light');
        this.pulse();
      });
    }
  }
}

/** 추적 지뢰 포위진: 시작 때 플레이어 둘레 원형 지뢰. 가운데 남거나 틈으로 나간다. 접이식 지뢰가 날아가 깔린다 */
export class MineSiege extends Channeled {
  private readonly mines: Phaser.GameObjects.Sprite[] = [];
  constructor(c: PatternCtx) {
    super(c);
    const p = c.host.playerPos();
    const n = c.v('mines');
    const base = c.host.rng.range(0, Math.PI * 2);
    const mineArt = c.art('mine');
    for (let i = 0; i < n; i++) {
      const a = base + (i * Math.PI * 2) / n;
      const at = { x: p.x + Math.cos(a) * c.v('circle'), y: p.y + Math.sin(a) * c.v('circle') };
      const delay = c.v('delaySec') + i * c.v('stepSec');
      blast(c, at, c.v('radius'), delay, c.v('damage'));
      if (!mineArt) continue;
      this.at(i * 0.05, () => {
        const b = c.boss.pos();
        lob(c.host.scene, mineArt, b, at, 0.45, 40, 12, () => {
          // 깔린 지뢰: 터질 때까지 바닥에서 깜빡인다
          const m = c.host.scene.add.sprite(at.x, at.y, mineArt.spriteKey).setDepth(2.5);
          m.setDisplaySize(12, (12 * m.height) / Math.max(1, m.width));
          loopArt(m, mineArt);
          this.mines.push(m);
          c.host.scene.time.delayedCall(Math.max(0, (delay - 0.45 - i * 0.05) * 1000), () => m.destroy());
        }, 6);
        if (i % 2 === 0) this.pulse();
      });
    }
  }
  override destroy(): void {
    super.destroy();
    for (const m of this.mines) m.destroy();
  }
}

/** 벡터 역장: 예고 뒤 틈 있는 확장 충격파. 쏘는 순간 벡터 격리 장막이 깨진다 */
export class GapWave extends Channeled {
  constructor(c: PatternCtx) {
    super(c);
    const from = c.boss.radius();
    const to = c.v('maxRadius');
    ring(c, { center: c.boss.pos(), fromR: from, toR: to, moveSec: (to - from) / c.v('speed'), telegraphSec: c.v('telegraphSec'), thickness: c.v('thickness'), damage: c.v('damage'), gapAngle: c.host.rng.range(0, Math.PI * 2), gapDeg: c.v('gapDeg'), bolt: true });
    this.at(c.v('telegraphSec'), () => {
      const p = c.boss.pos();
      const cage = c.art('cage');
      if (cage) playFx(c.host.scene, cage, p.x, p.y, { w: c.boss.radius() * 6, depth: 6 });
      shake(c.host.scene, 'medium');
      this.pulse();
    });
  }
}

/** 벼락 실증: 플레이어 기준 낙뢰 지점을 고정하고 순차 낙하. 칠 때마다 보스에서 번개가 이어진다 */
export class BoltProof extends Channeled {
  constructor(c: PatternCtx) {
    super(c);
    for (let i = 0; i < c.v('strikes'); i++) {
      const at = around(c, i, c.v('spread'), c.v('radius'));
      blast(c, at, c.v('radius'), c.v('delaySec') + i * c.v('stepSec'), c.v('damage'));
      this.at(c.v('delaySec') + i * c.v('stepSec') - 0.05, () => {
        zap(c, at);
        this.pulse();
      });
    }
  }
}

/** 전투원 호출: 살아 있는 동안 다시 부르지 않는다 */
export class CallTroopers extends Channeled {
  constructor(c: PatternCtx) {
    super(c);
    this.at(c.v('windupSec'), () => {
      const id = c.summonId;
      if (id) c.summon(Array.from({ length: c.v('count') }, () => id));
      shockRing(c.host.scene, c.boss.pos(), c.boss.radius() * 2.5, c.boss.fxColor, 0.35, 2);
      this.pulse();
    });
  }
}
