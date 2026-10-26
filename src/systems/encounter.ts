/**
 * 조우 칸 확장 지점. 유형 판정(보물·상인·습격·첨탑·히든보스)은 M4에서 구현한다.
 * M1은 코어에 상호작용하면 '준비 중'만 띄운다.
 */
import type { Rng } from '../core/rng';
import type { EncounterKind } from '../types/future';

export interface EncounterRoom {
  /** 조우 유형을 정한다. 아직 판정이 없으면 null */
  resolve(rng: Rng): EncounterKind | null;
}

export const pendingEncounter: EncounterRoom = {
  resolve: () => null,
};
