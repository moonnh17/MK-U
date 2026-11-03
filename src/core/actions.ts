/**
 * 행동 명령. 게임 로직은 키 이름이나 터치 좌표를 직접 읽지 않고 이것만 받는다.
 * `move`는 연속값(벡터), 나머지는 버튼(누름/뗌)이다.
 */
export const BUTTON_ACTIONS = [
  'attack',
  'dodge',
  'weaponSpecial',
  'skill1',
  'skill2',
  'skill3',
  'skill4',
  'ultimate',
  'swapWeapon',
  'interact',
  'inventory',
  'map',
  'pause',
] as const;

export type ButtonAction = (typeof BUTTON_ACTIONS)[number];
export type ActionCommand = 'move' | ButtonAction;

export interface Vec2 {
  x: number;
  y: number;
}

/** 한 프레임의 입력 결과 */
export interface ActionFrame {
  /** 이동 방향. 길이 0~1 (조이스틱은 아날로그, 키보드는 0 또는 1) */
  move: Vec2;
  /** 지금 눌려 있는 버튼 */
  held: ReadonlySet<ButtonAction>;
  /** 이번 프레임에 새로 눌린 버튼 */
  pressed: ReadonlySet<ButtonAction>;
}

export function isButtonAction(v: string): v is ButtonAction {
  return (BUTTON_ACTIONS as readonly string[]).includes(v);
}
