import type { UiModeSetting } from '../core/config';

export type UiMode = 'pc' | 'mobile';

/** 시작 UI 모드. 강제 설정이 없으면 거친 포인터(폰·태블릿)일 때만 모바일로 시작한다. */
export function initialUiMode(setting: UiModeSetting, coarsePointer: boolean): UiMode {
  if (setting !== 'auto') return setting;
  return coarsePointer ? 'mobile' : 'pc';
}

/**
 * 자동 모드에서 다음 모드를 정한다.
 * 터치가 들어오면 모바일, 게임 키보드 입력이 들어오면 PC. 강제 설정이면 바꾸지 않는다.
 */
export function nextUiMode(setting: UiModeSetting, current: UiMode, activity: 'touch' | 'keyboard'): UiMode {
  if (setting !== 'auto') return current;
  return activity === 'touch' ? 'mobile' : 'pc';
}
