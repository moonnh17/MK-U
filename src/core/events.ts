import type { ButtonAction } from './actions';
import type { UiMode } from '../input/uiMode';

/** 이벤트 이름 → 페이로드 */
export interface GameEvents {
  /** 눌린 순간의 버튼 명령 (로그·UI 피드백용) */
  command: { action: ButtonAction; enabled: boolean };
  uiModeChanged: { mode: UiMode };
  debugToggled: { on: boolean };
  /** 디버그: 현재 방 즉시 클리어 */
  debugClearRoom: Record<string, never>;
  /** 화면 가운데 짧은 알림 */
  toast: { text: string };
  /** 근처에 상호작용 대상이 생기거나 사라짐 (모바일 공격 버튼 → 줍기/조사) */
  interactHint: { kind: 'weapon' | 'core' | null };
  /** 사망·클리어 화면이 뜨거나(true) 닫힘(false) */
  overlay: { open: boolean };
  /** 화면의 '다시 시작' 버튼 */
  restartRequested: Record<string, never>;
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
