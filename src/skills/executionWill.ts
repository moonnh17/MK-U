/**
 * 집행 의지체 (마기법사 휘강파). 레벨마다 다른 소환체를 부른다. 다시 쓰면 앞의 소환체는 사라진다. 소환체는 적이 노리지 않는다.
 * - Lv1 집행 의지체: 플레이어 뒤를 떠다니며, 본체가 쓴 마기법사 액티브를 copyDelaySec 뒤 같은 방향으로 copyDamage 피해로 따라 쓴다.
 *   순간이동·원소 가호·집행 의지체·궁극기·기본공격은 따라 쓰지 않는다. 피해를 받지 않는다.
 * - Lv2 마기 병정 count기: 가까운 적에게 달라붙어 찌르고 둔화·밀치기. 적 탄·몸에 닿으면 체력이 깎이고, 부서지면 소폭발.
 * - Lv3 모조 마기골렘: 내려앉으며 충격파, 주기적 원형 충격파·밀치기, 가까운 적 자리에 마기 포격. 체력이 깎이고 사라질 때 마기 폭발.
 * 그림은 한 장(힉스필드)이고 움직임(떠다님·걸음·기울기·찌르기·내려찍기)과 등장 연출은 코드로 준다.
 */
import type Phaser from 'phaser';
import type { Vec2 } from '../core/actions';
import type { BuffView } from '../core/session';
import type { Enemy } from '../entities/enemy';
import { shake } from '../entities/juice';
import { willCopies } from '../systems/magiMage';
import type { SpriteRef } from '../types/data';
import { playFx } from './skillFx';
import { nearestEnemy, stepToward, trimOldest, type SkillCast, type SkillHost, type SkillImpl, type SkillObject } from './host';
import { skillImpl } from './registry';

const OWNER = 'executionWill';
/** 기획서: 의지체가 따라 쓰지 않는 액티브 (이동·버프·소환) */
const NOT_COPIED = ['teleport', 'elementWard', 'executionWill'];

/** 그림에 얹는 움직임 (트윈이 바꾸는 값) */
interface Pose {
  ox: number;
  oy: number;
  sx: number;
  sy: number;
  rot: number;
  alpha: number;
}

/** 소환체 공통: 그림(발밑 기준), 움직임, 체력·접촉 피해 */
class Summon implements SkillObject {
  readonly owner = OWNER;
  readonly createdAt: number;
  protected readonly img: Phaser.GameObjects.Sprite;
  protected life: number;
  protected hp: number;
  private contactIn = 0;
  protected gone = false;
  protected readonly pose: Pose = { ox: 0, oy: 0, sx: 1, sy: 1, rot: 0, alpha: 1 };
  private readonly baseSX: number;
  private readonly baseSY: number;
  private t = 0;
  private moving = false;
  /** 등장 연출 동안 움직이지 않는다 */
  protected busy = 0;

  constructor(
    protected readonly host: SkillHost,
    protected readonly s: SkillCast,
    protected readonly ref: SpriteRef,
    protected at: Vec2,
    /** 피해를 받는지 */
    private readonly mortal: boolean,
    /** 떠다니는 몸 (걷지 않는다) */
    private readonly floating = false,
  ) {
    this.createdAt = host.scene.time.now;
    this.life = s.values.lifeSec!;
    this.hp = s.values.hp!;
    this.t = host.rng.range(0, 6);
    this.img = host.sprite(at.x, at.y, ref).setDepth(4).setOrigin(0.5, 1);
    const art = host.ctx.data.art.sprites[ref.spriteKey];
    if (art) this.img.setDisplaySize(art.frameWidth / (art.density ?? 1), art.frameHeight / (art.density ?? 1));
    else this.img.setDisplaySize(ref.size, ref.height ?? ref.size);
    this.baseSX = this.img.scaleX;
    this.baseSY = this.img.scaleY;
  }

  /** to 쪽으로 걷는다(벽이면 서 있는다). 움직였으면 true */
  protected walk(to: Vec2, speed: number, dt: number, stopAt: number): boolean {
    const next = stepToward(this.at, to, speed, dt, stopAt);
    const dx = next.x - this.at.x;
    const dy = next.y - this.at.y;
    if ((dx === 0 && dy === 0) || this.host.blocked(next.x, next.y)) return false;
    this.at = next;
    this.moving = true;
    if (Math.abs(dx) > 0.01) this.img.setFlipX(dx < 0);
    return true;
  }

  protected face(x: number): void {
    this.img.setFlipX(x < this.at.x);
  }

  /** 트윈 한 번 (yoyo면 돌아온다) */
  protected tween(to: Partial<Pose>, sec: number, ease = 'Quad.easeOut', yoyo = false, onComplete?: () => void): void {
    this.host.scene.tweens.add({ targets: this.pose, ...to, duration: sec * 1000, ease, yoyo, onComplete });
  }

  /** 적 쪽으로 몸을 내밀었다 돌아온다 (공격 동작) */
  protected lunge(to: Vec2, px: number, sec: number): void {
    const dx = to.x - this.at.x;
    const dy = to.y - this.at.y;
    const d = Math.hypot(dx, dy) || 1;
    this.tween({ ox: (dx / d) * px, oy: (dy / d) * px * 0.5, rot: (dx < 0 ? -1 : 1) * 0.18 }, sec, 'Quad.easeOut', true);
  }

  /** 적 탄·몸에 닿으면 체력이 깎인다 */
  private takeHits(dt: number): void {
    if (!this.mortal) return;
    const r = this.ref.size / 2;
    this.hp -= this.host.enemyBulletsAt(this.at, r);
    this.contactIn -= dt;
    if (this.contactIn > 0) return;
    const touching = this.host.enemies().filter((e) => Math.hypot(e.sprite.x - this.at.x, e.sprite.y - this.at.y) <= e.radius + r);
    if (touching.length === 0) return;
    this.contactIn = this.s.values.contactEverySec!;
    this.hp -= Math.max(...touching.map((e) => e.def.contactDamage * e.damageMul));
    this.img.setTintFill(0xffffff);
    this.host.scene.time.delayedCall(60, () => this.img.active && this.img.clearTint());
  }

  update(dt: number): boolean {
    this.life -= dt;
    this.t += dt;
    this.busy = Math.max(0, this.busy - dt);
    this.takeHits(dt);
    this.moving = false;
    if (this.busy <= 0) this.act(dt);
    this.draw();
    if (this.life > 0 && this.hp > 0) return true;
    this.end(this.hp <= 0);
    return false;
  }

  /** 떠다님·숨쉬기·걸음 흔들림을 얹어 그린다 */
  private draw(): void {
    const t = this.t;
    let bob = 0;
    let lean = 0;
    let breath = 1;
    if (this.floating) {
      bob = -2 - Math.sin(t * 2.4) * 2;
      lean = Math.sin(t * 1.3) * 0.05;
    } else if (this.moving) {
      bob = -Math.abs(Math.sin(t * 11)) * 2.5;
      lean = Math.sin(t * 11) * 0.07;
    } else breath = 1 + Math.sin(t * 2.6) * 0.025;
    const p = this.pose;
    const fade = Math.min(1, Math.max(0, this.life) / 0.4 + 0.2);
    this.img
      .setPosition(this.at.x + p.ox, this.at.y + p.oy + bob)
      .setScale(this.baseSX * p.sx * (2 - breath), this.baseSY * p.sy * breath)
      .setRotation(p.rot + lean)
      .setAlpha(fade * p.alpha);
  }

  /** 매 프레임 할 일 */
  protected act(dt: number): void {
    void dt;
  }

  /** 사라질 때 (broken: 체력이 다해 부서졌다) */
  protected end(broken: boolean): void {
    void broken;
  }

  /** 반지름 r 폭발 */
  protected blast(at: Vec2, r: number, damage: number, fx: SpriteRef): void {
    const tags = this.s.def.sources.summon!;
    for (const e of [...this.host.enemies()]) if (Math.hypot(e.sprite.x - at.x, e.sprite.y - at.y) <= r + e.radius) this.host.hit(e, damage, tags);
    this.host.blastProps(at, r, damage);
    playFx(this.host.scene, fx, at.x, at.y - 4, { w: r * 2.2 });
  }

  /** 둘레 적을 밀친다 */
  protected push(at: Vec2, r: number, damage: number, distance: number): void {
    const tags = this.s.def.sources.summon!;
    for (const e of [...this.host.enemies()]) {
      const dx = e.sprite.x - at.x;
      const dy = e.sprite.y - at.y;
      const d = Math.hypot(dx, dy);
      if (d > r + e.radius) continue;
      if (!this.host.hit(e, damage, tags) && d > 0) e.knockback({ x: dx / d, y: dy / d }, distance, 0.15);
    }
  }

  buff(host: SkillHost): BuffView | null {
    // 여러 기면 한 줄만
    if (host.objects().find((o) => o.owner === OWNER) !== this) return null;
    return { id: OWNER, label: host.ctx.t('buff.executionWill'), color: this.s.def.color, leftSec: Math.max(0, this.life), totalSec: this.s.values.lifeSec! };
  }

  destroy(): void {
    this.gone = true;
    this.img.destroy();
  }
}

/** Lv1: 본체를 따라 떠다니며 마기법사 액티브를 따라 쓴다. 마법진에서 피어오르듯 나타난다 */
class WillConstruct extends Summon {
  constructor(host: SkillHost, s: SkillCast, ref: SpriteRef, at: Vec2) {
    super(host, s, ref, at, false, true);
    this.pose.sy = 0.1;
    this.pose.sx = 0.6;
    this.pose.alpha = 0;
    this.busy = 0.45;
    const ring = s.def.sprites.willHit;
    if (ring) playFx(host.scene, ring, at.x, at.y - 2, { w: 44, depth: 3 });
    this.tween({ sy: 1, sx: 1, alpha: 1 }, 0.45, 'Back.easeOut');
  }

  protected override act(dt: number): void {
    const p = this.host.playerPos();
    const d = this.host.aimDir();
    const follow = this.s.values.followPx!;
    if (!this.walk({ x: p.x - d.x * follow, y: p.y - d.y * follow }, this.s.values.speed! * 1.6, dt, 2)) this.img.setFlipX(d.x < 0);
  }

  onSkillCast(host: SkillHost, cast: SkillCast): void {
    if (!willCopies(cast.def, NOT_COPIED)) return;
    const impl = skillImpl(cast.def.id);
    const aim = { ...host.aimDir() };
    const v = this.s.values;
    host.scene.time.delayedCall(v.copyDelaySec! * 1000, () => {
      if (this.gone || !impl) return;
      // 의지체 자리에서, 본체가 쏜 방향으로, 피해만 줄여서. 쏘는 쪽으로 몸을 젖힌다
      const from = { x: this.at.x, y: this.at.y - 12 };
      this.img.setFlipX(aim.x < 0);
      this.tween({ sx: 1.15, sy: 0.9, ox: -aim.x * 3 }, 0.1, 'Quad.easeOut', true);
      const copy: SkillHost = { ...host, playerPos: () => ({ ...from }), aimDir: () => aim };
      const values = cast.values.damage !== undefined ? { ...cast.values, damage: cast.values.damage * v.copyDamage! } : cast.values;
      impl.cast(copy, { ...cast, values });
      host.burst(from, this.s.def.color);
    });
  }
}

/** Lv2: 땅에서 솟아올라, 가까운 적에게 달라붙어 찌른다 */
class MagiSoldier extends Summon {
  private attackIn = 0;

  constructor(host: SkillHost, s: SkillCast, ref: SpriteRef, at: Vec2, delaySec: number) {
    super(host, s, ref, at, true);
    this.pose.sy = 0;
    this.pose.alpha = 0;
    this.busy = 0.4 + delaySec;
    host.scene.time.delayedCall(delaySec * 1000, () => {
      if (this.gone) return;
      const dust = s.def.sprites.soldierBurst;
      if (dust) playFx(host.scene, dust, at.x, at.y - 2, { w: 30, depth: 3 });
      this.pose.alpha = 1;
      this.tween({ sy: 1 }, 0.35, 'Back.easeOut');
    });
  }

  protected override act(dt: number): void {
    const v = this.s.values;
    this.attackIn -= dt;
    const target = nearestEnemy(this.host, this.at);
    if (!target) {
      this.walk(this.host.playerPos(), v.speed!, dt, 20);
      return;
    }
    const reach = target.radius + v.reach!;
    const dist = Math.hypot(target.sprite.x - this.at.x, target.sprite.y - this.at.y);
    if (dist > reach) {
      this.walk({ x: target.sprite.x, y: target.sprite.y }, v.speed!, dt, reach * 0.8);
      return;
    }
    this.face(target.sprite.x);
    if (this.attackIn <= 0) {
      this.attackIn = v.attackSec!;
      this.thrust(target);
    }
  }

  private thrust(e: Enemy): void {
    const v = this.s.values;
    const dx = e.sprite.x - this.at.x;
    const dy = e.sprite.y - this.at.y;
    const d = Math.hypot(dx, dy) || 1;
    this.lunge({ x: e.sprite.x, y: e.sprite.y }, 7, 0.09);
    const fx = this.s.def.sprites.soldierThrust!;
    playFx(this.host.scene, fx, this.at.x + (dx / d) * fx.size * 0.45, this.at.y - 14 + (dy / d) * fx.size * 0.4, { w: fx.size, rotation: Math.atan2(dy, dx) });
    if (this.host.hit(e, v.damage!, this.s.def.sources.summon!)) return;
    this.host.chill(e, v.slow!, v.slowSec!);
    e.knockback({ x: dx / d, y: dy / d }, v.knockback!, 0.12);
  }

  protected override end(broken: boolean): void {
    if (broken) this.blast(this.at, this.host.area(this.s.values.burstRadius!), this.s.values.burstDamage!, this.s.def.sprites.soldierBurst!);
  }
}

const GOLEM_DROP_PX = 150;
const GOLEM_DROP_SEC = 0.42;

/** Lv3: 하늘에서 떨어져 내려앉으며 충격파, 주기적 충격파와 마기 포격 */
class ImitationGolem extends Summon {
  private crushIn: number;
  private shellIn: number;

  constructor(host: SkillHost, s: SkillCast, ref: SpriteRef, at: Vec2) {
    super(host, s, ref, at, true);
    this.crushIn = s.values.crushEverySec!;
    this.shellIn = s.values.shellEverySec! / 2;
    this.busy = GOLEM_DROP_SEC + 0.25;
    this.pose.oy = -GOLEM_DROP_PX;
    // 떨어질 자리에 그림자가 커진다
    const shadow = host.scene.add.ellipse(at.x, at.y, ref.size * 1.4, ref.size * 0.45, 0x000000, 0.4).setDepth(2.4).setScale(0.3);
    host.scene.tweens.add({ targets: shadow, scale: 1, duration: GOLEM_DROP_SEC * 1000, ease: 'Quad.easeIn', onComplete: () => shadow.destroy() });
    this.tween({ oy: 0 }, GOLEM_DROP_SEC, 'Quad.easeIn', false, () => {
      if (this.gone) return;
      // 내려앉는 충격파 + 찌그러졌다 펴진다
      this.crush(s.values.landDamage!, 'medium');
      this.pose.sx = 1.3;
      this.pose.sy = 0.7;
      this.tween({ sx: 1, sy: 1 }, 0.3, 'Back.easeOut');
    });
  }

  private crush(damage: number, power: 'light' | 'medium' = 'light'): void {
    const v = this.s.values;
    const r = this.host.area(v.crushRadius!);
    this.push(this.at, r, damage, v.knockback!);
    playFx(this.host.scene, this.s.def.sprites.golemCrush!, this.at.x, this.at.y, { w: r * 2.2, depth: 3 });
    shake(this.host.scene, power);
  }

  /** 들썩 뛰어올랐다 내려찍는다 */
  private stomp(): void {
    this.busy = 0.3;
    this.tween({ oy: -10, sy: 1.12, sx: 0.92 }, 0.14, 'Quad.easeOut', false, () => {
      this.tween({ oy: 0, sy: 0.78, sx: 1.2 }, 0.08, 'Quad.easeIn', false, () => {
        if (this.gone) return;
        this.crush(this.s.values.crushDamage!);
        this.tween({ sy: 1, sx: 1 }, 0.2, 'Back.easeOut');
      });
    });
  }

  private bombard(): void {
    const v = this.s.values;
    const list = [...this.host.enemies()].sort((a, b) => Math.hypot(a.sprite.x - this.at.x, a.sprite.y - this.at.y) - Math.hypot(b.sprite.x - this.at.x, b.sprite.y - this.at.y));
    if (list.length === 0) return;
    // 마기 핵을 내밀며 쏜다
    this.face(list[0]!.sprite.x);
    this.tween({ sx: 1.08, sy: 1.08, rot: 0 }, 0.12, 'Quad.easeOut', true);
    this.img.setTint(0xe0b3ff);
    this.host.scene.time.delayedCall(180, () => this.img.active && this.img.clearTint());
    const r = this.host.area(v.shellRadius!);
    const fx = this.s.def.sprites.golemShell!;
    for (let i = 0; i < v.shells!; i++) {
      // 적이 적으면 같은 적에게 여러 발
      const e = list[i % list.length]!;
      const at = { x: e.sprite.x + this.host.rng.range(-6, 6), y: e.sprite.y + this.host.rng.range(-6, 6) };
      this.host.scene.time.delayedCall(i * 80, () => {
        playFx(this.host.scene, fx, at.x, at.y, { w: Math.max(fx.size, r * 2.4) });
        this.host.scene.time.delayedCall(v.shellDelaySec! * 1000, () => {
          const tags = this.s.def.sources.summon!;
          for (const x of [...this.host.enemies()]) if (Math.hypot(x.sprite.x - at.x, x.sprite.y - at.y) <= r + x.radius) this.host.hit(x, v.shellDamage!, tags);
        });
      });
    }
  }

  protected override act(dt: number): void {
    const v = this.s.values;
    const target = nearestEnemy(this.host, this.at);
    if (target) this.walk({ x: target.sprite.x, y: target.sprite.y }, v.speed!, dt, target.radius + v.reach!);
    else this.walk(this.host.playerPos(), v.speed!, dt, 24);
    this.crushIn -= dt;
    if (this.crushIn <= 0) {
      this.crushIn = v.crushEverySec!;
      this.stomp();
    }
    this.shellIn -= dt;
    if (this.shellIn <= 0) {
      this.shellIn = v.shellEverySec!;
      this.bombard();
    }
  }

  protected override end(): void {
    this.blast(this.at, this.host.area(this.s.values.burstRadius!), this.s.values.burstDamage!, this.s.def.sprites.soldierBurst!);
  }
}

export const executionWill: SkillImpl = {
  cast(host, s) {
    trimOldest(host, OWNER, 0);
    const v = s.values;
    const p = host.playerPos();
    const d = host.aimDir();
    const sp = s.def.sprites;
    if (v.kind === 1) {
      host.addObject(new WillConstruct(host, s, sp.will!, { x: p.x - d.x * v.followPx!, y: p.y - d.y * v.followPx! }));
    } else if (v.kind === 2) {
      for (let i = 0; i < v.count!; i++) {
        const side = i % 2 === 0 ? 1 : -1;
        host.addObject(new MagiSoldier(host, s, sp.soldier!, { x: p.x - d.y * 16 * side, y: p.y + d.x * 16 * side }, i * 0.12));
      }
    } else {
      const ahead = { x: p.x + d.x * 28, y: p.y + d.y * 28 };
      host.addObject(new ImitationGolem(host, s, sp.golem!, host.blocked(ahead.x, ahead.y) ? p : ahead));
    }
    host.burst(p, s.def.color);
    return true;
  },
};
