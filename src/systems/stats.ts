/** 스탯 효과 (순수 함수). 수치는 stats.json의 effects. 태그 보정은 damage.ts·tags.ts가 맡는다. */
import type { StatEffectId, StatId, StatsData } from '../types/data';
import { linearBonus, type Stats } from './damage';

/** maxHp는 더하는 값, 나머지는 비율 */
export function statEffect(id: StatEffectId, stats: Stats, data: StatsData): number {
  return linearBonus(data.effects[id], stats);
}

export function maxHpFor(baseMaxHp: number, stats: Stats, data: StatsData): number {
  return baseMaxHp + statEffect('maxHp', stats, data);
}

export interface StatHolder {
  stats: Stats;
  hp: number;
  maxHp: number;
}

/** 스탯을 올리거나 정한다. 최대 체력이 늘면 늘어난 만큼 체력도 채운다 */
export function setStat<T extends StatHolder>(p: T, stat: StatId, value: number, baseMaxHp: number, data: StatsData): T {
  const stats = { ...p.stats, [stat]: value };
  const maxHp = maxHpFor(baseMaxHp, stats, data);
  const hp = Math.min(maxHp, p.hp + Math.max(0, maxHp - p.maxHp));
  return { ...p, stats, maxHp, hp };
}

export function addStat<T extends StatHolder>(p: T, stat: StatId, amount: number, baseMaxHp: number, data: StatsData): T {
  return setStat(p, stat, p.stats[stat] + amount, baseMaxHp, data);
}
