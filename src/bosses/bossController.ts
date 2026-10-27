/**
 * 보스 한 마리를 움직인다: 패턴 선택기(systems/bossBrain.ts) → 패턴 실행(patterns.ts).
 * 패턴이 없을 때는 keepDistance까지 다가간다. 체력 50% 이하에서 강화 단계(잠깐 무적 + 연출).
 * 히든보스: 피해에 챕터 배율, 자기 강화(전장의 함성), 분신, 지면 파괴 잔해를 여기서 관리한다.
 */
import type Phaser from 'phaser';
import type { Vec2 } from '../core/actions';
import { hexColor } from '../core/scale';
import type { Enemy } from '../entities/enemy';
import { initialBoss, stepBoss, type BossBrainState } from '../systems/bossBrain';
import type { BossCore } from '../types/data';
import type { BossHost, PatternRun } from './host';
import { makePattern, type BossBody } from './patterns';

const NONE: ReadonlySet<string> = new Set();
const CLONES_BLOCKED: ReadonlySet<string> = new Set(['clones']);

interface Minion {
  e: Enemy;
  left: number;
  shot: number;
}

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

  constructor(
    readonly enemy: Enemy,
    readonly def: BossCore,
    /** 피해 배율 (히든보스 챕터 배율, 스테이지 보스 1) */
    private readonly damageMul = 1,
  ) {
    this.brain = initialBoss(def.firstDelaySec);
    const sprite = enemy.sprite;
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
      color: hexColor(enemy.def.color),
    };
  }

  get enraged(): boolean {
    return this.brain.phase === 2;
  }

  update(dt: number, host: BossHost): void {
    this.host = host;
    const e = this.enemy;
    this.updateMinions(dt, host);
    if (e.dead || e.warn > 0) return;
    this.updateBuff(dt);
    const p = host.playerPos();
    const dist = Math.hypot(p.x - e.sprite.x, p.y - e.sprite.y);
    const blocked = this.minions.length > 0 ? CLONES_BLOCKED : NONE;
    const r = stepBoss(this.brain, dt, e.hp / e.maxHp, dist, this.def.patterns, this.def, host.rng, blocked);
    this.brain = r.state;
    for (const ev of r.events) {
      if (ev.type === 'end') {
        this.run?.destroy();
        this.run = null;
      } else if (ev.type === 'start') {
        this.run = makePattern(ev.id, {
          boss: this.body,
          host,
          v: (k) => this.value(ev.id, k),
          buff: (sec, dmg, speed) => this.startBuff(host, sec, dmg, speed),
          summonClones: () => this.summonClones(host),
          rubble: (at, radius) => this.addRubble(host, at, radius),
        });
        this.label(host, host.t(`boss.pattern.${ev.id}`));
      } else {
        this.enrage(host);
      }
    }
    if (this.run) this.run.update(dt);
    else this.approach(dist, p);
    this.aura?.setPosition(e.sprite.x, e.sprite.y).setRadius(e.radius + 4);
    this.buffFx?.setPosition(e.sprite.x, e.sprite.y).setRadius(e.radius + 7);
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
      this.minions.push({ e: clone, left: v('lifeSec'), shot: v('shotSec') * (0.5 + i * 0.25) });
    }
  }

  private updateMinions(dt: number, host: BossHost): void {
    if (this.minions.length === 0) return;
    const v = (k: string) => this.value('clones', k);
    const p = host.playerPos();
    this.minions = this.minions.filter((m) => {
      if (m.e.dead) return false;
      m.left -= dt;
      if (m.left <= 0 || this.enemy.dead) {
        host.removeMinion(m.e);
        return false;
      }
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

  private enrage(host: BossHost): void {
    const e = this.enemy;
    const en = this.def.enraged;
    e.invuln = this.def.enrageSec;
    e.sprite.setVelocity(0, 0);
    if (en.scale !== 1) e.setExtraScale(en.scale);
    this.aura = host.scene.add.circle(e.sprite.x, e.sprite.y, e.radius + 4).setStrokeStyle(2, hexColor(en.auraColor), 0.8).setDepth(2);
    host.scene.cameras.main.shake(300, 0.006);
    this.label(host, host.t(`boss.enraged.${this.def.id}`), en.auraColor);
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
    this.run?.destroy();
    this.run = null;
    this.aura?.destroy();
    this.aura = null;
    this.buffFx?.destroy();
    this.buffFx = null;
    for (const m of this.minions) this.host?.removeMinion(m.e);
    this.minions = [];
    for (const r of this.rubble) r.destroy();
    this.rubble = [];
  }
}
