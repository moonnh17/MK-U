/**
 * 보스전 에너지 (순수 함수): 보스 체력이 일정 비율씩 줄 때마다 에너지 구슬을 준다.
 * 이번에 넘은 경계 수 × 구슬 수. 처치 순간(0 경계)은 처치 보상이 따로 있으니 세지 않는다.
 */
export interface BossEnergyRule {
  everyHpRatio: number;
  orbs: number;
}

export function bossOrbDrops(prevRatio: number, ratio: number, r: BossEnergyRule): number {
  if (ratio >= prevRatio) return 0;
  const steps = (v: number) => Math.ceil(v / r.everyHpRatio - 1e-9);
  const crossed = steps(prevRatio) - Math.max(steps(ratio), 1);
  return Math.max(0, crossed) * r.orbs;
}
