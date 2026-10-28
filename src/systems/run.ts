/** 런 진행 (순수 함수). */
import type { MapgenData, WavesData } from '../types/data';

export interface StageRef {
  chapter: number;
  stage: number;
}

export type StageAdvance =
  | { type: 'stage'; next: StageRef }
  /** 챕터 마지막 스테이지를 끝내고 다음 챕터 1스테이지로 */
  | { type: 'chapter'; next: StageRef }
  /** 마지막 챕터까지 끝냄 (아직 없는 챕터가 있으면 '챕터N 클리어(임시)') */
  | { type: 'chapterClear'; chapter: number };

export function firstStage(): StageRef {
  return { chapter: 1, stage: 1 };
}

/** lastChapter: 웨이브 데이터가 있는 마지막 챕터 (playableChapters) */
export function advanceStage(cur: StageRef, data: MapgenData, lastChapter: number = data.chapters): StageAdvance {
  if (cur.stage < data.stagesPerChapter) return { type: 'stage', next: { chapter: cur.chapter, stage: cur.stage + 1 } };
  if (cur.chapter < Math.min(lastChapter, data.chapters)) return { type: 'chapter', next: { chapter: cur.chapter + 1, stage: 1 } };
  return { type: 'chapterClear', chapter: cur.chapter };
}

/** 플레이할 수 있는 마지막 챕터: 1장부터 이어서 웨이브 데이터가 있는 곳까지 */
export function playableChapters(waves: WavesData, data: MapgenData): number {
  let c = 0;
  while (c < data.chapters && waves.waves.some((w) => w.chapter === c + 1)) c++;
  return Math.max(1, c);
}
