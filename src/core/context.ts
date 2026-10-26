import type { GameData } from '../data/index';
import type { InputManager } from '../input/inputManager';
import type { TouchSource } from '../input/touch';
import type { UiMode } from '../input/uiMode';
import type { LaunchConfig } from './config';
import { formatText } from './text';

/** 씬들이 함께 쓰는 실행 컨텍스트. main.ts가 한 번 만든다. */
export interface GameContext {
  config: LaunchConfig;
  data: GameData;
  input: InputManager;
  touch: TouchSource;
  uiMode: UiMode;
  debug: boolean;
  t(key: string, vars?: Record<string, string | number>): string;
}

let ctx: GameContext | null = null;

export function setContext(c: Omit<GameContext, 't'>): GameContext {
  ctx = { ...c, t: (key, vars) => formatText(c.data.text, key, vars) };
  return ctx;
}

export function getContext(): GameContext {
  if (!ctx) throw new Error('GameContext가 아직 만들어지지 않음');
  return ctx;
}
