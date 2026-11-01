/**
 * 스킬 조준·목표 선택 (순수 함수). 반물질포·레일건·전투 드론이 쓴다.
 * 결과는 입력 배열의 인덱스로 돌려준다.
 */
import type { Vec2 } from '../core/actions';

/** 총구 자리: 손에서 조준 방향으로 length만큼 */
export function muzzlePoint(hand: Vec2, dir: Vec2, length: number): Vec2 {
  return { x: hand.x + dir.x * length, y: hand.y + dir.y * length };
}

/** 탄이 나갈 자리: 몸과 총구 사이에 적이 끼어 있으면 총구가 적을 지나쳐 있으므로 몸 가운데서 쏜다 */
export function shotOrigin(body: Vec2, muzzle: Vec2, targets: readonly (Vec2 & { radius: number })[], padPx = 2): Vec2 {
  const dx = muzzle.x - body.x;
  const dy = muzzle.y - body.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return muzzle;
  const blocked = targets.some((t) => {
    const k = Math.max(0, Math.min(1, ((t.x - body.x) * dx + (t.y - body.y) * dy) / len2));
    return Math.hypot(body.x + dx * k - t.x, body.y + dy * k - t.y) <= t.radius + padPx;
  });
  return blocked ? body : muzzle;
}

/** 총구에서 목표로 가는 각도. 목표가 없거나 minDist보다 가까우면 fallback (몸 기준 조준) */
export function muzzleAngle(muzzle: Vec2, target: Vec2 | null, fallback: number, minDist: number): number {
  if (!target || Math.hypot(target.x - muzzle.x, target.y - muzzle.y) < minDist) return fallback;
  return Math.atan2(target.y - muzzle.y, target.x - muzzle.x);
}
import type { EnemyRank } from '../types/data';

export interface Target extends Vec2 {
  radius: number;
}

export interface RankedTarget extends Target {
  rank: EnemyRank;
}

/** 등급별 가중치 (강적·보스 우선) */
export type RankWeights = Record<EnemyRank, number>;

/**
 * 직선 관통: origin에서 dir(단위 벡터) 방향 length까지, 폭 halfWidth 안에 걸친 적.
 * 가까운 순으로 돌려준다.
 */
export function lineHits(origin: Vec2, dir: Vec2, length: number, halfWidth: number, targets: readonly Target[]): number[] {
  const hits: { i: number; along: number }[] = [];
  targets.forEach((t, i) => {
    const dx = t.x - origin.x;
    const dy = t.y - origin.y;
    const along = dx * dir.x + dy * dir.y;
    if (along < -t.radius || along > length + t.radius) return;
    const side = Math.abs(dx * dir.y - dy * dir.x);
    if (side <= halfWidth + t.radius) hits.push({ i, along });
  });
  return hits.sort((a, b) => a.along - b.along).map((h) => h.i);
}

/**
 * 연쇄: from에서 시작해 매번 마지막으로 맞은 적에서 가장 가까운 적으로 최대 count번 옮겨 간다.
 * range 밖이거나 이미 맞은(exclude) 적은 건너뛴다.
 */
export function chainTargets(from: Vec2, targets: readonly Target[], count: number, range: number, exclude: ReadonlySet<number>): number[] {
  const used = new Set(exclude);
  const out: number[] = [];
  let at = from;
  for (let n = 0; n < count; n++) {
    let best = -1;
    let bestD = Infinity;
    targets.forEach((t, i) => {
      if (used.has(i)) return;
      const d = Math.hypot(t.x - at.x, t.y - at.y);
      if (d <= range + t.radius && d < bestD) {
        best = i;
        bestD = d;
      }
    });
    if (best < 0) break;
    out.push(best);
    used.add(best);
    at = targets[best]!;
  }
  return out;
}

/**
 * 밀집 지역·강적 자동 조준: 각 적을 중심으로 clusterRadius 안 적들의 등급 가중치를 더해 가장 높은 적.
 * 동점이면 앞쪽. 적이 없으면 -1.
 */
export function bestClusterTarget(targets: readonly RankedTarget[], clusterRadius: number, weights: RankWeights): number {
  let best = -1;
  let bestScore = -Infinity;
  targets.forEach((t, i) => {
    let score = 0;
    for (const o of targets) {
      if (Math.hypot(o.x - t.x, o.y - t.y) <= clusterRadius + o.radius) score += weights[o.rank];
    }
    if (score > bestScore) {
      best = i;
      bestScore = score;
    }
  });
  return best;
}

/** 우선 목표: range 안에서 등급 가중치가 높은 적, 같으면 from에서 가까운 적. 없으면 -1 */
export function priorityTarget(from: Vec2, targets: readonly RankedTarget[], range: number, weights: RankWeights): number {
  let best = -1;
  let bestW = -Infinity;
  let bestD = Infinity;
  targets.forEach((t, i) => {
    const d = Math.hypot(t.x - from.x, t.y - from.y);
    if (d > range + t.radius) return;
    const w = weights[t.rank];
    if (w > bestW || (w === bestW && d < bestD)) {
      best = i;
      bestW = w;
      bestD = d;
    }
  });
  return best;
}

/** 원 둘레에 count개를 고르게 놓는다. phase(라디안)만큼 돌린다 */
export function ringPoints(center: Vec2, count: number, radius: number, phase: number): Vec2[] {
  return Array.from({ length: count }, (_, i) => {
    const a = phase + (i * Math.PI * 2) / count;
    return { x: center.x + Math.cos(a) * radius, y: center.y + Math.sin(a) * radius };
  });
}
