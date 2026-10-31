/**
 * 마기역장 (헥타르, 버프). 공격 1회를 막는 보호막을 두른다. 지속시간은 버프 태그라 정신력으로 늘고,
 * 레벨이 오를수록 재생성 쿨타임이 줄어든다.
 * 각성 '벡터굴절역장'(태그 없음 → 정신력 보정 없음): 지속시간 동안 일반 탄막을 무효화한다
 * (근접·장판·보스 대형 레이저 제외 — 그런 공격은 refractable=false로 만든다). 막기 1회도 유지한다.
 */
import { makeShield } from '../systems/shield';
import { skillTags } from '../systems/tags';
import { levelRef } from './skillFx';
import type { SkillImpl } from './host';

export const magiField: SkillImpl = {
  cast(host, s) {
    const v = s.values;
    const awakened = s.owned.awakened;
    const duration = host.buffDuration(v.durationSec!, skillTags(s.def, awakened));
    const refract = awakened ? host.area(v.refractRadius!) : 0;
    host.setShield(makeShield(v.hits!, duration, refract), {
      blockInvulnSec: v.blockInvulnSec!,
      color: s.def.color,
      fxRadius: awakened ? refract : v.fxRadius!,
      look: awakened
        ? { body: s.def.sprites.loopA!, spawn: s.def.sprites.spawnA, end: s.def.sprites.endA, block: s.def.sprites.hexA, contact: s.def.sprites.contactA, deflect: s.def.sprites.deflectA }
        : { body: levelRef(s, 'shield') },
    });
    return true;
  },
};
