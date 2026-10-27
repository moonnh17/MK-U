/**
 * 열역학 제1법칙 (전직 전 기본 궁극기, 기술·원거리).
 * 마기 입자를 만들어 가장 가까운 적에게 던지고, 닿으면 폭발해 범위 피해를 준다.
 * 적이 없으면 마지막 조준 방향으로 사거리만큼 던진다.
 */
import { Explosive } from './explosive';
import { nearestEnemy, type UltimateImpl } from './host';

export const firstLaw: UltimateImpl = {
  cast(host, { def, values: v }) {
    const from = host.playerPos();
    const target = nearestEnemy(host, from, v.range!);
    const aim = host.aimDir();
    const to = target ? { x: target.sprite.x, y: target.sprite.y } : { x: from.x + aim.x * v.range!, y: from.y + aim.y * v.range! };
    host.addObject(
      new Explosive(host, {
        owner: def.id,
        from,
        to,
        speed: v.projectileSpeed!,
        radius: host.area(v.radius!),
        base: v.damage!,
        tags: def.sources.explosion!,
        sprite: def.sprites.particle!,
      }),
    );
    return true;
  },
};
