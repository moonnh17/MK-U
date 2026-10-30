/**
 * 회피 구르기 (순수 함수). 이동 중이면 이동 방향, 멈춰 있으면 조준 방향으로 빠르게 움직이고 잠깐 무적이다.
 */
import type { Vec2 } from '../core/actions';
import type { Rng } from '../core/rng';
import type { DodgeSchoolDef, PlayerData } from '../types/data';

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

/** 지금 직업의 회피: 기본 + 전직 변형(없으면 null) */
export function dodgeConfig(base: PlayerData['dodge'], school: string | null): { nameKey: string; school: DodgeSchoolDef | null } {
  const sc = school ? (base.schools[school] ?? null) : null;
  return { nameKey: sc?.nameKey ?? base.nameKey, school: sc };
}

/** 점멸 도착점: 조금씩 나아가다 막히기 직전에서 멈춘다 (벽을 뚫지 않는다) */
export function blinkTarget(from: Vec2, dir: Vec2, distance: number, step: number, blocked: (x: number, y: number) => boolean): Vec2 {
  const len = Math.hypot(dir.x, dir.y) || 1;
  const ux = dir.x / len;
  const uy = dir.y / len;
  let at = from;
  for (let d = step; d <= distance; d += step) {
    const next = { x: from.x + ux * d, y: from.y + uy * d };
    if (blocked(next.x, next.y)) break;
    at = next;
  }
  return at;
}

/** 번개 모양: 두 점 사이를 segments칸으로 나눠 수직으로 흔든다 (양 끝은 고정) */
export function zigzag(a: Vec2, b: Vec2, segments: number, amp: number, rng: Rng): Vec2[] {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const pts: Vec2[] = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const off = i === 0 || i === segments ? 0 : rng.range(-amp, amp);
    pts.push({ x: a.x + dx * t + (-dy / len) * off, y: a.y + dy * t + (dx / len) * off });
  }
  return pts;
}

export function stepDodge(s: DodgeState, dt: number): DodgeState {
  return { vel: s.vel, left: Math.max(0, s.left - dt), invuln: Math.max(0, s.invuln - dt), cooldown: Math.max(0, s.cooldown - dt) };
}
