/** 칼 무기 공격: 근접 베기·찌르기·내려찍기, 발도, 돌진, 베기 탄, 베기 연출. */
import { playFx } from '../../skills/skillFx';
import Phaser from 'phaser';
import type { Vec2 } from '../../core/actions';
import { hexColor } from '../../core/scale';
import { animKey } from '../../systems/art';
import { Enemy } from '../../entities/enemy';
import { shake } from '../../entities/juice';
import { lineHits, muzzleAngle } from '../../systems/targeting';
import { gradeEnergyMultiplier } from '../../systems/damage';
import { inArc, projectilesCut } from '../../systems/weapons';
import type { WeaponStats } from '../../systems/weapons';
import type { SpriteRef, WeaponSignature, TagId, WeaponDef } from '../../types/data';
import { sfx } from './shared';
import type { RunScene } from '../RunScene';

export class MeleeAttack {
  constructor(private readonly run: RunScene) {}

  /** 라스알히게의 검: 조준한 적 쪽으로 돌진 (적 앞에서 멈춘다). 돌진할 거리가 없으면 false */
  lunge(w: WeaponDef, l: NonNullable<WeaponDef['lunge']>, aimAngle: number): boolean {
    const p = this.run.player;
    const t = this.run.aimTarget;
    const reach = w.pattern.kind === 'arc' ? w.pattern.radius * 0.5 : 0;
    const dist = Math.min(l.distance, t ? Math.max(0, Math.hypot(t.x - p.x, t.y - p.y) - reach) : l.distance);
    if (dist < 1) return false;
    const speed = dist / l.sec;
    this.run.dashVel = { x: Math.cos(aimAngle) * speed, y: Math.sin(aimAngle) * speed };
    this.run.dashLeft = l.sec;
    return true;
  }

  /**
   * 발도(라스알히게의 검): 눈 깜짝할 새 조준한 적을 꿰뚫고 뒤로 빠진다. 지나간 자리에 잔상과 가는 칼빛만 남고,
   * cutDelaySec 뒤 칼을 거두는 순간 길 위의 적이 한꺼번에 베인다 (공간격 차례면 공간격)
   */
  iaido(w: WeaponDef, ia: NonNullable<WeaponDef['iaido']>, st: WeaponStats, aimAngle: number, sig: WeaponSignature | null, emp: number): void {
    const p = this.run.player;
    const from = { x: p.x, y: p.y };
    const t = this.run.aimTarget;
    const ang = t ? Math.atan2(t.y - from.y, t.x - from.x) : aimAngle;
    const dir = { x: Math.cos(ang), y: Math.sin(ang) };
    const want = Math.min(ia.maxDistance, t ? Math.hypot(t.x - from.x, t.y - from.y) + ia.behindPx : ia.maxDistance * 0.6);
    const len = Math.max(8, this.run.special.clipRay(from, dir, want));
    const to = { x: from.x + dir.x * len, y: from.y + dir.y * len };
    // 순식간에 적을 지나 뒤로: 몸이 적에 막히지 않게 바로 옮긴다 (벽·장애물까지의 거리는 위에서 잘랐다)
    p.setPosition(to.x, to.y);
    p.setVelocity(0, 0);
    this.run.invuln = Math.max(this.run.invuln, ia.sec + 0.15);
    const color = hexColor(ia.color);
    this.run.combat.startMeleeMotion(w, st.fireIntervalSec, ia.color);
    // 1) 순간: 출발점 번쩍, 지나간 길에 잔상과 가는 칼빛
    const flash = this.run.add.circle(from.x, from.y, 5, 0xffffff, 0.9).setDepth(7).setBlendMode(Phaser.BlendModes.ADD);
    this.run.tweens.add({ targets: flash, scale: 3, alpha: 0, duration: 160, onComplete: () => flash.destroy() });
    const ghosts = 6;
    for (let i = 0; i < ghosts; i++) {
      const k = i / (ghosts - 1);
      const g = this.run.add
        .image(from.x + dir.x * len * k, from.y + dir.y * len * k, p.texture.key, p.frame.name)
        .setOrigin(p.originX, p.originY)
        .setFlipX(dir.x < 0)
        .setScale(p.scaleX, p.scaleY)
        .setTintFill(i === ghosts - 1 ? 0xffffff : color)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setAlpha(0.15 + 0.5 * k)
        .setDepth(6);
      this.run.tweens.add({ targets: g, alpha: 0, duration: 200 + 140 * k, onComplete: () => g.destroy() });
    }
    const streak = this.run.add.graphics().setDepth(7).setBlendMode(Phaser.BlendModes.ADD);
    streak.lineStyle(3, color, 0.55).lineBetween(from.x, from.y, to.x, to.y);
    streak.lineStyle(1, 0xffffff, 1).lineBetween(from.x, from.y, to.x, to.y);
    this.run.tweens.add({ targets: streak, alpha: 0.25, duration: ia.cutDelaySec * 1000 });
    // 2) 칼을 거두는 순간: 길 위의 적이 한꺼번에 베인다
    this.run.time.delayedCall(ia.cutDelaySec * 1000, () => {
      streak.destroy();
      const tags: readonly TagId[] = sig?.kind === 'space' ? [...w.tags, 'space'] : w.tags;
      // 공간격 차례: 벤 길을 따라 공간이 갈라진다 (3식 제미니와 같은 연출)
      if (sig?.kind === 'space' && w.qSkill?.kind === 'gemini') this.run.weaponSkills.spaceSlash(w.qSkill, from, to, true);
      const enemies = this.run.enemies.filter((e) => !e.dead);
      const hits = lineHits(from, dir, len, ia.width / 2, enemies.map((e) => ({ x: e.sprite.x, y: e.sprite.y, radius: e.radius })));
      const lined = new Set(lineHits(from, dir, len, ia.width / 2, this.run.roomProps.breakables.map((b) => ({ x: b.x, y: b.y, radius: 6 }))).map((i) => this.run.roomProps.breakables[i]!));
      this.run.roomProps.meleeProps(st.damage * emp, (b) => lined.has(b));
      // 길 전체를 가르는 넓은 칼빛 (밝게 번쩍였다가 가늘어지며 사라진다)
      const fx = this.run.ctx.data.weapons.meleeFx;
      const mid = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
      this.meleeFx(fx.slashBig, ia.color, 0.18, mid.x, mid.y, { w: len * 1.15, h: ia.width * 1.6, rotation: ang });
      const cut = this.run.add.graphics().setDepth(7).setBlendMode(Phaser.BlendModes.ADD);
      cut.lineStyle(ia.width * 0.5, color, 0.5).lineBetween(from.x, from.y, to.x, to.y);
      cut.lineStyle(3, 0xffffff, 1).lineBetween(from.x - dir.x * 10, from.y - dir.y * 10, to.x + dir.x * 10, to.y + dir.y * 10);
      this.run.tweens.add({ targets: cut, alpha: 0, scaleY: 1, duration: 260, ease: 'Quad.easeOut', onComplete: () => cut.destroy() });
      for (const i of hits) {
        const e = enemies[i]!;
        const at = { x: e.sprite.x, y: e.sprite.y };
        // 적마다 엇갈린 X자 참격 + 금빛 불꽃
        for (const r of [ang + 0.6, ang - 0.6]) this.meleeFx(fx.slash, ia.color, 0.14, at.x, at.y, { w: 30, rotation: r });
        for (let s = 0; s < 6; s++) this.run.combat.spark(at.x, at.y, s % 2 ? '#ffffff' : ia.color, this.run.rng.range(-18, 18), this.run.rng.range(-18, 18));
        this.run.damage.hit(e, this.run.combat.critRoll(st.damage * emp, st.critChance, at), tags);
      }
      // 칼을 거두는 소리·멈칫
      sfx(hits.length ? 'crit' : 'swing');
      if (hits.length) {
        shake(this.run, 'light');
        this.run.hitStop.request(this.run.ctx.data.juice.hitStop.crit);
      }
      const ring = this.run.add.circle(this.run.player.x, this.run.player.y, 6).setStrokeStyle(2, color, 1).setDepth(7);
      this.run.tweens.add({ targets: ring, scale: 2.4, alpha: 0, duration: 240, onComplete: () => ring.destroy() });
    });
  }

  melee(w: WeaponDef, st: WeaponStats, aimAngle: number, chargeRatio: number, sig: WeaponSignature | null, emp: number): void {
    const origin = { x: this.run.player.x, y: this.run.player.y };
    const dir = { x: Math.cos(aimAngle), y: Math.sin(aimAngle) };
    const big = sig?.kind === 'bigSmash' ? sig : null;
    const dmgMul = (w.charge ? 1 + (w.charge.damageMul - 1) * chargeRatio : 1) * (big ? big.damageMul : 1) * emp;
    const radMul = (w.charge ? 1 + (w.charge.radiusMul - 1) * chargeRatio : 1) * (1 + this.run.itemRt.sums.area) * (big ? big.radiusMul : 1);
    const tags: readonly TagId[] = sig?.kind === 'space' ? [...w.tags, 'space'] : w.tags;
    if (big) {
      shake(this.run, 'light');
      this.run.floatLabel(origin, this.run.ctx.t(big.nameKey ?? 'weapon.sig.bigSmash'), w.color);
      if (big.sparks && w.pattern.kind === 'arc') this.slashSparks(origin, aimAngle, w.pattern.arcDeg, w.pattern.radius * radMul, big.sparks);
    }
    const p = w.pattern;
    const enemies = [...this.run.enemies];
    const strong = sig !== null || chargeRatio >= 1;
    const color = w.fxColor ?? w.color;
    const fx = this.run.ctx.data.weapons.meleeFx;
    let targets: Enemy[] = [];
    if (p.kind === 'arc') {
      const radius = p.radius * radMul;
      targets = enemies.filter((e) => inArc(origin, aimAngle, p.arcDeg, radius, e.sprite, e.radius));
      this.run.roomProps.meleeProps(st.damage * dmgMul, (b) => inArc(origin, aimAngle, p.arcDeg, radius, b, 6));
      this.run.combat.swingFlip = !this.run.combat.swingFlip;
      this.meleeFx(this.run.combat.tierFx(fx.slashTiers, w, strong), color, st.fireIntervalSec, origin.x + dir.x * radius * 0.5, origin.y + dir.y * radius * 0.5, { w: radius * (strong ? 1.5 : 1.2), rotation: aimAngle, flipY: this.run.combat.swingFlip });
    } else if (p.kind === 'line') {
      const len = p.length * radMul;
      const idx = lineHits(origin, dir, len, p.width / 2, enemies.map((e) => ({ x: e.sprite.x, y: e.sprite.y, radius: e.radius })));
      targets = idx.map((i) => enemies[i]!);
      const propIdx = lineHits(origin, dir, len, p.width / 2, this.run.roomProps.breakables.map((b) => ({ x: b.x, y: b.y, radius: 6 })));
      const lined = new Set(propIdx.map((i) => this.run.roomProps.breakables[i]!));
      this.run.roomProps.meleeProps(st.damage * dmgMul, (b) => lined.has(b));
      // 찌르기: 찌른 방향으로 뻗는 창 줄기
      this.meleeFx(this.run.combat.tierFx(fx.thrustTiers, w, strong), color, st.fireIntervalSec, origin.x + dir.x * len * 0.5, origin.y + dir.y * len * 0.5, { w: len * 1.08, h: p.width * (strong ? 4 : 3), rotation: aimAngle });
    } else if (p.kind === 'smash') {
      const c = { x: origin.x + dir.x * p.reach, y: origin.y + dir.y * p.reach };
      const r = p.radius * radMul;
      targets = enemies.filter((e) => Math.hypot(e.sprite.x - c.x, e.sprite.y - c.y) <= r + e.radius);
      this.run.roomProps.meleeProps(st.damage * dmgMul, (b) => Math.hypot(b.x - c.x, b.y - c.y) <= r + 6);
      this.meleeFx(this.run.combat.tierFx(fx.smashTiers, w, strong), color, st.fireIntervalSec, c.x, c.y, { w: r * 2.3 });
    } else if (p.kind === 'gust') {
      const r = p.radius * radMul;
      targets = enemies.filter((e) => Math.hypot(e.sprite.x - origin.x, e.sprite.y - origin.y) <= r + e.radius);
      this.run.roomProps.meleeProps(st.damage * dmgMul, (b) => Math.hypot(b.x - origin.x, b.y - origin.y) <= r + 6);
      this.gustFx(origin, r, color, this.run.combat.tierFx(fx.smashTiers, w, true));
    }
    this.run.combat.startMeleeMotion(w, st.fireIntervalSec, color);
    if (w.meleeShot) this.fireMeleeShot(w, w.meleeShot, st, aimAngle);
    if (w.selfBuff) this.run.combat.applyBuff(w.selfBuff);
    for (const e of targets) {
      const at = { x: e.sprite.x, y: e.sprite.y };
      this.run.damage.hit(e, this.run.combat.critRoll(st.damage * dmgMul, st.critChance, at), tags);
      if (w.bleed) this.run.skillRt.hostFor('weapon').bleed(e, w.bleed.stacks);
      if (w.knockback && !e.dead) {
        const d = Math.hypot(at.x - origin.x, at.y - origin.y) || 1;
        e.knockback({ x: (at.x - origin.x) / d, y: (at.y - origin.y) / d }, w.knockback.distance, w.knockback.sec);
      }
    }
    if (sig?.kind === 'chainBolt') this.run.combat.chainBolt(w, st, sig, origin);
    // 탄 베기 (베기 무기만)
    if (p.kind === 'arc') {
      const eb = this.run.enemyBullets.getChildren() as Phaser.Physics.Arcade.Image[];
      const cut = projectilesCut(
        w,
        origin,
        aimAngle,
        eb.map((b) => ({ x: b.x, y: b.y, cuttable: b.getData('cuttable') !== false })),
      );
      const reflect = this.run.itemRt.first('cutReflect');
      for (const i of cut) {
        const b = eb[i];
        if (!b) continue;
        // 마력 전투 응용법: 벤 탄이 온 방향으로 되돌아간다
        if (reflect) {
          const v = (b.body as Phaser.Physics.Arcade.Body).velocity;
          this.run.combat.fireBullet({ x: b.x, y: b.y }, Math.atan2(-v.y, -v.x), Math.hypot(v.x, v.y), reflect.range, b.getData('damage') as number, w.tags, 'cutReflect');
        }
        b.destroy();
      }
    }
  }

  /** 베면서 쏘는 탄 (에너지가 모자라면 베기만 한다) */
  fireMeleeShot(w: WeaponDef, s: NonNullable<WeaponDef['meleeShot']>, st: WeaponStats, aimAngle: number): void {
    const p = this.run.session.player;
    const cost = s.energyCost * gradeEnergyMultiplier(w.grade, this.run.ctx.data.groupMultipliers);
    if (p.energy < cost) return;
    p.energy -= cost;
    const from = this.run.combat.firePoint();
    this.run.combat.fireBullet(from, muzzleAngle(from, this.run.aimTarget, aimAngle, this.run.ctx.data.player.muzzleMinTargetPx), s.speed, s.range, st.damage * s.damageMul, ['physical', 'ranged'], null, { pierce: 0, crit: st.critChance, tint: s.color, trail: s.color });
  }

  /** 근접 이펙트 한 번: 무기 색을 입히고 밝은 심을 겹친다. 공격이 빠른 무기는 그만큼 빨리 돈다 */
  meleeFx(ref: SpriteRef, color: string, intervalSec: number, x: number, y: number, o: { w: number; h?: number; rotation?: number; flipY?: boolean }): void {
    const glow = this.run.ctx.data.weapons.meleeFx.glowAlpha;
    const anim = this.run.anims.get(animKey(ref.spriteKey, 'play'));
    const speed = anim ? Math.max(1, anim.duration / 1000 / Math.max(0.05, intervalSec)) : 1;
    for (const core of [false, true]) {
      const sp = playFx(this.run, ref, x, y, { w: o.w, h: o.h, rotation: o.rotation, depth: 6 }).setFlipY(o.flipY ?? false);
      sp.anims.timeScale = speed;
      if (core) sp.setBlendMode(Phaser.BlendModes.ADD).setAlpha(glow);
      else sp.setTint(hexColor(color));
    }
  }

  /**
   * 칼: 베기(arc) · 찌르기(line, 관통) · 내려찍기(smash, 넉백).
   * gust: 몸 둘레 바람(넉백), 자기 버프.
   * sig: 이번 공격에 발동한 유니크 고유 효과(네메아의 종말 = 피해·범위 증가, 공간 가르기 = 공간격) / emp: 피해 배율(특무 인장)
   * 강화 평타(고유 효과 발동·완전 차지)는 다른 이펙트를 쓴다.
   */
  /** 알 굴 참마검 '참수': 참격 호를 따라 흰 빛줄기가 바깥으로 뻗고 불티가 흩어진다 */
  slashSparks(origin: Vec2, aim: number, arcDeg: number, radius: number, s: { streaks: number; dots: number; color: string; lifeSec: number; speed: [number, number] }): void {
    const rng = this.run.rng;
    const color = hexColor(s.color);
    const half = (arcDeg * Math.PI) / 360;
    const spawn = (n: number, make: (x: number, y: number, a: number) => Phaser.GameObjects.Rectangle, grow: number) => {
      for (let i = 0; i < n; i++) {
        const a = aim + rng.range(-half, half);
        const r = radius * rng.range(0.45, 1.05);
        const x = origin.x + Math.cos(a) * r;
        const y = origin.y + Math.sin(a) * r;
        const v = rng.range(s.speed[0], s.speed[1]);
        const life = s.lifeSec * rng.range(0.6, 1.2);
        const obj = make(x, y, a).setDepth(8).setBlendMode(Phaser.BlendModes.ADD);
        this.run.tweens.add({ targets: obj, x: x + Math.cos(a) * v * life, y: y + Math.sin(a) * v * life, alpha: 0, scaleX: grow, duration: life * 1000, delay: rng.range(0, 60), ease: 'Cubic.easeOut', onComplete: () => obj.destroy() });
      }
    };
    // 빛줄기: 바깥 방향으로 길게, 날아가며 늘어난다
    spawn(s.streaks, (x, y, a) => this.run.add.rectangle(x, y, rng.range(6, 12), 1, color).setRotation(a), 1.8);
    // 불티: 작은 점
    spawn(s.dots, (x, y) => this.run.add.rectangle(x, y, rng.int(1, 2), rng.int(1, 2), color), 1);
  }

  /** 바람: 충격파 + 사방으로 뻗는 바람 줄기 */
  gustFx(at: Vec2, radius: number, color: string, ref: SpriteRef): void {
    this.meleeFx(ref, color, 0.5, at.x, at.y, { w: radius * 2.2 });
    const col = hexColor(color);
    const n = 18;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + this.run.rng.range(-0.12, 0.12);
      const from = radius * 0.2;
      const to = radius * this.run.rng.range(0.75, 1.1);
      const streak = this.run.add.rectangle(at.x + Math.cos(a) * from, at.y + Math.sin(a) * from, this.run.rng.range(8, 16), 1.5, col, 0.85).setRotation(a).setDepth(6);
      this.run.tweens.add({ targets: streak, x: at.x + Math.cos(a) * to, y: at.y + Math.sin(a) * to, alpha: 0, scaleX: 0.3, duration: 340, delay: i % 3 * 25, ease: 'Quad.easeOut', onComplete: () => streak.destroy() });
    }
    shake(this.run, 'light');
  }
}
