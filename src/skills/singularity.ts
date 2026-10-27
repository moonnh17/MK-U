/**
 * 특이점 실험 (아크로 학파 궁극기, 기술·확률·원거리).
 * 붉은 특이점이 주변 적(보스 제외)을 끌어당긴 뒤 결과 하나가 일어난다:
 * 붕괴(공간격 폭발) · 증식(자폭 실험체) · 변질(끌려온 적 전원) · 과부하(큰 폭발) · 대실패(약한 폭발 + 플레이어도 피해).
 * 대성공(확률 태그, 상한 60%)이면 대실패가 나오지 않고 위력 ×1.5.
 * 각성 '특이점 실험 : 역설': 관측 시간 동안 표식 적에게 준 실제 피해를 기록했다가 인과 역전으로 재현한다.
 * 일부(기본) · 상당 부분(실험 성공) · 전부(대성공, 공간격). 재현 피해는 다시 기록되지 않는다.
 */
import type Phaser from 'phaser';
import type { Vec2 } from '../core/actions';
import { hexColor } from '../core/scale';
import type { Enemy } from '../entities/enemy';
import { pickResults, rollChance } from '../systems/acro';
import { paradoxRatio } from '../systems/advancement';
import { findSkill, skillValues } from '../systems/skills';
import { floatText, nearestEnemy, type BuffView, type SkillHost, type SkillObject, type UltimateCast, type UltimateImpl } from './host';
import { spawnSubjects } from './unstableSubject';

const ID = 'singularity';
const RESULTS = ['collapse', 'proliferate', 'corrupt', 'overload', 'failure'] as const;

function isBoss(e: Enemy): boolean {
  return e.rank === 'boss' || e.rank === 'hiddenBoss';
}

function blast(host: SkillHost, u: UltimateCast, at: Vec2, radius: number, damage: number, source: string): void {
  host.fx(host.scene.add.circle(at.x, at.y, radius, hexColor(u.def.color), 0.45).setDepth(6), 0.25);
  for (const e of [...host.enemies()]) {
    if (Math.hypot(e.sprite.x - at.x, e.sprite.y - at.y) <= radius + e.radius) host.hit(e, damage, u.def.sources[source]!);
  }
}

class Singularity implements SkillObject {
  readonly owner = ID;
  readonly createdAt: number;
  private readonly core: Phaser.GameObjects.Image;
  private t = 0;

  constructor(
    host: SkillHost,
    private readonly u: UltimateCast,
    private readonly at: Vec2,
  ) {
    this.createdAt = host.scene.time.now;
    this.core = host.sprite(at.x, at.y, u.def.sprites.core!).setDepth(5);
  }

  update(dt: number, host: SkillHost): boolean {
    const v = this.u.values;
    this.t += dt;
    this.core.setScale(1 + this.t * 1.5).setRotation(this.t * 6);
    const r = host.area(v.pullRadius!);
    if (this.t < v.pullSec!) {
      for (const e of host.enemies()) {
        if (isBoss(e)) continue;
        const dx = this.at.x - e.sprite.x;
        const dy = this.at.y - e.sprite.y;
        const d = Math.hypot(dx, dy);
        if (d > r + e.radius || d < 2) continue;
        e.sprite.setVelocity((dx / d) * v.pullSpeed!, (dy / d) * v.pullSpeed!);
      }
      return true;
    }
    this.resolve(host);
    return false;
  }

  private resolve(host: SkillHost): void {
    const u = this.u;
    const v = u.values;
    const great = rollChance(host.rng, host.chance(v.greatChance!, 'greatSuccess', u.def.tags));
    const mult = great ? v.greatMultiplier! : 1;
    const weights: Record<string, number> = {};
    for (const id of RESULTS) weights[id] = (great || host.noGreatFailure()) && id === 'failure' ? 0 : (v[`${id}Weight`] ?? 0);
    const result = pickResults(host.rng, weights, 1)[0]!;
    if (great) floatText(host, this.at.x, this.at.y - 18, host.ctx.t('skillMsg.greatSuccess'), '#ffd23f');
    floatText(host, this.at.x, this.at.y - 8, host.ctx.t(`ultimate.singularity.result.${result}`), u.def.color);

    if (result === 'collapse') {
      blast(host, u, this.at, host.area(v.collapseRadius!), v.collapseDamage! * mult, 'collapse');
    } else if (result === 'overload') {
      blast(host, u, this.at, host.area(v.overloadRadius!), v.overloadDamage! * mult, 'overload');
    } else if (result === 'failure') {
      blast(host, u, this.at, host.area(v.failureRadius!), v.failureDamage!, 'failure');
      host.hurtSelf(v.failureSelfDamage!);
    } else if (result === 'corrupt') {
      const r = host.area(v.pullRadius!);
      host.fx(host.scene.add.circle(this.at.x, this.at.y, r, hexColor(host.ctx.data.ui.corruptionColor), 0.3).setDepth(6), 0.3);
      for (const e of host.enemies()) {
        if (Math.hypot(e.sprite.x - this.at.x, e.sprite.y - this.at.y) > r + e.radius) continue;
        host.corrupt(e, {
          leftSec: v.corruptSec!,
          vulnerability: v.corruptVulnerability! * mult,
          burstDamage: v.corruptBurstDamage!,
          burstRadius: host.area(v.corruptBurstRadius!),
          burstTags: u.def.sources.corrupt!,
        });
      }
    } else {
      // 증식: 자폭 실험체 (가진 불안정 실험체 레벨, 없으면 Lv1 수치)
      const def = findSkill(host.ctx.data.skills, 'unstableSubject');
      const owned = host.ctx.session?.player.loadout.owned.unstableSubject ?? { level: 1, awakened: false, order: 0 };
      const cast = { def, owned: { ...owned, awakened: false }, values: skillValues(def, { level: owned.level, awakened: false }).values };
      spawnSubjects(host, cast, this.at, Math.round(v.proliferateCount! * mult), 'blast');
    }
  }

  destroy(): void {
    this.core.destroy();
  }
}

/** 역설: 표식 적에게 준 실제 피해를 관측 시간 동안 기록 → 재현 */
class Paradox implements SkillObject {
  readonly owner = ID;
  readonly createdAt: number;
  private left: number;
  private readonly recorded = new Map<Enemy, number>();
  private readonly marks = new Map<Enemy, Phaser.GameObjects.Arc>();

  constructor(
    host: SkillHost,
    private readonly u: UltimateCast,
    at: Vec2,
  ) {
    this.createdAt = host.scene.time.now;
    const v = u.values;
    this.left = v.observeSec!;
    const r = host.area(v.observeRadius!);
    host.fx(host.scene.add.circle(at.x, at.y, r, hexColor(u.def.color), 0.2).setDepth(6), 0.4);
    for (const e of host.enemies()) {
      if (Math.hypot(e.sprite.x - at.x, e.sprite.y - at.y) > r + e.radius) continue;
      this.recorded.set(e, 0);
      this.marks.set(e, host.scene.add.circle(e.sprite.x, e.sprite.y, e.radius + 3).setStrokeStyle(1, hexColor(u.def.color), 0.9).setDepth(5));
    }
    floatText(host, at.x, at.y - 8, host.ctx.t('ultimate.singularity.observe'), u.def.color);
  }

  onDamageDealt(_host: SkillHost, amount: number, enemy: Enemy): void {
    // 관측 중에만 기록 (재현은 관측이 끝난 뒤라 기록되지 않는다)
    if (this.left > 0 && this.recorded.has(enemy)) this.recorded.set(enemy, this.recorded.get(enemy)! + amount);
  }

  update(dt: number, host: SkillHost): boolean {
    this.left -= dt;
    for (const [e, m] of this.marks) {
      if (e.dead) m.setVisible(false);
      else m.setPosition(e.sprite.x, e.sprite.y);
    }
    if (this.left > 0) return true;
    this.replay(host);
    return false;
  }

  private replay(host: SkillHost): void {
    const v = this.u.values;
    const tags = this.u.def.tags;
    const success = rollChance(host.rng, host.chance(v.successChance!, 'success', tags));
    const great = rollChance(host.rng, host.chance(v.greatChance!, 'greatSuccess', tags));
    const ratio = paradoxRatio(success, great, { partial: v.partialRatio!, major: v.majorRatio!, full: v.fullRatio! });
    const key = great ? 'full' : success ? 'major' : 'partial';
    const p = host.playerPos();
    floatText(host, p.x, p.y - 14, host.ctx.t(`ultimate.singularity.replay.${key}`), great ? '#ffd23f' : this.u.def.color, 1);
    for (const [e, dmg] of this.recorded) {
      if (e.dead || dmg <= 0) continue;
      host.fx(host.scene.add.circle(e.sprite.x, e.sprite.y, e.radius + 4, hexColor(this.u.def.color), 0.6).setDepth(6), 0.25);
      // 대성공만 공간격
      host.hitTrue(e, dmg * ratio, great);
    }
  }

  buff(host: SkillHost): BuffView | null {
    if (this.left <= 0) return null;
    return { id: ID, label: host.ctx.t('ultimate.singularity.observe'), color: this.u.def.color, leftSec: this.left, totalSec: this.u.values.observeSec! };
  }

  destroy(): void {
    for (const m of this.marks.values()) m.destroy();
  }
}

export const singularity: UltimateImpl = {
  cast(host, u) {
    const v = u.values;
    const from = host.playerPos();
    const e = nearestEnemy(host, from, v.range!);
    const aim = host.aimDir();
    const at = e ? { x: e.sprite.x, y: e.sprite.y } : { x: from.x + aim.x * v.range! * 0.5, y: from.y + aim.y * v.range! * 0.5 };
    host.addObject(u.awakened ? new Paradox(host, u, at) : new Singularity(host, u, at));
    return true;
  },
};
