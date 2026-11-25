/**
 * 기본적 마기 운용 (마기법사 전직 전 기본 궁극기, 마법·원거리).
 * 둘레의 가까운 적 최대 maxTargets명에게 광선을 하나씩 쏘고, 맞은 적은 잠시 뒤 폭발해 둘레에 피해를 준다.
 * 적이 없으면 조준 방향부터 고르게 나눈 방향으로 광선만 뻗는다.
 */
import { shake } from '../entities/juice';
import { playFx, sparks, stretchFx } from './skillFx';
import type { UltimateImpl } from './host';

export const magiOperation: UltimateImpl = {
  cast(host, { def, values: v }) {
    const p = host.playerPos();
    const range = v.range!;
    const targets = [...host.enemies()]
      .filter((e) => !e.dead && Math.hypot(e.sprite.x - p.x, e.sprite.y - p.y) <= range + e.radius)
      .sort((a, b) => Math.hypot(a.sprite.x - p.x, a.sprite.y - p.y) - Math.hypot(b.sprite.x - p.x, b.sprite.y - p.y))
      .slice(0, v.maxTargets!);
    if (targets.length === 0) {
      const aim = Math.atan2(host.aimDir().y, host.aimDir().x);
      for (let i = 0; i < v.maxTargets!; i++) {
        const a = aim + (i * Math.PI * 2) / v.maxTargets!;
        stretchFx(host.scene, def.sprites.beam!, p, { x: p.x + Math.cos(a) * range, y: p.y + Math.sin(a) * range }, v.beamWidth!, 0.25);
      }
      return true;
    }
    targets.forEach((e, i) => {
      host.scene.time.delayedCall(i * v.beamGapSec! * 1000, () => {
        if (e.dead) return;
        const from = host.playerPos();
        const at = { x: e.sprite.x, y: e.sprite.y };
        stretchFx(host.scene, def.sprites.beam!, from, at, v.beamWidth!, 0.25);
        sparks(host.scene, at.x, at.y, def.color, host.ctx.data.juice.projectileLook, 1);
        host.hit(e, v.beamDamage!, def.sources.beam!);
        host.scene.time.delayedCall(v.blastDelaySec! * 1000, () => {
          const c = e.dead ? at : { x: e.sprite.x, y: e.sprite.y };
          const r = host.area(v.radius!);
          playFx(host.scene, def.sprites.blast!, c.x, c.y, { w: r * 2.2 }).setBlendMode('ADD');
          shake(host.scene, 'light');
          for (const o of [...host.enemies()]) if (Math.hypot(o.sprite.x - c.x, o.sprite.y - c.y) <= r + o.radius) host.hit(o, v.blastDamage!, def.sources.blast!);
        });
      });
    });
    return true;
  },
};
