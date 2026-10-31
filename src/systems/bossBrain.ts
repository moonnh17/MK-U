/**
 * 보스 패턴 선택기 (순수 함수).
 * 쉬는 시간이 끝나면 쓸 수 있는 패턴(쿨타임 끝, 사거리 조건, 강화 단계 조건) 중 가중치로 고른다.
 * 같은 패턴은 두 번 연속 쓰지 않는다(쓸 수 있는 게 그것뿐이면 예외).
 * 체력이 enrageAt 이하로 내려가면 한 번만 강화 단계로 바뀐다: 하던 패턴을 끝내고 잠깐 쉰다(무적은 런타임). enrageAt 0이면 없음.
 * 시간 단계(마기카이저): 전투 시간이 unlocks[i]를 넘을 때마다 단계가 오르고, unlock이 그 이하인 패턴이 열린다.
 */
import type { Rng } from '../core/rng';

export interface BossPatternRule {
  id: string;
  weight: number;
  cooldownSec: number;
  durationSec: number;
  /** 1 = 처음부터, 2 = 강화 단계부터 */
  phase: 1 | 2;
  /** 근접 패턴은 플레이어가 가까이 있을 때만(maxRange), 원거리는 어디서나 */
  reach?: 'melee' | 'ranged';
  /** 플레이어가 이 거리 안일 때만 */
  maxRange?: number;
  /** 시간 단계가 이 값 이상일 때부터 */
  unlock?: number;
}

export interface BossBrainState {
  phase: 1 | 2;
  current: string | null;
  left: number;
  idle: number;
  last: string | null;
  cooldowns: Record<string, number>;
  /** 전투 시간(초)과 시간 단계 */
  time: number;
  unlocked: number;
}

export type BossEvent = { type: 'start'; id: string } | { type: 'end'; id: string } | { type: 'enrage' } | { type: 'unlock'; stage: number };

export interface BossBrainConfig {
  /** 강화 단계 진입 체력 비율 */
  enrageAt: number;
  /** 패턴 사이 쉬는 시간 */
  gapSec: number;
  /** 강화 단계 진입 후 쉬는 시간(무적) */
  enrageSec: number;
  /** 시간 단계가 열리는 초 (없으면 시간 단계 없음) */
  unlocks?: readonly number[];
}

/** 전투 시간 → 시간 단계 (넘은 unlocks 수) */
export function timeStage(time: number, unlocks: readonly number[] = []): number {
  return unlocks.filter((t) => time >= t).length;
}

export function initialBoss(firstDelaySec: number): BossBrainState {
  return { phase: 1, current: null, left: 0, idle: firstDelaySec, last: null, cooldowns: {}, time: 0, unlocked: 0 };
}

/** 지금 쓸 수 있는 패턴 */
/** blocked: 지금은 못 쓰는 패턴 (분신이 살아 있는 동안의 분신 소환 등) */
export function availablePatterns(
  s: BossBrainState,
  patterns: readonly BossPatternRule[],
  dist: number,
  blocked: ReadonlySet<string> = new Set(),
): BossPatternRule[] {
  const ok = patterns.filter(
    (p) => p.phase <= s.phase && (p.unlock ?? 0) <= s.unlocked && !blocked.has(p.id) && (s.cooldowns[p.id] ?? 0) <= 0 && (p.maxRange === undefined || dist <= p.maxRange),
  );
  const fresh = ok.filter((p) => p.id !== s.last);
  return fresh.length > 0 ? fresh : ok;
}

export function stepBoss(
  s: BossBrainState,
  dt: number,
  hpRatio: number,
  dist: number,
  patterns: readonly BossPatternRule[],
  cfg: BossBrainConfig,
  rng: Rng,
  blocked: ReadonlySet<string> = new Set(),
): { state: BossBrainState; events: BossEvent[] } {
  const cooldowns: Record<string, number> = {};
  for (const [id, v] of Object.entries(s.cooldowns)) cooldowns[id] = Math.max(0, v - dt);
  const events: BossEvent[] = [];
  const time = s.time + dt;
  const unlocked = timeStage(time, cfg.unlocks);
  let st: BossBrainState = { ...s, cooldowns, time, unlocked };
  // 단계 개방은 하던 패턴을 끊지 않는다
  for (let k = s.unlocked + 1; k <= unlocked; k++) events.push({ type: 'unlock', stage: k });

  if (st.phase === 1 && cfg.enrageAt > 0 && hpRatio <= cfg.enrageAt) {
    if (st.current) events.push({ type: 'end', id: st.current });
    events.push({ type: 'enrage' });
    return { state: { ...st, phase: 2, current: null, left: 0, idle: cfg.enrageSec }, events };
  }

  if (st.current) {
    const left = st.left - dt;
    if (left > 0) return { state: { ...st, left }, events };
    events.push({ type: 'end', id: st.current });
    return { state: { ...st, current: null, left: 0, idle: cfg.gapSec }, events };
  }

  const idle = st.idle - dt;
  if (idle > 0) return { state: { ...st, idle }, events };
  const pool = availablePatterns(st, patterns, dist, blocked);
  if (pool.length === 0) return { state: { ...st, idle: 0 }, events };
  const p = rng.weighted(pool.map((x) => ({ item: x, weight: x.weight })));
  events.push({ type: 'start', id: p.id });
  st = { ...st, current: p.id, left: p.durationSec, idle: 0, last: p.id, cooldowns: { ...cooldowns, [p.id]: p.cooldownSec } };
  return { state: st, events };
}
