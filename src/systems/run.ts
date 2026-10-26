/** 런 진행 (순수 함수). */
import type { MapgenData } from '../types/data';

export interface StageRef {
  chapter: number;
  stage: number;
}

export type StageAdvance =
  | { type: 'stage'; next: StageRef }
  /** 챕터 마지막 스테이지를 끝냄. M1은 챕터1만 있으므로 '챕터1 클리어(임시)' 화면을 띄운다. */
  | { type: 'chapterClear'; chapter: number };

export function firstStage(): StageRef {
  return { chapter: 1, stage: 1 };
}

export function advanceStage(cur: StageRef, data: MapgenData): StageAdvance {
  if (cur.stage < data.stagesPerChapter) return { type: 'stage', next: { chapter: cur.chapter, stage: cur.stage + 1 } };
  return { type: 'chapterClear', chapter: cur.chapter };
}
