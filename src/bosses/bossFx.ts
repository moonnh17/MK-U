/**
 * 보스 패턴 연출 도구: 몸짓 곡선(웅크림 → 내지름 → 복귀)과 가산 혼합 불티·충격파.
 * 판정과 무관한 겉모습만 다룬다. 그림 한 장짜리 자세 사이를 몸짓과 불티로 잇는다.
 */
import type { Vec2 } from '../core/actions';
import type { Rng } from '../core/rng';
import type Phaser from 'phaser';
import type { BossBody } from './patterns';

export const clamp01 = (k: number): number => Math.min(1, Math.max(0, k));
export const easeOut = (k: number): number => 1 - (1 - clamp01(k)) ** 3;

/** 목표 쪽 기울기 부호: 목표가 오른쪽이면 +1 (위·아래면 기울지 않는다) */
const side = (angle: number): number => (Math.abs(Math.cos(angle)) < 0.2 ? 0 : Math.sign(Math.cos(angle)));

/** 준비: 진행도 k만큼 웅크리고 목표 반대쪽으로 젖힌다. amount = 세기 */
export function coil(boss: BossBody, k: number, toward: number, amount = 1): void {
  const e = easeOut(k) * amount;
  boss.shape(1 + 0.1 * e, 1 - 0.1 * e, -side(toward) * 0.12 * e);
}

/** 내지른 뒤: since초 동안 목표 쪽으로 늘어났다가 제자리로 (dur초에 끝) */
export function lunge(boss: BossBody, since: number, toward: number, dur = 0.3, amount = 1): void {
  const r = (1 - easeOut(since / dur)) * amount;
  boss.shape(1 - 0.1 * r, 1 + 0.14 * r, side(toward) * 0.15 * r);
}

/** 착지·내려앉음: 납작했다가 제자리로 */
export function land(boss: BossBody, since: number, dur = 0.3, amount = 1): void {
  const r = (1 - easeOut(since / dur)) * amount;
  boss.shape(1 + 0.16 * r, 1 - 0.16 * r, 0);
}

function spark(scene: Phaser.Scene, x: number, y: number, w: number, h: number, color: number, rot: number, to: Vec2, sec: number, delayMs = 0): void {
  const r = scene.add.rectangle(x, y, w, h, color).setDepth(6).setRotation(rot).setBlendMode('ADD');
  scene.tweens.add({ targets: r, x: to.x, y: to.y, alpha: 0, scaleX: 0.3, duration: sec * 1000, delay: delayMs, ease: 'Cubic.easeOut', onComplete: () => r.destroy() });
}

/** 둘레(반경 fromR)에서 at으로 빨려 드는 빛 알갱이 (기 모으기) */
export function motes(scene: Phaser.Scene, rng: Rng, at: Vec2, color: number, n: number, fromR: number, sec = 0.35): void {
  for (let i = 0; i < n; i++) {
    const a = rng.range(0, Math.PI * 2);
    const r = fromR * rng.range(0.7, 1.1);
    const x = at.x + Math.cos(a) * r;
    const y = at.y + Math.sin(a) * r;
    const m = scene.add.rectangle(x, y, 2, 2, i % 3 === 0 ? 0xffffff : color).setDepth(6).setBlendMode('ADD').setAlpha(0);
    scene.tweens.add({ targets: m, x: at.x, y: at.y, alpha: { from: 0.2, to: 1 }, duration: sec * 1000, ease: 'Quad.easeIn', onComplete: () => m.destroy() });
  }
}

/**
 * at에서 바깥으로 튀는 빛줄기. arc를 주면 그 방향 부채꼴로만 (angle, spreadRad).
 * fromR: 시작 반경(호를 따라 튀게 할 때)
 */
export function burst(scene: Phaser.Scene, rng: Rng, at: Vec2, color: number, n: number, speed: [number, number], sec = 0.4, arc?: { angle: number; spread: number }, fromR = 0): void {
  for (let i = 0; i < n; i++) {
    const a = arc ? arc.angle + rng.range(-arc.spread / 2, arc.spread / 2) : rng.range(0, Math.PI * 2);
    const r0 = fromR * rng.range(0.5, 1);
    const x = at.x + Math.cos(a) * r0;
    const y = at.y + Math.sin(a) * r0;
    const d = rng.range(speed[0], speed[1]) * sec;
    const c = i % 3 === 0 ? 0xffffff : color;
    spark(scene, x, y, rng.range(5, 11), 1, c, a, { x: x + Math.cos(a) * d, y: y + Math.sin(a) * d }, sec * rng.range(0.7, 1.2), rng.range(0, 40));
  }
}

/** 퍼지는 충격파 고리 */
export function shockRing(scene: Phaser.Scene, at: Vec2, radius: number, color: number, sec = 0.35, width = 2): void {
  const ring = scene.add.circle(at.x, at.y, Math.max(2, radius * 0.25)).setStrokeStyle(width, color, 1).setDepth(6).setBlendMode('ADD');
  scene.tweens.add({ targets: ring, radius, alpha: 0, duration: sec * 1000, ease: 'Cubic.easeOut', onComplete: () => ring.destroy() });
}

/** 두 점 사이 지그재그 번개 한 줄기 (번쩍 하고 사라진다) */
export function crackle(scene: Phaser.Scene, rng: Rng, from: Vec2, to: Vec2, color: number, sec = 0.14, width = 1): void {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const n = Math.max(3, Math.round(len / 10));
  const pts: Vec2[] = [from];
  for (let i = 1; i < n; i++) {
    const k = i / n;
    const j = rng.range(-1, 1) * Math.min(10, len * 0.15);
    pts.push({ x: from.x + dx * k + nx * j, y: from.y + dy * k + ny * j });
  }
  pts.push(to);
  const g = scene.add.graphics().setDepth(6).setBlendMode('ADD');
  g.lineStyle(width + 2, color, 0.5).strokePoints(pts);
  g.lineStyle(width, 0xffffff, 1).strokePoints(pts);
  scene.tweens.add({ targets: g, alpha: 0, duration: sec * 1000, onComplete: () => g.destroy() });
}

/** 몸 둘레에 튀는 짧은 전기 (radius 근처에서 바깥으로) */
export function sparkAround(scene: Phaser.Scene, rng: Rng, at: Vec2, radius: number, color: number): void {
  const a = rng.range(0, Math.PI * 2);
  const r0 = radius * rng.range(0.4, 0.9);
  const r1 = radius * rng.range(1.1, 1.5);
  const b = a + rng.range(-0.5, 0.5);
  crackle(scene, rng, { x: at.x + Math.cos(a) * r0, y: at.y + Math.sin(a) * r0 }, { x: at.x + Math.cos(b) * r1, y: at.y + Math.sin(b) * r1 }, color, 0.1);
}
