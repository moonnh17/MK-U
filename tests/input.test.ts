import { describe, expect, it } from 'vitest';
import { BUTTON_ACTIONS, type ButtonAction } from '../src/core/actions';
import { gameData } from '../src/data/index';
import { combineInputs } from '../src/input/inputManager';
import { isBoundKey, resolveKeyboard } from '../src/input/keyboard';
import { isJoystickZone, joystickVector } from '../src/input/touch';
import { initialUiMode, nextUiMode } from '../src/input/uiMode';

const kb = gameData.keybindings;
const keys = (...codes: string[]) => resolveKeyboard(new Set(codes), kb);

describe('키보드 → ActionCommand', () => {
  it('WASD는 이동 벡터가 된다', () => {
    expect(keys('KeyW').move).toEqual({ x: 0, y: -1 });
    expect(keys('KeyS').move).toEqual({ x: 0, y: 1 });
    expect(keys('KeyA').move).toEqual({ x: -1, y: 0 });
    expect(keys('KeyD').move).toEqual({ x: 1, y: 0 });
  });

  it('대각선은 길이 1로 정규화되고, 반대 키는 상쇄된다', () => {
    const d = keys('KeyW', 'KeyD').move;
    expect(Math.hypot(d.x, d.y)).toBeCloseTo(1);
    expect(keys('KeyA', 'KeyD').move).toEqual({ x: 0, y: 0 });
  });

  it.each([
    ['Space', 'attack'],
    ['KeyE', 'swapWeapon'],
    ['KeyF', 'interact'],
    ['KeyI', 'inventory'],
    ['Tab', 'map'],
    ['Escape', 'pause'],
    ['Digit1', 'skill1'],
    ['Numpad1', 'skill1'],
    ['Digit4', 'skill4'],
    ['Numpad4', 'skill4'],
    ['Digit5', 'ultimate'],
    ['Numpad5', 'ultimate'],
  ] as [string, ButtonAction][])('%s → %s', (code, action) => {
    expect([...keys(code).held]).toEqual([action]);
  });

  it('모든 버튼 명령에 키가 하나 이상 있다', () => {
    for (const a of BUTTON_ACTIONS) expect(kb.buttons[a].length).toBeGreaterThan(0);
  });

  it('묶이지 않은 키는 무시한다', () => {
    expect(keys('KeyZ').held.size).toBe(0);
    expect(isBoundKey('KeyZ', kb)).toBe(false);
    expect(isBoundKey('Tab', kb)).toBe(true);
    expect(isBoundKey('F1', kb)).toBe(true);
  });
});

describe('조이스틱', () => {
  const o = { x: 100, y: 100 };

  it('반지름 밖으로 끌면 길이 1로 잘린다', () => {
    const v = joystickVector(o, { x: 300, y: 100 }, 50, 0.15);
    expect(v.x).toBeCloseTo(1);
    expect(v.y).toBeCloseTo(0);
  });

  it('반지름 안에서는 아날로그 값', () => {
    const v = joystickVector(o, { x: 100, y: 125 }, 50, 0.15);
    expect(v.y).toBeCloseTo(0.5);
  });

  it('데드존 안은 0', () => {
    expect(joystickVector(o, { x: 105, y: 100 }, 50, 0.15)).toEqual({ x: 0, y: 0 });
  });

  it('조이스틱은 화면 왼쪽 절반에서만 생긴다', () => {
    expect(isJoystickZone(10, 800)).toBe(true);
    expect(isJoystickZone(500, 800)).toBe(false);
  });
});

describe('입력 합성 (멀티터치 포함)', () => {
  it('조이스틱 이동과 공격 버튼이 같은 프레임에 함께 들어온다', () => {
    const joystick = { move: { x: 0.8, y: 0 }, held: new Set<ButtonAction>(['attack']) };
    const f = combineInputs(new Set(), [{ move: { x: 0, y: 0 }, held: new Set() }, joystick]);
    expect(f.move).toEqual({ x: 0.8, y: 0 });
    expect(f.held.has('attack')).toBe(true);
    expect(f.pressed.has('attack')).toBe(true);
  });

  it('pressed는 새로 눌린 순간에만 들어간다', () => {
    const s = [{ move: { x: 0, y: 0 }, held: new Set<ButtonAction>(['attack']) }];
    const first = combineInputs(new Set(), s);
    const second = combineInputs(first.held, s);
    expect(first.pressed.has('attack')).toBe(true);
    expect(second.pressed.has('attack')).toBe(false);
    expect(second.held.has('attack')).toBe(true);
  });

  it('여러 소스의 버튼은 합쳐지고, 이동은 더 큰 쪽을 쓴다', () => {
    const f = combineInputs(new Set(), [
      { move: { x: 0, y: -1 }, held: new Set<ButtonAction>(['skill1']) },
      { move: { x: 0.3, y: 0 }, held: new Set<ButtonAction>(['attack']) },
    ]);
    expect(f.move).toEqual({ x: 0, y: -1 });
    expect([...f.held].sort()).toEqual(['attack', 'skill1']);
  });
});

describe('UI 모드', () => {
  it('강제 설정이 우선한다', () => {
    expect(initialUiMode('mobile', false)).toBe('mobile');
    expect(initialUiMode('pc', true)).toBe('pc');
    expect(nextUiMode('pc', 'pc', 'touch')).toBe('pc');
  });

  it('자동: 거친 포인터면 모바일로 시작, 터치하면 모바일·키보드면 PC', () => {
    expect(initialUiMode('auto', true)).toBe('mobile');
    expect(initialUiMode('auto', false)).toBe('pc');
    expect(nextUiMode('auto', 'pc', 'touch')).toBe('mobile');
    expect(nextUiMode('auto', 'mobile', 'keyboard')).toBe('pc');
  });
});
