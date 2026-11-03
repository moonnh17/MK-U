/**
 * 환원주의자 (아크로 패시브, 버프). 장착하면 적을 처치할 때 체력을 회복한다.
 * 각성 '제1원리': 처치하면 기초 단위만큼 회복하고, 최대 체력을 넘는 양은 정신력을 회복한다.
 */
import type { SpriteRef } from '../types/data';
import { playFx } from './skillFx';
import type { PassiveImpl, SkillCast, SkillHost, SkillObject } from './host';

const ID = 'reductionist';

class Reductionist implements SkillObject {
  readonly owner = ID;
  readonly createdAt: number;

  constructor(
    host: SkillHost,
    private readonly s: SkillCast,
  ) {
    this.createdAt = host.scene.time.now;
  }

  update(): boolean {
    return true;
  }

  onKill(host: SkillHost): void {
    const v = this.s.values;
    if (this.s.owned.awakened) {
      host.heal(v.basicUnit!, true);
      this.smoke(host, this.s.def.sprites.unit!);
    } else {
      host.heal(v.killHeal!, false);
      this.smoke(host, this.s.def.sprites.smoke!);
    }
  }

  private smoke(host: SkillHost, ref: SpriteRef): void {
    const p = host.playerPos();
    playFx(host.scene, ref, p.x, p.y - 4, { fadeSec: 0.5, depth: 5 });
  }

  destroy(): void {}
}

export const reductionist: PassiveImpl = {
  activate(host, s) {
    host.addObject(new Reductionist(host, s));
  },
};
