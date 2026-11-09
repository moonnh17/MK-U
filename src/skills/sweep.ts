/**
 * 휩쓸기 (전사 전직 전 기본 궁극기, 물리·근접). 검으로 둘레를 크게 휩쓸어 반경 안의 모든 적을 베고 밀쳐 낸다.
 * 적이 없어도 쓸 수 있다.
 */
import { playFx } from './skillFx';
import { enemiesWithin } from './timed';
import type { UltimateImpl } from './host';

export const sweep: UltimateImpl = {
  cast(host, { def, values: v }) {
    const at = host.playerPos();
    const r = host.area(v.radius!);
    const aim = host.aimDir();
    // 조준 방향부터 네 번 이어 휘둘러 한 바퀴를 덮는다
    const a0 = Math.atan2(aim.y, aim.x);
    for (let i = 0; i < 4; i++) host.scene.time.delayedCall(i * 60, () => playFx(host.scene, def.sprites.sweep!, at.x, at.y, { w: r * 2.2, rotation: a0 + (i * Math.PI) / 2, depth: 5 }));
    for (const e of enemiesWithin(host, at, r)) {
      const dx = e.sprite.x - at.x;
      const dy = e.sprite.y - at.y;
      const d = Math.hypot(dx, dy) || 1;
      host.hit(e, v.damage!, def.sources.sweep!);
      if (!e.dead) e.knockback({ x: dx / d, y: dy / d }, v.knockback!, 0.15);
    }
    host.hitStop?.(0.05);
    return true;
  },
};
