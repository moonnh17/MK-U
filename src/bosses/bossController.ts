/**
 * 보스 한 마리를 움직인다: 패턴 선택기(systems/bossBrain.ts) → 패턴 실행(patterns.ts).
 * 패턴이 없을 때는 keepDistance까지 다가간다. 체력 50% 이하에서 강화 단계(잠깐 무적 + 연출).
 * 히든보스: 피해에 챕터 배율, 자기 강화(전장의 함성), 분신, 지면 파괴 잔해를 여기서 관리한다.
 * 체력 단계(마기카이저): 첫 단계가 열리기 전에는 구속구에 갇혀 움직이지 않고, 단계가 열릴 때마다 연출한다.
 * 마지막 단계에서는 일반 패턴과 별개로 독립 계승 패턴이 겹쳐 돈다.
 */
import type Phaser from 'phaser';
import type { Vec2 } from '../core/actions';
import { getContext } from '../core/context';
import { hexColor } from '../core/scale';
import { fitArt } from '../entities/art';
import { shake } from '../entities/juice';
import { animKey, artKeys, bossArtPhase } from '../systems/art';
import { loopArt, playFx } from '../skills/skillFx';
import type { Enemy } from '../entities/enemy';
import { initialBoss, stepBoss, type BossBrainState } from '../systems/bossBrain';
import { DelayedBlast } from '../entities/hazard';
import type { BossCore } from '../types/data';
import type { BossHost, PatternRun } from './host';
import { makePattern, type BossBody, type PatternCtx } from './patterns';

/**
 * 보스가 부른 적. pattern: 부른 패턴(살아 있는 동안 그 패턴은 다시 쓰지 않는다)
 * left·shot: 분신만 (시간이 지나면 사라지고 스스로 조준탄을 쏜다). 나머지는 자기 AI대로 싸우다 보스와 함께 사라진다.
 */
interface Minion {
  e: Enemy;
  pattern: string;
  left: number | null;
  shot: number | null;
}

/** 자세 동안의 좌우: 움직이는 쪽을 보고, 멈춰 있으면 그대로. 몸이 없으면 null */
function poseFlip(e: Enemy): boolean | null {
  const body = e.sprite.body as Phaser.Physics.Arcade.Body | null;
  if (!body) return null;
  return body.velocity.x !== 0 ? body.velocity.x < 0 : e.sprite.flipX;
}

/** 부른 패턴을 막지 않는 소환수 */
const FREE_MINION = '';

export class BossController {
  private brain: BossBrainState;
  private run: PatternRun | null = null;
  private aura: Phaser.GameObjects.Arc | null = null;
  private readonly body: BossBody;
  /** 자기 강화 */
  private buffLeft = 0;
  private buffDamage = 1;
  private buffSpeed = 1;
  private buffFx: Phaser.GameObjects.Arc | null = null;
  private minions: Minion[] = [];
  private rubble: { destroy(): void }[] = [];
  private host: BossHost | null = null;
  /** 파성 돌진: 핵이 드러난 동안의 표시 */
  private coreFx: Phaser.GameObjects.Arc | Phaser.GameObjects.Sprite | null = null;
  /** 구속구 (시간 단계 보스, 첫 단계 전) */
  private restraint: Phaser.GameObjects.Graphics | null = null;
  /** 지금 입은 단계 그림 (0 = 기본 그림) */
  private artPhase = 0;
  /** 독립 계승 패턴 (일반 패턴과 겹쳐 돈다) */
  private inheritRun: PatternRun | null = null;
  private inheritLeft = 0;
  private inheritRoll = 0;
  private inheritGap = 0;
  /** 저체력 추가 공격까지 남은 시간 */
  private lowStrike: number | null = null;
  /** 본체 자세: 지금 패턴과 시작 후 시간, 단계 전환 자세 남은 시간 */
  private patternId: string | null = null;
  private patternAge = 0;
  private transitionLeft = 0;
  private pose: string | null = null;
  /** 강화 단계에 몸에 겹치는 그림 */
  private layers: { sp: Phaser.GameObjects.Sprite; alpha: number; pulse: number; spin: number }[] = [];
  private layerT = 0;

  constructor(
    readonly enemy: Enemy,
    readonly def: BossCore,
    /** 피해 배율 (히든보스 챕터 배율, 스테이지 보스 1) */
    private readonly damageMul = 1,
  ) {
    this.brain = initialBoss(def.firstDelaySec);
    enemy.animScale = def.poseScale ?? null;
    this.applyPhaseArt();
    const sprite = enemy.sprite;
    const firstArt = Object.values(this.def.art ?? {})[0];
    const fxColor = hexColor(firstArt?.color ?? enemy.def.color);
    this.body = {
      pos: () => ({ x: sprite.x, y: sprite.y }),
      radius: () => enemy.radius,
      // 씬 종료 중에는 몸(body)이 먼저 사라진다
      setVelocity: (x, y) => {
        if (sprite.body) sprite.setVelocity(x, y);
      },
      blocked: () => {
        const b = sprite.body as Phaser.Physics.Arcade.Body | null;
        return !!b && !b.blocked.none;
      },
      teleport: (x, y) => {
        if (sprite.body) (sprite.body as Phaser.Physics.Arcade.Body).reset(x, y);
      },
      setAlpha: (a) => {
        sprite.setAlpha(a);
      },
      shape: (sx, sy, lean) => {
        enemy.shape = { sx, sy, lean };
      },
      ghost: (alpha, sec) => {
        const g = sprite.scene.add
          .image(sprite.x, sprite.y, sprite.texture.key, sprite.frame.name)
          .setOrigin(sprite.originX, sprite.originY)
          .setScale(sprite.scaleX, sprite.scaleY)
          .setRotation(sprite.rotation)
          .setFlipX(sprite.flipX)
          .setDepth(sprite.depth - 0.1)
          .setAlpha(alpha)
          .setTintFill(fxColor)
          .setBlendMode('ADD');
        sprite.scene.tweens.add({ targets: g, alpha: 0, scale: g.scale * 1.06, duration: sec * 1000, onComplete: () => g.destroy() });
      },
      color: hexColor(enemy.def.color),
      fxColor,
    };
  }

  get enraged(): boolean {
    const u = this.def.unlocks?.length ?? 0;
    return this.brain.phase === 2 || (u > 0 && this.brain.unlocked >= u);
  }

  /** 체력 단계 보스가 아직 구속돼 있다 */
  get restrained(): boolean {
    return (this.def.unlocks?.length ?? 0) > 0 && this.brain.unlocked === 0;
  }

  update(dt: number, host: BossHost): void {
    this.host = host;
    const e = this.enemy;
    this.updateMinions(dt, host);
    if (e.dead || e.warn > 0) return;
    this.updateBuff(dt);
    const p = host.playerPos();
    const dist = Math.hypot(p.x - e.sprite.x, p.y - e.sprite.y);
    const hp = e.hp / e.maxHp;
    const blocked = new Set(this.minions.map((m) => m.pattern));
    for (const x of this.def.patterns) if (x.hpBelow !== undefined && hp > x.hpBelow) blocked.add(x.id);
    const r = stepBoss(this.brain, dt, hp, dist, this.rules, this.def, host.rng, blocked);
    this.brain = r.state;
    for (const ev of r.events) {
      if (ev.type === 'end') {
        this.run?.destroy();
        this.run = null;
        this.patternId = null;
        e.shape = { sx: 1, sy: 1, lean: 0 };
      } else if (ev.type === 'unlock') {
        this.unlock(host, ev.stage);
      } else if (ev.type === 'start') {
        this.run = makePattern(ev.id, this.patternCtx(host, ev.id, this.body));
        this.patternId = ev.id;
        this.patternAge = 0;
        const cast = this.def.art?.[`${ev.id}.cast`];
        if (cast) playFx(host.scene, cast, e.sprite.x, e.sprite.y, { depth: 5 });
        this.label(host, host.t(`boss.pattern.${ev.id}`));
        this.spawnCompanions(host);
        if (this.def.lowHpStrike && hp <= this.def.lowHpStrike.at) this.lowStrike = this.def.lowHpStrike.afterSec;
      } else {
        this.enrage(host);
      }
    }
    this.updateLowStrike(dt, host);
    this.updateInherit(dt, host);
    this.updatePose(dt);
    this.updateLayers(dt);
    if (this.run) this.run.update(dt);
    else if (this.restrained) e.sprite.setVelocity(0, 0);
    else this.approach(dist, p);
    this.drawRestraint(host);
    this.aura?.setPosition(e.sprite.x, e.sprite.y).setRadius(e.radius + 4);
    this.coreFx?.setPosition(e.sprite.x, e.sprite.y);
    this.buffFx?.setPosition(e.sprite.x, e.sprite.y).setRadius(e.radius + 7);
  }

  private get rules(): BossCore['patterns'] {
    return this.def.patterns.filter((x) => !x.inherit);
  }

  private patternCtx(host: BossHost, id: string, boss: BossBody): PatternCtx {
    return {
      boss,
      host,
      v: (k) => this.value(id, k),
      art: (slot) => this.def.art?.[`${id}.${slot}`] ?? this.def.art?.[slot],
      summonId: this.def.patterns.find((x) => x.id === id)?.summon,
      buff: (sec, dmg, speed) => this.startBuff(host, sec, dmg, speed),
      summonClones: () => this.summonClones(host),
      summon: (ids, free) => this.summonGroup(host, free ? FREE_MINION : id, ids),
      minionCount: (enemyId) => this.minions.filter((m) => m.e.def.id === enemyId).length,
      expose: (sec, mul) => this.expose(host, sec, mul),
      rubble: (at, radius) => this.addRubble(host, at, radius),
    };
  }

  /** 본체 자세: 단계 전환 → 핵 노출 → 돌진 → 패턴 자세. 없으면 평소 idle·move로 돌아간다 */
  private updatePose(dt: number): void {
    this.patternAge += dt;
    this.transitionLeft -= dt;
    const poses = this.def.poses;
    if (!poses) return;
    const e = this.enemy;
    let want: string | null = null;
    const pick = (entry: NonNullable<BossCore['poses']>[string] | undefined): string | null => {
      if (!entry) return null;
      return typeof entry === 'string' ? entry : this.patternAge < entry.sec ? entry.first : entry.then;
    };
    if (this.transitionLeft > 0) want = 'transition';
    else if (e.exposed) want = pick(poses.recover);
    else if (this.run) want = pick(poses[this.run.bodyPose?.() ?? '']) ?? (this.patternId ? pick(poses[this.patternId]) : null);
    const key = animKey(e.sprite.texture.key, want ?? '');
    if (want && e.sprite.scene.anims.exists(key)) {
      e.poseHold = true;
      const p = poseFlip(e);
      if (p !== null) e.sprite.setFlipX(p);
      if (this.pose !== key) e.sprite.play(key);
      this.pose = key;
      return;
    }
    e.poseHold = false;
    this.pose = null;
  }

  /** 강화 단계 겹침 그림: 몸을 따라다니며 맥동한다 */
  private updateLayers(dt: number): void {
    if (this.layers.length === 0) return;
    this.layerT += dt;
    const { x, y } = this.enemy.sprite.getCenter();
    for (const l of this.layers) l.sp.setPosition(x, y).setAlpha(l.alpha + Math.sin(this.layerT * 10) * l.pulse).setRotation(this.layerT * l.spin);
  }

  private showLayers(host: BossHost): void {
    for (const l of this.def.layers ?? []) {
      const sp = host.scene.add.sprite(0, 0, l.sprite.spriteKey).setDepth(2).setAlpha(l.alpha);
      loopArt(sp, l.sprite);
      this.layers.push({ sp, alpha: l.alpha, pulse: l.pulse, spin: l.spin ?? 0 });
    }
  }

  /** 패턴에 따라 나오는 소환수 (상한까지만) */
  private spawnCompanions(host: BossHost): void {
    const c = this.def.companions;
    if (!c) return;
    const pool = this.enraged ? c.enemiesEnraged : c.enemies;
    const room = c.maxAlive - this.minions.length;
    const n = Math.min(room, this.enraged ? c.countEnraged : c.count);
    if (n > 0) this.summonGroup(host, FREE_MINION, Array.from({ length: n }, () => host.rng.pick(pool)));
  }

  /** 저체력 추가 공격: 피한 뒤 멈추는 습관을 노린다 */
  private updateLowStrike(dt: number, host: BossHost): void {
    const s = this.def.lowHpStrike;
    if (this.lowStrike === null || !s) return;
    this.lowStrike -= dt;
    if (this.lowStrike > 0) return;
    this.lowStrike = null;
    host.addHazard(new DelayedBlast(host.scene, host.playerPos(), s.radius, s.delaySec, s.damage * this.damageMul, this.body.color));
  }

  /** 독립 계승: 마지막 단계에서 일반 패턴과 겹쳐 돈다. 이동은 일반 패턴 몫이라 건드리지 않는다 */
  private updateInherit(dt: number, host: BossHost): void {
    const cfg = this.def.inherit;
    if (!cfg || !this.enraged) return;
    if (this.inheritRun) {
      this.inheritRun.update(dt);
      this.inheritLeft -= dt;
      if (this.inheritLeft > 0) return;
      this.inheritRun.destroy();
      this.inheritRun = null;
      this.inheritGap = cfg.minGapSec;
      return;
    }
    this.inheritGap -= dt;
    this.inheritRoll -= dt;
    if (this.inheritGap > 0 || this.inheritRoll > 0) return;
    this.inheritRoll = cfg.rollSec;
    if (!host.rng.chance(cfg.chance)) return;
    const pool = this.def.patterns.filter((x) => x.inherit);
    const p = host.rng.pick(pool);
    this.inheritRun = makePattern(p.id, this.patternCtx(host, p.id, { ...this.body, setVelocity: () => {} }));
    this.inheritLeft = p.durationSec;
    this.label(host, host.t(`boss.pattern.${p.id}`), this.def.enraged.auraColor);
  }

  /** 패턴 수치. 강화 단계면 `키Enraged`가 있으면 그것. 피해 값은 챕터 배율·자기 강화를 곱한다 */
  private value(patternId: string, key: string): number {
    const v = this.def.patterns.find((x) => x.id === patternId)!.values;
    const enragedKey = `${key}Enraged`;
    const raw = this.enraged && v[enragedKey] !== undefined ? v[enragedKey]! : (v[key] ?? 0);
    return /damage/i.test(key) && !/Mul$/.test(key) ? raw * this.damageMul * this.buffDamage : raw;
  }

  private approach(dist: number, p: { x: number; y: number }): void {
    const e = this.enemy;
    if (dist <= this.def.keepDistance + e.radius) {
      e.sprite.setVelocity(0, 0);
      return;
    }
    const speed = e.def.moveSpeed * (this.enraged ? this.def.enraged.moveSpeedMul : 1) * this.buffSpeed;
    e.sprite.setVelocity(((p.x - e.sprite.x) / dist) * speed, ((p.y - e.sprite.y) / dist) * speed);
  }

  private startBuff(host: BossHost, sec: number, damage: number, speed: number): void {
    this.buffLeft = sec;
    this.buffDamage = damage;
    this.buffSpeed = speed;
    // 접촉 피해도 함께
    this.enemy.damageMul = this.damageMul * damage;
    this.buffFx ??= host.scene.add.circle(0, 0, this.enemy.radius + 7).setStrokeStyle(2, 0xff3a2a, 0.9).setDepth(2);
  }

  private updateBuff(dt: number): void {
    if (this.buffLeft <= 0) return;
    this.buffLeft -= dt;
    if (this.buffLeft > 0) return;
    this.buffDamage = 1;
    this.buffSpeed = 1;
    this.enemy.damageMul = this.damageMul;
    this.buffFx?.destroy();
    this.buffFx = null;
  }

  /** 분신: 보스 둘레에 반투명 분신, 일정 시간 조준탄을 쏘다 사라진다 */
  private summonClones(host: BossHost): void {
    const v = (k: string) => this.value('clones', k);
    const e = this.enemy;
    const a = host.arena();
    const m = e.radius + 4;
    const base = host.rng.range(0, Math.PI * 2);
    const n = v('count');
    for (let i = 0; i < n; i++) {
      const ang = base + (i * Math.PI * 2) / n;
      const at = {
        x: Math.min(a.x + a.w - m, Math.max(a.x + m, e.sprite.x + Math.cos(ang) * v('offset'))),
        y: Math.min(a.y + a.h - m, Math.max(a.y + m, e.sprite.y + Math.sin(ang) * v('offset'))),
      };
      const clone = host.spawnMinion('royalMageClone', at, Math.max(1, Math.round(e.maxHp * v('hpRatio'))));
      clone.sprite.setAlpha(0.55);
      this.minions.push({ e: clone, pattern: 'clones', left: v('lifeSec'), shot: v('shotSec') * (0.5 + i * 0.25) });
    }
  }

  /** 적 무리 소환 (전투원 호출·폐허의 군세): 보스 둘레에, 보상 없이 */
  private summonGroup(host: BossHost, pattern: string, ids: readonly string[]): void {
    const e = this.enemy;
    const a = host.arena();
    const base = host.rng.range(0, Math.PI * 2);
    ids.forEach((id, i) => {
      const ang = base + (i * Math.PI * 2) / ids.length;
      const r = e.radius + 30;
      const at = {
        x: Math.min(a.x + a.w - 12, Math.max(a.x + 12, e.sprite.x + Math.cos(ang) * r)),
        y: Math.min(a.y + a.h - 12, Math.max(a.y + 12, e.sprite.y + Math.sin(ang) * r)),
      };
      const m = host.spawnMinion(id, at);
      // 보스가 부른 소환수만 체력 배율 (방에 원래 나오는 같은 적은 그대로)
      if (this.def.summonHpMul) m.setMaxHp(Math.max(1, Math.round(m.maxHp * this.def.summonHpMul)));
      this.minions.push({ e: m, pattern, left: null, shot: null });
      const fx = this.def.art?.summon;
      if (fx) playFx(host.scene, fx, at.x, at.y);
    });
  }

  /** 핵 노출 (파성 돌진이 벽에 부딪힘): 잠깐 멈추고 받는 피해 증가 */
  private expose(host: BossHost, sec: number, mul: number): void {
    const e = this.enemy;
    e.setExposed(sec, mul);
    this.coreFx?.destroy();
    const core = this.def.art?.core;
    this.coreFx = core ? host.scene.add.sprite(e.sprite.x, e.sprite.y, core.spriteKey).setDepth(4) : host.scene.add.circle(e.sprite.x, e.sprite.y, e.radius * 0.45, 0xff5a3a, 0.9).setDepth(4);
    host.scene.tweens.add({ targets: this.coreFx, alpha: 0.3, duration: 200, yoyo: true, repeat: -1 });
    host.scene.time.delayedCall(sec * 1000, () => {
      this.coreFx?.destroy();
      this.coreFx = null;
    });
  }

  private updateMinions(dt: number, host: BossHost): void {
    if (this.minions.length === 0) return;
    const v = (k: string) => this.value('clones', k);
    const p = host.playerPos();
    this.minions = this.minions.filter((m) => {
      if (m.e.dead) return false;
      if (m.left !== null) m.left -= dt;
      if ((m.left !== null && m.left <= 0) || this.enemy.dead) {
        host.removeMinion(m.e);
        return false;
      }
      if (m.shot === null) return true;
      m.shot -= dt;
      if (m.shot <= 0) {
        m.shot = v('shotSec');
        const from = { x: m.e.sprite.x, y: m.e.sprite.y };
        host.fireEnemyBullet(from, Math.atan2(p.y - from.y, p.x - from.x), v('shotSpeed'), v('shotRange'), v('shotDamage'), true);
      }
      return true;
    });
  }

  /** 지면 파괴 잔해: 상한(maxRubble)을 넘으면 가장 오래된 것부터 치운다 */
  private addRubble(host: BossHost, at: Vec2, radius: number): void {
    const v = (k: string) => this.value('groundBreak', k);
    const r = host.addObstacle(at, radius, v('doorClear'));
    if (!r) return;
    this.rubble.push(r);
    while (this.rubble.length > v('maxRubble')) this.rubble.shift()!.destroy();
  }

  /**
   * 단계 그림: `보스키_phaseN`이 불러와져 있으면 그 모습으로 (판정은 그대로). 없으면 지금 그림을 그대로 둔다.
   */
  private applyPhaseArt(): void {
    const ctx = getContext();
    const e = this.enemy;
    const phase = bossArtPhase(this.brain.unlocked, this.brain.phase, (this.def.unlocks?.length ?? 0) > 0);
    const key = artKeys.bossPhase(e.def.spriteKey, phase);
    if (phase === this.artPhase || !ctx.artLoaded.has(key)) return;
    this.artPhase = phase;
    // 재생 중인 이전 그림의 애니메이션이 다음 프레임에 텍스처를 되돌리지 않게 멈춘다
    e.sprite.anims.stop();
    e.sprite.setTexture(key, 0);
    fitArt(ctx.data, e.sprite, e.def.size, e.def.height ?? e.def.size);
  }

  /** 구속구: 몸을 감싼 틀과 사슬 (첫 단계가 열리면 부서진다). 구속된 모습의 그림이 있으면 그림이 대신한다 */
  private drawRestraint(host: BossHost): void {
    if (!this.restrained || this.artPhase === 1) return;
    const e = this.enemy;
    this.restraint ??= host.scene.add.graphics().setDepth(4);
    const r = e.radius + 3;
    const { x, y } = e.sprite;
    const g = this.restraint.clear().lineStyle(2, 0x8a8a8a, 1).strokeRect(x - r, y - r, r * 2, r * 2);
    g.lineStyle(1, 0xb0b0b0, 0.9).lineBetween(x - r, y - r, x + r, y + r).lineBetween(x + r, y - r, x - r, y + r);
    // 바닥에 박힌 사슬
    g.lineStyle(1, 0x6a6a6a, 0.9);
    for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) g.lineBetween(x + dx * r, y + dy * r, x + dx * (r + 12), y + dy * (r + 12));
  }

  /** 체력 단계 개방: 이름 표시·흔들림·잠깐 무적, 첫 단계면 구속이 풀린다 */
  private unlock(host: BossHost, stage: number): void {
    const e = this.enemy;
    this.applyPhaseArt();
    e.invuln = this.def.enrageSec;
    e.sprite.setVelocity(0, 0);
    this.transitionLeft = this.def.enrageSec;
    if (stage === (this.def.unlocks?.length ?? 0)) this.showLayers(host);
    if (stage === 1) {
      this.restraint?.destroy();
      this.restraint = null;
      const burst = host.scene.add.circle(e.sprite.x, e.sprite.y, e.radius + 3).setStrokeStyle(3, 0xb0b0b0, 1).setDepth(6);
      host.scene.tweens.add({ targets: burst, scale: 3, alpha: 0, duration: 400, onComplete: () => burst.destroy() });
    }
    this.aura?.destroy();
    this.aura = host.scene.add.circle(e.sprite.x, e.sprite.y, e.radius + 4).setStrokeStyle(stage, hexColor(this.def.enraged.auraColor), 0.8).setDepth(2);
    shake(host.scene, 'heavy');
    // 구속 해제 그림 (있으면): 몸을 가로지르는 붉은 전선
    const unbound = this.def.art?.unlock;
    if (unbound) playFx(host.scene, unbound, e.sprite.x, e.sprite.y, { w: e.radius * 5, depth: 7 });
    host.bossPhaseFx(host.t(`boss.unlock.${this.def.id}.${stage}`), this.def.enraged.auraColor, { x: e.sprite.x, y: e.sprite.y });
  }

  private enrage(host: BossHost): void {
    const e = this.enemy;
    this.applyPhaseArt();
    const en = this.def.enraged;
    this.transitionLeft = this.def.enrageSec;
    this.showLayers(host);
    e.invuln = this.def.enrageSec;
    e.sprite.setVelocity(0, 0);
    if (en.scale !== 1) e.setExtraScale(en.scale);
    this.aura = host.scene.add.circle(e.sprite.x, e.sprite.y, e.radius + 4).setStrokeStyle(2, hexColor(en.auraColor), 0.8).setDepth(2);
    shake(host.scene, 'heavy');
    host.bossPhaseFx(host.t(`boss.enraged.${this.def.id}`), en.auraColor, { x: e.sprite.x, y: e.sprite.y });
  }

  private label(host: BossHost, text: string, color = '#ffffff'): void {
    const e = this.enemy;
    const t = host.scene.add
      .text(e.sprite.x, e.sprite.y - e.radius - 4, text, { fontFamily: 'sans-serif', fontSize: '9px', color, stroke: '#000000', strokeThickness: 2 })
      .setOrigin(0.5, 1)
      .setDepth(7);
    host.scene.tweens.add({ targets: t, y: t.y - 8, alpha: 0, duration: 900, onComplete: () => t.destroy() });
  }

  /** 보스가 사라질 때: 패턴·분신·잔해도 함께 치운다 */
  destroy(): void {
    const death = this.def.art?.death;
    if (death && this.enemy.dead && this.host) {
      const { x, y } = this.enemy.sprite;
      playFx(this.host.scene, death, x, y, { fadeSec: 0.6 });
    }
    for (const l of this.layers) l.sp.destroy();
    this.layers = [];
    this.run?.destroy();
    this.run = null;
    this.inheritRun?.destroy();
    this.inheritRun = null;
    this.aura?.destroy();
    this.aura = null;
    this.buffFx?.destroy();
    this.buffFx = null;
    this.coreFx?.destroy();
    this.coreFx = null;
    this.restraint?.destroy();
    this.restraint = null;
    for (const m of this.minions) this.host?.removeMinion(m.e);
    this.minions = [];
    for (const r of this.rubble) r.destroy();
    this.rubble = [];
  }
}
