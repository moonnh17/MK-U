/**
 * 피해 계산 (순수 함수). M1은 태그 배율만 구현한다.
 * 물리·마기·기술(attribute 그룹)의 스탯 보정은 더한 뒤 한 번만 곱한다.
 * 아이템 피해 증가, 근접·원거리 증가, 치명타 등 별도 단계는 M2 이후.
 */
import type { GradeId, GroupMultipliersData, StatId, TagDef, TagId, TagsData } from '../types/data';

export type Stats = Record<StatId, number>;

export interface DamageSource {
  baseDamage: number;
  tags: readonly TagId[];
}

export function startingStats(startValue: number): Stats {
  return {
    strength: startValue,
    toughness: startValue,
    agility: startValue,
    intelligence: startValue,
    magiPower: startValue,
    willpower: startValue,
  };
}

/** 선형 스탯 보정 (기준점 아래는 0, 상한까지) */
export function linearBonus(rule: { stat: StatId; pivot: number; perPoint: number; cap: number }, stats: Stats): number {
  const over = Math.max(0, stats[rule.stat] - rule.pivot);
  return Math.min(rule.cap, over * rule.perPoint);
}

/** 이 source의 attribute 태그 보정 합 → 배율 (예: +48% +40% → ×1.88) */
export function tagMultiplier(tags: readonly TagId[], stats: Stats, tagData: TagsData): number {
  let sum = 0;
  const seen = new Set<TagId>();
  for (const id of tags) {
    if (seen.has(id)) continue;
    seen.add(id);
    const def: TagDef | undefined = tagData.tags.find((t) => t.id === id);
    if (!def || def.damageGroup !== 'attribute' || def.rule.kind !== 'linearStat') continue;
    sum += linearBonus(def.rule, stats);
  }
  return 1 + sum;
}

export function calcDamage(source: DamageSource, stats: Stats, tagData: TagsData): number {
  return source.baseDamage * tagMultiplier(source.tags, stats, tagData);
}

/** 기준값 × 그룹(등급) 배율 */
export function gradeMultiplier(grade: GradeId, groups: GroupMultipliersData): number {
  return groups.grades.find((g) => g.id === grade)?.damageMultiplier ?? 1;
}
