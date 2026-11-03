/**
 * 아크로 스킬 규칙 (순수 함수): 실험 성공·대성공 판정, 실험 결과 뽑기, 변질, 반역.
 * 대성공은 아크로 공통 특성이 아니라 스킬마다 따로 굴린다.
 */
import type { Rng } from '../core/rng';
import type { EnemyRank, SpriteRef, TagId, TagsData } from '../types/data';
import { hasTag, taggedChance } from './tags';

/** 확률 태그가 있으면 상한을 적용한 확률, 없으면 기본 확률 */
export function skillChance(base: number, capKey: string, tags: readonly TagId[], data: TagsData): number {
  return hasTag(tags, 'chance') ? taggedChance(base, capKey, data) : base;
}

export function rollChance(rng: Rng, p: number): boolean {
  return rng.chance(p);
}

/** 실험 결과를 가중치로 count개 뽑는다(서로 다른 결과). 가중치 0인 결과는 나오지 않는다 */
export function pickResults(rng: Rng, weights: Readonly<Record<string, number>>, count: number): string[] {
  let pool = Object.entries(weights)
    .filter(([, w]) => w > 0)
    .map(([item, weight]) => ({ item, weight }));
  const out: string[] = [];
  while (out.length < count && pool.length > 0) {
    const id = rng.weighted(pool);
    out.push(id);
    pool = pool.filter((e) => e.item !== id);
  }
  return out;
}

/** 마기 변질 상태: 받는 피해 증가, 죽으면 폭발 */
export interface CorruptionState {
  leftSec: number;
  /** 받는 피해 증가 비율 (0.3 = +30%) */
  vulnerability: number;
  burstDamage: number;
  burstRadius: number;
  /** 폭발 공격의 source 태그 */
  burstTags: readonly TagId[];
  /** 표식(유지) · 폭발 · 파편 · 풀릴 때 그림 */
  fx?: { mark: SpriteRef; burst: SpriteRef; shards?: SpriteRef; end?: SpriteRef };
}

export function tickCorruption(s: CorruptionState, dt: number): CorruptionState | null {
  const leftSec = s.leftSec - dt;
  return leftSec > 0 ? { ...s, leftSec } : null;
}

/** 변질된 적이 받는 피해 */
export function corruptedDamage(damage: number, s: CorruptionState | null): number {
  return s ? damage * (1 + s.vulnerability) : damage;
}

/** 다시 걸면 더 센 쪽·더 긴 쪽으로 */
export function applyCorruption(prev: CorruptionState | null, next: CorruptionState): CorruptionState {
  if (!prev) return next;
  return {
    leftSec: Math.max(prev.leftSec, next.leftSec),
    vulnerability: Math.max(prev.vulnerability, next.vulnerability),
    burstDamage: Math.max(prev.burstDamage, next.burstDamage),
    burstRadius: Math.max(prev.burstRadius, next.burstRadius),
    burstTags: next.burstTags,
    fx: next.fx ?? prev.fx,
  };
}

/** 반역 개체가 될 수 있는 적 (보스 불가) */
export function canRebel(rank: EnemyRank): boolean {
  return rank !== 'boss' && rank !== 'hiddenBoss';
}
