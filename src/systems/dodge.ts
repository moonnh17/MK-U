/**
 * 회피 구르기 (순수 함수). 이동 중이면 이동 방향, 멈춰 있으면 조준 방향으로 빠르게 움직이고 잠깐 무적이다.
 */
import type { Vec2 } from '../core/actions';

export interface DodgeConfig {
  speed: number;
  durationSec: number;
  invulnSec: number;
  cooldownSec: number;
}

export interface DodgeState {
  vel: Vec2;
  /** 남은 구르기 시간(초) */
  left: number;
  /** 남은 무적(초) */
  invuln: number;
  /** 남은 재사용 대기(초) */
  cooldown: number;
}

export const IDLE_DODGE: DodgeState = { vel: { x: 0, y: 0 }, left: 0, invuln: 0, cooldown: 0 };

export function dodgeReady(cooldown: number): boolean {
  return cooldown <= 0;
}

/** 재사용 대기 중이면 null */
export function startDodge(cooldown: number, move: Vec2, aim: Vec2, c: DodgeConfig): DodgeState | null {
  if (!dodgeReady(cooldown)) return null;
  const dir = move.x !== 0 || move.y !== 0 ? move : aim;
  const len = Math.hypot(dir.x, dir.y) || 1;
  return { vel: { x: (dir.x / len) * c.speed, y: (dir.y / len) * c.speed }, left: c.durationSec, invuln: c.invulnSec, cooldown: c.cooldownSec };
}

export function stepDodge(s: DodgeState, dt: number): DodgeState {
  return { vel: s.vel, left: Math.max(0, s.left - dt), invuln: Math.max(0, s.invuln - dt), cooldown: Math.max(0, s.cooldown - dt) };
}
