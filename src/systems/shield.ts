/**
 * 마기역장 보호막 (순수 함수). 공격을 hits번 막고, 시간이 끝나면 사라진다.
 * 각성(벡터굴절역장)은 지속시간 동안 일반 탄을 무효화한다. 막을 횟수를 다 써도 굴절은 남는다.
 */
export interface ShieldState {
  /** 남은 막기 횟수 */
  hits: number;
  maxHits: number;
  leftSec: number;
  totalSec: number;
  /** 일반 탄 무효화 반지름(px). 0이면 굴절 없음 */
  refractRadius: number;
}

export function makeShield(hits: number, durationSec: number, refractRadius: number): ShieldState {
  return { hits, maxHits: hits, leftSec: durationSec, totalSec: durationSec, refractRadius };
}

/** 할 일이 남았는지 (막기 횟수나 굴절) */
function alive(s: ShieldState): boolean {
  return s.leftSec > 0 && (s.hits > 0 || s.refractRadius > 0);
}

export function tickShield(s: ShieldState, dt: number): ShieldState | null {
  const next = { ...s, leftSec: s.leftSec - dt };
  return alive(next) ? next : null;
}

/** 공격 한 번. 막았으면 blocked, 남은 보호막(없으면 null) */
export function absorbHit(s: ShieldState | null): { shield: ShieldState | null; blocked: boolean } {
  if (!s || s.hits <= 0) return { shield: s, blocked: false };
  const next = { ...s, hits: s.hits - 1 };
  return { shield: alive(next) ? next : null, blocked: true };
}

/** 굴절로 지울 탄인지: 굴절 반지름 안이고, 무효화할 수 있는 일반 탄 */
export function refracts(s: ShieldState | null, dist: number, refractable: boolean): boolean {
  return !!s && refractable && s.refractRadius > 0 && dist <= s.refractRadius;
}
