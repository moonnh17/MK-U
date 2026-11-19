// ---------- 공통 ----------

/** [min, max] 정수 범위 (양끝 포함) */
export type IntRange = readonly [number, number];

/** 기획서 태그 표의 11종 + 화상(사용자 추가, 2026-11-10) */
export const TAG_IDS = [
  'physical',
  'magic',
  'tech',
  'chance',
  'charging',
  'targeted',
  'ranged',
  'melee',
  'buff',
  'space',
  'bleed',
  'burn',
] as const;
export type TagId = (typeof TAG_IDS)[number];

export const GRADE_IDS = ['common', 'rare', 'legendary', 'unique', 'mythic'] as const;
export type GradeId = (typeof GRADE_IDS)[number];

/** 도형 플레이스홀더. 나중에 도트 아트로 바꿀 때 spriteKey만 교체한다. */
export interface SpriteRef {
  spriteKey: string;
  /** 플레이스홀더 색 (0xRRGGBB 문자열, 예: "#ff8800") */
  color: string;
  /** 플레이스홀더 크기(px, 기준 해상도) */
  size: number;
  /** 세로 크기가 다를 때(px). 없으면 size */
  height?: number;
}

// ---------- 태그 ----------

/** 확률 태그: 결과별 상한 (예: success 0.98, greatSuccess 0.6) */
export interface ChanceRule {
  kind: 'chance';
  caps: Record<string, number>;
}

export interface SpaceRule {
  kind: 'space';
  /** 일반 몬스터: 즉사 */
  normal: 'instakill';
  /** 엘리트: 최대 HP 비율 피해 */
  eliteMaxHpRatio: number;
  /** 집행자·집정관: 최대 HP 비율 피해 */
  championMaxHpRatio: number;
  /** 보스·히든보스: 공간격 피해 배율 */
  bossDamageMultiplier: number;
}

export interface BleedRule {
  kind: 'bleed';
  durationSec: number;
  tickIntervalSec: number;
  maxStacks: number;
  refreshOnReapply: boolean;
  /** 중첩 1개당 틱 피해 (출처·태그 보너스와 상관없이 고정, 사용자 지정) */
  damagePerStack: number;
}

/** 화상: 지속시간 없이 죽을 때까지 탄다. 중첩 상한은 일반·보스 따로 */
export interface BurnRule {
  kind: 'burn';
  tickIntervalSec: number;
  maxStacks: number;
  bossMaxStacks: number;
  /** 중첩 1개당 틱 피해 (고정) */
  damagePerStack: number;
}

export interface NoScaling {
  kind: 'none';
}

export type TagRule = ChanceRule | SpaceRule | BleedRule | BurnRule | NoScaling;

/** 피해 계산에서 태그가 속하는 단계 */
export type TagDamageGroup =
  /** 물리·마기·기술: 보정을 더한 뒤 한 번 곱한다 */
  | 'attribute'
  /** 근접·원거리: 별도 단계에서 곱한다 */
  | 'range'
  /** 피해 배율과 무관 */
  | 'none';

export interface TagDef {
  id: TagId;
  nameKey: string;
  descKey: string;
  damageGroup: TagDamageGroup;
  rule: TagRule;
  /** 배지 색 */
  badgeColor: string;
}

export interface TagsData {
  tags: TagDef[];
}

// ---------- 등급·그룹 배율 ----------

export interface GradeDef {
  id: GradeId;
  nameKey: string;
  color: string;
  /** 기준 피해 배율 (무기·아이템 공통 그룹 배율) */
  damageMultiplier: number;
  /** 무기 에너지 소모 배율 (높은 등급일수록 많이 먹는다) */
  energyMultiplier: number;
  /** 무작위 추가 옵션 개수 */
  randomOptions: number;
}

/** 아이템 효과 그룹. 실제 값 = 기준값 × 그룹 배율 */
export type ItemGroupId = 'hpFlat' | 'damagePct' | 'procDamage' | 'area' | 'cooldown';

export interface GroupMultipliersData {
  /** 초기값은 임시. 밸런스 조정 시 이 표만 바꾼다. */
  grades: GradeDef[];
  /** 아이템 효과 그룹 배율 (기획서 '수치를 유동적으로 두는 방법') */
  itemGroups: Record<ItemGroupId, number>;
}
