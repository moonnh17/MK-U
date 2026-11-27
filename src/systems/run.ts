/** 런 진행 (순수 함수). */
import type { MapgenData, OverflowThemeDef, WavesData } from '../types/data';

/** 오버플로우 4장부터 뽑힌 장 (표 조회 장·웨이브 장) */
export type StageTheme = Pick<OverflowThemeDef, 'id' | 'chapter' | 'waveChapters' | 'tint'>;

export interface StageRef {
  chapter: number;
  stage: number;
  /** 오버플로우 4장부터: 뽑힌 장. 없으면 chapter가 곧 표 조회 장 */
  theme?: StageTheme;
  /** 오버플로우 4장부터 X-2·X-5: 이 칸의 보스 (임시 보스로 대신 나올 수 있다) */
  boss?: string;
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
