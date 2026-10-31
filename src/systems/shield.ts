/**
 * 마기역장 보호막 (순수 함수). 쓸 때마다 막기 횟수가 쌓이고(상한까지), 시간이 지나도 사라지지 않는다.
 * 각성(벡터굴절역장)은 쓸 때마다 정해진 시간 동안 일반 탄을 무효화한다. 막을 횟수를 다 써도 굴절은 남는다.
 */
export interface ShieldState {
  /** 남은 막기 횟수 */
  hits: number;
  maxHits: number;
  /** 굴절 남은 시간(초) */
  refractLeftSec: number;
  refractTotalSec: number;
  /** 일반 탄 무효화 반지름(px). 0이면 굴절 없음 */
  refractRadius: number;
}

/** 한 겹 쌓는다. 굴절은 새로 시작한다 */
export function stackShield(s: ShieldState | null, hits: number, maxHits: number, refractSec = 0, refractRadius = 0): ShieldState {
  return { hits: Math.min(maxHits, (s?.hits ?? 0) + hits), maxHits, refractLeftSec: refractSec, refractTotalSec: refractSec, refractRadius };
}

/** 할 일이 남았는지 (막기 횟수나 굴절) */
function alive(s: ShieldState): boolean {
  return s.hits > 0 || s.refractLeftSec > 0;
}

export function tickShield(s: ShieldState, dt: number): ShieldState | null {
  const next = { ...s, refractLeftSec: Math.max(0, s.refractLeftSec - dt) };
  return alive(next) ? next : null;
}

/** 공격 한 번. 막았으면 blocked, 남은 보호막(없으면 null) */
export function absorbHit(s: ShieldState | null): { shield: ShieldState | null; blocked: boolean } {
  if (!s || s.hits <= 0) return { shield: s, blocked: false };
  const next = { ...s, hits: s.hits - 1 };
  return { shield: alive(next) ? next : null, blocked: true };
}

/** 굴절로 지울 탄인지: 굴절 중이고 반지름 안이며, 무효화할 수 있는 일반 탄 */
export function refracts(s: ShieldState | null, dist: number, refractable: boolean): boolean {
  return !!s && refractable && s.refractLeftSec > 0 && s.refractRadius > 0 && dist <= s.refractRadius;
}
