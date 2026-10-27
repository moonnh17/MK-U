/**
 * 아직 로직을 만들지 않는 시스템의 타입만 둔다.
 * JSON은 채우지 않는다. (스킬·카드는 M2에서 types/data.ts로 옮겼다)
 */
import type { GradeId, JobId, SchoolId, TagId } from './data';

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

/** 직업 데이터 (전직은 M3). 마기법사·전사는 enabled: false로 잠근다 */
export interface JobDef {
  id: JobId;
  enabled: boolean;
  startWeapon: string;
  startUltimate: string;
  /** 전직 분기 2개 */
  advancements: { school: SchoolId; ultimate: string; passive: string }[];
}

/** 조우 칸 유형 (판정 로직은 M4) */
export type EncounterKind = 'treasure' | 'merchant' | 'ambush' | 'magiSpire' | 'hiddenBoss';
