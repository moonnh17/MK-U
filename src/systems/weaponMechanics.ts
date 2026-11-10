/**
 * 특수 무기 규칙 (순수 함수): 공간봉합침 연결 순서, 환국의 잔명 충전, 야시장 복제총 에너지·폭발, 체납자의 의수 징수.
 */
import type { Vec2 } from '../core/actions';
import type { Rng } from '../core/rng';

/**
 * 공간봉합침: 가장 오래된 침에서 시작해 아직 잇지 않은 침 중 가장 가까운 것으로 차례로 잇는다.
 * 돌려주는 값은 points의 번호 쌍 (선 하나 = [a, b])
 */
export function needleLinks(points: readonly Vec2[]): [number, number][] {
  if (points.length < 2) return [];
  const left = new Set(points.map((_, i) => i));
  let at = 0;
  left.delete(0);
  const out: [number, number][] = [];
  while (left.size > 0) {
    let best = -1;
    let bestD = Infinity;
    for (const i of left) {
      const d = Math.hypot(points[i]!.x - points[at]!.x, points[i]!.y - points[at]!.y);
      if (d < bestD) {
        best = i;
        bestD = d;
      }
    }
    if (best < 0) break; // 좌표가 NaN이면 아무것도 못 고른다: 무한 루프 방지
    out.push([at, best]);
    left.delete(best);
    at = best;
  }
  return out;
}

/** 환국의 잔명: 이번 사격이 강화 사격인가 */
export function beamEmpowered(stacks: number, max: number): boolean {
  return stacks >= max;
}

/**
 * 환국의 잔명: 사격 한 번 뒤 충전. 강화 사격이면 0으로 (그 사격은 충전에 들어가지 않는다),
 * 아니면 적을 맞혔을 때만 1 (관통으로 여럿 맞혀도 1)
 */
export function beamStacksAfter(stacks: number, max: number, hit: boolean): number {
  if (beamEmpowered(stacks, max)) return 0;
  return hit ? Math.min(max, stacks + 1) : stacks;
}

/** 야시장 복제총: 이번 공격의 에너지 소모 (기본 × [min, max], 소수 둘째 자리) */
export function rolledEnergyCost(rng: Rng, base: number, range: readonly [number, number]): number {
  return Math.round(base * rng.range(range[0], range[1]) * 100) / 100;
}

/** 체납자의 의수: 공격마다 징수. 낼 수 있으면 coins를 빼고 paid */
export function collectDebt(coins: number, cost: number): { coins: number; paid: boolean } {
  return coins >= cost ? { coins: coins - cost, paid: true } : { coins, paid: false };
}
