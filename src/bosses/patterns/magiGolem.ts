/** 마기골렘 패턴 */
import { shake } from '../../entities/juice';
import type { Vec2 } from '../../core/actions';
import { playFx } from '../../skills/skillFx';
import type { SpriteRef } from '../../types/data';
import type { PatternRun } from '../host';
import { burst, coil, debris, easeOut, land, lob, lunge, motes, shockRing } from '../bossFx';
import { Timed, angleTo, Dash, rad, blast, predict, beam, ring, faultBand, rectAt } from './base';
import type { PatternCtx } from './base';

/**
 * 무거운 몸짓 바탕 (마기골렘): riseSec 동안 몸을 일으키며 기를 끌어모으고,
 * impact()마다 쿵 내려앉으며 땅이 울리고 파편·먼지가 튄다. 그 사이엔 숨 쉬듯 미세하게 들썩인다.
 */
export abstract class Heavy extends Timed {
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
export class EarthCrush extends Heavy {
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
export class Bombard extends Timed {
  private recoilAt = -1;

  constructor(c: PatternCtx) {
    super(c);
    const shell = c.art('shell');
    const meteor = c.art('meteor');
    for (let i = 0; i < c.v('shells'); i++) {
      const step = i * c.v('stepSec');
      this.at(step, () => {
        const at = predict(c, c.v('delaySec'), c.v('spread'));
        blast(c, at, c.v('radius'), c.v('delaySec'), c.v('damage'));
        if (meteor) this.fall(meteor, at);
        if (shell) {
          const p = c.boss.pos();
          lob(c.host.scene, shell, { x: p.x, y: p.y - c.boss.radius() * 0.8 }, at, c.v('delaySec') * 0.95, 48, 14, undefined, 8, c.boss.fxColor);
          burst(c.host.scene, c.host.rng, { x: p.x, y: p.y - c.boss.radius() * 0.8 }, c.boss.fxColor, 4, [50, 90], 0.25, { angle: -Math.PI / 2, spread: 1.2 });
        }
        this.recoilAt = this.t;
      });
    }
  }

  /** 흑점: 하늘에서 예고 원으로 곧장 떨어지며 꼬리를 남긴다 */
  private fall(ref: SpriteRef, at: Vec2): void {
    const c = this.c;
    const scene = c.host.scene;
    const img = scene.add.sprite(at.x, at.y - 150, ref.spriteKey).setDepth(7).setBlendMode('ADD');
    img.setDisplaySize(ref.size * 1.6, (ref.size * 1.6 * img.height) / Math.max(1, img.width));
    let n = 0;
    scene.tweens.add({
      targets: img,
      y: at.y,
      duration: c.v('delaySec') * 1000 * 0.95,
      ease: 'Quad.easeIn',
      onUpdate: () => {
        if (n++ % 2) return;
        const d = scene.add.circle(img.x, img.y - 4, 3, c.boss.fxColor, 0.7).setDepth(6).setBlendMode('ADD');
        scene.tweens.add({ targets: d, alpha: 0, scale: 0.3, duration: 220, onComplete: () => d.destroy() });
      },
      onComplete: () => img.destroy(),
    });
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
export class RuinBeam extends Heavy {
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
export class RuinLegion extends Heavy {
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
export class BreakerDash implements PatternRun {
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
export class CrustCrack extends Heavy {
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
export class CollapseZone extends Heavy {
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
export class DoomFault extends Heavy {
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
