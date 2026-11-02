/**
 * 피해 계산 (순수 함수).
 * 1단계: 물리·마기·기술(attribute 그룹)의 피해 증가는 더한 뒤 한 번만 곱한다.
 * 2단계: 근접·원거리 증가(range 그룹)를 따로 곱한다. 증가량은 아이템(M4)이 채운다.
 * 피해 계산은 부모 스킬이 아니라 실제 공격(source)의 태그로 한다.
 */
import type {
  EnemyRank,
  GradeId,
  GroupMultipliersData,
  SpaceRule,
  TagDef,
  TagId,
  TagsData,
} from '../types/data';

/** 태그별 피해 증가 (0.2 = +20%). 아이템과 무기가 채운다 */
export type TagBonus = Partial<Record<TagId, number>>;

export interface DamageSource {
  baseDamage: number;
  tags: readonly TagId[];
}

/** 이 source의 attribute 태그 증가 합 → 배율 (예: +48% +40% → ×1.88) */
export function tagMultiplier(tags: readonly TagId[], bonus: TagBonus, tagData: TagsData): number {
  let sum = 0;
  const seen = new Set<TagId>();
  for (const id of tags) {
    if (seen.has(id)) continue;
    seen.add(id);
    const def: TagDef | undefined = tagData.tags.find((t) => t.id === id);
    if (!def || def.damageGroup !== 'attribute') continue;
    sum += bonus[id] ?? 0;
  }
  return 1 + sum;
}

/** 근접·원거리 피해 증가 (별도 단계). 0.2 = +20% */
export interface RangeBonus {
  melee: number;
  ranged: number;
}

export const NO_RANGE_BONUS: RangeBonus = { melee: 0, ranged: 0 };

export function rangeMultiplier(tags: readonly TagId[], bonus: RangeBonus = NO_RANGE_BONUS): number {
  let m = 1;
  if (tags.includes('melee')) m *= 1 + bonus.melee;
  if (tags.includes('ranged')) m *= 1 + bonus.ranged;
  return m;
}

export function calcDamage(source: DamageSource, tagBonus: TagBonus, tagData: TagsData, bonus: RangeBonus = NO_RANGE_BONUS): number {
  return source.baseDamage * tagMultiplier(source.tags, tagBonus, tagData) * rangeMultiplier(source.tags, bonus);
}

/**
 * 공간격 피해. 일반 몬스터 즉사(최대 체력만큼), 엘리트·집행자/집정관은 최대 체력 비율,
 * 보스·히든보스는 즉사 없이 피해 배율.
 */
export function spaceDamage(rank: EnemyRank, enemyMaxHp: number, damage: number, rule: SpaceRule): number {
  switch (rank) {
    case 'normal':
      return enemyMaxHp;
    case 'elite':
      return enemyMaxHp * rule.eliteMaxHpRatio;
    case 'champion':
      return enemyMaxHp * rule.championMaxHpRatio;
    case 'boss':
    case 'hiddenBoss':
      return damage * rule.bossDamageMultiplier;
  }
}

/** 기준값 × 그룹(등급) 배율 */
export function gradeEnergyMultiplier(grade: GradeId, groups: GroupMultipliersData): number {
  return groups.grades.find((g) => g.id === grade)?.energyMultiplier ?? 1;
}

export function gradeMultiplier(grade: GradeId, groups: GroupMultipliersData): number {
  return groups.grades.find((g) => g.id === grade)?.damageMultiplier ?? 1;
}
