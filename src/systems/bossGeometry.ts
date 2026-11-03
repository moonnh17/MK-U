/**
 * 보스 패턴 기하 (순수 함수): 고리 틈 판정, 틈 있는 원형 탄막, 이동 예측.
 */
import type { Vec2 } from '../core/actions';

/** angle이 gapAngle을 중심으로 gapDeg만큼 벌어진 틈 안인가 */
export function inGap(angle: number, gapAngle: number, gapDeg: number): boolean {
  const diff = Math.atan2(Math.sin(angle - gapAngle), Math.cos(angle - gapAngle));
  return Math.abs(diff) <= (gapDeg * Math.PI) / 360;
}

/** n방향 원형 탄막에서 gapStart부터 연속 gap발을 비운 각도들 */
export function gapBulletAngles(n: number, gapStart: number, gap: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    if ((i - gapStart + n) % n < gap) continue;
    out.push((i * Math.PI * 2) / n);
  }
  return out;
}

/** 지금 위치·속도로 sec 뒤 자리 */
export function predictPoint(pos: Vec2, vel: Vec2, sec: number): Vec2 {
  return { x: pos.x + vel.x * sec, y: pos.y + vel.y * sec };
}

/** 체력 비율 → 체력 단계 (넘어선 문턱 수). thresholds는 내림차순 */
export function hpStage(hpRatio: number, thresholds: readonly number[] = []): number {
  return thresholds.filter((t) => hpRatio <= t).length;
}
