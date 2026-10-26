import type { ButtonAction } from './actions';
import type { UiMode } from '../input/uiMode';

/** 이벤트 이름 → 페이로드 */
export interface GameEvents {
  /** 눌린 순간의 버튼 명령 (로그·UI 피드백용) */
  command: { action: ButtonAction; enabled: boolean };
  uiModeChanged: { mode: UiMode };
  debugToggled: { on: boolean };
}

type Handler<T> = (payload: T) => void;

export class EventBus<E extends object> {
  private handlers = new Map<keyof E, Set<Handler<never>>>();

  on<K extends keyof E>(name: K, fn: Handler<E[K]>): () => void {
    let set = this.handlers.get(name);
    if (!set) {
      set = new Set();
      this.handlers.set(name, set);
    }
    set.add(fn as Handler<never>);
    return () => this.off(name, fn);
  }

  off<K extends keyof E>(name: K, fn: Handler<E[K]>): void {
    this.handlers.get(name)?.delete(fn as Handler<never>);
  }

  emit<K extends keyof E>(name: K, payload: E[K]): void {
    const set = this.handlers.get(name);
    if (!set) return;
    for (const fn of [...set]) (fn as Handler<E[K]>)(payload);
  }
}

export const bus = new EventBus<GameEvents>();
