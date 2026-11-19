/**
 * 조우 칸: 들어가는 순간 유형이 정해진다(systems/loot.ts rollEncounter).
 * 아직 만들지 않은 유형은 판정에서 빠진다. 히든보스는 셋 다 나온 런에서 빠진다(systems/hiddenBoss.ts).
 */
import type { EncounterKindId } from '../types/data';

/** 챕터 가중치: 기본표에 그 챕터의 덮어쓰기를 얹는다 */
export function encounterWeights(e: { weights: Record<EncounterKindId, number>; chapterWeights: Record<string, Partial<Record<EncounterKindId, number>>> }, chapter: number): Record<EncounterKindId, number> {
  return { ...e.weights, ...e.chapterWeights[String(chapter)] };
}

export const IMPLEMENTED_ENCOUNTERS: ReadonlySet<EncounterKindId> = new Set<EncounterKindId>(['treasure', 'merchant', 'skillShop', 'raid', 'magiSpire', 'hiddenBoss', 'combiner']);
