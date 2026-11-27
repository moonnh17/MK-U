/**
 * 오버플로우 마기카이저 학습 (순수 함수, 제안): 그 런에서 맞힌 공격의 태그를 세고,
 * 가장 많이 쓴 계열에 맞서는 임시 변형 하나를 고른다. 수치는 overflow.json kaiserLearning.
 */
import type { KaiserLearningData, KaiserVariantDef, TagId } from '../types/data';

export type TagUse = Partial<Record<string, number>>;

export function tallyTags(use: TagUse, tags: readonly string[]): TagUse {
  const out = { ...use };
  for (const t of tags) out[t] = (out[t] ?? 0) + 1;
  return out;
}

/** 변형마다 맞서는 태그 수의 합이 가장 큰 것. 합이 minHits보다 적으면 변형 없음 */
export function pickKaiserVariant(use: TagUse, K: KaiserLearningData): KaiserVariantDef | null {
  let best: KaiserVariantDef | null = null;
  let top = K.minHits - 1;
  for (const v of K.variants) {
    const n = v.tags.reduce((s, t) => s + (use[t] ?? 0), 0);
    if (n > top) {
      top = n;
      best = v;
    }
  }
  return best;
}

/** 맞힌 공격의 태그 중 가장 많이 줄어드는 받는 피해 배율 (해당 없으면 1) */
export function tagTakenMul(taken: Partial<Record<TagId, number>> | null | undefined, tags: readonly TagId[]): number {
  if (!taken) return 1;
  return tags.reduce((m, t) => Math.min(m, taken[t] ?? 1), 1);
}
