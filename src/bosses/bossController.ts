/**
 * 보스 한 마리를 움직인다: 패턴 선택기(systems/bossBrain.ts) → 패턴 실행(patterns.ts).
 * 패턴이 없을 때는 keepDistance까지 다가간다. 체력 50% 이하에서 강화 단계(잠깐 무적 + 연출).
 */
import type Phaser from 'phaser';
import { hexColor } from '../core/scale';
import type { Enemy } from '../entities/enemy';
import { initialBoss, stepBoss, type BossBrainState } from '../systems/bossBrain';
import type { BossDef } from '../types/data';
import type { BossHost, PatternRun } from './host';
import { makePattern, type BossBody } from './patterns';

export class BossController {
  private brain: BossBrainState;
  private run: PatternRun | null = null;
  private aura: Phaser.GameObjects.Arc | null = null;
  private readonly body: BossBody;

  constructor(
    readonly enemy: Enemy,
    readonly def: BossDef,
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
      color: hexColor(enemy.def.color),
    };
  }

  get enraged(): boolean {
    return this.brain.phase === 2;
  }

  update(dt: number, host: BossHost): void {
    const e = this.enemy;
    if (e.dead || e.warn > 0) return;
    const p = host.playerPos();
    const dist = Math.hypot(p.x - e.sprite.x, p.y - e.sprite.y);
    const r = stepBoss(this.brain, dt, e.hp / e.maxHp, dist, this.def.patterns, this.def, host.rng);
    this.brain = r.state;
    for (const ev of r.events) {
      if (ev.type === 'end') {
        this.run?.destroy();
        this.run = null;
      } else if (ev.type === 'start') {
        this.run = makePattern(ev.id, { boss: this.body, host, v: (k) => this.value(ev.id, k) });
        this.label(host, host.t(`boss.pattern.${ev.id}`));
      } else {
        this.enrage(host);
      }
    }
    if (this.run) this.run.update(dt);
    else this.approach(dist, p);
    this.aura?.setPosition(e.sprite.x, e.sprite.y).setRadius(e.radius + 4);
  }

  /** 패턴 수치. 강화 단계면 `키Enraged`가 있으면 그것 */
  private value(patternId: string, key: string): number {
    const v = this.def.patterns.find((x) => x.id === patternId)!.values;
    const enragedKey = `${key}Enraged`;
    return this.enraged && v[enragedKey] !== undefined ? v[enragedKey]! : (v[key] ?? 0);
  }

  private approach(dist: number, p: { x: number; y: number }): void {
    const e = this.enemy;
    if (dist <= this.def.keepDistance + e.radius) {
      e.sprite.setVelocity(0, 0);
      return;
    }
    const speed = e.def.moveSpeed * (this.enraged ? this.def.enraged.moveSpeedMul : 1);
    e.sprite.setVelocity(((p.x - e.sprite.x) / dist) * speed, ((p.y - e.sprite.y) / dist) * speed);
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

  destroy(): void {
    this.run?.destroy();
    this.run = null;
    this.aura?.destroy();
    this.aura = null;
  }
}
