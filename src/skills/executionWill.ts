/**
 * 집행 의지체 (마기법사 휘강파). 레벨마다 다른 소환체를 부른다. 다시 쓰면 앞의 소환체는 사라진다. 소환체는 적이 노리지 않는다.
 * - Lv1 집행 의지체: 플레이어 뒤를 떠다니며, 본체가 쓴 마기법사 액티브를 copyDelaySec 뒤 같은 방향으로 copyDamage 피해로 따라 쓴다.
 *   순간이동·원소 가호·집행 의지체·궁극기·기본공격은 따라 쓰지 않는다. 피해를 받지 않는다.
 * - Lv2 마기 병정 count기: 가까운 적에게 달라붙어 찌르고 둔화·밀치기. 적 탄·몸에 닿으면 체력이 깎이고, 부서지면 소폭발.
 * - Lv3 모조 마기골렘: 내려앉으며 충격파, 주기적 원형 충격파·밀치기, 가까운 적 자리에 마기 포격. 체력이 깎이고 사라질 때 마기 폭발.
 * 그림은 힉스필드로 뽑은 움직임 시트(idle·move·attack/cast). 떠다님·숨쉬기·등장 연출은 코드로 얹는다.
 */
import type Phaser from 'phaser';
import type { Vec2 } from '../core/actions';
import type { BuffView } from '../core/session';
import type { Enemy } from '../entities/enemy';
import { shake } from '../entities/juice';
import { animKey } from '../systems/art';
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
  /** 공격·시전 동작이 끝나기 전에는 걷기·서기로 바꾸지 않는다 */
  private actingUntil = 0;
  /** 땅에서 솟는 정도 (0: 땅속, 1: 다 나옴) */
  protected rise = 1;

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
    this.play('idle');
  }

  /** 반복 동작 (공격 중이면 미룬다) */
  protected play(name: string): void {
    if (this.host.scene.time.now < this.actingUntil) return;
    const key = animKey(this.ref.spriteKey, name);
    if (this.img.anims.currentAnim?.key !== key && this.img.scene.anims.exists(key)) this.img.play(key);
  }

  /** 한 번 도는 동작(공격·시전). 끝나면 서기로. 걸리는 초를 돌려준다 */
  protected act1(name: string): number {
    const key = animKey(this.ref.spriteKey, name);
    const anim = this.img.scene.anims.get(key);
    if (!anim) return 0;
    const sec = anim.frames.length / anim.frameRate;
    this.actingUntil = this.host.scene.time.now + sec * 1000;
    this.img.play(key);
    this.img.once('animationcomplete', () => {
      this.actingUntil = 0;
      if (!this.gone) this.play('idle');
    });
    return sec;
  }

  /** to 쪽으로 걷는다(벽이면 서 있는다). 움직였으면 true */
  protected walk(to: Vec2, speed: number, dt: number, stopAt: number): boolean {
    const next = stepToward(this.at, to, speed, dt, stopAt);
    const dx = next.x - this.at.x;
    const dy = next.y - this.at.y;
    if ((dx === 0 && dy === 0) || this.host.blocked(next.x, next.y)) return false;
    this.at = next;
    this.moving = true;
    this.play('move');
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
    if (!this.moving) this.play('idle');
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
    } else if (!this.moving) breath = 1 + Math.sin(t * 2.6) * 0.02;
    const p = this.pose;
    const fade = Math.min(1, Math.max(0, this.life) / 0.4 + 0.2);
    // 땅에서 솟는 중: 땅 아래로 내리고 땅 위로 나온 만큼만 보인다
    if (this.rise < 1) this.img.setCrop(0, 0, this.img.frame.width, this.img.frame.height * this.rise);
    else if (this.img.isCropped) this.img.setCrop();
    const sink = (1 - this.rise) * this.img.displayHeight;
    this.img
      .setPosition(this.at.x + p.ox, this.at.y + p.oy + bob + sink)
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
      this.act1('cast');
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
    this.act1('attack');
    this.lunge({ x: e.sprite.x, y: e.sprite.y }, 4, 0.08);
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

const GOLEM_RISE_SEC = 0.9;

/** Lv3: 땅을 가르고 솟아오르며 충격파, 주기적 내려찍기 충격파와 마기 포격 */
class ImitationGolem extends Summon {
  private crushIn: number;
  private shellIn: number;

  constructor(host: SkillHost, s: SkillCast, ref: SpriteRef, at: Vec2) {
    super(host, s, ref, at, true);
    this.crushIn = s.values.crushEverySec!;
    this.shellIn = s.values.shellEverySec! / 2;
    this.busy = GOLEM_RISE_SEC + 0.2;
    this.rise = 0;
    // 땅이 갈라지고(균열) 흔들리며 몸이 솟는다. 다 나오면 충격파
    const crater = s.def.sprites.golemCrater;
    if (crater) {
      const c = host.sprite(at.x, at.y + 2, crater).setDepth(2.5).setScale(0.2).setAlpha(0.95);
      const w = ref.size * 2.2;
      host.scene.tweens.add({ targets: c, displayWidth: w, displayHeight: (w * c.height) / Math.max(1, c.width), duration: 260, ease: 'Back.easeOut' });
      host.scene.tweens.add({ targets: c, alpha: 0, delay: (GOLEM_RISE_SEC + 1.2) * 1000, duration: 600, onComplete: () => c.destroy() });
    }
    shake(host.scene, 'rumble');
    host.scene.tweens.add({ targets: this, rise: 1, duration: GOLEM_RISE_SEC * 1000, ease: 'Quad.easeOut', onComplete: () => {
      if (this.gone) return;
      this.crush(s.values.landDamage!, 'medium');
      this.act1('attack');
    } });
    // 솟는 동안 돌 부스러기가 튄다
    for (let i = 0; i < 4; i++) host.scene.time.delayedCall(i * 180, () => !this.gone && host.burst({ x: at.x + host.rng.range(-10, 10), y: at.y }, '#8a8a96'));
  }

  private crush(damage: number, power: 'light' | 'medium' = 'light'): void {
    const v = this.s.values;
    const r = this.host.area(v.crushRadius!);
    this.push(this.at, r, damage, v.knockback!);
    playFx(this.host.scene, this.s.def.sprites.golemCrush!, this.at.x, this.at.y, { w: r * 2.2, depth: 3 });
    shake(this.host.scene, power);
  }

  /** 두 주먹을 들어 내려찍는다 (내려찍는 칸에서 충격파) */
  private stomp(): void {
    const sec = this.act1('attack') || 0.3;
    this.busy = sec;
    this.host.scene.time.delayedCall(sec * 0.6 * 1000, () => !this.gone && this.crush(this.s.values.crushDamage!));
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
