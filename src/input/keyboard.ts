import { BUTTON_ACTIONS, type ButtonAction, type Vec2 } from '../core/actions';
import type { InputSourceState } from './inputManager';

/** keybindings.json 형태. 키는 KeyboardEvent.code (배열 = 여러 키 허용) */
export interface KeybindingsData {
  move: { up: string[]; down: string[]; left: string[]; right: string[] };
  buttons: Record<ButtonAction, string[]>;
  debugToggle: string[];
}

/** 눌린 키 코드 집합 → 이동 벡터 + 눌린 버튼 (순수 함수) */
export function resolveKeyboard(down: ReadonlySet<string>, b: KeybindingsData): InputSourceState {
  const any = (codes: readonly string[]) => codes.some((c) => down.has(c));
  let x = 0;
  let y = 0;
  if (any(b.move.left)) x -= 1;
  if (any(b.move.right)) x += 1;
  if (any(b.move.up)) y -= 1;
  if (any(b.move.down)) y += 1;
  const len = Math.hypot(x, y);
  const move: Vec2 = len > 0 ? { x: x / len, y: y / len } : { x: 0, y: 0 };

  const held = new Set<ButtonAction>();
  for (const action of BUTTON_ACTIONS) {
    if (any(b.buttons[action])) held.add(action);
  }
  return { move, held };
}

/** 이 키 코드가 게임에 묶여 있는지 (브라우저 기본 동작을 막을지 판단) */
export function isBoundKey(code: string, b: KeybindingsData): boolean {
  if (b.debugToggle.includes(code)) return true;
  if (Object.values(b.move).some((codes) => codes.includes(code))) return true;
  return BUTTON_ACTIONS.some((a) => b.buttons[a].includes(code));
}

/** 브라우저 키 이벤트를 받아 눌린 키 집합을 유지한다. */
export class KeyboardSource {
  private down = new Set<string>();
  private readonly onKeyDown = (e: KeyboardEvent) => {
    if (!isBoundKey(e.code, this.bindings)) return;
    e.preventDefault();
    if (e.repeat) return;
    if (this.bindings.debugToggle.includes(e.code)) {
      this.onDebugToggle?.();
      return;
    }
    this.down.add(e.code);
    this.onActivity?.();
  };
  private readonly onKeyUp = (e: KeyboardEvent) => {
    if (!isBoundKey(e.code, this.bindings)) return;
    e.preventDefault();
    this.down.delete(e.code);
  };
  private readonly onBlur = () => this.down.clear();

  /** 키보드를 쓰기 시작했을 때(UI 모드 자동 전환용) */
  onActivity?: () => void;
  onDebugToggle?: () => void;

  constructor(private readonly bindings: KeybindingsData) {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
  }

  state(): InputSourceState {
    return resolveKeyboard(this.down, this.bindings);
  }

  destroy(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
  }
}
