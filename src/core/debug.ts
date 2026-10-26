import type { GameContext } from './context';
import { bus } from './events';
import type { DebugToggle } from '../ui/debugPanel';

/** 디버그 표시(F1)를 켜고 끈다 */
export function toggleDebug(ctx: GameContext): void {
  ctx.debug = !ctx.debug;
  bus.emit('debugToggled', { on: ctx.debug });
}

/** 디버그 토글(맵 공개·무적). 디버그 표시가 꺼져 있으면 무시한다. */
export function toggleDebugFlag(ctx: GameContext, name: DebugToggle): void {
  if (!ctx.debug) return;
  ctx.debugFlags[name] = !ctx.debugFlags[name];
}

/** 현재 방 즉시 클리어 */
export function debugClearRoom(ctx: GameContext): void {
  if (!ctx.debug) return;
  bus.emit('debugClearRoom', {});
}
