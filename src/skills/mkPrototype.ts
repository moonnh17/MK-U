/**
 * MK : 프로토타입 (아크로, 버프·근접). 사거리 안에 적이 있어야 쓸 수 있다.
 * 지속시간(버프 태그: 정신력) 동안 슈트를 입는다: 이동속도 증가, 받는 피해 감소,
 * 사거리 안 가장 가까운 적을 자동 펀치(물리·근접).
 * 각성 'MK : 오버드라이브': 쓸 때 현재 체력 일부를 소모(죽지 않음). 펀치가 주변까지 터지는 폭발 펀치가 되고,
 * 펀치 사거리 밖 적에게는 짧게 돌진한다(돌진에 닿은 적도 피해, 물리·근접).
 */
import type Phaser from 'phaser';
import { hexColor } from '../core/scale';
import type { Enemy } from '../entities/enemy';
import { skillTags } from '../systems/tags';
import type { PlayerMods } from '../systems/vitals';
import { nearestEnemy, trimOldest, type BuffView, type SkillCast, type SkillHost, type SkillImpl, type SkillObject } from './host';

const ID = 'mkPrototype';

class Suit implements SkillObject {
  readonly owner = ID;
  readonly createdAt: number;
  private readonly ring: Phaser.GameObjects.Arc;
  private left: number;
  private punchTimer = 0;
  private dashTimer = 0;
  private dashing = 0;
  private readonly dashHit = new Set<Enemy>();

  constructor(
    host: SkillHost,
    private readonly s: SkillCast,
    private readonly total: number,
  ) {
    this.createdAt = host.scene.time.now;
    this.left = total;
    const p = host.playerPos();
    this.ring = host.scene.add
      .circle(p.x, p.y, s.values.fxRadius!)
      .setStrokeStyle(s.owned.awakened ? 3 : 2, hexColor(s.def.color), 0.9)
      .setDepth(5);
  }

  playerMods(): Partial<PlayerMods> {
    return { moveSpeed: this.s.values.moveSpeed!, damageReduction: this.s.values.damageReduction! };
  }

  update(dt: number, host: SkillHost): boolean {
    this.left -= dt;
    if (this.left <= 0) return false;
    const v = this.s.values;
    const p = host.playerPos();
    this.ring.setPosition(p.x, p.y);
    this.punchTimer -= dt;
    this.dashTimer -= dt;

    if (this.dashing > 0) {
      this.dashing -= dt;
      const tags = skillTags(this.s.def, true, 'dash');
      for (const e of [...host.enemies()]) {
        if (this.dashHit.has(e) || Math.hypot(e.sprite.x - p.x, e.sprite.y - p.y) > e.radius + v.fxRadius!) continue;
        this.dashHit.add(e);
        host.hit(e, v.dashDamage!, tags);
      }
      return true;
    }

    const target = nearestEnemy(host, p, host.area(v.range!));
    if (target && this.punchTimer <= 0) {
      this.punch(host, target);
      this.punchTimer = v.punchIntervalSec!;
    } else if (!target && this.s.owned.awakened && this.dashTimer <= 0) {
      const far = nearestEnemy(host, p, v.dashRange!);
      if (far) {
        const dx = far.sprite.x - p.x;
        const dy = far.sprite.y - p.y;
        const d = Math.hypot(dx, dy) || 1;
        host.dash({ x: dx / d, y: dy / d }, v.dashSpeed!, v.dashSec!);
        this.dashing = v.dashSec!;
        this.dashHit.clear();
        this.dashTimer = v.dashCooldownSec!;
      }
    }
    return true;
  }

  private punch(host: SkillHost, target: Enemy): void {
    const v = this.s.values;
    const tags = skillTags(this.s.def, this.s.owned.awakened, 'punch');
    const c = { x: target.sprite.x, y: target.sprite.y };
    if (!this.s.owned.awakened) {
      host.fx(host.scene.add.circle(c.x, c.y, target.radius + 2, hexColor(this.s.def.color), 0.6).setDepth(6));
      host.hit(target, v.punchDamage!, tags);
      return;
    }
    // 폭발 펀치: 맞은 적 둘레까지
    const r = host.area(v.blastRadius!);
    host.fx(host.scene.add.circle(c.x, c.y, r, hexColor(this.s.def.color), 0.45).setDepth(6), 0.15);
    for (const e of [...host.enemies()]) {
      if (Math.hypot(e.sprite.x - c.x, e.sprite.y - c.y) <= r + e.radius) host.hit(e, v.punchDamage!, tags);
    }
  }

  buff(host: SkillHost): BuffView {
    const key = this.s.owned.awakened ? 'buff.mkPrototype.overdrive' : 'buff.mkPrototype';
    return { id: ID, label: host.ctx.t(key), color: this.s.def.color, leftSec: this.left, totalSec: this.total };
  }

  destroy(): void {
    this.ring.destroy();
  }
}

export const mkPrototype: SkillImpl = {
  cast(host, s) {
    const v = s.values;
    if (s.owned.awakened) host.payHp(v.hpCost!);
    // 다시 입으면 새 슈트로
    trimOldest(host, ID, 0);
    host.addObject(new Suit(host, s, host.buffDuration(v.durationSec!, skillTags(s.def, s.owned.awakened))));
    return true;
  },
};
