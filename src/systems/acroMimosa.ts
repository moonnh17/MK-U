/**
 * 7-5 아크로 학파 연구원 미모사 (순수 함수, 제안): 순간이동 자리, 공간 베기 선, 맵 곳곳 소환(넘어갈 칸·소환 목록),
 * 2→3 전환의 합 겨루기 시간표. 페이즈 문턱은 헥타르 미모사와 같은 mimosaPhase를 쓴다.
 */
import type { Vec2 } from '../core/actions';
import type { Rng } from '../core/rng';
import type { BossesData } from '../types/data';
import type { Rect } from './mimosa';

/** 한 점을 지나는 직선 (길이는 그릴 때 정한다) */
export interface CutLine {
  x: number;
  y: number;
  angle: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** 순간이동 자리: 플레이어에게서 min~max 떨어진 방 안 (가장자리 edge 여백). 못 찾으면 범위 안으로 당긴 자리 */
export function blinkTarget(rng: Rng, arena: Rect, player: Vec2, minD: number, maxD: number, edge: number): Vec2 {
  const inside = (p: Vec2) => ({ x: clamp(p.x, arena.x + edge, arena.x + arena.w - edge), y: clamp(p.y, arena.y + edge, arena.y + arena.h - edge) });
  for (let i = 0; i < 12; i++) {
    const a = rng.range(0, Math.PI * 2);
    const d = rng.range(minD, maxD);
    const p = { x: player.x + Math.cos(a) * d, y: player.y + Math.sin(a) * d };
    const q = inside(p);
    if (Math.hypot(q.x - p.x, q.y - p.y) < 1) return q;
  }
  return inside({ x: player.x + rng.range(-maxD, maxD), y: player.y - minD });
}

/** 공간 베기: 첫 선은 플레이어를 정확히 지나고, 나머지는 옆으로 spread 안에서 비껴 지난다 */
export function cutLines(rng: Rng, player: Vec2, n: number, spread: number): CutLine[] {
  return Array.from({ length: n }, (_, i) => {
    const angle = rng.range(0, Math.PI);
    if (i === 0) return { x: player.x, y: player.y, angle };
    const off = rng.range(-spread, spread);
    return { x: player.x - Math.sin(angle) * off, y: player.y + Math.cos(angle) * off, angle };
  });
}

/** 교차 베기: 가운데를 지나는 n개의 선이 고르게 (선 사이 쐐기가 안전 구역) */
export function crossLines(rng: Rng, center: Vec2, n: number): CutLine[] {
  const base = rng.range(0, Math.PI / n);
  return Array.from({ length: n }, (_, i) => ({ x: center.x, y: center.y, angle: base + (i * Math.PI) / n }));
}

/** 점에서 선(가운데 기준 길이 len) 까지 거리 */
export function segmentDist(p: Vec2, l: CutLine, len: number): number {
  const dx = Math.cos(l.angle);
  const dy = Math.sin(l.angle);
  const t = clamp((p.x - l.x) * dx + (p.y - l.y) * dy, -len / 2, len / 2);
  return Math.hypot(p.x - (l.x + dx * t), p.y - (l.y + dy * t));
}

/** 함께 넘어갈 칸: 보스방·직전 칸 말고 아무 칸. 없으면 null */
export function hopRoom(rng: Rng, rooms: readonly { id: number }[], bossRoom: number, last: number | null): number | null {
  const pool = rooms.filter((r) => r.id !== bossRoom && r.id !== last);
  return pool.length > 0 ? rng.pick(pool).id : null;
}

/** 그 장(테마)의 본편 보스 중 소환할 수 있는 것 */
export function themeBosses(d: { bosses: BossesData }, chapter: number, exclude: readonly string[]): string[] {
  return d.bosses.bosses.filter((b) => b.chapter === chapter && !exclude.includes(b.id)).map((b) => b.id);
}

/** 소환 목록: 그 장 일반 적 count마리 + 그 장 보스 하나 (없으면 null) */
export function summonPlan(rng: Rng, roster: readonly string[], bosses: readonly string[], count: number): { normals: string[]; boss: string | null } {
  return { normals: roster.length > 0 ? Array.from({ length: count }, () => rng.pick(roster)) : [], boss: bosses.length > 0 ? rng.pick(bosses) : null };
}

/** 합 겨루기: 각 합의 시각 (간격이 start에서 end까지 기하급수로 줄어든다) */
export function clashTimes(hops: number, startGap: number, endGap: number): number[] {
  const r = hops > 1 ? Math.pow(endGap / startGap, 1 / (hops - 1)) : 1;
  let t = 0;
  return Array.from({ length: hops }, (_, i) => (t += startGap * Math.pow(r, i)));
}
