/** 플레이어 상태: 회피(점멸·진격), 정신력·패닉, 보스전 에너지 구슬, 피격 깜빡임. */
import { bossHalfOrbs, bossOrbDrops } from '../../systems/bossEnergy';
import { IDLE_DODGE, blinkTarget, dodgeConfig, leapTarget, startDodge, stepDodge, zigzag, type DodgeState } from '../../systems/dodge';
import { contains, interiorRect } from '../../systems/worldLayout';
import Phaser from 'phaser';
import type { ActionFrame, Vec2 } from '../../core/actions';
import { Rng } from '../../core/rng';
import { hexColor } from '../../core/scale';
import { Enemy } from '../../entities/enemy';
import { PanicFx } from '../../entities/panicFx';
import { sanityMaxFor, stepSanity } from '../../systems/sanity';
import { Pickup } from '../../entities/pickup';
import { muzzleAngle } from '../../systems/targeting';
import type { DodgeSchoolDef } from '../../types/data';
import type { RunScene } from '../RunScene';
import { sfx } from './shared';

export class PlayerCondition {
  dodge: DodgeState = IDLE_DODGE;
  dodgeGhostIn = 0;
  dodgeBar: Phaser.GameObjects.Graphics | null = null;
  dodgeFxRng: Rng | null = null;
  /** 방패 돌격 중: 설정과 이번 돌격에 밀친 적, 앞에 그리는 방패 빛 */
  private charge: { s: Extract<DodgeSchoolDef, { kind: 'charge' }>; hit: Set<Enemy>; fx: Phaser.GameObjects.Graphics } | null = null;
  /** 도약 중 몸이 떠 있는 높이(px). 든 무기도 같이 뜬다 */
  leapLift = 0;
  panicFx: PanicFx | null = null;
  panicTinted = false;
  bossHpSeen = new Map<Enemy, number>();

  constructor(private readonly run: RunScene) {}

  /** 회피 입력·잔상·재사용 막대 */
  /** 민첩이 재사용을 줄인다 */
  dodgeCooldownSec(): number {
    const d = this.run.ctx.data;
    // 투르비용: 회피 재사용 대기 감소
    return d.player.dodge.cooldownSec * Math.max(0, 1 - this.run.itemRt.total('dodgeCdReduce'));
  }

  updateDodge(dt: number, frame: ActionFrame): void {
    const c = this.run.ctx.data.player.dodge;
    // 구르기·도약 체공·돌격이 끝나야 재사용 대기가 돈다
    this.dodge = stepDodge(this.dodge, dt, this.dodge.left > 0 || this.run.dashLeft > 0);
    if (frame.pressed.has('dodge') && this.run.dashLeft <= 0) {
      const started = startDodge(this.dodge.cooldown, frame.move, this.run.aimDir, { ...c, cooldownSec: this.dodgeCooldownSec() });
      if (started) {
        this.dodge = started;
        this.dodgeGhostIn = 0;
        const school = dodgeConfig(c, this.run.session.player.advancement).school;
        if (school?.kind === 'blink') this.blink(school, started.vel);
        else if (school?.kind === 'leap') this.leap(school, started.vel);
        else if (school?.kind === 'charge') this.startCharge(school, started.vel);
        else {
          sfx('dash');
          if (school?.kind === 'shot') this.dodgeShot(school);
        }
      }
    }
    this.updateCharge();
    this.run.session.dodgeView = { nameKey: dodgeConfig(c, this.run.session.player.advancement).nameKey, left: this.dodge.cooldown, total: this.dodgeCooldownSec() };
    if (this.dodge.left > 0) {
      this.dodgeGhostIn -= dt;
      if (this.dodgeGhostIn <= 0) {
        this.dodgeGhostIn = c.ghostEverySec;
        const f = this.run.player.frame;
        const ghost = this.run.add.image(this.run.player.x, this.run.player.y, this.run.player.texture.key, f.name).setOrigin(this.run.player.originX, this.run.player.originY).setFlipX(this.run.player.flipX).setAlpha(0.45).setDepth(3).setTint(hexColor(c.barColor));
        this.run.tweens.add({ targets: ghost, alpha: 0, duration: c.durationSec * 1000, onComplete: () => ghost.destroy() });
      }
    }
    this.dodgeBar ??= this.run.add.graphics().setDepth(6);
    this.dodgeBar.clear();
    if (this.dodge.cooldown > 0) {
      const w = 14;
      const k = 1 - this.dodge.cooldown / this.dodgeCooldownSec();
      const x = this.run.player.x - w / 2;
      const y = this.run.player.y + 7;
      this.dodgeBar.fillStyle(0x000000, 0.6).fillRect(x, y, w, 2).fillStyle(hexColor(c.barColor), 1).fillRect(x, y, w * k, 2);
    }
  }

  /** 점멸: 벽을 뚫지 않는 데까지 순간이동하고, 지나간 자리에 번개가 지직거린다 */
  blink(s: Extract<DodgeSchoolDef, { kind: 'blink' }>, dir: Vec2): void {
    const from = { x: this.run.player.x, y: this.run.player.y };
    const to = blinkTarget(from, dir, s.distancePx, s.stepPx, this.blockedAt());
    this.run.player.setPosition(to.x, to.y);
    (this.run.player.body as Phaser.Physics.Arcade.Body).reset(to.x, to.y);
    this.dodge = { ...this.dodge, left: 0, invuln: s.invulnSec };
    sfx('blink');
    const color = hexColor(s.boltColor);
    const g = this.run.add.graphics().setDepth(6);
    const rng = (this.dodgeFxRng ??= Rng.derive(this.run.ctx.config.seed, 'dodge-fx'));
    const draw = () => {
      g.clear();
      const pts = zigzag(from, to, s.boltSegments, s.boltAmpPx, rng);
      g.lineStyle(3, color, 0.35).strokePoints(pts);
      g.lineStyle(1, 0xffffff, 1).strokePoints(pts);
    };
    draw();
    // 번개 모양을 몇 번 바꿔 지직거린다
    this.run.time.addEvent({ delay: (s.boltSec * 1000) / 4, repeat: 2, callback: draw });
    this.run.tweens.add({ targets: g, alpha: 0, delay: s.boltSec * 500, duration: s.boltSec * 500, onComplete: () => g.destroy() });
    this.run.cameras.main.flash(50, 150, 210, 255);
  }

  /** 방패 돌격 시작: 무적 없이 더 빠르고 길게 돈다 */
  private startCharge(s: Extract<DodgeSchoolDef, { kind: 'charge' }>, dir: Vec2): void {
    const len = Math.hypot(dir.x, dir.y) || 1;
    this.dodge = { ...this.dodge, vel: { x: (dir.x / len) * s.speed, y: (dir.y / len) * s.speed }, left: s.durationSec, invuln: 0 };
    this.charge?.fx.destroy();
    this.charge = { s, hit: new Set(), fx: this.run.add.graphics().setDepth(5) };
    sfx('dash');
  }

  /** 돌격 중 받는 피해 감소 */
  chargeGuard(): number {
    return this.charge && this.dodge.left > 0 ? this.charge.s.damageReduction : 0;
  }

  /** 돌격 중: 앞을 막는 방패 빛, 닿은 적 밀치기 */
  private updateCharge(): void {
    const c = this.charge;
    if (!c) return;
    if (this.dodge.left <= 0) {
      c.fx.destroy();
      this.charge = null;
      return;
    }
    const p = this.run.player;
    const v = this.dodge.vel;
    const sp = Math.hypot(v.x, v.y) || 1;
    const dir = { x: v.x / sp, y: v.y / sp };
    const a = Math.atan2(dir.y, dir.x);
    const col = hexColor(c.s.color);
    const r = c.s.hitRadius;
    c.fx.clear().lineStyle(3, col, 0.35).beginPath().arc(p.x, p.y, r, a - 0.9, a + 0.9).strokePath();
    c.fx.lineStyle(1, 0xffffff, 0.9).beginPath().arc(p.x, p.y, r, a - 0.7, a + 0.7).strokePath();
    for (const e of this.run.enemies) {
      if (e.dead || c.hit.has(e)) continue;
      const dx = e.sprite.x - p.x;
      const dy = e.sprite.y - p.y;
      if (Math.hypot(dx, dy) > r + e.radius) continue;
      c.hit.add(e);
      // 돌진 방향과 옆으로 비켜난 방향을 섞어 길을 연다
      const d = Math.hypot(dx, dy) || 1;
      const push = { x: dir.x + dx / d, y: dir.y + dy / d };
      const pl = Math.hypot(push.x, push.y) || 1;
      e.knockback({ x: push.x / pl, y: push.y / pl }, c.s.knockbackPx, c.s.knockbackSec);
      e.squash();
      sfx('hit', 10);
    }
  }

  /** 플레이어 몸이 (x, y)에 서면 벽·문·소품에 걸리는지 */
  private blockedAt(): (x: number, y: number) => boolean {
    const r = this.run.ctx.data.player.size / 2;
    return (x, y) =>
      this.run.physics.overlapRect(x - r, y - r, r * 2, r * 2, false, true).some((b) => {
        const go = b.gameObject;
        return this.run.walls.contains(go) || this.run.doorGroup.contains(go) || this.run.roomProps.propGroup.contains(go);
      });
  }

  /**
   * 도약(야만용사): 높이 뛰어 벽·장애물을 넘는다. 방 안에서는 그 방 바닥 안 내려설 수 있는 가장 먼 곳으로
   * (잠긴 방을 넘어 나가지 않게), 복도에서는 벽 앞까지. 공중에서는 충돌·피격이 없고, 착지하며 둘레 적에게 피해
   */
  leap(s: Extract<DodgeSchoolDef, { kind: 'leap' }>, dir: Vec2): void {
    const run = this.run;
    const p = run.player;
    const from = { x: p.x, y: p.y };
    const blocked = this.blockedAt();
    const rid = run.session.currentRoomId;
    const half = run.ctx.data.player.size / 2;
    const floor = rid === null ? null : interiorRect(run.session.map.rooms[rid]!, run.m, half);
    const to = floor ? leapTarget(from, dir, s.distancePx, s.stepPx, (x, y) => contains(floor, x, y) && !blocked(x, y)) : blinkTarget(from, dir, s.distancePx, s.stepPx, blocked);
    const body = p.body as Phaser.Physics.Arcade.Body;
    body.enable = false;
    // 공중에 있는 동안 입력·회피를 막는다 (MK 돌진과 같은 자리, 속도 0)
    run.dashLeft = s.airSec;
    run.dashVel = { x: 0, y: 0 };
    this.dodge = { ...this.dodge, left: 0, invuln: s.invulnSec };
    sfx('dash');
    const col = hexColor(s.color);
    const shadow = run.add.ellipse(from.x, from.y + half, 12, 5, 0x000000, 0.35).setDepth(2.4);
    // 그림만 위로 띄운다 (위치·카메라는 땅을 따라간다)
    const oy = p.originY;
    run.tweens.addCounter({
      from: 0,
      to: 1,
      duration: s.airSec * 1000,
      onUpdate: (tw) => {
        const t = tw.getValue() ?? 0;
        const x = from.x + (to.x - from.x) * t;
        const y = from.y + (to.y - from.y) * t;
        const h = Math.sin(t * Math.PI) * s.heightPx;
        this.leapLift = h;
        p.setPosition(x, y).setOrigin(p.originX, oy + h / Math.max(1, p.displayHeight));
        shadow.setPosition(x, y + half).setScale(1 - 0.4 * (h / s.heightPx));
      },
      onComplete: () => {
        shadow.destroy();
        this.leapLift = 0;
        p.setOrigin(p.originX, oy).setPosition(to.x, to.y);
        body.enable = true;
        body.reset(to.x, to.y);
        this.leapLand(s, to, col);
      },
    });
  }

  /** 도약 착지: 둘레 적에게 피해·밀치기, 흙먼지 고리와 화면 흔들림 */
  private leapLand(s: Extract<DodgeSchoolDef, { kind: 'leap' }>, at: Vec2, col: number): void {
    const run = this.run;
    sfx('bossSlam');
    run.cameras.main.shake(90, 0.006);
    const ring = run.add.circle(at.x, at.y, s.landRadius, col, 0.25).setStrokeStyle(2, col, 0.9).setDepth(2.6).setScale(0.3);
    run.tweens.add({ targets: ring, scale: 1, alpha: 0, duration: 260, ease: 'Quad.easeOut', onComplete: () => ring.destroy() });
    for (const e of [...run.enemies]) {
      if (e.dead) continue;
      const dx = e.sprite.x - at.x;
      const dy = e.sprite.y - at.y;
      const d = Math.hypot(dx, dy);
      if (d > s.landRadius + e.radius) continue;
      run.combat.hit(e, s.landDamage, s.tags, 'dodge');
      // 보스·고정 적은 knockback이 알아서 무시한다
      if (!e.dead && d > 0) e.knockback({ x: dx / d, y: dy / d }, s.landKnockbackPx, 0.12);
    }
  }

  /** 진격: 구르는 순간 조준 방향으로 부채꼴 탄 */
  dodgeShot(s: Extract<DodgeSchoolDef, { kind: 'shot' }>): void {
    const from = { x: this.run.player.x, y: this.run.player.y };
    const base = muzzleAngle(from, this.run.aimTarget, Math.atan2(this.run.aimDir.y, this.run.aimDir.x), 0);
    const spread = (s.spreadDeg * Math.PI) / 180;
    for (let i = 0; i < s.shots; i++) {
      const a = s.shots === 1 ? base : base - spread / 2 + (spread * i) / (s.shots - 1);
      this.run.combat.fireBullet(from, a, s.projectileSpeed, s.range, s.damage, s.tags, 'dodge', { pierce: 0, crit: 0, tint: s.tint });
    }
  }

  /** 정신력 값 반영. 패닉에 들어가고 나올 때 알린다 */
  setSanity(next: { sanity: number; panic: boolean }): void {
    const p = this.run.session.player;
    const was = p.panic;
    p.sanity = next.sanity;
    p.panic = next.panic;
    if (!was && p.panic) {
      sfx('panic');
      this.run.toastThrottled(this.run.ctx.t(this.run.itemRt.panicAwaken() ? 'panic.awaken' : 'panic.enter'));
    } else if (was && !p.panic) this.run.toastThrottled(this.run.ctx.t('panic.exit'));
  }

  /** 최대치 동기화, 회복·보스 감소, 패닉 연출·각성 */
  updateSanity(dt: number): void {
    const d = this.run.ctx.data;
    const p = this.run.session.player;
    const cfg = d.player.sanity;
    const max = sanityMaxFor(p.meta.sanity + this.run.itemRt.sums.maxSanity, cfg);
    if (max !== p.sanityMax) {
      if (max > p.sanityMax) p.sanity += max - p.sanityMax;
      p.sanityMax = max;
      p.sanity = Math.min(p.sanity, max);
    }
    const facingBoss = this.run.enemies.some((e) => e.rank === 'boss' || e.rank === 'hiddenBoss');
    this.setSanity(stepSanity(p, dt, facingBoss, cfg));

    if (p.panic) {
      // 아트로스 비석 필사본: 시야 방해가 준다
      const calm = this.run.itemRt.first('panicCalm')?.visionMul ?? 1;
      this.panicFx ??= new PanicFx(this.run, { ...cfg.panic, darkAlpha: cfg.panic.darkAlpha * calm, lines: Math.round(cfg.panic.lines * calm), lightRadius: cfg.panic.lightRadius / calm }, Rng.derive(this.run.ctx.config.seed, 'panic-fx'), this.run.ctx.renderScale, this.run.itemRt.panicAwaken()?.glyphColor);
      const cam = this.run.cameras.main;
      this.panicFx.update(dt, cam.width / 2 + (this.run.player.x - cam.midPoint.x), cam.height / 2 + (this.run.player.y - cam.midPoint.y));
    } else if (this.panicFx) {
      this.panicFx.destroy();
      this.panicFx = null;
    }
    // 각성: 체력이 닳는다 (죽지는 않는다)
    const awaken = p.panic ? this.run.itemRt.panicAwaken() : null;
    if (awaken) {
      p.hp = Math.max(Math.min(p.hp, 1), p.hp - awaken.hpPerSec * dt);
      this.run.player.setTint(hexColor(cfg.panic.awakenTint));
      this.panicTinted = true;
    } else if (this.panicTinted) {
      this.run.player.clearTint();
      this.panicTinted = false;
    }
  }

  /** 보스 체력이 일정 비율 줄 때마다 보스와 플레이어 사이에 에너지 구슬 */
  updateBossEnergy(): void {
    const d = this.run.ctx.data;
    for (const e of this.run.bossControllers.keys()) {
      const ratio = e.hp / e.maxHp;
      const prev = this.bossHpSeen.get(e) ?? 1;
      const n = bossOrbDrops(prev, ratio, d.bosses.energyDrops) + bossHalfOrbs(prev, ratio, d.bosses.energyDrops);
      this.bossHpSeen.set(e, ratio);
      if (n <= 0) continue;
      const x = (e.sprite.x + this.run.player.x) / 2;
      const y = (e.sprite.y + this.run.player.y) / 2;
      const pop = d.juice.death.orbPopPx;
      for (let i = 0; i < n; i++) {
        const a = this.run.rng.range(0, Math.PI * 2);
        const r = this.run.rng.range(pop[0], pop[1]);
        const pk = new Pickup(this.run, 'energy', e.sprite.x, e.sprite.y, d.pickups);
        this.run.tweens.add({ targets: pk.sprite, x: x + Math.cos(a) * r, y: y + Math.sin(a) * r, duration: d.juice.death.orbPopSec * 1000, ease: 'Back.easeOut' });
        this.run.pickups.push(pk);
      }
    }
  }

  updateInvuln(dt: number): void {
    if (this.run.invuln <= 0) {
      this.run.player.setAlpha(1);
      return;
    }
    this.run.invuln -= dt;
    const blink = this.run.ctx.data.player.blinkIntervalSec;
    this.run.player.setAlpha(Math.floor(this.run.invuln / blink) % 2 === 0 ? 0.3 : 1);
  }
}
