/**
 * 실험 병기 (아크로, 기술·확률·원거리). 무작위 실험 결과를 발동한다.
 * 결과(=source): 폭발 · 탄막 · 연쇄 방전 · 공간 붕괴. 각 결과는 자기 source 태그로 피해를 주고,
 * 공간 붕괴만 공간격이다. 결과별 가중치는 데이터의 `{결과}Weight`.
 * 각성 전 대성공: 결과 위력 ×greatMultiplier. 각성 '판도라 장치': 2종 동시, 대성공이면 3종.
 */
import type { Vec2 } from '../core/actions';
import { pickResults, rollChance } from '../systems/acro';
import { skillTags } from '../systems/tags';
import { chainTargets } from '../systems/targeting';
import type { SpriteRef } from '../types/data';
import { Explosive } from './explosive';
import { shake } from '../entities/juice';
import { playFx, stretchFx } from './skillFx';
import { floatText, nearestEnemy, type SkillCast, type SkillHost, type SkillImpl } from './host';

const ID = 'experimentalWeapon';
const DISCHARGE_THICK = 12;

/** 목표 지점: 사거리 안 가장 가까운 적, 없으면 조준 방향 */
function aimPoint(host: SkillHost, range: number): Vec2 {
  const from = host.playerPos();
  const e = nearestEnemy(host, from, range);
  if (e) return { x: e.sprite.x, y: e.sprite.y };
  const aim = host.aimDir();
  return { x: from.x + aim.x * range * 0.5, y: from.y + aim.y * range * 0.5 };
}

/** 각성(판도라 장치)이면 전용 그림 */
function art(s: SkillCast, name: string): SpriteRef {
  return (s.owned.awakened ? s.def.sprites[`${name}A`] : undefined) ?? s.def.sprites[name]!;
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
        sprite: art(s, 'shell'),
        blasts: [art(s, 'blast'), art(s, 'shock')],
      }),
    );
  },
  barrage(host, s, mult) {
    const v = s.values;
    const from = host.playerPos();
    const n = v.barrageCount!;
    const tags = skillTags(s.def, s.owned.awakened, 'barrage');
    playFx(host.scene, art(s, 'burst'), from.x, from.y, { w: 44 });
    for (let i = 0; i < n; i++) host.fireBullet(from, (i * Math.PI * 2) / n, v.barrageSpeed!, v.range!, v.barrageDamage! * mult, tags, s.def.sprites.shell);
  },
  discharge(host, s, mult) {
    const v = s.values;
    const from = host.playerPos();
    const enemies = [...host.enemies()];
    const pos = enemies.map((e) => ({ x: e.sprite.x, y: e.sprite.y, radius: e.radius }));
    const tags = skillTags(s.def, s.owned.awakened, 'discharge');
    let at: Vec2 = from;
    for (const i of chainTargets(from, pos, v.dischargeCount!, v.dischargeRange!, new Set())) {
      stretchFx(host.scene, art(s, 'laser'), at, pos[i]!, DISCHARGE_THICK);
      playFx(host.scene, s.def.sprites.flash!, pos[i]!.x, pos[i]!.y);
      host.burst(pos[i]!, s.def.color);
      host.hit(enemies[i]!, v.dischargeDamage! * mult, tags);
      at = pos[i]!;
    }
  },
  collapse(host, s, mult) {
    const v = s.values;
    const c = aimPoint(host, v.range!);
    const r = host.area(v.collapseRadius!);
    playFx(host.scene, art(s, 'pull'), c.x, c.y, { w: r * 3, depth: 5 });
    playFx(host.scene, art(s, 'slice'), c.x, c.y, { w: r * 2.6 });
    host.burst(c, s.def.color);
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
    // 발동 순간: 몸에서 빛 입자가 터지고 화면이 흔들린다
    host.burst(p, s.def.color);
    playFx(host.scene, s.def.sprites.flash!, p.x, p.y, { w: 34 });
    shake(host.scene, great ? 'medium' : 'light');
    picks.forEach((id, i) => {
      floatText(host, p.x, p.y - 10 + i * 9, host.ctx.t(`skill.experimentalWeapon.result.${id}`), s.def.color);
      RESULTS[id]?.(host, s, mult);
    });
    return true;
  },
};

/** 실험 결과 id 목록 (데이터 검증·테스트용) */
export const EXPERIMENT_RESULTS = Object.keys(RESULTS);
