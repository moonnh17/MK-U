import Phaser from 'phaser';
import type { Vec2 } from '../core/actions';
import type { Rng } from '../core/rng';
import { hexColor } from '../core/scale';
import { archonMods, archonStage, rescaleHp } from '../systems/champions';
import type { CorruptionState } from '../systems/acro';
import { effectiveRank, eliteMods, type EliteMods } from '../systems/elites';
import { aimLocked, chainWindup, forceWindup, initialAi, keepDistanceStep, stepAi, type AiEvent, type AiState } from '../systems/enemyAi';
import type { BleedState } from '../systems/tags';
import type { EliteDef, ElitesData, EnemyAttackDef, EnemyDef, EnemyRank } from '../types/data';
import { Beams, SectorBlast, Zone, type Hazard, type HazardHost } from './hazard';

/** 적이 전투 씬에 바라는 것 (원거리 탄·장판·전술 연계·밧줄) */
export interface EnemyHost extends HazardHost {
  readonly rng: Rng;
  fireEnemyBullet(from: Vec2, angle: number, speed: number, range: number, damage: number, refractable: boolean): void;
  addHazard(h: Hazard): void;
  /** 전술 연계: 이 적이 조준을 시작했다 (같은 방의 동료도 함께 조준) */
  linkWindup(e: Enemy, attackId: string): void;
  /** 집행자 밧줄: 플레이어를 to까지 speed로 끌어당긴다. 걸리는 시간(초) */
  pullPlayer(to: Vec2, speed: number): number;
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
  /** 붙은 엘리트 전부 (보통 0~1, 중형 첨탑 강적은 2) */
  readonly elites: EliteDef[];
  /** 보스가 부른 적: 처치 보상·기록이 없다 */
  noReward = false;
  /** 증오의 파편: 이어서 남은 돌진 수 */
  private chainLeft = 0;
  /** 집행자: 밧줄이 뻗은 길이·적중 여부, 끌어당긴 뒤 도끼까지 멈춰 있는 시간 */
  private ropeLen = 0;
  private ropeHit = false;
  private holdLeft = 0;
  /** 집정관: 흡수량·단계·후광 */
  private absorbed = 0;
  absorbStage = 0;
  private halo: Phaser.GameObjects.Arc | null = null;

  constructor(
    private readonly scene: Phaser.Scene,
    readonly def: EnemyDef,
    x: number,
    y: number,
    warnSec: number,
    readonly elite: EliteDef | null,
    elitesData: ElitesData,
    iconText = '',
    /** 두 번째 엘리트 (엘리트 2종이 겹친 개체) */
    extraElite: EliteDef | null = null,
  ) {
    this.elites = [elite, extraElite].filter((x): x is EliteDef => x !== null);
    this.mods = eliteMods(this.elites, elitesData);
    this.maxHp = def.maxHp * this.mods.hpMul;
    this.hp = this.maxHp;
    this.warn = warnSec;
    this.attacks = [...this.elites.flatMap((x) => x.extraAttacks ?? []), ...(def.attacks ?? [])];
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
      if (this.elites.some((x) => x.look === 'outline')) this.outline = scene.add.graphics().setDepth(4);
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

  /** 핵 노출·기절: sec 동안 받는 피해 ×mul (보스 파성 돌진) */
  setExposed(sec: number, mul: number): void {
    this.stunLeft = sec;
    this.stunMul = mul;
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
    // 보스는 bosses/의 컨트롤러가 움직인다 (핵 노출 시간만 여기서 줄인다)
    if (this.def.ai === 'boss') {
      if (this.stunLeft > 0) this.stunLeft -= dt;
      return;
    }
    // 마기갑충: 벽에 부딪혀 기절
    if (this.stunLeft > 0) {
      this.stunLeft -= dt;
      this.sprite.setVelocity(0, 0);
      if (this.stunLeft <= 0) this.sprite.clearTint();
      return;
    }
    // 집행자: 끌어당긴 플레이어에게 도끼가 떨어질 때까지 제자리
    if (this.holdLeft > 0) {
      this.holdLeft -= dt;
      this.sprite.setVelocity(0, 0);
      return;
    }
    const r = stepAi(this.ai, dt, dist, this.attacks, this.mods.attackSpeedMul);
    this.ai = r.state;
    const dir = dist > 0 ? { x: dx / dist, y: dy / dist } : this.aim;
    for (const e of r.events) {
      this.onEvent(e, host, dir, dist, true);
      // 증오의 파편: 돌진이 끝나면 쿨타임 없이 다시 조준해 이어 돌진
      const a = this.attacks.find((x) => x.id === e.attackId);
      if (e.type === 'end' && a?.chain && this.chainLeft > 0 && this.stunLeft <= 0) {
        this.chainLeft--;
        this.ai = chainWindup(this.ai, a, a.chainWindupSec ?? a.windupSec, this.mods.attackSpeedMul);
        this.onEvent({ type: 'windup', attackId: a.id }, host, dir, dist, false, true);
      }
    }

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
        host.hurtPlayer(attack.damage * this.damageMul, this);
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
    } else if (this.ai.phase === 'act' && attack?.kind === 'rope') {
      this.sprite.setVelocity(0, 0);
      this.updateRope(dt, attack, host);
    } else {
      this.sprite.setVelocity(0, 0);
    }
    // 조준선은 쏘기 전까지 플레이어를 따라간다
    if (this.ai.phase === 'windup' && attack?.kind === 'burst' && this.telegraph) {
      const p2 = host.playerPos();
      this.telegraph.clear().lineStyle(1, TELEGRAPH_COLOR, 0.7).lineBetween(this.sprite.x, this.sprite.y, p2.x, p2.y);
    }
    // 집정관 저격: 조준선이 따라오다 끝 lockSec 동안 고정된다(굵고 밝게)
    if (this.ai.phase === 'windup' && attack?.kind === 'snipe' && this.telegraph) {
      const locked = aimLocked(this.ai, attack.lockSec! / this.mods.attackSpeedMul);
      if (!locked) {
        const p2 = host.playerPos();
        const d2 = Math.hypot(p2.x - this.sprite.x, p2.y - this.sprite.y) || 1;
        this.aim = { x: (p2.x - this.sprite.x) / d2, y: (p2.y - this.sprite.y) / d2 };
      }
      const len = attack.range!;
      this.telegraph
        .clear()
        .lineStyle(locked ? 2 : 1, locked ? 0xffffff : TELEGRAPH_COLOR, locked ? 0.9 : 0.6)
        .lineBetween(this.sprite.x, this.sprite.y, this.sprite.x + this.aim.x * len, this.sprite.y + this.aim.y * len);
    }
  }

  /** 집행자 밧줄: 끝이 플레이어에 닿으면 끌어당기고, 끌려온 자리에 도끼 예고 */
  private updateRope(dt: number, a: EnemyAttackDef, host: EnemyHost): void {
    if (this.ropeHit) return;
    this.ropeLen = Math.min(a.range!, this.ropeLen + a.speed! * dt);
    const from = { x: this.sprite.x, y: this.sprite.y };
    const tip = { x: from.x + this.aim.x * this.ropeLen, y: from.y + this.aim.y * this.ropeLen };
    this.telegraph ??= this.scene.add.graphics().setDepth(4);
    this.telegraph.clear().lineStyle(2, hexColor(this.def.color), 1).lineBetween(from.x, from.y, tip.x, tip.y);
    const p = host.playerPos();
    if (Math.hypot(p.x - tip.x, p.y - tip.y) > host.playerRadius + 3) return;
    this.ropeHit = true;
    this.clearTelegraph();
    host.hurtPlayer(a.damage * this.damageMul, this);
    // 집행자 바로 앞까지 끌어당긴다
    const to = { x: from.x + this.aim.x * (this.radius + host.playerRadius + 4), y: from.y + this.aim.y * (this.radius + host.playerRadius + 4) };
    const pullSec = host.pullPlayer(to, a.pullSpeed!);
    const delay = pullSec + a.axeDelaySec!;
    this.holdLeft = delay;
    host.addHazard(new SectorBlast(this.scene, from, Math.atan2(this.aim.y, this.aim.x), a.radius!, a.arcDeg!, delay, a.axeDamage! * this.damageMul, TELEGRAPH_COLOR));
  }

  /**
   * 집정관 흡수: 같은 방에서 죽은 적의 최대 체력만큼. 단계가 오르면 체력(비율 유지)·공격력·후광이 커진다.
   * 단계가 바뀌었으면 새 단계를 돌려준다.
   */
  absorb(amount: number): number | null {
    const def = this.def.absorb;
    if (!def || this.dead) return null;
    this.absorbed += amount;
    const stage = archonStage(this.absorbed, def);
    if (stage === this.absorbStage) return null;
    this.setAbsorbStage(stage);
    return stage;
  }

  /** 방을 나가면 흡수가 초기화된다 */
  resetAbsorb(): void {
    if (!this.def.absorb || this.absorbed === 0) return;
    this.absorbed = 0;
    this.setAbsorbStage(0);
  }

  private setAbsorbStage(stage: number): void {
    const def = this.def.absorb!;
    const m = archonMods(stage, def);
    const max = this.def.maxHp * this.mods.hpMul * m.hpMul;
    this.hp = rescaleHp(this.hp, this.maxHp, max);
    this.maxHp = max;
    this.damageMul = m.damageMul;
    this.absorbStage = stage;
    this.halo?.destroy();
    this.halo = m.haloRadius > 0 ? this.scene.add.circle(this.sprite.x, this.sprite.y, m.haloRadius, hexColor(def.haloColor), 0.25).setStrokeStyle(1, hexColor(def.haloColor), 0.9).setDepth(2) : null;
  }

  /** burst 한 발: 지금 플레이어 쪽으로 */
  private fireShot(a: EnemyAttackDef, host: EnemyHost): void {
    const p = host.playerPos();
    const from = { x: this.sprite.x, y: this.sprite.y };
    host.fireEnemyBullet(from, Math.atan2(p.y - from.y, p.x - from.x), a.speed!, a.range!, a.damage * this.damageMul, true);
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

  /**
   * link: 이 조준이 동료에게 연계를 거는지 (연계로 시작한 조준은 다시 걸지 않는다)
   * chained: 연속 돌진의 이어지는 예고 (남은 횟수를 다시 뽑지 않는다)
   */
  private onEvent(e: AiEvent, host: EnemyHost, dir: Vec2, dist: number, link: boolean, chained = false): void {
    const a = this.attacks.find((x) => x.id === e.attackId);
    if (!a) return;
    if (e.type === 'windup') {
      this.aim = dir;
      this.clearTelegraph();
      if (a.chain && !chained) this.chainLeft = host.rng.int(a.chain[0], a.chain[1]) - 1;
      const g = this.scene.add.graphics().setDepth(2);
      if (a.kind === 'fan') {
        const half = (a.spreadDeg! * Math.PI) / 360;
        const base = Math.atan2(dir.y, dir.x);
        g.lineStyle(1, TELEGRAPH_COLOR, 0.5);
        for (const s of [-half, 0, half]) g.lineBetween(this.sprite.x, this.sprite.y, this.sprite.x + Math.cos(base + s) * 40, this.sprite.y + Math.sin(base + s) * 40);
      } else if (a.kind === 'rope') {
        g.lineStyle(1, TELEGRAPH_COLOR, 0.8).lineBetween(this.sprite.x, this.sprite.y, this.sprite.x + dir.x * a.range!, this.sprite.y + dir.y * a.range!);
      } else if (a.kind === 'snipe') {
        // 조준선은 update에서 그린다
      } else if (a.kind === 'burst') {
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
    } else if (e.type === 'end') {
      // 밧줄이 빗나갔으면 거둔다
      if (a.kind === 'rope') this.clearTelegraph();
    } else if (e.type === 'strike') {
      this.clearTelegraph();
      this.actHit = false;
      if (a.kind === 'burst') {
        this.shotsFired = 0;
        this.shotTimer = 0;
        this.fireShot(a, host);
      } else if (a.kind === 'puddle') {
        host.addHazard(new Zone(this.scene, this.slamAt, a.radius!, a.liveSec!, a.damage, a.tickSec!, hexColor(this.def.color)));
      } else if (a.kind === 'fan') {
        // 부채꼴 탄막: 예고 때 정한 방향으로 (일반 탄: 굴절·탄 베기 가능)
        const base = Math.atan2(this.aim.y, this.aim.x);
        const spread = (a.spreadDeg! * Math.PI) / 180;
        const n = a.shots!;
        const from = { x: this.sprite.x, y: this.sprite.y };
        for (let k = 0; k < n; k++) {
          const ang = n === 1 ? base : base - spread / 2 + (spread * k) / (n - 1);
          host.fireEnemyBullet(from, ang, a.speed!, a.range!, a.damage * this.damageMul, true);
        }
      } else if (a.kind === 'rope') {
        this.ropeLen = 0;
        this.ropeHit = false;
      } else if (a.kind === 'snipe') {
        // 고정된 방향으로 직선 레이저 (대형 레이저: 굴절 불가), 한 번만 맞힌다
        const from = { x: this.sprite.x, y: this.sprite.y };
        host.addHazard(
          new Beams(this.scene, {
            center: () => from,
            count: 1,
            length: a.range!,
            width: a.width!,
            spin: 0,
            startAngle: Math.atan2(this.aim.y, this.aim.x),
            telegraphSec: 0,
            liveSec: a.actSec,
            damage: a.damage * this.damageMul,
            tickSec: a.actSec + 1,
            color: hexColor(this.def.color),
          }),
        );
      }
      if (a.kind === 'slam') {
        const p = host.playerPos();
        if (Math.hypot(p.x - this.slamAt.x, p.y - this.slamAt.y) <= a.radius! + host.playerRadius) host.hurtPlayer(a.damage * this.damageMul, this);
        const flash = this.scene.add.circle(this.slamAt.x, this.slamAt.y, a.radius!, TELEGRAPH_COLOR, 0.5).setDepth(6);
        this.scene.time.delayedCall(120, () => flash.destroy());
      }
    }
  }

  /** 엘리트 표시: 머리 위 아이콘, 두꺼운 외곽선 / 잔상 / 깜빡임 */
  private updateLook(dt: number): void {
    this.halo?.setPosition(this.sprite.x, this.sprite.y);
    if (!this.elite) return;
    const { x, y } = this.sprite;
    this.icon?.setPosition(x, y - this.radius - 1);
    if (this.outline) {
      const s = this.radius * 2 + 4;
      const ol = this.elites.find((e) => e.look === 'outline')!;
      this.outline.clear().lineStyle(2, hexColor(ol.color), 1).strokeRect(x - s / 2, y - s / 2, s, s);
    }
    const ghost = this.elites.find((e) => e.look === 'afterimage');
    if (ghost) {
      this.ghostTimer -= dt;
      const body = this.sprite.body as Phaser.Physics.Arcade.Body | null;
      if (this.ghostTimer <= 0 && body && body.speed > 10) {
        this.ghostTimer = 0.08;
        const g = this.scene.add.image(x, y, this.def.spriteKey).setScale(this.mods.scale).setAlpha(0.35).setDepth(2);
        g.setTint(hexColor(ghost.color));
        this.scene.tweens.add({ targets: g, alpha: 0, duration: 250, onComplete: () => g.destroy() });
      }
    }
    if (this.elites.some((e) => e.look === 'blink') && this.warn <= 0) {
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
    return this.elites.some((e) => e.knockbackImmune) || this.def.rank === 'boss' || this.def.rank === 'hiddenBoss';
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
    this.halo?.destroy();
    this.icon?.destroy();
    this.outline?.destroy();
    this.sprite.destroy();
  }
}
