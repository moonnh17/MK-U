/**
 * 아직 로직을 만들지 않는 시스템의 타입만 둔다 (M2 이후 구현).
 * JSON은 채우지 않는다.
 */
import type { GradeId, StatId, TagId } from './data';

export type SkillKind = 'active' | 'passive' | 'ultimate';
export type JobId = 'magiScholar' | 'magiMage' | 'warrior';
export type SchoolId = 'hectar' | 'acro';

export interface SkillLevelDef {
  level: 1 | 2 | 3;
  descKey: string;
  /** 레벨별 수치 (스킬마다 의미가 다름) */
  values: Record<string, number>;
}

export interface SkillAwakeningDef {
  /** 각성 조건: Lv3 + 요구 스탯 */
  requiredStat: StatId;
  requiredValue: number;
  nameKey: string;
  descKey: string;
  tags: TagId[];
}

export interface SkillDef {
  id: string;
  kind: SkillKind;
  job: JobId;
  /** 전직 전 공용 스킬이면 null */
  school: SchoolId | null;
  nameKey: string;
  tags: TagId[];
  /** 하위 공격(source)별 태그. 부모 태그를 복사하지 않는다 */
  sourceTags: Record<string, TagId[]>;
  cooldownSec: number;
  levels: SkillLevelDef[];
  awakening: SkillAwakeningDef | null;
  /** 전직 시 변환 대상 스킬 id (학파별) */
  advancesTo: Partial<Record<SchoolId, string>>;
}

export type PassiveDef = SkillDef & { kind: 'passive' };

export interface ItemDef {
  id: string;
  nameKey: string;
  descKey: string;
  grade: GradeId;
  tags: TagId[];
  /** 기준값. 실제 효과 = 기준값 × 그룹 배율 */
  baseValues: Record<string, number>;
  spriteKey: string;
}

export type CardKind = 'skillNew' | 'skillLevelUp' | 'passive' | 'awakening' | 'stat';

export interface CardDef {
  kind: CardKind;
  /** 스킬·패시브 카드: 스킬 id / 스탯 카드: 스탯 id */
  targetId: string;
  /** 스탯 카드 상승량 */
  amount?: number;
  grade?: GradeId;
}

/** 조우 칸 유형 (판정 로직은 M4) */
export type EncounterKind = 'treasure' | 'merchant' | 'ambush' | 'magiSpire' | 'hiddenBoss';
