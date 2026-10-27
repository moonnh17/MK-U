/**
 * 아직 로직을 만들지 않는 시스템의 타입만 둔다.
 * JSON은 채우지 않는다. (스킬·카드는 M2, 직업은 M3에서 types/data.ts로 옮겼다)
 */
import type { GradeId, TagId } from './data';

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

/** 조우 칸 유형 (판정 로직은 M4) */
export type EncounterKind = 'treasure' | 'merchant' | 'ambush' | 'magiSpire' | 'hiddenBoss';
