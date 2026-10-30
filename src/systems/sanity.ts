/**
 * 정신력 (순수 함수). 정신 피해로 줄고 시간이 지나면 회복한다. 0이 되면 패닉.
 * 패닉 중 받는 정신 피해는 체력 피해로 바뀐다.
 */
import type { SanityConfig } from '../types/data';

export interface SanityState {
  sanity: number;
  sanityMax: number;
  panic: boolean;
}

export function sanityMaxFor(willpower: number, c: Pick<SanityConfig, 'base' | 'perWillpower'>): number {
  return Math.max(1, c.base + c.perWillpower * willpower);
}

/** 정신 피해. hpDamage: 패닉 중이라 체력 피해로 바뀐 양 */
export function applyMental(s: SanityState, amount: number): { sanity: number; panic: boolean; hpDamage: number } {
  if (amount <= 0) return { sanity: s.sanity, panic: s.panic, hpDamage: 0 };
  if (s.panic) return { sanity: s.sanity, panic: true, hpDamage: amount };
  const sanity = Math.max(0, s.sanity - amount);
  return { sanity, panic: sanity <= 0, hpDamage: 0 };
}

/** 한 프레임: 패닉이면 빠르게 회복해 벗어나고, 보스와 마주하면 줄고, 아니면 회복한다 */
export function stepSanity(s: SanityState, dt: number, facingBoss: boolean, c: SanityConfig): { sanity: number; panic: boolean } {
  if (s.panic) {
    const sanity = Math.min(s.sanityMax, s.sanity + c.panic.regenPerSec * dt);
    return { sanity, panic: sanity < s.sanityMax * c.panic.exitRatio };
  }
  if (facingBoss) {
    const sanity = Math.max(0, s.sanity - c.bossDrainPerSec * dt);
    return { sanity, panic: sanity <= 0 };
  }
  return { sanity: Math.min(s.sanityMax, s.sanity + c.regenPerSec * dt), panic: false };
}
