import Phaser from 'phaser';
import type { Vec2 } from '../core/actions';
import { hexColor } from '../core/scale';
import type { CorruptionState } from '../systems/acro';
import { effectiveRank, eliteMods, type EliteMods } from '../systems/elites';
import { forceWindup, initialAi, keepDistanceStep, stepAi, type AiEvent, type AiState } from '../systems/enemyAi';
import type { BleedState } from '../systems/tags';
import type { EliteDef, ElitesData, EnemyAttackDef, EnemyDef, EnemyRank } from '../types/data';
import { Zone, type Hazard, type HazardHost } from './hazard';

/** 적이 전투 씬에 바라는 것 (원거리 탄·장판·전술 연계) */
export interface EnemyHost extends HazardHost {
  fireEnemyBullet(from: Vec2, angle: number, speed: number, range: number, damage: number, refractable: boolean): void;
  addHazard(h: Hazard): void;
  /** 전술 연계: 이 적이 조준을 시작했다 (같은 방의 동료도 함께 조준) */
  linkWindup(e: Enemy, attackId: string): void;
}

/** 거리 유지 적이 멈추는 폭 */
const KEEP_BAND = 30;

/** 예고 표시 색 */
const TELEGRAPH_COLOR = 0xff4040;

/**
 * 적 하나. 스프라이트에 `enemy` 데이터로 자신을 붙여 충돌 콜백에서 찾는다.
 * 행동은 systems/enemyAi.ts 상태 기계가 정하고, 여기서는 돌진·강타와 예고 표시를 처리한다.
 */
export class Enemy {
  readonly sprite: Phaser.Physics.Arcade.Image;
  hp: number;
  maxHp: number;
  /** 접촉 피해 배율 (히든보스 챕터 배율·자기 강화) */
  damageMul = 1;
  /** 소환 직후 공격·접촉 피해가 없는 남은 시간(초) */
  warn: number;
  /** 마지막 접촉 피해 시각(ms) */
  lastContactAt = -Infinity;
  dead = false;
  /** 남은 무적(초). 보스 강화 단계 진입 연출 중 */
  invuln = 0;
  /** 넉백 남은 시간·속도 */
  private kbLeft = 0;
  private kbVel: Vec2 = { x: 0, y: 0 };
  /** 보스 거대화 등 추가 크기 배율 */
  private extraScale = 1;
  /** 반역 개체가 되어 사라졌다(폭발 엘리트도 터지지 않음) */
  converted = false;
  /** 걸려 있는 출혈 */
  bleed: BleedState | null = null;
  /** 걸려 있는 마기 변질 */
  corruption: CorruptionState | null = null;
  readonly mods: EliteMods;
  private readonly attacks: EnemyAttackDef[];
  private ai: AiState;
  private aim: Vec2 = { x: 1, y: 0 };
  private slamAt: Vec2 = { x: 0, y: 0 };
  private actHit = false;
  private telegraph: Phaser.GameObjects.Graphics | null = null;
  private readonly icon: Phaser.GameObjects.Text | null = null;
  private readonly outline: Phaser.GameObjects.Graphics | null = null;
  private ghostTimer = 0;
  private blinkT = 0;
  /** 마기갑충: 벽에 부딪혀 기절한 남은 시간과 그동안 받는 피해 배율 */
  private stunLeft = 0;
  private stunMul = 1;
  /** burst: 이번 공격에서 쏜 수와 다음 발까지 */
  private shotsFired = 0;
  private shotTimer = 0;
  /** 어느 기억: 장판을 남긴 뒤 움직인 거리 */
  private trailDist = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    readonly def: EnemyDef,
    x: number,
    y: number,
    warnSec: number,
    readonly elite: EliteDef | null,
    elites: ElitesData,
    iconText = '',
  ) {
    this.mods = eliteMods(elite, elites);
    this.maxHp = def.maxHp * this.mods.hpMul;
    this.hp = this.maxHp;
    this.warn = warnSec;
    this.attacks = [...(elite?.extraAttacks ?? []), ...(def.attacks ?? [])];
    // 첫 공격은 등장 직후 바로 나오지 않게
    this.ai = initialAi(this.attacks, warnSec);
    this.sprite = scene.physics.add.image(x, y, def.spriteKey);
    this.sprite.setData('enemy', this);
    this.sprite.setDepth(3);
    if (this.mods.scale !== 1) this.sprite.setScale(this.mods.scale);
    if (def.ai === 'idle') this.sprite.setImmovable(true);
    if (warnSec > 0) this.sprite.setAlpha(0.4);
    if (elite) {
      this.icon = scene.add
        .text(x, y, iconText, { fontFamily: 'sans-serif', fontSize: '8px', color: elite.color })
        .setOrigin(0.5, 1)
        .setDepth(7);
      if (elite.look === 'outline') this.outline = scene.add.graphics().setDepth(4);
    }
  }

  get radius(): number {
    return (this.def.size * this.mods.scale * this.extraScale) / 2;
  }

  /** 체력 배율 (히든보스 챕터 배율·분신 체력) — 소환 직후에만 */
  setMaxHp(v: number): void {
    this.maxHp = v;
    this.hp = v;
  }

  setExtraScale(k: number): void {
    this.extraScale = k;
    this.sprite.setScale(this.mods.scale * k);
  }

  /** 등급 판정용 (엘리트가 붙으면 '엘리트') */
  get rank(): EnemyRank {
    return effectiveRank(this.def.rank, this.elite);
  }

  /** 받는 피해 배율 (거대 엘리트·기절) */
  get takenMul(): number {
    return this.mods.damageTakenMul * (this.stunLeft > 0 ? this.stunMul : 1);
  }

  /** 전술 연계: 쫓는 중이고 쿨타임이 끝났으면 같은 공격 조준을 바로 시작한다 */
  tryLink(attackId: string, host: EnemyHost): void {
    const a = this.attacks.find((x) => x.id === attackId);
    if (!a || this.dead || this.warn > 0 || this.stunLeft > 0) return;
    const r = forceWindup(this.ai, a, this.mods.attackSpeedMul);
    if (!r.started) return;
    this.ai = r.state;
    const p = host.playerPos();
    const d = Math.hypot(p.x - this.sprite.x, p.y - this.sprite.y) || 1;
    this.onEvent({ type: 'windup', attackId }, host, { x: (p.x - this.sprite.x) / d, y: (p.y - this.sprite.y) / d }, d, false);
  }

  update(dt: number, host: EnemyHost): void {
    if (this.dead) return;
    this.updateLook(dt);
    if (this.kbLeft > 0) {
      this.kbLeft -= dt;
      this.sprite.setVelocity(this.kbVel.x, this.kbVel.y);
      return;
    }
    if (this.invuln > 0) {
      this.invuln -= dt;
      this.sprite.setAlpha(this.invuln > 0 ? 0.5 + 0.5 * Math.abs(Math.sin(this.invuln * 20)) : 1);
    }
    if (this.warn > 0) {
      this.warn -= dt;
      if (this.warn <= 0) this.sprite.setAlpha(1);
      this.sprite.setVelocity(0, 0);
      return;
    }
    const p = host.playerPos();
    const dx = p.x - this.sprite.x;
    const dy = p.y - this.sprite.y;
    const dist = Math.hypot(dx, dy);
    if (this.def.ai === 'idle') {
      this.sprite.setVelocity(0, 0);
      return;
    }
    // 보스는 bosses/의 컨트롤러가 움직인다
    if (this.def.ai === 'boss') return;
    // 마기갑충: 벽에 부딪혀 기절
    if (this.stunLeft > 0) {
      this.stunLeft -= dt;
      this.sprite.setVelocity(0, 0);
      if (this.stunLeft <= 0) this.sprite.clearTint();
      return;
    }
    const r = stepAi(this.ai, dt, dist, this.attacks, this.mods.attackSpeedMul);
    this.ai = r.state;
    for (const e of r.events) this.onEvent(e, host, dist > 0 ? { x: dx / dist, y: dy / dist } : this.aim, dist, true);

    const attack = this.attacks.find((a) => a.id === this.ai.attackId);
    if (this.ai.phase === 'chase') {
      const speed = this.def.moveSpeed * this.mods.moveSpeedMul;
      const len = dist || 1;
      // 원거리 적은 거리를 유지한다
      const k = this.def.keepDistance ? keepDistanceStep(dist, this.def.keepDistance, KEEP_BAND) : 1;
      this.sprite.setVelocity((dx / len) * speed * k, (dy / len) * speed * k);
      this.dropTrail(dt, speed * Math.abs(k), host);
    } else if (this.ai.phase === 'act' && attack?.kind === 'lunge') {
      this.sprite.setVelocity(this.aim.x * attack.speed!, this.aim.y * attack.speed!);
      if (!this.actHit && dist <= this.radius + host.playerRadius) {
        this.actHit = true;
        host.hurtPlayer(attack.damage, this);
      }
      const body = this.sprite.body as Phaser.Physics.Arcade.Body | null;
      if (attack.wallStunSec && body && !body.blocked.none) {
        this.stunLeft = attack.wallStunSec;
        this.stunMul = attack.stunTakenMul ?? 1;
        this.ai = { ...this.ai, phase: 'recover', left: 0 };
        this.sprite.setVelocity(0, 0).setTint(0x8888ff);
      }
    } else if (this.ai.phase === 'act' && attack?.kind === 'burst') {
      this.sprite.setVelocity(0, 0);
      this.shotTimer -= dt;
      if (this.shotsFired < attack.shots! && this.shotTimer <= 0) this.fireShot(attack, host);
    } else {
      this.sprite.setVelocity(0, 0);
    }
    // 조준선은 쏘기 전까지 플레이어를 따라간다
    if (this.ai.phase === 'windup' && attack?.kind === 'burst' && this.telegraph) {
      const p2 = host.playerPos();
      this.telegraph.clear().lineStyle(1, TELEGRAPH_COLOR, 0.7).lineBetween(this.sprite.x, this.sprite.y, p2.x, p2.y);
    }
  }

  /** burst 한 발: 지금 플레이어 쪽으로 */
  private fireShot(a: EnemyAttackDef, host: EnemyHost): void {
    const p = host.playerPos();
    const from = { x: this.sprite.x, y: this.sprite.y };
    host.fireEnemyBullet(from, Math.atan2(p.y - from.y, p.x - from.x), a.speed!, a.range!, a.damage, true);
    this.shotsFired++;
    this.shotTimer = a.shotGapSec ?? 0;
  }

  /** 지나간 자리에 장판 (어느 기억) */
  private dropTrail(dt: number, speed: number, host: EnemyHost): void {
    const t = this.def.trail;
    if (!t) return;
    this.trailDist += speed * dt;
    if (this.trailDist < t.everyPx) return;
    this.trailDist = 0;
    host.addHazard(new Zone(this.scene, { x: this.sprite.x, y: this.sprite.y }, t.radius, t.liveSec, t.damage, t.tickSec, hexColor(this.def.color)));
  }

  /** link: 이 조준이 동료에게 연계를 거는지 (연계로 시작한 조준은 다시 걸지 않는다) */
  private onEvent(e: AiEvent, host: EnemyHost, dir: Vec2, dist: number, link: boolean): void {
    const a = this.attacks.find((x) => x.id === e.attackId);
    if (!a) return;
    if (e.type === 'windup') {
      this.aim = dir;
      this.clearTelegraph();
      const g = this.scene.add.graphics().setDepth(2);
      if (a.kind === 'burst') {
        g.lineStyle(1, TELEGRAPH_COLOR, 0.7).lineBetween(this.sprite.x, this.sprite.y, this.sprite.x + dir.x * dist, this.sprite.y + dir.y * dist);
        if (link) host.linkWindup(this, a.id);
      } else if (a.kind === 'puddle') {
        this.slamAt = host.playerPos();
        g.lineStyle(1, hexColor(this.def.color), 0.9).strokeCircle(this.slamAt.x, this.slamAt.y, a.radius!);
        g.fillStyle(hexColor(this.def.color), 0.15).fillCircle(this.slamAt.x, this.slamAt.y, a.radius!);
      } else if (a.kind === 'lunge') {
        const len = a.speed! * a.actSec;
        g.lineStyle(this.radius * 2, TELEGRAPH_COLOR, 0.25);
        g.lineBetween(this.sprite.x, this.sprite.y, this.sprite.x + dir.x * len, this.sprite.y + dir.y * len);
      } else {
        const reach = Math.min(dist, a.reach!);
        this.slamAt = { x: this.sprite.x + dir.x * reach, y: this.sprite.y + dir.y * reach };
        g.lineStyle(1, TELEGRAPH_COLOR, 0.9);
        g.strokeCircle(this.slamAt.x, this.slamAt.y, a.radius!);
        g.fillStyle(TELEGRAPH_COLOR, 0.2);
        g.fillCircle(this.slamAt.x, this.slamAt.y, a.radius!);
      }
      this.telegraph = g;
    } else if (e.type === 'strike') {
      this.clearTelegraph();
      this.actHit = false;
      if (a.kind === 'burst') {
        this.shotsFired = 0;
        this.shotTimer = 0;
        this.fireShot(a, host);
      } else if (a.kind === 'puddle') {
        host.addHazard(new Zone(this.scene, this.slamAt, a.radius!, a.liveSec!, a.damage, a.tickSec!, hexColor(this.def.color)));
      }
      if (a.kind === 'slam') {
        const p = host.playerPos();
        if (Math.hypot(p.x - this.slamAt.x, p.y - this.slamAt.y) <= a.radius! + host.playerRadius) host.hurtPlayer(a.damage, this);
        const flash = this.scene.add.circle(this.slamAt.x, this.slamAt.y, a.radius!, TELEGRAPH_COLOR, 0.5).setDepth(6);
        this.scene.time.delayedCall(120, () => flash.destroy());
      }
    }
  }

  /** 엘리트 표시: 머리 위 아이콘, 두꺼운 외곽선 / 잔상 / 깜빡임 */
  private updateLook(dt: number): void {
    if (!this.elite) return;
    const { x, y } = this.sprite;
    this.icon?.setPosition(x, y - this.radius - 1);
    if (this.outline) {
      const s = this.radius * 2 + 4;
      this.outline.clear().lineStyle(2, hexColor(this.elite.color), 1).strokeRect(x - s / 2, y - s / 2, s, s);
    }
    if (this.elite.look === 'afterimage') {
      this.ghostTimer -= dt;
      const body = this.sprite.body as Phaser.Physics.Arcade.Body | null;
      if (this.ghostTimer <= 0 && body && body.speed > 10) {
        this.ghostTimer = 0.08;
        const g = this.scene.add.image(x, y, this.def.spriteKey).setScale(this.mods.scale).setAlpha(0.35).setDepth(2);
        g.setTint(hexColor(this.elite.color));
        this.scene.tweens.add({ targets: g, alpha: 0, duration: 250, onComplete: () => g.destroy() });
      }
    }
    if (this.elite.look === 'blink' && this.warn <= 0) {
      this.blinkT += dt;
      this.sprite.setAlpha(0.6 + 0.4 * Math.abs(Math.sin(this.blinkT * 8)));
    }
  }

  private clearTelegraph(): void {
    this.telegraph?.destroy();
    this.telegraph = null;
  }

  /** 넉백: 거대 엘리트·보스는 면역 */
  get knockbackImmune(): boolean {
    return !!this.elite?.knockbackImmune || this.def.rank === 'boss' || this.def.rank === 'hiddenBoss';
  }

  knockback(dir: Vec2, distance: number, sec: number): void {
    if (this.dead || this.knockbackImmune || sec <= 0) return;
    this.kbLeft = sec;
    this.kbVel = { x: (dir.x * distance) / sec, y: (dir.y * distance) / sec };
  }

  /** 피해를 주고, 이번에 죽었으면 true */
  damage(amount: number): boolean {
    if (this.dead) return false;
    this.hp -= amount;
    this.sprite.setTintFill(0xffffff);
    this.sprite.scene.time.delayedCall(50, () => this.sprite.active && this.sprite.clearTint());
    if (this.hp <= 0) {
      this.dead = true;
      return true;
    }
    return false;
  }

  destroy(): void {
    this.dead = true;
    this.clearTelegraph();
    this.icon?.destroy();
    this.outline?.destroy();
    this.sprite.destroy();
  }
}
