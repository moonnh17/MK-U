/**
 * 플레이어 체력·스킬 보정 (순수 함수). 정신력은 systems/sanity.ts.
 */

export interface Vitals {
  hp: number;
  maxHp: number;
}

/** 피해 */
export function takeDamage(v: Vitals, amount: number): Vitals {
  return { ...v, hp: Math.max(0, v.hp - amount) };
}

/** 회복. overflow: 최대 체력을 넘어 남은 양 */
export function heal(v: Vitals, amount: number): { hp: number; overflow: number } {
  const toHp = Math.min(Math.max(0, v.maxHp - v.hp), amount);
  return { hp: v.hp + toHp, overflow: amount - toHp };
}

/** 어느 전사의 기억: 체력 ratio 이상이면 피해 증가, 미만이면 받는 피해 감소 */
export function hpStance(hp: number, maxHp: number, e: { ratio: number; damageUp: number; takenDown: number }): { damage: number; taken: number } {
  return hp >= maxHp * e.ratio ? { damage: e.damageUp, taken: 0 } : { damage: 0, taken: e.takenDown };
}

/** 체력 소모(죽지 않음: 최소 1 남김). 소모한 양도 돌려준다 */
export function payHp(hp: number, ratio: number): { hp: number; paid: number } {
  const paid = Math.min(Math.max(0, hp - 1), hp * ratio);
  return { hp: hp - paid, paid };
}

/** 스킬이 주는 플레이어 보정 (MK 슈트) */
export interface PlayerMods {
  /** 이동속도 증가 비율 */
  moveSpeed: number;
  /** 받는 피해 감소 비율 (0~1) */
  damageReduction: number;
  /** 움직일 수 없음 (MK 레이저 집중 사격) */
  rooted?: boolean;
}

export const NO_MODS: PlayerMods = { moveSpeed: 0, damageReduction: 0 };

/** 이동속도는 더하고, 피해 감소는 곱해서 합친다(100%가 되지 않음) */
export function combineMods(list: readonly Partial<PlayerMods>[]): PlayerMods {
  let moveSpeed = 0;
  let keep = 1;
  let rooted = false;
  for (const m of list) {
    moveSpeed += m.moveSpeed ?? 0;
    keep *= 1 - Math.min(1, Math.max(0, m.damageReduction ?? 0));
    rooted ||= m.rooted ?? false;
  }
  return { moveSpeed, damageReduction: 1 - keep, rooted };
}
