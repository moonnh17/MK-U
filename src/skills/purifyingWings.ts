/**
 * 정화의 날개 (아크로, 물리·근접). 사거리 안의 가장 가까운 적에게 붉은 대검을 휘두른다.
 * 각성 '첫 사람의 날개': 개벽·역천·창세 3연격 + 출혈 중첩(출혈 공격 source는 물리·출혈).
 */
import { hexColor } from '../core/scale';
import { inArc } from '../systems/weapons';
import { skillTags } from '../systems/tags';
import { nearestEnemy, type SkillCast, type SkillHost, type SkillImpl } from './host';

function slash(host: SkillHost, s: SkillCast, damage: number, source: string, label?: string): void {
  const v = s.values;
  const origin = host.playerPos();
  const range = host.area(v.range!);
  const target = nearestEnemy(host, origin, range);
  const aim = host.aimDir();
  const angle = target ? Math.atan2(target.sprite.y - origin.y, target.sprite.x - origin.x) : Math.atan2(aim.y, aim.x);
  const tags = skillTags(s.def, s.owned.awakened, source);
  for (const e of [...host.enemies()]) {
    if (!inArc(origin, angle, v.arcDeg!, range, e.sprite, e.radius)) continue;
    host.hit(e, damage, tags);
    if (s.owned.awakened && !e.dead) host.bleed(e, v.bleedDamage!, v.bleedStacksPerHit!, skillTags(s.def, true, 'bleed'));
  }

  const half = (v.arcDeg! * Math.PI) / 360;
  const g = host.scene.add.graphics().setDepth(6);
  g.fillStyle(hexColor(s.def.color), 0.55);
  g.slice(origin.x, origin.y, range, angle - half, angle + half, false);
  g.fillPath();
  host.fx(g);
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
      slash(host, s, s.values.damage!, 'slash');
      return true;
    }
    const v = s.values;
    const hits = [v.hit1Damage!, v.hit2Damage!, v.hit3Damage!];
    hits.forEach((dmg, i) => {
      const label = host.ctx.t(`skill.purifyingWings.hit${i + 1}`);
      host.scene.time.delayedCall(i * v.hitDelaySec! * 1000, () => slash(host, s, dmg, 'awakenedSlash', label));
    });
    return true;
  },
};
