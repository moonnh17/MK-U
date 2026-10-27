/**
 * 조우 칸: 들어가는 순간 유형이 정해진다(systems/loot.ts rollEncounter).
 * 아직 만들지 않은 유형은 판정에서 빠진다. M4-D에서 히든보스를 더한다.
 */
import type { EncounterKindId } from '../types/data';

export const IMPLEMENTED_ENCOUNTERS: ReadonlySet<EncounterKindId> = new Set<EncounterKindId>(['treasure', 'merchant', 'raid', 'magiSpire']);
