import type { ButtonAction, Vec2 } from '../core/actions';
import type { MobileLayoutData } from '../types/data';
import { layoutMobileControls, type MobileLayout, type TouchControlId } from '../ui/mobileLayout';
import type { InputSourceState } from './inputManager';

/**
 * 조이스틱 벡터 (순수 함수). 중심에서 손가락까지의 거리를 반지름으로 나눠 0~1로 자르고,
 * deadZone 이하는 0으로 본다.
 */
export function joystickVector(origin: Vec2, point: Vec2, radius: number, deadZone: number): Vec2 {
  const dx = point.x - origin.x;
  const dy = point.y - origin.y;
  const dist = Math.hypot(dx, dy);
  if (dist === 0 || radius <= 0) return { x: 0, y: 0 };
  const mag = Math.min(1, dist / radius);
  if (mag <= deadZone) return { x: 0, y: 0 };
  return { x: (dx / dist) * mag, y: (dy / dist) * mag };
}

/** 이 화면 좌표에서 조이스틱을 만들 수 있는지: 왼쪽 절반이고 버튼 위가 아니어야 한다. */
export function isJoystickZone(x: number, viewW: number): boolean {
  return x < viewW / 2;
}

/** 손가락이 요소 밖으로 나가도 이벤트를 계속 받게 한다. 이미 끝난 포인터면 무시한다. */
function capture(el: HTMLElement, pointerId: number): void {
  try {
    el.setPointerCapture(pointerId);
  } catch {
    // 포인터가 이미 사라진 경우(NotFoundError) — 캡처 없이 진행
  }
}

interface JoystickState {
  pointerId: number;
  origin: Vec2;
  point: Vec2;
}

const CONTROL_IDS: TouchControlId[] = [
  'attack',
  'dodge',
  'weaponSpecial',
  'skill1',
  'skill2',
  'skill3',
  'skill4',
  'ultimate',
  'swapWeapon',
  'inventory',
  'pause',
  'map',
];

/**
 * 화면 위 DOM 레이어에 모바일 컨트롤을 그리고 포인터 이벤트로 상태를 만든다.
 * 포인터마다 따로 추적하므로 조이스틱과 공격 버튼을 동시에 누를 수 있다(멀티터치).
 */
export class TouchSource {
  private joystick: JoystickState | null = null;
  /** pointerId → 누르고 있는 버튼 */
  private buttonPointers = new Map<number, TouchControlId>();
  /** pointerId → 누른 순간 정해진 명령 (공격 버튼이 '줍기'로 바뀐 경우 interact) */
  private pointerActions = new Map<number, ButtonAction>();
  /** 한 프레임보다 짧은 탭도 놓치지 않게, 누른 명령은 다음 state()까지 한 번은 눌린 것으로 낸다 */
  private latched = new Set<ButtonAction>();
  /** 공격 버튼을 대신할 명령. null이면 원래대로 attack */
  private attackOverride: ButtonAction | null = null;
  private readonly buttons = new Map<TouchControlId, HTMLDivElement>();
  private readonly joyBase: HTMLDivElement;
  private readonly joyKnob: HTMLDivElement;
  private layout: MobileLayout | null = null;
  private active = false;

  constructor(
    private readonly root: HTMLElement,
    private readonly cfg: MobileLayoutData,
    labels: Record<TouchControlId, string>,
  ) {
    for (const id of CONTROL_IDS) {
      const el = document.createElement('div');
      el.className = 'tbtn';
      el.dataset.control = id;
      el.textContent = labels[id];
      el.addEventListener('pointerdown', (e) => this.onButtonDown(e, id));
      root.appendChild(el);
      this.buttons.set(id, el);
    }
    this.joyBase = document.createElement('div');
    this.joyBase.className = 'joy-base';
    this.joyKnob = document.createElement('div');
    this.joyKnob.className = 'joy-knob';
    root.append(this.joyBase, this.joyKnob);
    this.hideJoystick();

    root.addEventListener('pointerdown', (e) => this.onLayerDown(e));
    root.addEventListener('pointermove', (e) => this.onMove(e));
    root.addEventListener('pointerup', (e) => this.onUp(e));
    root.addEventListener('pointercancel', (e) => this.onUp(e));
    root.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('resize', () => this.relayout());
    this.relayout();
  }

  setActive(on: boolean): void {
    this.active = on;
    this.root.classList.toggle('active', on);
    if (!on) this.releaseAll();
    this.relayout();
  }

  setDisabled(id: TouchControlId, disabled: boolean): void {
    this.buttons.get(id)?.classList.toggle('disabled', disabled);
  }

  /** 버튼을 숨긴다 (실험장에서는 런 전용 버튼을 감춘다) */
  setHidden(id: TouchControlId, hidden: boolean): void {
    this.buttons.get(id)?.classList.toggle('hidden', hidden);
  }

  /**
   * 근처에 상호작용 대상이 있으면 공격 버튼이 다른 명령(interact)을 내게 한다.
   * 이미 누르고 있던 손가락은 누른 순간의 명령을 유지한다(누른 채 다가가도 갑자기 줍지 않음).
   */
  setAttackOverride(action: ButtonAction | null, label: string): void {
    this.attackOverride = action;
    this.setLabel('attack', label);
  }

  setLabel(id: TouchControlId, label: string): void {
    const el = this.buttons.get(id);
    if (el) el.textContent = label;
  }

  /** 버튼 DOM (스킬 버튼 위에 쿨타임·레벨을 그릴 때 사용) */
  element(id: TouchControlId): HTMLDivElement | undefined {
    return this.buttons.get(id);
  }

  /** 현재 배치(HUD가 버튼을 피해서 그릴 때 사용) */
  currentLayout(): MobileLayout | null {
    return this.layout;
  }

  state(): InputSourceState {
    if (!this.active) return { move: { x: 0, y: 0 }, held: new Set() };
    const held = new Set<ButtonAction>([...this.pointerActions.values(), ...this.latched]);
    this.latched.clear();
    const move = this.joystick
      ? joystickVector(this.joystick.origin, this.joystick.point, this.cfg.joystick.radiusDp, this.cfg.joystick.deadZone)
      : { x: 0, y: 0 };
    return { move, held };
  }

  private relayout(): void {
    this.layout = layoutMobileControls(window.innerWidth, window.innerHeight, this.cfg);
    for (const [id, el] of this.buttons) {
      const r = this.layout[id];
      Object.assign(el.style, {
        left: `${r.x}px`,
        top: `${r.y}px`,
        width: `${r.w}px`,
        height: `${r.h}px`,
      });
      el.classList.toggle('square', !r.round);
    }
    const base = this.cfg.joystick.radiusDp * 2;
    Object.assign(this.joyBase.style, { width: `${base}px`, height: `${base}px` });
    const knob = this.cfg.joystick.knobDp;
    Object.assign(this.joyKnob.style, { width: `${knob}px`, height: `${knob}px` });
  }

  private onButtonDown(e: PointerEvent, id: TouchControlId): void {
    e.preventDefault();
    e.stopPropagation();
    capture(e.currentTarget as HTMLElement, e.pointerId);
    this.buttonPointers.set(e.pointerId, id);
    const action = id === 'attack' && this.attackOverride ? this.attackOverride : id;
    this.pointerActions.set(e.pointerId, action);
    this.latched.add(action);
    this.buttons.get(id)?.classList.add('pressed');
  }

  private onLayerDown(e: PointerEvent): void {
    e.preventDefault();
    if (this.joystick || !isJoystickZone(e.clientX, window.innerWidth)) return;
    capture(this.root, e.pointerId);
    const p ={ x: e.clientX, y: e.clientY };
    this.joystick = { pointerId: e.pointerId, origin: p, point: p };
    this.showJoystick();
  }

  private onMove(e: PointerEvent): void {
    if (!this.joystick || e.pointerId !== this.joystick.pointerId) return;
    this.joystick.point = { x: e.clientX, y: e.clientY };
    this.showJoystick();
  }

  private onUp(e: PointerEvent): void {
    const id = this.buttonPointers.get(e.pointerId);
    if (id) {
      this.buttonPointers.delete(e.pointerId);
      this.pointerActions.delete(e.pointerId);
      if (![...this.buttonPointers.values()].includes(id)) this.buttons.get(id)?.classList.remove('pressed');
    }
    if (this.joystick && e.pointerId === this.joystick.pointerId) {
      this.joystick = null;
      this.hideJoystick();
    }
  }

  private releaseAll(): void {
    this.buttonPointers.clear();
    this.pointerActions.clear();
    this.latched.clear();
    for (const el of this.buttons.values()) el.classList.remove('pressed');
    this.joystick = null;
    this.hideJoystick();
  }

  private showJoystick(): void {
    if (!this.joystick) return;
    const { origin } = this.joystick;
    const v = joystickVector(origin, this.joystick.point, this.cfg.joystick.radiusDp, 0);
    const r = this.cfg.joystick.radiusDp;
    this.joyBase.style.display = 'block';
    this.joyKnob.style.display = 'block';
    this.joyBase.style.left = `${origin.x}px`;
    this.joyBase.style.top = `${origin.y}px`;
    this.joyKnob.style.left = `${origin.x + v.x * r}px`;
    this.joyKnob.style.top = `${origin.y + v.y * r}px`;
  }

  private hideJoystick(): void {
    this.joyBase.style.display = 'none';
    this.joyKnob.style.display = 'none';
  }
}
