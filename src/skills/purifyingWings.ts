/**
 * 정화의 날개 (아크로, 물리·근접). 사거리 안의 가장 가까운 적에게 붉은 대검을 휘두른다.
 * 각성 '첫 사람의 날개': 개벽·역천·창세 3연격 + 출혈 중첩(출혈 공격 source는 물리·출혈).
 */
import { inArc } from '../systems/weapons';
import { skillTags } from '../systems/tags';
import type { SpriteRef } from '../types/data';
import { levelRef, playFx } from './skillFx';
import { nearestEnemy, type SkillCast, type SkillHost, type SkillImpl } from './host';

function slash(host: SkillHost, s: SkillCast, art: SpriteRef, damage: number, source: string, label?: string): void {
  const v = s.values;
  const origin = host.playerPos();
  const range = host.area(v.range!);
  const target = nearestEnemy(host, origin, range);
  const aim = host.aimDir();
  const angle = target ? Math.atan2(target.sprite.y - origin.y, target.sprite.x - origin.x) : Math.atan2(aim.y, aim.x);
  const tags = skillTags(s.def, s.owned.awakened, source);
  const sp = s.def.sprites;
  for (const e of [...host.enemies()]) {
    if (!inArc(origin, angle, v.arcDeg!, range, e.sprite, e.radius)) continue;
    const { x, y } = e.sprite;
    playFx(host.scene, sp.flash!, x, y);
    host.hit(e, damage, tags);
    if (s.owned.awakened && !e.dead) {
      host.bleed(e, v.bleedStacksPerHit!);
      playFx(host.scene, sp.bleedA!, x, y);
      playFx(host.scene, sp.markA!, x, y - e.radius, { fadeSec: 0.6 });
    }
  }
  // 그림 가운데가 몸, 호는 오른쪽(각도 0)으로 그려져 있다
  playFx(host.scene, art, origin.x, origin.y, { w: range * 2.2, rotation: angle });
  if (label) {
    const t = host.scene.add
      .text(origin.x + Math.cos(angle) * range * 0.6, origin.y + Math.sin(angle) * range * 0.6, label, {
        fontFamily: 'sans-serif',
        fontSize: '9px',
        color: '#ffffff',
        stroke: '#000000',
        strokeThickness: 2,
      })
      .setOrigin(0.5)
      .setDepth(7);
    host.fx(t, 0.4);
  }
}

export const purifyingWings: SkillImpl = {
  cast(host, s) {
    // 근접: 사거리 안에 적이 없으면 발동하지 않는다(쿨타임도 돌지 않음)
    if (!nearestEnemy(host, host.playerPos(), host.area(s.values.range!))) return false;
    if (!s.owned.awakened) {
      slash(host, s, levelRef(s, 'slash'), s.values.damage!, 'slash');
      return true;
    }
    const v = s.values;
    const hits = [v.hit1Damage!, v.hit2Damage!, v.hit3Damage!];
    hits.forEach((dmg, i) => {
      const label = host.ctx.t(`skill.purifyingWings.hit${i + 1}`);
      host.scene.time.delayedCall(i * v.hitDelaySec! * 1000, () => slash(host, s, s.def.sprites[`hit${i + 1}A`]!, dmg, 'awakenedSlash', label));
    });
    return true;
  },
};
