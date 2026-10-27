/**
 * 실험 병기 (아크로, 기술·확률·원거리). 무작위 실험 결과를 발동한다.
 * 결과(=source): 폭발 · 탄막 · 연쇄 방전 · 공간 붕괴. 각 결과는 자기 source 태그로 피해를 주고,
 * 공간 붕괴만 공간격이다. 결과별 가중치는 데이터의 `{결과}Weight`.
 * 각성 전 대성공: 결과 위력 ×greatMultiplier. 각성 '판도라 장치': 2종 동시, 대성공이면 3종.
 */
import type { Vec2 } from '../core/actions';
import { hexColor } from '../core/scale';
import { pickResults, rollChance } from '../systems/acro';
import { skillTags } from '../systems/tags';
import { chainTargets } from '../systems/targeting';
import { Explosive } from './explosive';
import { floatText, nearestEnemy, type SkillCast, type SkillHost, type SkillImpl } from './host';

const ID = 'experimentalWeapon';

/** 목표 지점: 사거리 안 가장 가까운 적, 없으면 조준 방향 */
function aimPoint(host: SkillHost, range: number): Vec2 {
  const from = host.playerPos();
  const e = nearestEnemy(host, from, range);
  if (e) return { x: e.sprite.x, y: e.sprite.y };
  const aim = host.aimDir();
  return { x: from.x + aim.x * range * 0.5, y: from.y + aim.y * range * 0.5 };
}

const RESULTS: Record<string, (host: SkillHost, s: SkillCast, mult: number) => void> = {
  explosion(host, s, mult) {
    const v = s.values;
    host.addObject(
      new Explosive(host, {
        owner: `${ID}.shell`,
        from: host.playerPos(),
        to: aimPoint(host, v.range!),
        speed: v.explosionSpeed!,
        radius: host.area(v.explosionRadius!),
        base: v.explosionDamage! * mult,
        tags: skillTags(s.def, s.owned.awakened, 'explosion'),
        sprite: s.def.sprites.shell!,
      }),
    );
  },
  barrage(host, s, mult) {
    const v = s.values;
    const from = host.playerPos();
    const n = v.barrageCount!;
    const tags = skillTags(s.def, s.owned.awakened, 'barrage');
    for (let i = 0; i < n; i++) host.fireBullet(from, (i * Math.PI * 2) / n, v.barrageSpeed!, v.range!, v.barrageDamage! * mult, tags);
  },
  discharge(host, s, mult) {
    const v = s.values;
    const from = host.playerPos();
    const enemies = [...host.enemies()];
    const pos = enemies.map((e) => ({ x: e.sprite.x, y: e.sprite.y, radius: e.radius }));
    const tags = skillTags(s.def, s.owned.awakened, 'discharge');
    let at: Vec2 = from;
    for (const i of chainTargets(from, pos, v.dischargeCount!, v.dischargeRange!, new Set())) {
      const g = host.scene.add.graphics().setDepth(6);
      g.lineStyle(2, hexColor(s.def.color), 0.9);
      g.lineBetween(at.x, at.y, pos[i]!.x, pos[i]!.y);
      host.fx(g, 0.15);
      host.hit(enemies[i]!, v.dischargeDamage! * mult, tags);
      at = pos[i]!;
    }
  },
  collapse(host, s, mult) {
    const v = s.values;
    const c = aimPoint(host, v.range!);
    const r = host.area(v.collapseRadius!);
    host.fx(host.scene.add.circle(c.x, c.y, r, 0x000000, 0.7).setStrokeStyle(1, hexColor(s.def.color)).setDepth(6), 0.3);
    const tags = skillTags(s.def, s.owned.awakened, 'collapse');
    for (const e of [...host.enemies()]) {
      if (Math.hypot(e.sprite.x - c.x, e.sprite.y - c.y) <= r + e.radius) host.hit(e, v.collapseDamage! * mult, tags);
    }
  },
};

export const experimentalWeapon: SkillImpl = {
  cast(host, s) {
    const v = s.values;
    const great = rollChance(host.rng, host.chance(v.greatChance!, 'greatSuccess', skillTags(s.def, s.owned.awakened)));
    const weights: Record<string, number> = {};
    for (const id of Object.keys(s.def.sources)) weights[id] = v[`${id}Weight`] ?? 0;
    const picks = pickResults(host.rng, weights, great ? v.greatResults! : v.results!);
    const mult = great ? v.greatMultiplier! : 1;
    const p = host.playerPos();
    if (great) {
      floatText(host, p.x, p.y - 20, host.ctx.t('skillMsg.greatSuccess'), '#ffd23f');
      host.greatSuccess();
    }
    picks.forEach((id, i) => {
      floatText(host, p.x, p.y - 10 + i * 9, host.ctx.t(`skill.experimentalWeapon.result.${id}`), s.def.color);
      RESULTS[id]?.(host, s, mult);
    });
    return true;
  },
};

/** 실험 결과 id 목록 (데이터 검증·테스트용) */
export const EXPERIMENT_RESULTS = Object.keys(RESULTS);
