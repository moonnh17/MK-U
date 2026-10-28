/**
 * 적 행동 상태 기계 (순수 함수). 추격 → 예고 → 공격 → 후딜 → 추격.
 * 공격 종류별 실제 동작(돌진·강타)은 entities/enemy.ts가 이벤트를 받아 처리한다.
 */

export type AiPhase = 'chase' | 'windup' | 'act' | 'recover';

export interface AiAttack {
  id: string;
  /** 플레이어가 이 거리 안이면 공격을 시작한다 */
  triggerRange: number;
  windupSec: number;
  actSec: number;
  recoverSec: number;
  cooldownSec: number;
}

export interface AiState {
  phase: AiPhase;
  attackId: string | null;
  left: number;
  /** 공격 id → 남은 쿨타임 */
  cooldowns: Record<string, number>;
}

export type AiEvent = { type: 'windup' | 'strike' | 'end'; attackId: string };

export function initialAi(attacks: readonly AiAttack[], firstDelaySec = 0): AiState {
  const cooldowns: Record<string, number> = {};
  for (const a of attacks) cooldowns[a.id] = firstDelaySec;
  return { phase: 'chase', attackId: null, left: 0, cooldowns };
}

/**
 * 한 프레임. speedMul은 공격 속도 배율(신속 엘리트): 예고·후딜·쿨타임이 그만큼 짧아진다.
 * 공격은 목록 순서대로 우선한다.
 */
export function stepAi(
  s: AiState,
  dt: number,
  distToPlayer: number,
  attacks: readonly AiAttack[],
  speedMul = 1,
): { state: AiState; events: AiEvent[] } {
  const cooldowns: Record<string, number> = {};
  for (const [id, v] of Object.entries(s.cooldowns)) cooldowns[id] = Math.max(0, v - dt * speedMul);
  const events: AiEvent[] = [];
  const find = (id: string | null) => attacks.find((a) => a.id === id);

  if (s.phase === 'chase') {
    const a = attacks.find((x) => (cooldowns[x.id] ?? 0) <= 0 && distToPlayer <= x.triggerRange);
    if (!a) return { state: { ...s, cooldowns }, events };
    events.push({ type: 'windup', attackId: a.id });
    return { state: { phase: 'windup', attackId: a.id, left: a.windupSec / speedMul, cooldowns }, events };
  }

  const a = find(s.attackId);
  if (!a) return { state: { phase: 'chase', attackId: null, left: 0, cooldowns }, events };
  const left = s.left - dt;
  if (left > 0) return { state: { ...s, left, cooldowns }, events };

  if (s.phase === 'windup') {
    events.push({ type: 'strike', attackId: a.id });
    return { state: { phase: 'act', attackId: a.id, left: a.actSec, cooldowns }, events };
  }
  if (s.phase === 'act') {
    events.push({ type: 'end', attackId: a.id });
    cooldowns[a.id] = a.cooldownSec;
    return { state: { phase: 'recover', attackId: a.id, left: a.recoverSec / speedMul, cooldowns }, events };
  }
  return { state: { phase: 'chase', attackId: null, left: 0, cooldowns }, events };
}

/**
 * 전술 연계: 쫓는 중이고 그 공격 쿨타임이 끝났으면 바로 예고를 시작한다 (동료가 쏘기 시작할 때).
 * 이미 공격 중이거나 쿨타임이면 그대로.
 */
export function forceWindup(s: AiState, attack: AiAttack, speedMul = 1): { state: AiState; started: boolean } {
  if (s.phase !== 'chase' || (s.cooldowns[attack.id] ?? 0) > 0) return { state: s, started: false };
  return { state: { phase: 'windup', attackId: attack.id, left: attack.windupSec / speedMul, cooldowns: s.cooldowns }, started: true };
}

/**
 * 거리 유지 (원거리 적): 1 = 다가감, -1 = 물러남, 0 = 멈춤.
 * keep보다 band 이상 멀면 다가가고, keep보다 가까우면 물러난다.
 */
export function keepDistanceStep(dist: number, keep: number, band: number): -1 | 0 | 1 {
  if (dist > keep + band) return 1;
  if (dist < keep) return -1;
  return 0;
}
