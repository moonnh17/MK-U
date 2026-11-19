/** 융합악귀 패턴 */
import { shake } from '../../entities/juice';
import { SectorBlast } from '../../entities/hazard';
import { playFx } from '../../skills/skillFx';
import type { PatternRun } from '../host';
import { burst, coil, land, lunge, motes, shockRing } from '../bossFx';
import type Phaser from 'phaser';
import { Timed, angleTo, Dash, rad, blast, gapCircle } from './base';
import type { PatternCtx } from './base';

/** 악귀 할퀴기: 플레이어 쪽 넓은 부채꼴. 뒤로보다 옆으로 빠져야 한다 */
export class Claw extends Timed {
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
export class SpiritDash implements PatternRun {
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
export class Eruption extends Timed {
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
export class SpiritBurst extends Timed {
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
