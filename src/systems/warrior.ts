/**
 * 전사 스킬 공식 (순수 함수). 수치는 skills.json, 여기는 계산만.
 */

/** 광란의 검격: 같은 적을 벤 횟수만큼 빨라진 간격 (가속 상한까지) */
export function frenzyInterval(baseSec: number, sameHits: number, perHit: number, cap: number): number {
  return baseSec * (1 - Math.min(cap, sameHits * perHit));
}

/** 소용돌이: 가진 다른 공격 스킬 하나마다 피해 +perSkill (상한 cap) */
export function whirlBonus(otherAttackSkills: number, perSkill: number, cap: number): number {
  return Math.min(cap, otherAttackSkills * perSkill);
}

/** 끓어오르는 심장: 공격마다 더하는 기본 피해 = 최대 체력 × 비율 (상한) */
export function heartFlatDamage(maxHp: number, ratio: number, cap: number): number {
  return Math.min(cap, maxHp * ratio);
}

/** 성역 오라: 잃은 체력 비율만큼 받는 피해 감소 (체력이 0에 가까울수록 최대) */
export function auraReduction(hpRatio: number, max: number): number {
  return max * (1 - Math.min(1, Math.max(0, hpRatio)));
}

/** 보호막: 피해를 먼저 흡수하고 남은 보호막과 남은 피해 */
export function absorbInto(shield: number, amount: number): { shield: number; left: number } {
  const used = Math.min(shield, amount);
  return { shield: shield - used, left: amount - used };
}
