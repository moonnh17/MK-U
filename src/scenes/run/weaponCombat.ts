/** 무기 공격과 피해: 사격·근접(참격·타격 이펙트)·든 무기의 움직임과 잔상·바람과 버프·레이저·운석·번개, 탄 적중·튕김, 피해 계산. */
import { loopArt, playFx } from '../../skills/skillFx';
import { segmentClear } from '../../systems/pathField';
import { zigzag } from '../../systems/dodge';
import Phaser from 'phaser';
import type { Vec2 } from '../../core/actions';
import { Rng } from '../../core/rng';
import { hexColor, mixHex } from '../../core/scale';
import { Enemy } from '../../entities/enemy';
import { fitArt } from '../../entities/art';
import { shake } from '../../entities/juice';
import { weaponSfx } from '../../systems/sound';
import { Explosive } from '../../skills/explosive';
import { nearestEnemy } from '../../skills/host';
import { chainTargets, muzzleAngle, muzzlePoint, shotOrigin } from '../../systems/targeting';
import { signatureFires, weaponPose, type WeaponMotionKind, type WeaponMotionParams } from '../../systems/motion';

import { chargedCrit, gunShots, rollCrit, spendEnergy, spinUpMul, type WeaponItem, type WeaponStats } from '../../systems/weapons';
import { contains, interiorRect } from '../../systems/worldLayout';
import type { SpriteRef, WeaponSignature, TagId, WeaponDef } from '../../types/data';
import type { RunScene } from '../RunScene';
import { sfx } from './shared';

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
  /** 넣어 둔 무기의 남은 쿨타임 (꺼내면 그 무기에 그대로 돌려준다) */
  benchCooldown = 0;
  /** 공격력 버프 (아르고 원정대의 깃발) */
  buffLeft = 0;
  buffTotal = 0;
  buffDamage = 0;
  buffColor = '#ffffff';
  buffAura: Phaser.GameObjects.Sprite | null = null;
  private buffSparkIn = 0;
  /** 휘두를 때마다 참격 방향을 뒤집는다 */
  swingFlip = false;
  /** 든 무기의 움직임 (없으면 제자리) */
  motion: { kind: WeaponMotionKind; t: number; sec: number; params: WeaponMotionParams; ghost: string | null; lastRot: number | null; particles: string | null } | null = null;

  constructor(private readonly run: RunScene) {}

  /** Space를 누르고 있으면 연사. 차지 무기(대검)는 누르는 동안 모았다가 놓을 때 휘두른다 */
  updateAttack(dt: number, held: boolean, aimAngle: number): void {
    this.fireCooldown -= dt;
    this.benchCooldown -= dt;
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
  spark(x: number, y: number, color: string, dx: number, dy: number): void {
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
      // 체납자의 의수: 칠 때마다 마기 입자를 가져간다. 모자라면 맨손으로 친다
      if (w.debt && !this.run.special.payDebt(w)) {
        const fist = this.run.fistItem();
        const fistStats = this.run.weaponStatsOf(fist);
        this.fireCooldown = fistStats.fireIntervalSec;
        this.run.meleeRt.melee(this.run.weaponDefOf(fist.defId), fistStats, aimAngle, 0, null, emp);
        return;
      }
      if (w.iaido) {
        this.run.meleeRt.iaido(w, w.iaido, st, aimAngle, sig, emp);
        return;
      }
      if (w.lunge && this.run.meleeRt.lunge(w, w.lunge, aimAngle)) {
        // 돌진이 끝난 자리에서 벤다
        this.run.time.delayedCall(w.lunge.sec * 1000, () => this.run.meleeRt.melee(w, st, aimAngle, chargeRatio, sig, emp));
        return;
      }
      this.run.meleeRt.melee(w, st, aimAngle, chargeRatio, sig, emp);
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
      this.run.meleeRt.melee(fistDef, fistStats, aimAngle, 0, null, this.run.itemRt.consumeEmpowered());
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
      this.fireBullet(muzzle, shotAngle, st.projectileSpeed, w.range, st.damage * emp, w.tags, null, { pierce: w.pierce ?? 0, crit: st.critChance, homing: w.pattern.turnRate, sprite: this.tierFx(this.run.ctx.data.weapons.meleeFx.orbTiers, w, false), tint: this.shotTint(w) });
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
    // 따로 그린 탄이 없는 무기: 등급별 픽셀 탄(총) · 구슬(지팡이)에 무기 색, 총은 총구 섬광
    const fx = this.run.ctx.data.weapons.meleeFx;
    const own = w.shot ?? this.tierFx(w.category === 'staff' ? fx.orbTiers : fx.bulletTiers, w, chargeRatio >= 1);
    if (!w.shot && w.category === 'gun') this.muzzleFlash(w, muzzle, shotAngle, chargeRatio >= 1);
    for (const shot of gunShots(w, shotAngle, this.run.rng, this.run.itemRt.sums.pellets)) {
      this.fireBullet(muzzle, shot.angle, st.projectileSpeed, shot.range, st.damage * emp, w.tags, null, { pierce: w.pierce ?? 0, crit: chargedCrit(st.critChance, chargeRatio, w.charge?.critAtMax), ricochet: w.ricochet, tint: w.shot ? undefined : this.shotTint(w), sprite: own, flame: w.flame?.scaleTo, trail: w.attackParticles?.color });
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
  startMeleeMotion(w: WeaponDef, intervalSec: number, color: string): void {
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
      this.run.damage.hit(e, this.critRoll(st.damage * sig.damageMul, st.critChance, to), w.tags);
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
        if (!e.dead && Math.hypot(e.sprite.x - at.x, e.sprite.y - at.y) <= radius + e.radius) this.run.damage.hit(e, this.critRoll(base, st.critChance, at), w.tags);
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
    this.run.special.laserHits(path, width, (e) => this.run.damage.hit(e, this.critRoll(base, crit, { x: e.sprite.x, y: e.sprite.y }), w.tags));
    for (const s of path) {
      if (beamKey && this.run.textures.exists(beamKey)) {
        // 그림 레이저: 길이에 맞춰 늘려 뻗는다
        const beam = this.run.add.image(s.from.x, s.from.y, beamKey).setOrigin(0, 0.5).setDepth(6).setRotation(Math.atan2(s.dir.y, s.dir.x)).setDisplaySize(Math.max(1, s.len), width * 2.5);
        this.run.tweens.add({ targets: beam, alpha: 0, duration: 180, onComplete: () => beam.destroy() });
        continue;
      }
      // 등급별 픽셀 레이저: 길이에 맞춰 늘이고 무기 색을 입힌다
      this.beamSprite(this.tierFx(this.run.ctx.data.weapons.meleeFx.beamTiers, w, false), w.color, s.from, s.dir, s.len, width * 2.5);
    }
  }

  /** 탄·섬광에 입히는 색: 무기 색을 흰색 쪽으로 밝힌다 */
  shotTint(w: WeaponDef): string {
    return mixHex(w.fxColor ?? w.color, '#ffffff', this.run.ctx.data.weapons.meleeFx.shotTintWhite);
  }

  /** 총구 섬광 (등급별, 무기 색) */
  private muzzleFlash(w: WeaponDef, at: Vec2, angle: number, strong: boolean): void {
    const ref = this.tierFx(this.run.ctx.data.weapons.meleeFx.muzzleTiers, w, strong);
    playFx(this.run, ref, at.x, at.y, { rotation: angle, originX: 0, depth: 7 }).setTint(hexColor(this.shotTint(w)));
  }

  /** 늘여 그리는 픽셀 레이저 한 번 (무기 색 + 밝은 심) */
  beamSprite(ref: SpriteRef, color: string, from: Vec2, dir: Vec2, len: number, thick: number): void {
    const glow = this.run.ctx.data.weapons.meleeFx.glowAlpha;
    for (const core of [false, true]) {
      const sp = playFx(this.run, ref, from.x, from.y, { w: Math.max(1, len), h: thick, rotation: Math.atan2(dir.y, dir.x), originX: 0, depth: 6 });
      if (core) sp.setBlendMode(Phaser.BlendModes.ADD).setAlpha(glow);
      else sp.setTint(hexColor(color));
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
    // 관통 전개: 무기 탄 관통 + (스킬 탄은 시전 값에서 더한다)
    const pierce = opts.pierce + (source === null ? this.run.mage.extraPierce() : 0);
    b.setData({ base, tags, range, ox: from.x, oy: from.y, source, pierce, crit: opts.crit, homing: opts.homing ?? 0, hitSet: new Set<Enemy>(), bounces: opts.ricochet?.bounces ?? 0, bounceRange: opts.ricochet?.range ?? 0, flame: opts.flame ?? 0, trail: opts.trail, ghost: !!opts.ghost });
    if (opts.tint) b.setTint(hexColor(opts.tint));
    b.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed);
  }

  /** 무기를 쥔 손 자리 (그림이 뒤집히면 x도 뒤집고, 조준 방향으로 살짝 내민다) */
  handPos(): Vec2 {
    const { weaponHand: hand, weaponOffset: off } = this.run.ctx.data.player;
    // 바라보는 방향과 상관없이 화면 오른쪽 손에 든다
    return { x: this.run.player.x + hand.x + this.run.aimDir.x * off, y: this.run.player.y + hand.y - this.run.condition.leapLift + this.run.aimDir.y * off };
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

  /** 무기 등급에 맞는 이펙트 단계 그림 (강화 평타는 한 단계 위) */
  tierFx(list: readonly SpriteRef[], w: WeaponDef, strong: boolean): SpriteRef {
    const tier = this.run.ctx.data.weapons.meleeFx.tiers[w.grade] + (strong ? 1 : 0);
    return list[Math.min(list.length, tier) - 1]!;
  }

  /** 공격력 버프를 걸거나 새로 시작한다 */
  applyBuff(b: NonNullable<WeaponDef['selfBuff']>): void {
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

}
