/** 무기 공격과 피해: 사격·근접(참격·타격 이펙트)·바람과 버프·레이저·운석·번개, 탄 적중·튕김, 피해 계산. */
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
import { calcDamage, spaceDamage, type RangeBonus } from '../../systems/damage';
import { gaugeFromDamage, gaugeFromEnergy } from '../../systems/advancement';
import { itemDamageMultiplier } from '../../systems/items';
import { chainTargets, lineHits, muzzleAngle, muzzlePoint } from '../../systems/targeting';
import { signatureFires } from '../../systems/motion';
import { corruptedDamage, skillChance } from '../../systems/acro';
import { hpStance } from '../../systems/vitals';
import { gainGauge } from '../../systems/skills';
import { gunShots, inArc, projectilesCut, rollCrit, spendEnergy, type WeaponItem, type WeaponStats } from '../../systems/weapons';
import { contains, interiorRect } from '../../systems/worldLayout';
import type { SpriteRef, WeaponSignature, SpaceRule, TagId, WeaponDef } from '../../types/data';
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

  constructor(private readonly run: RunScene) {}

  /** Space를 누르고 있으면 연사. 차지 무기(대검)는 누르는 동안 모았다가 놓을 때 휘두른다 */
  updateAttack(dt: number, held: boolean, aimAngle: number): void {
    this.fireCooldown -= dt;
    this.updateBuff(dt);
    const charge = this.run.weaponDef().charge;
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
      this.attack(aimAngle, this.chargeT / charge.maxSec);
      this.resetCharge();
    }
    this.drawCharge(charge.maxSec);
  }

  resetCharge(): void {
    this.charging = false;
    this.chargeT = 0;
    this.chargeFx?.clear();
  }

  drawCharge(maxSec: number): void {
    if (!this.chargeFx) this.chargeFx = this.run.add.graphics().setDepth(6);
    this.chargeFx.clear();
    if (!this.charging) return;
    const k = this.chargeT / maxSec;
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
    // 유니크 고유 효과: 들고 있는 무기의 공격을 센다 (바꾸면 처음부터)
    if (this.sigItem !== item) {
      this.sigItem = item;
      this.sigCount = 0;
    }
    const sig = w.signature && signatureFires(++this.sigCount, w.signature.every) ? w.signature : null;

    if (w.category === 'blade') {
      sfx(weaponSfx(w));
      // 특무 인장: 순간 회피 직후 기본공격 피해 증가
      this.melee(w, st, aimAngle, chargeRatio, sig, this.run.itemRt.consumeEmpowered());
      return;
    }

    const left = spendEnergy(p.energy, st);
    if (left === null) {
      this.run.session.energyEmptyAt = this.run.time.now;
      this.run.toastThrottled(this.run.ctx.t('room.energyEmpty'));
      // 에너지가 모자라면 총 대신 주먹으로 친다 (잠긴 방에서 공격 수단이 사라지지 않게)
      const fist = this.run.fistItem();
      const fistStats = this.run.weaponStatsOf(fist);
      this.fireCooldown = fistStats.fireIntervalSec;
      const fistDef = this.run.weaponDefOf(fist.defId);
      sfx(weaponSfx(fistDef));
      this.melee(fistDef, fistStats, aimAngle, 0, null, this.run.itemRt.consumeEmpowered());
      return;
    }
    const udef = this.run.skillRt.ultimateDef();
    p.ultimate.gauge = gainGauge(p.ultimate.gauge, udef.gaugeMax, gaugeFromEnergy(udef, p.energy - left));
    p.energy = left;
    sfx(sig?.kind === 'laser' ? 'shotLaser' : weaponSfx(w));
    const emp = this.run.itemRt.consumeEmpowered();
    if (sig?.kind === 'laser') {
      this.weaponLaser(w, st.damage * sig.damageMul * emp, st.critChance, aimAngle, sig.length, sig.width, sig.beam?.spriteKey);
      return;
    }
    if (w.pattern.kind === 'meteor') {
      this.dropMeteor(w, st, w.pattern, st.damage * emp);
      return;
    }
    const muzzle = this.muzzle();
    const shotAngle = muzzleAngle(muzzle, this.run.aimTarget, aimAngle, this.run.ctx.data.player.muzzleMinTargetPx);
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
          radius: w.pattern.radius * (1 + this.run.itemRt.sums.area),
          base: st.damage * emp,
          tags: w.tags,
          sprite: this.run.ctx.data.weapons.projectile,
        }),
      );
      return;
    }
    for (const shot of gunShots(w, shotAngle, this.run.rng)) {
      this.fireBullet(muzzle, shot.angle, st.projectileSpeed, shot.range, st.damage * emp, w.tags, null, { pierce: w.pierce ?? 0, crit: st.critChance, ricochet: w.ricochet, tint: w.ricochet ? w.color : undefined });
    }
  }

  /** 기환의 팔: 가까운 적에서 적으로 튕기는 번개 */
  chainBolt(w: WeaponDef, st: WeaponStats, sig: Extract<WeaponSignature, { kind: 'chainBolt' }>, origin: Vec2): void {
    const enemies = this.run.enemies.filter((e) => !e.dead);
    const idx = chainTargets(origin, enemies.map((e) => ({ x: e.sprite.x, y: e.sprite.y, radius: e.radius })), sig.jumps, sig.range, new Set());
    if (idx.length === 0) return;
    sfx('blink');
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
      sfx('explosion');
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
    const len = length * (1 + this.run.itemRt.sums.area);
    const enemies = [...this.run.enemies];
    const idx = lineHits(origin, dir, len, width / 2, enemies.map((e) => ({ x: e.sprite.x, y: e.sprite.y, radius: e.radius })));
    for (const i of idx) {
      const e = enemies[i]!;
      this.hit(e, this.critRoll(base, crit, { x: e.sprite.x, y: e.sprite.y }), w.tags);
    }
    if (beamKey && this.run.textures.exists(beamKey)) {
      // 그림 레이저: 길이에 맞춰 늘려 총구에서 뻗는다
      const beam = this.run.add.image(origin.x, origin.y, beamKey).setOrigin(0, 0.5).setDepth(6).setRotation(aimAngle).setDisplaySize(len, width * 2.5);
      this.run.tweens.add({ targets: beam, alpha: 0, duration: 180, onComplete: () => beam.destroy() });
      return;
    }
    const g = this.run.add.graphics().setDepth(6);
    g.lineStyle(width, hexColor(w.color), 0.8).lineBetween(origin.x, origin.y, origin.x + dir.x * len, origin.y + dir.y * len);
    this.run.time.delayedCall(this.run.ctx.data.ui.slashFxSec * 1000, () => g.destroy());
  }

  fireBullet(
    from: Vec2,
    angle: number,
    speed: number,
    range: number,
    base: number,
    tags: readonly TagId[],
    source: string | null = null,
    opts: { pierce: number; crit: number; homing?: number; tint?: string; sprite?: SpriteRef; ricochet?: { bounces: number; range: number } } = { pierce: 0, crit: 0 },
  ): void {
    const proj = this.run.ctx.data.weapons.projectile;
    const b = this.run.bullets.create(from.x, from.y, opts.sprite?.spriteKey ?? proj.spriteKey) as Phaser.Physics.Arcade.Sprite;
    // 스킬 전용 탄: 날아가는 쪽을 보고 프레임이 돈다
    if (opts.sprite) {
      b.setRotation(angle);
      loopArt(b, opts.sprite);
    }
    fitArt(this.run.ctx.data, b, proj.size, proj.height ?? proj.size);
    b.setDepth(5);
    b.setData({ base, tags, range, ox: from.x, oy: from.y, source, pierce: opts.pierce, crit: opts.crit, homing: opts.homing ?? 0, hitSet: new Set<Enemy>(), bounces: opts.ricochet?.bounces ?? 0, bounceRange: opts.ricochet?.range ?? 0 });
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

  /** 무기 치명 판정 */
  critRoll(base: number, chance: number, at: Vec2): number {
    const r = rollCrit(this.run.rng, base, chance, this.run.ctx.data.weapons.critMultiplier);
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
  melee(w: WeaponDef, st: WeaponStats, aimAngle: number, chargeRatio: number, sig: WeaponSignature | null, emp: number): void {
    const origin = { x: this.run.player.x, y: this.run.player.y };
    const dir = { x: Math.cos(aimAngle), y: Math.sin(aimAngle) };
    const big = sig?.kind === 'bigSmash' ? sig : null;
    const dmgMul = (w.charge ? 1 + (w.charge.damageMul - 1) * chargeRatio : 1) * (big ? big.damageMul : 1) * emp;
    const radMul = (w.charge ? 1 + (w.charge.radiusMul - 1) * chargeRatio : 1) * (1 + this.run.itemRt.sums.area) * (big ? big.radiusMul : 1);
    const tags: readonly TagId[] = sig?.kind === 'space' ? [...w.tags, 'space'] : w.tags;
    if (big) {
      shake(this.run, 'medium');
      this.run.floatLabel(origin, this.run.ctx.t('weapon.sig.bigSmash'), w.color);
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
    const stats = this.run.effStats();
    let dmg = calcDamage({ baseDamage: base, tags }, stats, d.tags, this.rangeBonus());
    // 아이템: 피해 %(더한 뒤 한 번), 보스·적이 받는 피해·스킬 피해, 적중 효과(신검 공간격·참마검)
    const boss = enemy.rank === 'boss' || enemy.rank === 'hiddenBoss';
    const hm = this.run.itemRt.hitMods(this.run.rng, (c) => skillChance(c, 'success', ['chance'], stats, d.tags));
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
    return this.applyDamage(enemy, corruptedDamage(dmg, enemy.corruption), source, { tags, crit, space });
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
      sfx(fx.crit ? 'crit' : 'hit');
      this.run.juice.hitSpark({ x: enemy.sprite.x, y: enemy.sprite.y }, fx.tags);
      enemy.squash();
      const hs = this.run.ctx.data.juice.hitStop;
      if (fx.tags.includes('melee')) this.run.hitStop.request(hs.melee);
      if (fx.crit) this.run.hitStop.request(hs.crit);
    }
    for (const o of [...this.run.skillRt.skillObjects]) o.onDamageDealt?.(this.run.host, dealt, enemy);
    // 학파 궁극기: 정해진 스킬의 피해로 데이터 축적
    const ult = this.run.session.player.ultimate;
    const udef = this.run.skillRt.ultimateDef();
    const gain = gaugeFromDamage(udef, source, dealt);
    if (gain > 0) ult.gauge = gainGauge(ult.gauge, udef.gaugeMax, gain);
    if (killed) this.run.onEnemyKilled(enemy);
    return killed;
  }

  /** 근접·원거리 피해 증가: 들고 있는 무기 + 아이템 (같은 종류라 더한다) */
  rangeBonus(): RangeBonus {
    const b = this.run.weaponDef().equipBonus;
    const it = this.run.itemRt.sums.damage;
    return { melee: (b?.meleeDamage ?? 0) + it.melee, ranged: (b?.rangedDamage ?? 0) + it.ranged };
  }
}
