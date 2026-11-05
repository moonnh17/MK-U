/** 플레이어 상태: 회피(점멸·진격), 정신력·패닉, 보스전 에너지 구슬, 피격 깜빡임. */
import { bossHalfOrbs, bossOrbDrops } from '../../systems/bossEnergy';
import { IDLE_DODGE, blinkTarget, dodgeConfig, startDodge, stepDodge, zigzag, type DodgeState } from '../../systems/dodge';
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
    this.dodge = stepDodge(this.dodge, dt);
    if (frame.pressed.has('dodge') && this.run.dashLeft <= 0) {
      const started = startDodge(this.dodge.cooldown, frame.move, this.run.aimDir, { ...c, cooldownSec: this.dodgeCooldownSec() });
      if (started) {
        this.dodge = started;
        this.dodgeGhostIn = 0;
        const school = dodgeConfig(c, this.run.session.player.advancement).school;
        if (school?.kind === 'blink') this.blink(school, started.vel);
        else {
          sfx('dash');
          if (school?.kind === 'shot') this.dodgeShot(school);
        }
      }
    }
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
    const r = this.run.ctx.data.player.size / 2;
    const blocked = (x: number, y: number) =>
      this.run.physics.overlapRect(x - r, y - r, r * 2, r * 2, false, true).some((b) => {
        const go = b.gameObject;
        return this.run.walls.contains(go) || this.run.doorGroup.contains(go) || this.run.roomProps.propGroup.contains(go);
      });
    const to = blinkTarget(from, dir, s.distancePx, s.stepPx, blocked);
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
      this.panicFx ??= new PanicFx(this.run, { ...cfg.panic, darkAlpha: cfg.panic.darkAlpha * calm, lines: Math.round(cfg.panic.lines * calm), lightRadius: cfg.panic.lightRadius / calm }, Rng.derive(this.run.ctx.config.seed, 'panic-fx'), this.run.ctx.renderScale);
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
