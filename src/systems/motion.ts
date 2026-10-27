/**
 * 움직임 계산 (순수 함수): 벽에 튕기는 투사체(오리온의 방패), 적을 따라 휘는 탄(아비오르의 지팡이).
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

/** 유니크 무기 고유 효과: every번째 공격인가 (count = 이번 공격까지 센 수, 1부터) */
export function signatureFires(count: number, every: number): boolean {
  return every > 0 && count > 0 && count % every === 0;
}
