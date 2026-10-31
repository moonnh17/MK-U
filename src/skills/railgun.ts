/**
 * 레일건 (헥타르, 기술·원거리). 조준 방향으로 직선 관통 사격을 한다(적이 없어도 마지막 조준 방향으로 쏜다).
 * 과충전이 없어 차징 태그는 없다.
 * 각성 '초전도 레일건': 관통한 적마다 전자기 파동(주변 피해), 마지막으로 관통한 적에서 최대 2명에게 연쇄한다.
 */
import type { Vec2 } from '../core/actions';
import type { Enemy } from '../entities/enemy';
import { skillTags } from '../systems/tags';
import { chainTargets, lineHits } from '../systems/targeting';
import { levelRef, playFx, stretchFx } from './skillFx';
import type { SkillImpl } from './host';

/** 판정 반폭에 대한 광선 그림 굵기, 연쇄 번개 굵기 */
const BEAM_THICK = 3;
const CHAIN_THICK = 10;

export const railgun: SkillImpl = {
  cast(host, s) {
    const v = s.values;
    const awakened = s.owned.awakened;
    const origin = host.playerPos();
    const dir = host.aimDir();
    const enemies: Enemy[] = [...host.enemies()];
    const pos = enemies.map((e) => ({ x: e.sprite.x, y: e.sprite.y, radius: e.radius }));
    const hits = lineHits(origin, dir, v.length!, v.halfWidth!, pos);

    const sp = s.def.sprites;
    const end = { x: origin.x + dir.x * v.length!, y: origin.y + dir.y * v.length! };
    const angle = Math.atan2(dir.y, dir.x);
    // 광선: 레벨마다 굵어진다 (원본 Lv1·3·5, 각성은 Lv5 광선 + 총구)
    stretchFx(host.scene, awakened ? s.def.sprites.beam3! : levelRef(s, 'beam'), origin, end, v.halfWidth! * BEAM_THICK);
    if (awakened) {
      playFx(host.scene, sp.chargeA!, origin.x, origin.y);
      playFx(host.scene, sp.muzzleA!, origin.x, origin.y, { rotation: angle, originX: 0 });
    } else if (s.owned.level >= 2) {
      // Lv3부터 충전 빛과 끝점 폭발·파동
      playFx(host.scene, sp.charge!, origin.x, origin.y);
      playFx(host.scene, sp.end!, end.x, end.y);
      playFx(host.scene, sp.wave!, end.x, end.y, { rotation: angle });
    }
    const rail = skillTags(s.def, awakened, 'rail');
    for (const i of hits) {
      playFx(host.scene, awakened ? sp.hitA! : sp.hit!, pos[i]!.x, pos[i]!.y);
      // Lv5(게임 Lv3)·각성: 분석 표식
      if (awakened || s.owned.level >= 3) playFx(host.scene, sp.mark!, pos[i]!.x, pos[i]!.y, { fadeSec: 0.5 });
      host.hit(enemies[i]!, v.damage!, rail);
    }
    if (!awakened || hits.length === 0) return true;

    // 전자기 파동: 관통한 적 둘레 (관통당한 적 자신은 제외)
    const hitSet = new Set(hits);
    const waveR = host.area(v.waveRadius!);
    const wave = skillTags(s.def, true, 'wave');
    for (const i of hits) {
      const c = pos[i]!;
      playFx(host.scene, sp.burstA!, c.x, c.y, { w: waveR * 2.2 });
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
      stretchFx(host.scene, sp.chainA!, from, pos[j]!, CHAIN_THICK);
      host.hit(enemies[j]!, v.chainDamage!, chain);
      from = pos[j]!;
    }
    return true;
  },
};
