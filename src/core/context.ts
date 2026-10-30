import type { GameData } from '../data/index';
import type { InputManager } from '../input/inputManager';
import type { TouchSource } from '../input/touch';
import type { UiMode } from '../input/uiMode';
import type { LaunchConfig } from './config';
import type { SaveStore } from './save';
import type { DebugFlags, RunSession } from './session';
import { formatText } from './text';

/** 씬들이 함께 쓰는 실행 컨텍스트. main.ts가 한 번 만든다. */
export interface GameContext {
  config: LaunchConfig;
  data: GameData;
  input: InputManager;
  touch: TouchSource;
  uiMode: UiMode;
  debug: boolean;
  debugFlags: DebugFlags;
  /** 진행 중인 런 (RunScene이 만든다) */
  session: RunSession | null;
  /** 영구 저장 (결정·강화·기억) */
  save: SaveStore;
  /** 실제로 불러온 그림의 spriteKey (Boot가 채운다. 화면 아이콘이 그림을 쓸지 정할 때) */
  artLoaded: Set<string>;
  t(key: string, vars?: Record<string, string | number>): string;
}

let ctx: GameContext | null = null;

export function setContext(c: Omit<GameContext, 't' | 'session' | 'debugFlags' | 'artLoaded'>): GameContext {
  ctx = {
    ...c,
    artLoaded: new Set(),
    session: null,
    debugFlags: { revealMap: false, invincible: false },
    t: (key, vars) => formatText(c.data.text, key, vars),
  };
  return ctx;
}

export function getContext(): GameContext {
  if (!ctx) throw new Error('GameContext가 아직 만들어지지 않음');
  return ctx;
}
