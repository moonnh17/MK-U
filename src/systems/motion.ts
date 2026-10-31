/**
 * 움직임 계산 (순수 함수): 벽에 튕기는 투사체(오리온의 방패), 적을 따라 휘는 탄(아비오르의 지팡이), 든 무기의 자세.
 */
import type { Vec2 } from '../core/actions';
import type { Rect } from '../entities/hazard';

/**
 * 사각형 안에서 한 프레임 이동. 반지름 r의 원이 벽에 닿으면 그 축 속도를 뒤집는다.
 * bounces: 이번 프레임에 튕긴 횟수 (모서리에 닿으면 2)
 */
export function bounceStep(pos: Vec2, vel: Vec2, dt: number, rect: Rect, r: number): { pos: Vec2; vel: Vec2; bounces: number } {
  let x = pos.x + vel.x * dt;
  let y = pos.y + vel.y * dt;
  let vx = vel.x;
  let vy = vel.y;
  let bounces = 0;
  const minX = rect.x + r;
  const maxX = rect.x + rect.w - r;
  const minY = rect.y + r;
  const maxY = rect.y + rect.h - r;
  if (x < minX || x > maxX) {
    x = x < minX ? 2 * minX - x : 2 * maxX - x;
    vx = -vx;
    bounces++;
  }
  if (y < minY || y > maxY) {
    y = y < minY ? 2 * minY - y : 2 * maxY - y;
    vy = -vy;
    bounces++;
  }
  return { pos: { x: Math.min(maxX, Math.max(minX, x)), y: Math.min(maxY, Math.max(minY, y)) }, vel: { x: vx, y: vy }, bounces };
}

/** 속도 방향을 목표 쪽으로 최대 turnRate*dt만큼 돌린다 (빠르기는 그대로) */
export function steerToward(vel: Vec2, from: Vec2, target: Vec2, turnRate: number, dt: number): Vec2 {
  const speed = Math.hypot(vel.x, vel.y);
  if (speed === 0) return vel;
  const cur = Math.atan2(vel.y, vel.x);
  const want = Math.atan2(target.y - from.y, target.x - from.x);
  let diff = want - cur;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  const max = turnRate * dt;
  const a = cur + Math.max(-max, Math.min(max, diff));
  return { x: Math.cos(a) * speed, y: Math.sin(a) * speed };
}

export type WeaponMotionKind = 'recoil' | 'staff' | 'swing' | 'thrust' | 'smash' | 'wave';

export interface WeaponMotionParams {
  /** 조준에서 벗어나는 각도(라디안): recoil 들림 / swing 반폭 / wave 흔들림 / smash 시작 */
  rad?: number;
  /** smash 끝 각도(라디안) */
  toRad?: number;
  /** 앞뒤 이동(px): recoil·staff 뒤로 / thrust 앞으로 */
  px?: number;
  /** swing 방향 (1 또는 -1) */
  sign?: number;
}

/** 움직임 시간 0~1에서 조준 기준 각도(rot, 라디안, 조준이 오른쪽일 때 + = 아래)와 조준 방향 이동(push) */
export function weaponPose(kind: WeaponMotionKind, t: number, o: WeaponMotionParams): { rot: number; push: number } {
  const k = Math.max(0, Math.min(1, t));
  const rad = o.rad ?? 0;
  const px = o.px ?? 0;
  if (kind === 'recoil' || kind === 'staff') {
    const d = (1 - k) ** 2;
    return { rot: kind === 'recoil' ? -rad * d : 0, push: -px * d };
  }
  if (kind === 'thrust') return { rot: 0, push: px * (k < 0.35 ? 1 - (1 - k / 0.35) ** 2 : 1 - (k - 0.35) / 0.65) };
  if (kind === 'wave') return { rot: rad * Math.sin(k * Math.PI * 3) * (1 - k), push: 0 };
  // 들어 올렸다(0~12%) 빠르게 내지르고(~65%) 제자리로 돌아온다
  const from = kind === 'swing' ? (o.sign ?? 1) * rad : rad;
  const to = kind === 'swing' ? -(o.sign ?? 1) * rad : (o.toRad ?? 0);
  if (k < 0.12) return { rot: from * (k / 0.12), push: 0 };
  if (k < 0.65) {
    const u = (k - 0.12) / 0.53;
    return { rot: from + (to - from) * (1 - (1 - u) ** 3), push: 0 };
  }
  return { rot: to * (1 - (k - 0.65) / 0.35), push: 0 };
}

/** 유니크 무기 고유 효과: every번째 공격인가 (count = 이번 공격까지 센 수, 1부터) */
export function signatureFires(count: number, every: number): boolean {
  return every > 0 && count > 0 && count % every === 0;
}
