/**
 * 마기역장 (헥타르, 버프). 공격 1회를 막는 보호막을 두른다(겹치지 않는다). 지속시간은 없고 포탈을 타면 초기화된다.
 * 레벨이 오를수록 재생성 쿨타임이 줄어든다.
 * 각성 '벡터굴절역장'(태그 없음 → 정신력 보정 없음): 보호막에 더해, 쓸 때마다 정해진 시간 동안 일반 탄막을 무효화한다
 * (근접·장판·보스 대형 레이저 제외 — 그런 공격은 refractable=false로 만든다).
 */
import { stackShield } from '../systems/shield';
import { levelRef } from './skillFx';
import type { SkillImpl } from './host';

export const magiField: SkillImpl = {
  cast(host, s) {
    const v = s.values;
    const awakened = s.owned.awakened;
    const now = host.shield();
    // 이미 두르고 있으면 쿨타임을 낭비하지 않는다 (각성은 굴절을 새로 켠다)
    if (!awakened && now && now.hits >= v.maxHits!) return false;
    const refract = awakened ? host.area(v.refractRadius!) : 0;
    host.setShield(stackShield(now, v.hits!, v.maxHits!, awakened ? v.durationSec! : 0, refract), {
      blockInvulnSec: v.blockInvulnSec!,
      color: s.def.color,
      fxRadius: awakened ? refract : v.fxRadius!,
      // 보호막 그림은 그린다. 겹을 알리던 둘레 원(테두리)만 없앴다
      look: awakened
        ? { body: s.def.sprites.loopA!, spawn: s.def.sprites.spawnA, end: s.def.sprites.endA, block: s.def.sprites.hexA, contact: s.def.sprites.contactA, deflect: s.def.sprites.deflectA }
        : { body: levelRef(s, 'shield') },
    });
    return true;
  },
};
