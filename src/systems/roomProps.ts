/**
 * 방 소품 배치 (순수 함수, 시드 재현): 부서지는 상자, 폭발 통, 일회용 석상.
 * 장애물·문 앞 통로·가운데 등 avoid 자리와 소품끼리의 간격을 피해 놓는다. 자리가 없으면 그만큼 적게 놓는다.
 */
import type { Rng } from '../core/rng';
import type { RoomPropRule, StatueKind } from '../types/data';

export interface PropArea {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type RoomPropSpot = { x: number; y: number } & ({ kind: 'crate' | 'barrel' } | { kind: 'statue'; statue: StatueKind });

/** 소품 하나당 자리 찾기 시도 횟수 */
const TRIES = 30;

export function placeRoomProps(rng: Rng, area: PropArea, avoid: readonly PropArea[], rule: RoomPropRule, spacingPx: number, statues: readonly StatueKind[]): RoomPropSpot[] {
  const out: RoomPropSpot[] = [];
  const free = (x: number, y: number) =>
    !avoid.some((a) => x >= a.x && y >= a.y && x <= a.x + a.w && y <= a.y + a.h) && !out.some((o) => Math.hypot(o.x - x, o.y - y) < spacingPx);
  const place = (make: (x: number, y: number) => RoomPropSpot) => {
    for (let t = 0; t < TRIES; t++) {
      const x = rng.range(area.x, area.x + area.w);
      const y = rng.range(area.y, area.y + area.h);
      if (!free(x, y)) continue;
      out.push(make(x, y));
      return;
    }
  };
  if (statues.length > 0 && rng.chance(rule.statueChance)) {
    const statue = rng.pick(statues);
    place((x, y) => ({ kind: 'statue', statue, x, y }));
  }
  const crates = rng.int(rule.crates[0], rule.crates[1]);
  for (let i = 0; i < crates; i++) place((x, y) => ({ kind: 'crate', x, y }));
  const barrels = rng.int(rule.barrels[0], rule.barrels[1]);
  for (let i = 0; i < barrels; i++) place((x, y) => ({ kind: 'barrel', x, y }));
  return out;
}

/** 깎고 남은 내구도와 부서졌는지 */
export function damageProp(hp: number, amount: number): { hp: number; broken: boolean } {
  const left = Math.max(0, hp - amount);
  return { hp: left, broken: left <= 0 };
}

/** 상자 드롭: 종류별 확률로 min~max개 */
export function crateDrops(rng: Rng, drops: { chance: number; count: [number, number] }): number {
  return rng.chance(drops.chance) ? rng.int(drops.count[0], drops.count[1]) : 0;
}
