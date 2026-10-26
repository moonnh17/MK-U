import type { ActionFrame, ButtonAction, Vec2 } from '../core/actions';

/** 입력 소스(키보드·터치) 하나가 매 프레임 내놓는 상태 */
export interface InputSourceState {
  move: Vec2;
  held: ReadonlySet<ButtonAction>;
}

export interface InputSource {
  state(): InputSourceState;
}

/**
 * 여러 소스를 한 프레임으로 합친다 (순수 함수).
 * - 이동: 크기가 가장 큰 소스를 쓴다(키보드와 조이스틱을 섞지 않음). 길이는 1로 자른다.
 * - 버튼: 합집합. pressed = 이번 프레임에 새로 눌린 것.
 */
export function combineInputs(prevHeld: ReadonlySet<ButtonAction>, states: readonly InputSourceState[]): ActionFrame {
  let move: Vec2 = { x: 0, y: 0 };
  let best = 0;
  const held = new Set<ButtonAction>();
  for (const s of states) {
    const mag = Math.hypot(s.move.x, s.move.y);
    if (mag > best) {
      best = mag;
      move = s.move;
    }
    for (const a of s.held) held.add(a);
  }
  if (best > 1) move = { x: move.x / best, y: move.y / best };

  const pressed = new Set<ButtonAction>();
  for (const a of held) if (!prevHeld.has(a)) pressed.add(a);
  return { move: { x: move.x, y: move.y }, held, pressed };
}

const EMPTY: ActionFrame = { move: { x: 0, y: 0 }, held: new Set(), pressed: new Set() };

/** 매 프레임 한 번 poll()해서 ActionFrame을 만든다. 게임 로직은 이 프레임만 읽는다. */
export class InputManager {
  private frame: ActionFrame = EMPTY;
  private readonly sources: InputSource[] = [];

  add(source: InputSource): void {
    this.sources.push(source);
  }

  poll(): ActionFrame {
    this.frame = combineInputs(
      this.frame.held,
      this.sources.map((s) => s.state()),
    );
    return this.frame;
  }

  /** 마지막으로 poll한 프레임 (UI 표시용) */
  current(): ActionFrame {
    return this.frame;
  }
}
