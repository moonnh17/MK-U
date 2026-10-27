/**
 * 레일건 (헥타르, 기술·원거리). 조준 방향으로 직선 관통 사격을 한다(적이 없어도 마지막 조준 방향으로 쏜다).
 * 과충전이 없어 차징 태그는 없다.
 * 각성 '초전도 레일건': 관통한 적마다 전자기 파동(주변 피해), 마지막으로 관통한 적에서 최대 2명에게 연쇄한다.
 */
import type { Vec2 } from '../core/actions';
import { hexColor } from '../core/scale';
import type { Enemy } from '../entities/enemy';
import { skillTags } from '../systems/tags';
import { chainTargets, lineHits } from '../systems/targeting';
import type { SkillCast, SkillHost, SkillImpl } from './host';

function bolt(host: SkillHost, s: SkillCast, a: Vec2, b: Vec2, width: number, alpha: number): void {
  const g = host.scene.add.graphics().setDepth(6);
  g.lineStyle(width, hexColor(s.def.color), alpha);
  g.lineBetween(a.x, a.y, b.x, b.y);
  g.lineStyle(Math.max(1, width / 3), 0xffffff, alpha);
  g.lineBetween(a.x, a.y, b.x, b.y);
  host.fx(g, 0.15);
}

export const railgun: SkillImpl = {
  cast(host, s) {
    const v = s.values;
    const awakened = s.owned.awakened;
    const origin = host.playerPos();
    const dir = host.aimDir();
    const enemies: Enemy[] = [...host.enemies()];
    const pos = enemies.map((e) => ({ x: e.sprite.x, y: e.sprite.y, radius: e.radius }));
    const hits = lineHits(origin, dir, v.length!, v.halfWidth!, pos);

    bolt(host, s, origin, { x: origin.x + dir.x * v.length!, y: origin.y + dir.y * v.length! }, v.halfWidth! * 2, 0.9);
    const rail = skillTags(s.def, awakened, 'rail');
    for (const i of hits) host.hit(enemies[i]!, v.damage!, rail);
    if (!awakened || hits.length === 0) return true;

    // 전자기 파동: 관통한 적 둘레 (관통당한 적 자신은 제외)
    const hitSet = new Set(hits);
    const waveR = host.area(v.waveRadius!);
    const wave = skillTags(s.def, true, 'wave');
    for (const i of hits) {
      const c = pos[i]!;
      host.fx(host.scene.add.circle(c.x, c.y, waveR, hexColor(s.def.color), 0.25).setDepth(6), 0.15);
      enemies.forEach((e, j) => {
        if (hitSet.has(j) || e.dead) return;
        if (Math.hypot(pos[j]!.x - c.x, pos[j]!.y - c.y) <= waveR + e.radius) host.hit(e, v.waveDamage!, wave);
      });
    }

    // 연쇄: 마지막으로 관통한 적에서 가까운 적으로
    const exclude = new Set([...hitSet, ...enemies.flatMap((e, j) => (e.dead ? [j] : []))]);
    const last = pos[hits[hits.length - 1]!]!;
    const chain = skillTags(s.def, true, 'chain');
    let from: Vec2 = last;
    for (const j of chainTargets(last, pos, v.chainCount!, v.chainRange!, exclude)) {
      bolt(host, s, from, pos[j]!, 2, 0.9);
      host.hit(enemies[j]!, v.chainDamage!, chain);
      from = pos[j]!;
    }
    return true;
  },
};
