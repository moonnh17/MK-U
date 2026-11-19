/**
 * 마기법사 휘강파 (순수 마기).
 * - 마기탄: 조준 방향으로 빠르게 연사. 마기 분출: 직선 관통 광선(벽에서 끊긴다).
 * - 마기 파동: 앞쪽 부채꼴 피해 + 밀치기. 마기 응축구: 느리게 나아가며 끌어당기다 터진다.
 * - 마기 기둥: 가까운 적 발밑(없으면 앞쪽)에서 공간격 분출. 슬픈 처형: 보라 대광선, 낮은 체력 일반·엘리트 처형.
 * - 각인 상시 효과·응축 게이지·순수 전개는 scenes/run/mageRuntime.
 */
import type Phaser from 'phaser';
import type { Vec2 } from '../core/actions';
import { bus } from '../core/events';
import { executeMark } from '../entities/statusLook';
import { shake } from '../entities/juice';
import { executable } from '../systems/magiMage';
import { lineHits } from '../systems/targeting';
import { inArc } from '../systems/weapons';
import { fxScale, impactFx, playFx, ProjectileLook, stretchFx } from './skillFx';
import { nearestEnemy, type PassiveImpl, type SkillCast, type SkillHost, type SkillImpl, type SkillObject, type UltimateImpl } from './host';

const RAY_STEP_PX = 4;

/** p에서 dir로 벽에 닿기 전까지의 길이 (최대 max) */
function rayLength(host: SkillHost, p: Vec2, dir: Vec2, max: number): number {
  for (let d = RAY_STEP_PX; d <= max; d += RAY_STEP_PX) if (host.blocked(p.x + dir.x * d, p.y + dir.y * d)) return d;
  return max;
}

// ---------- 마기탄 ----------

export const magiBolt: SkillImpl = {
  cast(host, s) {
    const v = s.values;
    const tags = s.def.sources.bolt!;
    const shot = s.def.sprites.shot!;
    for (let i = 0; i < v.shots!; i++) {
      host.scene.time.delayedCall(i * v.gapSec! * 1000, () => {
        const d = host.aimDir();
        const a = Math.atan2(d.y, d.x) + host.rng.range(-1, 1) * ((v.spreadDeg! * Math.PI) / 180);
        host.fireBullet(host.playerPos(), a, v.speed!, v.range!, v.damage!, tags, shot, { pierce: v.pierce ?? 0, hitSize: shot.size / 2 });
      });
    }
    return true;
  },
};

// ---------- 마기 분출 ----------

export const magiBurst: SkillImpl = {
  cast(host, s) {
    const v = s.values;
    const p = host.playerPos();
    const dir = host.aimDir();
    const len = rayLength(host, p, dir, v.length!);
    const enemies = [...host.enemies()];
    const hits = lineHits(p, dir, len, v.width! / 2, enemies.map((e) => ({ x: e.sprite.x, y: e.sprite.y, radius: e.radius })));
    for (const i of hits) host.hit(enemies[i]!, v.damage!, s.def.sources.beam!);
    // 그림의 광선 몸통은 칸 높이의 절반쯤이라 판정 폭의 두 배로 그린다
    stretchFx(host.scene, s.def.sprites.beam!, p, { x: p.x + dir.x * len, y: p.y + dir.y * len }, v.width! * 2 * fxScale(host, s.owned.level), 0.25);
    impactFx(host, s.owned.level, p.x + dir.x * len, p.y + dir.y * len, s.def.color, v.width! * 1.5);
    return true;
  },
};

// ---------- 마기 파동 ----------

export const magiWave: SkillImpl = {
  cast(host, s) {
    const v = s.values;
    const p = host.playerPos();
    const d = host.aimDir();
    const a = Math.atan2(d.y, d.x);
    const r = host.area(v.radius!);
    for (const e of [...host.enemies()]) {
      if (!inArc(p, a, v.arcDeg!, r, { x: e.sprite.x, y: e.sprite.y }, e.radius)) continue;
      if (host.hit(e, v.damage!, s.def.sources.wave!)) continue;
      const dx = e.sprite.x - p.x;
      const dy = e.sprite.y - p.y;
      const n = Math.hypot(dx, dy) || 1;
      e.knockback({ x: dx / n, y: dy / n }, v.knockback!, v.knockSec!);
    }
    playFx(host.scene, s.def.sprites.wave!, p.x + d.x * r * 0.35, p.y + d.y * r * 0.35, { w: r * 1.5 * fxScale(host, s.owned.level), rotation: a });
    if (s.owned.level >= host.ctx.data.juice.projectileLook.ringFromLevel) impactFx(host, s.owned.level, p.x + d.x * r * 0.5, p.y + d.y * r * 0.5, s.def.color, r * 0.6);
    return true;
  },
};

// ---------- 마기 응축구 ----------

class Condenser implements SkillObject {
  readonly owner = 'magiCondenser';
  readonly createdAt: number;
  private readonly look: ProjectileLook;
  private life: number;
  private pullIn = 0;

  constructor(
    host: SkillHost,
    private readonly s: SkillCast,
    private at: Vec2,
    private readonly dir: Vec2,
  ) {
    this.createdAt = host.scene.time.now;
    this.life = s.values.lifeSec!;
    this.look = new ProjectileLook(host.scene, at.x, at.y, s.def.sprites.orb!, host.ctx.data.juice.projectileLook, { glow: s.def.sprites.orbGlow, spin: true, trail: false, scale: fxScale(host, s.owned.level) });
  }

  update(dt: number, host: SkillHost): boolean {
    const v = this.s.values;
    this.life -= dt;
    const next = { x: this.at.x + this.dir.x * v.speed! * dt, y: this.at.y + this.dir.y * v.speed! * dt };
    if (!host.blocked(next.x, next.y)) this.at = next;
    // 터질 때가 다가올수록 부푼다
    const grow = 1 + 0.4 * (1 - Math.max(0, this.life) / v.lifeSec!);
    this.look.place(this.at.x, this.at.y, dt, grow);
    this.pullIn -= dt;
    if (this.pullIn <= 0) {
      this.pullIn = v.pullEverySec!;
      const pr = host.area(v.pullRadius!);
      for (const e of host.enemies()) {
        const dx = this.at.x - e.sprite.x;
        const dy = this.at.y - e.sprite.y;
        const d = Math.hypot(dx, dy);
        if (d > pr + e.radius || d < 2) continue;
        e.knockback({ x: dx / d, y: dy / d }, Math.min(v.pullPx!, d), v.pullEverySec!);
      }
    }
    if (this.life > 0) return true;
    this.explode(host);
    return false;
  }

  private explode(host: SkillHost): void {
    const v = this.s.values;
    const r = host.area(v.radius!);
    bus.emit('sfx', { id: 'explosion', size: r });
    host.blastProps(this.at, r, v.damage!);
    for (const e of [...host.enemies()]) if (Math.hypot(e.sprite.x - this.at.x, e.sprite.y - this.at.y) <= r + e.radius) host.hit(e, v.damage!, this.s.def.sources.blast!);
    playFx(host.scene, this.s.def.sprites.blast!, this.at.x, this.at.y, { w: r * 2.4 * fxScale(host, this.s.owned.level) });
    impactFx(host, this.s.owned.level, this.at.x, this.at.y, this.s.def.color, r * 1.2, 2);
    shake(host.scene, 'light');
  }

  destroy(): void {
    this.look.destroy();
  }
}

export const magiCondenser: SkillImpl = {
  cast(host, s) {
    host.addObject(new Condenser(host, s, host.playerPos(), host.aimDir()));
    return true;
  },
};

// ---------- 마기 기둥 ----------

export const magiPillar: SkillImpl = {
  cast(host, s) {
    const v = s.values;
    const p = host.playerPos();
    const target = nearestEnemy(host, p, v.range!);
    const d = host.aimDir();
    const at = target ? { x: target.sprite.x, y: target.sprite.y } : { x: p.x + d.x * v.ahead!, y: p.y + d.y * v.ahead! };
    const r = host.area(v.radius!);
    const ref = s.def.sprites.pillar!;
    playFx(host.scene, ref, at.x, at.y + r * 0.3, { w: Math.max(ref.size, r * 2.4) * fxScale(host, s.owned.level) }).setOrigin(0.5, 1);
    host.scene.time.delayedCall(v.delaySec! * 1000, () => {
      impactFx(host, s.owned.level, at.x, at.y, s.def.color, r * 1.4, 1.5);
      for (const e of [...host.enemies()]) if (Math.hypot(e.sprite.x - at.x, e.sprite.y - at.y) <= r + e.radius) host.hit(e, v.damage!, s.def.sources.pillar!);
    });
    return true;
  },
};

// ---------- 순수 전개 (패시브): 규칙은 scenes/run/mageRuntime ----------

export const pureUnfolding: PassiveImpl = { activate() {} };

// ---------- 슬픈 처형 (휘강파 궁극기) ----------

export const sadExecution: UltimateImpl = {
  cast(host, u) {
    const v = u.values;
    const p = host.playerPos();
    const dir = host.aimDir();
    const end = { x: p.x + dir.x * v.length!, y: p.y + dir.y * v.length! };
    host.scene.time.delayedCall(v.chargeSec! * 1000, () => {
      const enemies = [...host.enemies()];
      const hits = lineHits(p, dir, v.length!, v.width! / 2, enemies.map((e) => ({ x: e.sprite.x, y: e.sprite.y, radius: e.radius })));
      stretchFx(host.scene, u.def.sprites.beam!, p, end, v.width! * 2, 0.4);
      shake(host.scene, 'heavy');
      for (const i of hits) {
        const e = enemies[i]!;
        if (host.hit(e, v.damage!, u.def.sources.beam!) || e.dead) continue;
        if (!executable(e.rank, e.hp, e.maxHp, v.executeRatio!)) continue;
        executeMark(host.scene, e.sprite.x, e.sprite.y);
        host.hitTrue(e, e.hp / Math.max(0.01, e.takenMul) + 1, false);
      }
    });
    // 모으는 동안 가는 예고선
    stretchFx(host.scene, u.def.sprites.beam!, p, end, v.width! * 0.4, v.chargeSec!);
    return true;
  },
};
