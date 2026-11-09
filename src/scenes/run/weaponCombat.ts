/** 무기 공격과 피해: 사격·근접(참격·타격 이펙트)·든 무기의 움직임과 잔상·바람과 버프·레이저·운석·번개, 탄 적중·튕김, 피해 계산. */
import { loopArt, playFx } from '../../skills/skillFx';
import { segmentClear } from '../../systems/pathField';
import { zigzag } from '../../systems/dodge';
import Phaser from 'phaser';
import type { Vec2 } from '../../core/actions';
import { Rng } from '../../core/rng';
import { hexColor } from '../../core/scale';
import { animKey } from '../../systems/art';
import { Enemy } from '../../entities/enemy';
import { lowSanityBonus } from '../../systems/sanity';
import { fitArt } from '../../entities/art';
import { shake } from '../../entities/juice';
import { damageKind } from '../../systems/juice';
import { weaponSfx } from '../../systems/sound';
import { Explosive } from '../../skills/explosive';
import { nearestEnemy } from '../../skills/host';
import { calcDamage, spaceDamage, type RangeBonus, type TagBonus } from '../../systems/damage';
import { itemDamageMultiplier } from '../../systems/items';
import { chainTargets, lineHits, muzzleAngle, muzzlePoint, shotOrigin } from '../../systems/targeting';
import { signatureFires, weaponPose, type WeaponMotionKind, type WeaponMotionParams } from '../../systems/motion';
import { corruptedDamage, skillChance } from '../../systems/acro';
import { hpStance } from '../../systems/vitals';

import { masteryTotals } from '../../systems/skills';
import { gradeEnergyMultiplier } from '../../systems/damage';
import { chargedCrit, gunShots, inArc, projectilesCut, rollCrit, spendEnergy, spinUpMul, type WeaponItem, type WeaponStats } from '../../systems/weapons';
import { contains, interiorRect } from '../../systems/worldLayout';
import type { SpriteRef, WeaponSignature, SpaceRule, TagId, WeaponDef } from '../../types/data';
import type { RunScene } from '../RunScene';
import { sfx } from './shared';

/** 신성한 이코르의 출혈 공격 태그 */
const ITEM_BLEED_TAGS: readonly TagId[] = ['physical', 'bleed'];

export class WeaponCombat {
  /** 유니크 고유 효과: 지금 무기로 한 공격 수 */
  sigItem: WeaponItem | null = null;
  sigCount = 0;
  pendingCrit = false;
  /** 대검 차지 */
  charging = false;
  chargeT = 0;
  chargeFx: Phaser.GameObjects.Graphics | null = null;
  /** 활: 시위에 건 화살 */
  nockArrow: Phaser.GameObjects.Image | null = null;
  private chargeSparkIn = 0;
  /** MG70: 연속으로 쏜 수와 쉰 시간 */
  private spinShots = 0;
  private spinIdle = 0;
  fireCooldown = 0;
  /** 공격력 버프 (아르고 원정대의 깃발) */
  buffLeft = 0;
  buffTotal = 0;
  buffDamage = 0;
  buffColor = '#ffffff';
  buffAura: Phaser.GameObjects.Sprite | null = null;
  private buffSparkIn = 0;
  /** 휘두를 때마다 참격 방향을 뒤집는다 */
  private swingFlip = false;
  /** 든 무기의 움직임 (없으면 제자리) */
  motion: { kind: WeaponMotionKind; t: number; sec: number; params: WeaponMotionParams; ghost: string | null; lastRot: number | null; particles: string | null } | null = null;

  constructor(private readonly run: RunScene) {}

  /** Space를 누르고 있으면 연사. 차지 무기(대검)는 누르는 동안 모았다가 놓을 때 휘두른다 */
  updateAttack(dt: number, held: boolean, aimAngle: number): void {
    this.fireCooldown -= dt;
    this.updateBuff(dt);
    const def = this.run.weaponDef();
    if (def.spinUp) {
      this.spinIdle += dt;
      if (this.spinIdle > def.spinUp.resetSec) this.spinShots = 0;
    }
    // LK-99: 차징 시간 감소
    const charge = def.charge ? { ...def.charge, maxSec: def.charge.maxSec * (1 - this.run.itemRt.sums.chargeTime) } : undefined;
    if (!charge) {
      if (held && this.fireCooldown <= 0) this.attack(aimAngle, 0);
      return;
    }
    if (held) {
      if (this.fireCooldown <= 0) {
        this.charging = true;
        this.chargeT = Math.min(charge.maxSec, this.chargeT + dt);
      }
    } else if (this.charging) {
      const ratio = this.chargeT / charge.maxSec;
      // 차징이 모자라면 나가지 않는다 (반물질 권총)
      if (ratio >= (charge.minRatio ?? 0)) this.attack(aimAngle, ratio);
      this.resetCharge();
    }
    this.drawCharge(charge.maxSec, dt);
  }

  resetCharge(): void {
    this.charging = false;
    this.chargeT = 0;
    this.chargeFx?.clear();
    this.nockArrow?.destroy();
    this.nockArrow = null;
  }

  /** 차징 중 이동속도 증가 (서풍) */
  chargeMoveBonus(): number {
    return this.charging ? (this.run.weaponDef().chargeMoveSpeed ?? 0) : 0;
  }

  /** 그림 안 마력 중심의 월드 좌표 (든 무기의 회전·뒤집힘을 따른다) */
  private corePoint(core: NonNullable<WeaponDef['core']>): Vec2 {
    const s = this.run.weaponSprite;
    const lx = (core.u - s.originX) * s.displayWidth;
    const ly = (core.v - s.originY) * s.displayHeight * (s.flipY ? -1 : 1);
    const c = Math.cos(s.rotation);
    const n = Math.sin(s.rotation);
    return { x: s.x + lx * c - ly * n, y: s.y + lx * n + ly * c };
  }

  /** 차징 연출: 활은 화살을 당기고, 마력 중심이 있으면 파티클이 모여들며 번쩍인다 */
  private chargeLook(k: number, dt: number): void {
    const w = this.run.weaponDef();
    if (w.category === 'bow' && w.shot) {
      this.nockArrow ??= this.run.add.image(0, 0, w.shot.spriteKey).setDepth(4.2);
      const hand = this.handPos();
      const back = 8 * k;
      this.nockArrow.setPosition(hand.x + this.run.aimDir.x * (2 - back), hand.y + this.run.aimDir.y * (2 - back)).setRotation(Math.atan2(this.run.aimDir.y, this.run.aimDir.x));
    }
    this.chargeSparkIn -= dt;
    if (this.chargeSparkIn > 0) return;
    const m = this.run.ctx.data.juice.weaponMotion.chargeCore;
    this.chargeSparkIn = m.everySec;
    const at = this.run.player;
    if (w.attackParticles) this.spark(at.x + this.run.rng.range(-8, 8), at.y + this.run.rng.range(-6, 6), w.attackParticles.color, 0, -14);
    const core = w.core;
    if (!core?.onCharge) return;
    const c = this.corePoint(core);
    const col = hexColor(core.color);
    const a = this.run.rng.range(0, Math.PI * 2);
    const r = m.gatherPx * this.run.rng.range(0.6, 1);
    const dot = this.run.add.rectangle(c.x + Math.cos(a) * r, c.y + Math.sin(a) * r, 1.5, 1.5, col, 1).setDepth(6).setBlendMode(Phaser.BlendModes.ADD);
    this.run.tweens.add({ targets: dot, x: c.x, y: c.y, duration: m.gatherSec * 1000, ease: 'Quad.easeIn', onComplete: () => dot.destroy() });
    // 찰수록 중심의 빛이 커지고, 다 차면 크게 번쩍인다
    const glow = this.run.add.circle(c.x, c.y, 1 + m.glowPx * k, col, 0.35 + 0.5 * k).setDepth(6).setBlendMode(Phaser.BlendModes.ADD);
    this.run.tweens.add({ targets: glow, alpha: 0, scale: 0.6, duration: m.everySec * 2000, onComplete: () => glow.destroy() });
    if (k >= 1) this.run.juice.sparkle(c, core.color, this.run.ctx.data.juice.weaponMotion.staff);
  }

  /** 작은 파티클 하나 */
  private spark(x: number, y: number, color: string, dx: number, dy: number): void {
    const p = this.run.add.rectangle(x, y, 2, 2, hexColor(color), 1).setDepth(6).setBlendMode(Phaser.BlendModes.ADD);
    this.run.tweens.add({ targets: p, x: x + dx, y: y + dy, alpha: 0, duration: 320, ease: 'Quad.easeOut', onComplete: () => p.destroy() });
  }

  /** 탄이 날아가는 동안: 화염은 커지며 흐려지고, 파티클을 흘리는 탄은 뒤로 흘린다 */
  bulletLook(b: Phaser.Physics.Arcade.Image, dist: number, dt: number): void {
    const flame = b.getData('flame') as number | undefined;
    if (flame) {
      const k = Math.min(1, dist / (b.getData('range') as number));
      b.setScale(1 + (flame - 1) * k).setAlpha(1 - 0.75 * k);
    }
    const trail = b.getData('trail') as string | undefined;
    if (!trail) return;
    const left = ((b.getData('trailIn') as number | undefined) ?? 0) - dt;
    if (left > 0) {
      b.setData('trailIn', left);
      return;
    }
    b.setData('trailIn', this.run.ctx.data.juice.weaponMotion.chargeCore.everySec);
    this.spark(b.x, b.y, trail, this.run.rng.range(-5, 5), this.run.rng.range(-5, 5));
  }

  drawCharge(maxSec: number, dt = 0): void {
    if (!this.chargeFx) this.chargeFx = this.run.add.graphics().setDepth(6);
    this.chargeFx.clear();
    if (!this.charging) return;
    const k = this.chargeT / maxSec;
    this.chargeLook(k, dt);
    this.chargeFx.lineStyle(2, k >= 1 ? 0xffd23f : 0xffffff, 0.8).beginPath();
    this.chargeFx.arc(this.run.player.x, this.run.player.y, 12, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k, false).strokePath();
  }

  /** chargeRatio: 0~1 (차지 무기만) */
  attack(aimAngle: number, chargeRatio: number): void {
    const item = this.run.weaponItem();
    const w = this.run.weaponDefOf(item.defId);
    const st = this.run.weaponStatsOf(item);
    const p = this.run.session.player;
    this.fireCooldown = st.fireIntervalSec;
    if (w.spinUp) {
      this.spinShots++;
      this.spinIdle = 0;
      this.fireCooldown = st.fireIntervalSec / spinUpMul(this.spinShots, w.spinUp);
    }
    // 유니크 고유 효과: 들고 있는 무기의 공격을 센다 (바꾸면 처음부터)
    if (this.sigItem !== item) {
      this.sigItem = item;
      this.sigCount = 0;
    }
    const sig = w.signature && signatureFires(++this.sigCount, w.signature.every) ? w.signature : null;

    if (w.category === 'blade') {
      // 칼: 피해가 클수록 무거운 휘두르기 (내려찍기 같은 강화 공격은 한 단계 위로)
      sfx(weaponSfx(w), st.damage * (sig?.kind === 'bigSmash' ? sig.damageMul : 1));
      // 특무 인장: 순간 회피 직후 기본공격 피해 증가
      const emp = this.run.itemRt.consumeEmpowered();
      if (w.iaido) {
        this.iaido(w, w.iaido, st, aimAngle, sig, emp);
        return;
      }
      if (w.lunge && this.lunge(w, w.lunge, aimAngle)) {
        // 돌진이 끝난 자리에서 벤다
        this.run.time.delayedCall(w.lunge.sec * 1000, () => this.melee(w, st, aimAngle, chargeRatio, sig, emp));
        return;
      }
      this.melee(w, st, aimAngle, chargeRatio, sig, emp);
      return;
    }

    // 궤도절삭륜: 충전(손에 남은 원반)이 없으면 던지지 않는다
    if (w.boomerang && this.run.special.discCharges(w) <= 0) {
      this.fireCooldown = 0.05;
      return;
    }
    // 야시장 복제총: 이번 공격의 에너지 소모가 무작위
    const rolled = this.run.special.rolledStats(w, st);
    const left = spendEnergy(p.energy, rolled);
    if (left === null) {
      this.run.session.energyEmptyAt = this.run.time.now;
      this.run.toastThrottled(this.run.ctx.t('room.energyEmpty'));
      // 에너지가 모자라면 총 대신 주먹으로 친다 (잠긴 방에서 공격 수단이 사라지지 않게)
      const fist = this.run.fistItem();
      const fistStats = this.run.weaponStatsOf(fist);
      this.fireCooldown = fistStats.fireIntervalSec;
      const fistDef = this.run.weaponDefOf(fist.defId);
      sfx(weaponSfx(fistDef), fistStats.damage);
      this.melee(fistDef, fistStats, aimAngle, 0, null, this.run.itemRt.consumeEmpowered());
      return;
    }
    p.energy = left;
    this.startShotMotion(w, this.fireCooldown);
    sfx(sig?.kind === 'laser' ? 'shotLaser' : weaponSfx(w));
    // 쏘는 무기의 차징: 모은 만큼 피해 증가
    const emp = this.run.itemRt.consumeEmpowered() * (w.charge ? 1 + (w.charge.damageMul - 1) * chargeRatio : 1);
    if (sig?.kind === 'laser') {
      this.weaponLaser(w, st.damage * sig.damageMul * emp, st.critChance, aimAngle, sig.length, sig.width, sig.beam?.spriteKey);
      return;
    }
    if (w.pattern.kind === 'meteor') {
      this.dropMeteor(w, st, w.pattern, st.damage * emp);
      return;
    }
    const muzzle = this.firePoint();
    const shotAngle = muzzleAngle(muzzle, this.run.aimTarget, aimAngle, this.run.ctx.data.player.muzzleMinTargetPx);
    if (w.boomerang) {
      this.run.special.throwDisc(w, { ...st, damage: st.damage * emp }, muzzle, shotAngle);
      return;
    }
    if (w.needle) {
      this.run.special.fireNeedle(w, { ...st, damage: st.damage * emp }, muzzle, shotAngle);
      return;
    }
    if (w.beam) {
      this.run.special.fireBeam(w, { ...st, damage: st.damage * emp }, shotAngle);
      return;
    }
    // 쌍성 지팡이: 지금 상태의 탄 (주성 별빛 화살 / 반성·정렬 관통·지형 무시 탄막)
    const twin = this.run.special.twinStarMode(w);
    if (twin) {
      this.fireBullet(muzzle, shotAngle, st.projectileSpeed, w.range, st.damage * emp, w.tags, null, { pierce: twin.pierce, crit: st.critChance, sprite: twin.shot, ghost: twin.ghost, hitSize: twin.hitSize });
      return;
    }
    if (w.pattern.kind === 'homing') {
      this.fireBullet(muzzle, shotAngle, st.projectileSpeed, w.range, st.damage * emp, w.tags, null, { pierce: w.pierce ?? 0, crit: st.critChance, homing: w.pattern.turnRate });
      return;
    }
    if (w.pattern.kind === 'lob') {
      // 유탄: 사거리 안 가장 가까운 적(없으면 조준 방향) 자리에 떨어져 터진다. 자해 없음
      const host = this.run.skillRt.hostFor('weapon');
      const target = nearestEnemy(host, this.run.player, w.range);
      const to = target ? { x: target.sprite.x, y: target.sprite.y } : { x: this.run.player.x + this.run.aimDir.x * w.range, y: this.run.player.y + this.run.aimDir.y * w.range };
      host.addObject(
        new Explosive(host, {
          owner: 'weapon',
          from: muzzle,
          to,
          speed: st.projectileSpeed,
          radius: w.pattern.radius * (1 + this.run.itemRt.sums.area) * (w.charge ? 1 + (w.charge.radiusMul - 1) * chargeRatio : 1),
          base: st.damage * emp,
          tags: w.tags,
          sprite: w.shot ?? this.run.ctx.data.weapons.projectile,
          blasts: w.lobBlast ? [w.lobBlast] : undefined,
        }),
      );
      return;
    }
    for (const shot of gunShots(w, shotAngle, this.run.rng, this.run.itemRt.sums.pellets)) {
      this.fireBullet(muzzle, shot.angle, st.projectileSpeed, shot.range, st.damage * emp, w.tags, null, { pierce: w.pierce ?? 0, crit: chargedCrit(st.critChance, chargeRatio, w.charge?.critAtMax), ricochet: w.ricochet, tint: w.ricochet || w.flame ? w.color : undefined, sprite: w.shot, flame: w.flame?.scaleTo, trail: w.attackParticles?.color });
    }
    // 질 낮은 가품: 쏠 때마다 따로 판정해 터지면 무기가 사라진다
    this.run.special.rollSelfDestruct(w);
  }

  /** 총은 뒤로 튕기고(느린 총일수록 크게), 지팡이는 끝에서 번쩍인다 */
  private startShotMotion(w: WeaponDef, intervalSec: number): void {
    const m = this.run.ctx.data.juice.weaponMotion;
    if (w.category === 'staff') {
      this.setMotion('staff', m.staff.sec, intervalSec, { px: m.staff.px }, null);
      this.run.juice.sparkle(this.muzzle(), w.color, m.staff);
      return;
    }
    // 발사 번쩍임: 마력 중심 (소울 칼리버)
    if (w.core && !w.core.onCharge) {
      const c = this.corePoint(w.core);
      this.run.juice.sparkle(c, w.core.color, m.staff);
      if (w.fireFlash) playFx(this.run, w.fireFlash, c.x, c.y, { w: w.fireFlash.size * 2, depth: 7 });
    }
    if (w.attackParticles) this.run.juice.sparkle(this.muzzle(), w.attackParticles.color, m.staff);
    const heavy = Math.min(1, intervalSec / m.recoil.refIntervalSec);
    this.setMotion('recoil', m.recoil.sec, intervalSec, { rad: (m.recoil.kickDeg * heavy * Math.PI) / 180, px: m.recoil.minPx + (m.recoil.maxPx - m.recoil.minPx) * heavy }, null);
  }

  /** 칼: 패턴에 맞는 움직임을 잔상과 함께 */
  private startMeleeMotion(w: WeaponDef, intervalSec: number, color: string): void {
    const m = this.run.ctx.data.juice.weaponMotion;
    const rad = (deg: number) => (deg * Math.PI) / 180;
    const p = w.pattern;
    if (p.kind === 'arc') this.setMotion('swing', m.swing.sec, intervalSec, { rad: rad(Math.min(p.arcDeg, m.swing.maxArcDeg) / 2), sign: this.swingFlip ? -1 : 1 }, color);
    else if (p.kind === 'line') this.setMotion('thrust', m.thrust.sec, intervalSec, { px: m.thrust.px }, color);
    else if (p.kind === 'smash') this.setMotion('smash', m.smash.sec, intervalSec, { rad: rad(m.smash.fromDeg), toRad: rad(m.smash.toDeg) }, color);
    else if (p.kind === 'gust') this.setMotion('wave', m.wave.sec, intervalSec, { rad: rad(m.wave.deg) }, color);
  }

  private setMotion(kind: WeaponMotionKind, sec: number, intervalSec: number, params: WeaponMotionParams, ghost: string | null): void {
    this.motion = { kind, t: 0, sec: Math.min(sec, intervalSec * this.run.ctx.data.juice.weaponMotion.fitInterval), params, ghost, lastRot: null, particles: this.run.weaponDef().attackParticles?.color ?? null };
  }

  /** 이번 프레임 든 무기의 자세 (조준이 왼쪽이면 호출한 쪽이 각도를 뒤집는다) */
  heldPose(dt: number): { rot: number; push: number } {
    const m = this.motion;
    if (!m) return { rot: 0, push: 0 };
    m.t += dt / m.sec;
    if (m.t >= 1) {
      this.motion = null;
      return { rot: 0, push: 0 };
    }
    return weaponPose(m.kind, m.t, m.params);
  }

  /** 움직이는 칼 뒤로 잔상: 지난 프레임과의 각도 사이도 채워 흐릿하게 이어 보이게 한다 */
  trailHeld(sprite: Phaser.GameObjects.Image, push: number): void {
    const m = this.motion;
    if (!m?.ghost || m.t > 0.7) return;
    const c = this.run.ctx.data.juice.weaponMotion;
    const from = m.lastRot ?? sprite.rotation;
    let diff = sprite.rotation - from;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    m.lastRot = sprite.rotation;
    const moved = Math.abs(diff) > 0.001 || push !== 0;
    if (!moved) return;
    // 칼끝에서 파티클을 흘린다 (마기족의 송곳니)
    if (m.particles) {
      const len = sprite.displayWidth * (1 - sprite.originX);
      this.spark(sprite.x + Math.cos(sprite.rotation) * len, sprite.y + Math.sin(sprite.rotation) * len, m.particles, this.run.rng.range(-6, 6), this.run.rng.range(-6, 6));
    }
    const steps = Math.max(1, Math.min(5, Math.ceil(Math.abs(diff) / ((c.ghostStepDeg * Math.PI) / 180))));
    const col = hexColor(m.ghost);
    for (let i = 1; i <= steps; i++) {
      const g = this.run.add
        .image(sprite.x, sprite.y, sprite.texture.key)
        .setOrigin(sprite.originX, sprite.originY)
        .setFlip(sprite.flipX, sprite.flipY)
        .setScale(sprite.scaleX, sprite.scaleY)
        .setRotation(from + (diff * i) / steps)
        .setDepth(sprite.depth - 0.1)
        .setTint(col)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setAlpha(c.ghostAlpha * (i / steps));
      this.run.tweens.add({ targets: g, alpha: 0, duration: c.ghostFadeSec * 1000, onComplete: () => g.destroy() });
    }
  }

  /** 라스알히게의 검: 조준한 적 쪽으로 돌진 (적 앞에서 멈춘다). 돌진할 거리가 없으면 false */
  private lunge(w: WeaponDef, l: NonNullable<WeaponDef['lunge']>, aimAngle: number): boolean {
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
  private iaido(w: WeaponDef, ia: NonNullable<WeaponDef['iaido']>, st: WeaponStats, aimAngle: number, sig: WeaponSignature | null, emp: number): void {
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
    this.startMeleeMotion(w, st.fireIntervalSec, ia.color);
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
        for (let s = 0; s < 6; s++) this.spark(at.x, at.y, s % 2 ? '#ffffff' : ia.color, this.run.rng.range(-18, 18), this.run.rng.range(-18, 18));
        this.hit(e, this.critRoll(st.damage * emp, st.critChance, at), tags);
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

  /** 기환의 팔: 가까운 적에서 적으로 튕기는 번개 (anyDistance면 첫 적은 아무리 멀어도) */
  chainBolt(w: WeaponDef, st: WeaponStats, sig: Extract<WeaponSignature, { kind: 'chainBolt' }>, origin: Vec2): void {
    const enemies = this.run.enemies.filter((e) => !e.dead);
    const pts = enemies.map((e) => ({ x: e.sprite.x, y: e.sprite.y, radius: e.radius }));
    const first = chainTargets(origin, pts, 1, sig.anyDistance ? Infinity : sig.range, new Set());
    const idx = first.length ? [...first, ...chainTargets(pts[first[0]!]!, pts, sig.jumps - 1, sig.range, new Set(first))] : [];
    if (idx.length === 0) return;
    sfx('electric');
    const rng = (this.run.condition.dodgeFxRng ??= Rng.derive(this.run.ctx.config.seed, 'dodge-fx'));
    const g = this.run.add.graphics().setDepth(6);
    let at = origin;
    for (const i of idx) {
      const e = enemies[i]!;
      const to = { x: e.sprite.x, y: e.sprite.y };
      const pts = zigzag(at, to, 5, 5, rng);
      g.lineStyle(3, hexColor(sig.color), 0.4).strokePoints(pts);
      g.lineStyle(1, 0xffffff, 1).strokePoints(pts);
      this.hit(e, this.critRoll(st.damage * sig.damageMul, st.critChance, to), w.tags);
      at = to;
    }
    this.run.tweens.add({ targets: g, alpha: 0, duration: 200, onComplete: () => g.destroy() });
  }

  /** 식광의 핵: 가까운 적 자리에 운석이 떨어져 터진다 */
  dropMeteor(w: WeaponDef, st: WeaponStats, p: Extract<WeaponDef['pattern'], { kind: 'meteor' }>, base: number): void {
    const host = this.run.skillRt.hostFor('weapon');
    const target = nearestEnemy(host, this.run.player, w.range);
    const at = target ? { x: target.sprite.x, y: target.sprite.y } : { x: this.run.player.x + this.run.aimDir.x * w.range * 0.5, y: this.run.player.y + this.run.aimDir.y * w.range * 0.5 };
    const radius = p.radius * (1 + this.run.itemRt.sums.area);
    const mark = this.run.add.circle(at.x, at.y, radius, hexColor(p.color), 0.2).setStrokeStyle(1, hexColor(p.color), 0.9).setDepth(2);
    const rock = this.run.add.image(at.x, at.y - p.fallPx, p.sprite.spriteKey).setDepth(7);
    this.run.tweens.add({ targets: rock, y: at.y, duration: p.delaySec * 1000, ease: 'Quad.easeIn' });
    this.run.time.delayedCall(p.delaySec * 1000, () => {
      mark.destroy();
      rock.destroy();
      sfx('explosion', radius);
      shake(this.run, 'light');
      this.run.juice.explosionNear(at, 0);
      for (const e of [...this.run.enemies]) {
        if (!e.dead && Math.hypot(e.sprite.x - at.x, e.sprite.y - at.y) <= radius + e.radius) this.hit(e, this.critRoll(base, st.critChance, at), w.tags);
      }
      this.run.roomProps.blastProps(at, radius, base);
    });
  }

  /** 지팡이 고유 효과: 조준 방향 직선 레이저 (관통, 치명 판정) */
  weaponLaser(w: WeaponDef, base: number, crit: number, aimAngle: number, length: number, width: number, beamKey?: string): void {
    const origin = { x: this.run.player.x, y: this.run.player.y };
    const dir = { x: Math.cos(aimAngle), y: Math.sin(aimAngle) };
    // 벽에서 끊기고, 스넬의 법칙이 있으면 반사된다
    const path = this.run.special.laserPath(origin, dir, length * (1 + this.run.itemRt.sums.area));
    this.run.special.laserHits(path, width, (e) => this.hit(e, this.critRoll(base, crit, { x: e.sprite.x, y: e.sprite.y }), w.tags));
    for (const s of path) {
      if (beamKey && this.run.textures.exists(beamKey)) {
        // 그림 레이저: 길이에 맞춰 늘려 뻗는다
        const beam = this.run.add.image(s.from.x, s.from.y, beamKey).setOrigin(0, 0.5).setDepth(6).setRotation(Math.atan2(s.dir.y, s.dir.x)).setDisplaySize(Math.max(1, s.len), width * 2.5);
        this.run.tweens.add({ targets: beam, alpha: 0, duration: 180, onComplete: () => beam.destroy() });
        continue;
      }
      const g = this.run.add.graphics().setDepth(6);
      g.lineStyle(width, hexColor(w.color), 0.8).lineBetween(s.from.x, s.from.y, s.from.x + s.dir.x * s.len, s.from.y + s.dir.y * s.len);
      this.run.time.delayedCall(this.run.ctx.data.ui.slashFxSec * 1000, () => g.destroy());
    }
  }

  fireBullet(
    from: Vec2,
    angle: number,
    speed: number,
    range: number,
    base: number,
    tags: readonly TagId[],
    source: string | null = null,
    opts: { pierce: number; crit: number; homing?: number; tint?: string; sprite?: SpriteRef; ricochet?: { bounces: number; range: number }; flame?: number; trail?: string; ghost?: boolean; hitSize?: number } = { pierce: 0, crit: 0 },
  ): void {
    const proj = this.run.ctx.data.weapons.projectile;
    const b = this.run.bullets.create(from.x, from.y, opts.sprite?.spriteKey ?? proj.spriteKey) as Phaser.Physics.Arcade.Sprite;
    this.run.playerBulletLayer.add(b);
    // 스킬 전용 탄: 날아가는 쪽을 보고 프레임이 돈다
    if (opts.sprite) {
      b.setRotation(angle);
      loopArt(b, opts.sprite);
    }
    fitArt(this.run.ctx.data, b, opts.hitSize ?? proj.size, opts.hitSize ?? proj.height ?? proj.size);
    b.setDepth(5);
    b.setData({ base, tags, range, ox: from.x, oy: from.y, source, pierce: opts.pierce, crit: opts.crit, homing: opts.homing ?? 0, hitSet: new Set<Enemy>(), bounces: opts.ricochet?.bounces ?? 0, bounceRange: opts.ricochet?.range ?? 0, flame: opts.flame ?? 0, trail: opts.trail, ghost: !!opts.ghost });
    if (opts.tint) b.setTint(hexColor(opts.tint));
    b.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed);
  }

  /** 무기를 쥔 손 자리 (그림이 뒤집히면 x도 뒤집고, 조준 방향으로 살짝 내민다) */
  handPos(): Vec2 {
    const { weaponHand: hand, weaponOffset: off } = this.run.ctx.data.player;
    return { x: this.run.player.x + (this.run.player.flipX ? -hand.x : hand.x) + this.run.aimDir.x * off, y: this.run.player.y + hand.y + this.run.aimDir.y * off };
  }

  /** 탄이 나가는 자리: 무기 끝. 끝이 벽·장애물 너머면 몸 가운데 (벽 뒤로 쏘지 않게) */
  muzzle(): Vec2 {
    const body = { x: this.run.player.x, y: this.run.player.y };
    const rid = this.run.session.currentRoomId;
    if (rid === null) return body;
    const art = this.run.ctx.data.art.sprites[this.run.weaponDef().spriteKey];
    const at = muzzlePoint(this.handPos(), this.run.aimDir, art ? (art.frameWidth / (art.density ?? 1)) * (1 - (art.gripX ?? 0.5)) : 0);
    const node = this.run.session.map.rooms[rid]!;
    const inside = contains(interiorRect(node, this.run.m), at.x, at.y);
    return inside && segmentClear(body, at, this.run.obstacles.get(rid) ?? []) ? at : body;
  }

  /** 실제로 탄이 나가는 자리: 총구까지의 사이에 적이 끼어 있으면 몸 가운데 (가까운 적을 지나쳐 쏘지 않게) */
  firePoint(): Vec2 {
    const body = { x: this.run.player.x, y: this.run.player.y };
    return shotOrigin(body, this.muzzle(), this.run.enemies.filter((e) => !e.dead).map((e) => ({ x: e.sprite.x, y: e.sprite.y, radius: e.radius })));
  }

  /** 무기 치명 판정 */
  critRoll(base: number, chance: number, at: Vec2): number {
    const r = rollCrit(this.run.rng, base, chance, this.run.ctx.data.weapons.critMultiplier + this.run.itemRt.total('critDamage'));
    // 치명타는 바로 이어지는 피해의 숫자를 크고 노랗게 (at은 예전 '치명' 글자 자리, 지금은 쓰지 않음)
    void at;
    if (r.crit) this.pendingCrit = true;
    return r.damage;
  }

  /**
   * 칼: 베기(arc) · 찌르기(line, 관통) · 내려찍기(smash, 넉백).
   * gust: 몸 둘레 바람(넉백), 자기 버프.
   * sig: 이번 공격에 발동한 유니크 고유 효과(네메아의 종말 = 피해·범위 증가, 공간 가르기 = 공간격) / emp: 피해 배율(특무 인장)
   * 강화 평타(고유 효과 발동·완전 차지)는 다른 이펙트를 쓴다.
   */
  /** 알 굴 참마검 '참수': 참격 호를 따라 흰 빛줄기가 바깥으로 뻗고 불티가 흩어진다 */
  private slashSparks(origin: Vec2, aim: number, arcDeg: number, radius: number, s: { streaks: number; dots: number; color: string; lifeSec: number; speed: [number, number] }): void {
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
      this.swingFlip = !this.swingFlip;
      this.meleeFx(strong ? fx.slashBig : fx.slash, color, st.fireIntervalSec, origin.x + dir.x * radius * 0.5, origin.y + dir.y * radius * 0.5, { w: radius * (strong ? 1.5 : 1.2), rotation: aimAngle, flipY: this.swingFlip });
    } else if (p.kind === 'line') {
      const len = p.length * radMul;
      const idx = lineHits(origin, dir, len, p.width / 2, enemies.map((e) => ({ x: e.sprite.x, y: e.sprite.y, radius: e.radius })));
      targets = idx.map((i) => enemies[i]!);
      const propIdx = lineHits(origin, dir, len, p.width / 2, this.run.roomProps.breakables.map((b) => ({ x: b.x, y: b.y, radius: 6 })));
      const lined = new Set(propIdx.map((i) => this.run.roomProps.breakables[i]!));
      this.run.roomProps.meleeProps(st.damage * dmgMul, (b) => lined.has(b));
      // 찌르기: 참격을 찌른 방향으로 길게 늘인다
      this.meleeFx(strong ? fx.slashBig : fx.slash, color, st.fireIntervalSec, origin.x + dir.x * len * 0.5, origin.y + dir.y * len * 0.5, { w: len, h: p.width * (strong ? 4 : 3), rotation: aimAngle });
    } else if (p.kind === 'smash') {
      const c = { x: origin.x + dir.x * p.reach, y: origin.y + dir.y * p.reach };
      const r = p.radius * radMul;
      targets = enemies.filter((e) => Math.hypot(e.sprite.x - c.x, e.sprite.y - c.y) <= r + e.radius);
      this.run.roomProps.meleeProps(st.damage * dmgMul, (b) => Math.hypot(b.x - c.x, b.y - c.y) <= r + 6);
      this.meleeFx(strong ? fx.slamBig : fx.slam, color, st.fireIntervalSec, c.x, c.y, this.fitWidth(strong ? fx.slamBig : fx.slam, r * 2.3));
    } else if (p.kind === 'gust') {
      const r = p.radius * radMul;
      targets = enemies.filter((e) => Math.hypot(e.sprite.x - origin.x, e.sprite.y - origin.y) <= r + e.radius);
      this.run.roomProps.meleeProps(st.damage * dmgMul, (b) => Math.hypot(b.x - origin.x, b.y - origin.y) <= r + 6);
      this.gustFx(origin, r, color);
    }
    this.startMeleeMotion(w, st.fireIntervalSec, color);
    if (w.meleeShot) this.fireMeleeShot(w, w.meleeShot, st, aimAngle);
    if (w.selfBuff) this.applyBuff(w.selfBuff);
    for (const e of targets) {
      const at = { x: e.sprite.x, y: e.sprite.y };
      this.hit(e, this.critRoll(st.damage * dmgMul, st.critChance, at), tags);
      if (w.bleed) this.run.skillRt.hostFor('weapon').bleed(e, w.bleed.base, w.bleed.stacks, w.tags);
      if (w.knockback && !e.dead) {
        const d = Math.hypot(at.x - origin.x, at.y - origin.y) || 1;
        e.knockback({ x: (at.x - origin.x) / d, y: (at.y - origin.y) / d }, w.knockback.distance, w.knockback.sec);
      }
    }
    if (sig?.kind === 'chainBolt') this.chainBolt(w, st, sig, origin);
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
          this.fireBullet({ x: b.x, y: b.y }, Math.atan2(-v.y, -v.x), Math.hypot(v.x, v.y), reflect.range, b.getData('damage') as number, w.tags, 'cutReflect');
        }
        b.destroy();
      }
    }
  }

  /** 베면서 쏘는 탄 (에너지가 모자라면 베기만 한다) */
  private fireMeleeShot(w: WeaponDef, s: NonNullable<WeaponDef['meleeShot']>, st: WeaponStats, aimAngle: number): void {
    const p = this.run.session.player;
    const cost = s.energyCost * gradeEnergyMultiplier(w.grade, this.run.ctx.data.groupMultipliers);
    if (p.energy < cost) return;
    p.energy -= cost;
    const from = this.firePoint();
    this.fireBullet(from, muzzleAngle(from, this.run.aimTarget, aimAngle, this.run.ctx.data.player.muzzleMinTargetPx), s.speed, s.range, st.damage * s.damageMul, ['physical', 'ranged'], null, { pierce: 0, crit: st.critChance, tint: s.color, trail: s.color });
  }

  /** 근접 이펙트 한 번: 무기 색을 입히고 밝은 심을 겹친다. 공격이 빠른 무기는 그만큼 빨리 돈다 */
  private meleeFx(ref: SpriteRef, color: string, intervalSec: number, x: number, y: number, o: { w: number; h?: number; rotation?: number; flipY?: boolean }): void {
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

  /** 세로로 긴 그림도 긴 쪽이 size에 맞게 (타격 이펙트) */
  private fitWidth(ref: SpriteRef, size: number): { w: number } {
    const art = this.run.ctx.data.art.sprites[ref.spriteKey];
    return { w: art ? size * Math.min(1, art.frameWidth / art.frameHeight) : size };
  }

  /** 바람: 충격파 + 사방으로 뻗는 바람 줄기 */
  private gustFx(at: Vec2, radius: number, color: string): void {
    const fx = this.run.ctx.data.weapons.meleeFx;
    this.meleeFx(fx.slamBig, color, 0.5, at.x, at.y, this.fitWidth(fx.slamBig, radius * 2.2));
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

  /** 공격력 버프를 걸거나 새로 시작한다 */
  private applyBuff(b: NonNullable<WeaponDef['selfBuff']>): void {
    if (this.buffLeft <= 0) this.run.juice.colorBurst({ x: this.run.player.x, y: this.run.player.y }, b.color, this.run.ctx.data.juice.shieldSpawn);
    this.buffLeft = b.sec;
    this.buffTotal = b.sec;
    this.buffDamage = b.damage;
    this.buffColor = b.color;
    this.run.floatLabel({ x: this.run.player.x, y: this.run.player.y - 14 }, this.run.ctx.t('buff.warBanner'), b.color);
  }

  /** 버프 동안 발밑 문양이 따라오고 불티가 피어오른다 */
  private updateBuff(dt: number): void {
    if (this.buffLeft <= 0) return;
    this.buffLeft -= dt;
    const fx = this.run.ctx.data.weapons.meleeFx;
    if (this.buffLeft <= 0) {
      this.buffAura?.destroy();
      this.buffAura = null;
      return;
    }
    const { x, y } = this.run.player;
    if (!this.buffAura) {
      this.buffAura = this.run.add.sprite(x, y, fx.buffAura.spriteKey).setDepth(2.5).setTint(hexColor(this.buffColor));
      loopArt(this.buffAura, fx.buffAura);
    }
    // 끝나 갈 때 깜빡여 알린다
    this.buffAura.setPosition(x, y + 4).setAlpha(this.buffLeft < 1 ? 0.2 + 0.4 * Math.abs(Math.sin(this.buffLeft * 10)) : 0.6);
    this.buffSparkIn -= dt;
    if (this.buffSparkIn > 0) return;
    this.buffSparkIn = fx.buffSparkSec;
    const ember = this.run.add.rectangle(x + this.run.rng.range(-9, 9), y + this.run.rng.range(-4, 6), 2, 2, hexColor(this.buffColor), 1).setDepth(6);
    this.run.tweens.add({ targets: ember, y: ember.y - this.run.rng.range(16, 28), alpha: 0, duration: 480, ease: 'Quad.easeOut', onComplete: () => ember.destroy() });
  }

  onBulletHit(b: Phaser.Physics.Arcade.Image, sprite: Phaser.Physics.Arcade.Image): void {
    const enemy = sprite.getData('enemy') as Enemy | undefined;
    if (!b.active || !enemy || enemy.dead) return;
    // 관통탄: 같은 적은 한 번만
    const hitSet = b.getData('hitSet') as Set<Enemy> | undefined;
    if (hitSet?.has(enemy)) return;
    const tags = b.getData('tags') as TagId[];
    const source = (b.getData('source') as string | null | undefined) ?? null;
    const base = this.critRoll(b.getData('base') as number, (b.getData('crit') as number | undefined) ?? 0, enemy.sprite);
    const pierce = (b.getData('pierce') as number | undefined) ?? 0;
    const bounces = (b.getData('bounces') as number | undefined) ?? 0;
    if (bounces > 0) this.ricochet(b, enemy, bounces);
    else if (pierce > 0) {
      b.setData('pierce', pierce - 1);
      hitSet?.add(enemy);
    } else {
      b.destroy();
    }
    this.hit(enemy, base, tags, source);
  }

  /** 튕김: 아직 안 맞힌 가까운 적으로 방향을 바꾼다. 없으면 사라진다 */
  private ricochet(b: Phaser.Physics.Arcade.Image, enemy: Enemy, bounces: number): void {
    const hitSet = b.getData('hitSet') as Set<Enemy>;
    hitSet.add(enemy);
    const list = this.run.enemies.filter((e) => !e.dead);
    const exclude = new Set(list.flatMap((e, i) => (hitSet.has(e) ? [i] : [])));
    const at = { x: enemy.sprite.x, y: enemy.sprite.y };
    const next = list[chainTargets(at, list.map((e) => ({ x: e.sprite.x, y: e.sprite.y, radius: e.radius })), 1, b.getData('bounceRange') as number, exclude)[0] ?? -1];
    if (!next) {
      b.destroy();
      return;
    }
    const body = b.body as Phaser.Physics.Arcade.Body;
    const a = Math.atan2(next.sprite.y - b.y, next.sprite.x - b.x);
    b.setVelocity(Math.cos(a) * body.speed, Math.sin(a) * body.speed);
    b.setData({ bounces: bounces - 1, ox: b.x, oy: b.y });
  }

  /** 피해 한 번. 태그 보정은 이 공격(source)의 태그로 계산한다 */
  hit(enemy: Enemy, base: number, tags: readonly TagId[], source: string | null = null): boolean {
    if (enemy.dead) return false;
    const d = this.run.ctx.data;
    // 끓어오르는 심장: 공격마다 기본 피해에 체력 비례 값을 더한다
    let dmg = calcDamage({ baseDamage: base + (this.run.skillRt.playerMods().flatDamage ?? 0), tags }, this.tagBonus(), d.tags, this.rangeBonus());
    // 신앙 강화: 성기사 계열(성기사 스킬·궁극기) 피해
    if (source && this.schoolOf(source) === 'paladin') dmg *= 1 + (masteryTotals(this.run.session.player.loadout, d.skills).paladinDamage ?? 0);
    // 아이템: 피해 %(더한 뒤 한 번), 보스·적이 받는 피해·스킬 피해, 적중 효과(신검 공간격·참마검)
    const boss = enemy.rank === 'boss' || enemy.rank === 'hiddenBoss';
    const hm = this.run.itemRt.hitMods(this.run.rng, (c) => skillChance(c, 'success', ['chance'], d.tags));
    dmg *= itemDamageMultiplier(this.run.itemRt.sums, this.run.itemRt.extraDamageAll(), boss, source) * hm.mult;
    // 무기 고유 피해 (무기 공격만)
    const eb = source === null ? this.run.weaponDef().equipBonus : undefined;
    if (eb?.bossDamage && boss) dmg *= 1 + eb.bossDamage;
    const school = this.run.session.player.advancement;
    if (school && eb?.jobDamage?.[school]) dmg *= 1 + eb.jobDamage[school]!;
    // 어느 전사의 기억 · 아트로스 비석 필사본
    const sp = this.run.session.player;
    if (this.buffLeft > 0) dmg *= 1 + this.buffDamage;
    const stance = this.run.itemRt.first('hpStance');
    if (stance) dmg *= 1 + hpStance(sp.hp, sp.maxHp, stance).damage;
    const low = this.run.itemRt.first('lowSanityDamage');
    if (low) dmg *= 1 + lowSanityBonus(sp.sanity, sp.sanityMax, low.maxDamage);
    const space = tags.includes('space') || hm.space;
    if (space) dmg = spaceDamage(enemy.rank, enemy.maxHp, dmg, this.run.tagRule<SpaceRule>('space'));
    const crit = this.pendingCrit;
    this.pendingCrit = false;
    const killed = this.applyDamage(enemy, corruptedDamage(dmg, enemy.corruption), source, { tags, crit, space });
    // 신성한 이코르: 근접 공격이 맞으면 확률로 출혈
    const mb = this.run.itemRt.first('meleeBleed');
    if (mb && !killed && tags.includes('melee') && this.run.rng.chance(mb.chance)) this.run.host.bleed(enemy, mb.damage, mb.stacks, ITEM_BLEED_TAGS);
    return killed;
  }

  /** 계산이 끝난 피해를 넣는다. 환원주의자 등에게 알리고, 죽였으면 true */
  /** fx: 타격(태그·치명·공간격). 없으면 출혈·변질 같은 지속 피해(작은 회색 숫자, 불꽃 없음) */
  applyDamage(enemy: Enemy, dmg: number, source: string | null = null, fx?: { tags: readonly TagId[]; crit: boolean; space: boolean }): boolean {
    if (enemy.dead) return false;
    // 보스 강화 단계 진입 중 무적
    if (enemy.invuln > 0) return false;
    dmg *= enemy.takenMul;
    const dealt = Math.min(Math.max(0, enemy.hp), dmg);
    const killed = enemy.damage(dmg);
    // 타격감: 피해 숫자, 불꽃·찌그러짐, 근접·치명 히트스톱
    const top = { x: enemy.sprite.x, y: enemy.sprite.y - enemy.radius };
    const bossHit = enemy.rank === 'boss' || enemy.rank === 'hiddenBoss';
    this.run.juice.damageNumber(top, dmg, damageKind({ crit: fx?.crit, space: fx?.space, dot: !fx }), bossHit);
    if (fx) {
      // 근접 타격은 피해에 맞는 무게, 쏘는 공격은 탄 맞는 소리
      if (fx.crit) sfx('crit');
      else if (fx.tags.includes('melee')) sfx('hit', dmg);
      else sfx('hitBullet');
      this.run.juice.hitSpark({ x: enemy.sprite.x, y: enemy.sprite.y }, fx.tags);
      enemy.squash();
      const hs = this.run.ctx.data.juice.hitStop;
      if (fx.tags.includes('melee')) this.run.hitStop.request(hs.melee);
      if (fx.crit) this.run.hitStop.request(hs.crit);
    }
    for (const o of [...this.run.skillRt.skillObjects]) o.onDamageDealt?.(this.run.host, dealt, enemy);
    // 아이템 피해 흡혈 (과기전쟁의 일기) + 스킬 흡혈 (전장의 함성)
    const steal = this.run.itemRt.sums.lifesteal + (this.run.skillRt.playerMods().lifesteal ?? 0);
    if (steal > 0 && dealt > 0) this.run.host.heal(dealt * steal, false);
    if (killed) this.run.onEnemyKilled(enemy);
    return killed;
  }

  /** 태그별 피해 증가: 아이템 + 들고 있는 무기 */
  tagBonus(): TagBonus {
    const it = this.run.itemRt.sums.damage;
    return { physical: it.physical + (this.run.weaponDef().equipBonus?.physicalDamage ?? 0), magic: it.magic, tech: it.tech };
  }

  /** 근접·원거리 피해 증가: 들고 있는 무기 + 아이템 + 무기 숙련 + 전장의 함성 (같은 종류라 더한다) */
  rangeBonus(): RangeBonus {
    const b = this.run.weaponDef().equipBonus;
    const it = this.run.itemRt.sums.damage;
    const mastery = masteryTotals(this.run.session.player.loadout, this.run.ctx.data.skills).meleeDamage ?? 0;
    const skill = this.run.skillRt.playerMods().meleeDamage ?? 0;
    return { melee: (b?.meleeDamage ?? 0) + it.melee + mastery + skill, ranged: (b?.rangedDamage ?? 0) + it.ranged };
  }

  /** 피해를 준 스킬·궁극기의 계열 (무기·아이템이면 null) */
  private schoolOf(source: string): string | null {
    const d = this.run.ctx.data;
    return d.skills.skills.find((s) => s.id === source)?.school ?? d.ultimates.ultimates.find((u) => u.id === source)?.school ?? null;
  }
}
