/**
 * 환원주의자 (아크로 패시브, 버프). 장착하면 적을 공격할 때(짧은 간격마다)·처치할 때 체력을 회복한다.
 * 회복량은 정신력으로 늘지 않는다(버프 태그는 시간제 버프 지속에만).
 * 각성 '제1원리': 준 피해의 일부를 흡혈하고, 처치하면 기초 단위만큼 회복한다.
 * 기초 단위로 최대 체력을 넘는 양은 보호막이 된다(보호막 최대치는 장착 중에만 늘어남).
 */
import type { PassiveImpl, SkillCast, SkillHost, SkillObject } from './host';

const ID = 'reductionist';

class Reductionist implements SkillObject {
  readonly owner = ID;
  readonly createdAt: number;
  private hitTimer = 0;

  constructor(
    host: SkillHost,
    private readonly s: SkillCast,
  ) {
    this.createdAt = host.scene.time.now;
  }

  update(dt: number): boolean {
    this.hitTimer -= dt;
    return true;
  }

  onDamageDealt(host: SkillHost, amount: number): void {
    const v = this.s.values;
    if (amount <= 0) return;
    if (this.s.owned.awakened) {
      host.heal(amount * v.lifesteal!, false);
      return;
    }
    if (this.hitTimer > 0) return;
    host.heal(v.hitHeal!, false);
    this.hitTimer = v.hitHealIntervalSec!;
  }

  onKill(host: SkillHost): void {
    const v = this.s.values;
    if (this.s.owned.awakened) host.heal(v.basicUnit!, true);
    else host.heal(v.killHeal!, false);
  }

  destroy(): void {}
}

export const reductionist: PassiveImpl = {
  activate(host, s) {
    host.addObject(new Reductionist(host, s));
  },
};
