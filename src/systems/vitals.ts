/**
 * 플레이어 체력·보호막·스킬 보정 (순수 함수).
 * 보호막(HUD 보호막 바)은 체력보다 먼저 깎인다. 지금은 환원주의자 각성(제1원리)만 채운다.
 */

export interface Vitals {
  hp: number;
  maxHp: number;
  shield: number;
  shieldMax: number;
}

/** 피해: 보호막부터 깎고 남은 만큼 체력 */
export function takeDamage(v: Vitals, amount: number): Vitals {
  const toShield = Math.min(v.shield, amount);
  return { ...v, shield: v.shield - toShield, hp: Math.max(0, v.hp - (amount - toShield)) };
}

/** 회복. overflowToShield면 최대 체력을 넘는 양을 보호막으로(보호막 최대치까지) */
export function heal(v: Vitals, amount: number, overflowToShield: boolean): Vitals {
  const room = Math.max(0, v.maxHp - v.hp);
  const toHp = Math.min(room, amount);
  const extra = amount - toHp;
  const shield = overflowToShield ? Math.min(v.shieldMax, v.shield + extra) : v.shield;
  return { ...v, hp: v.hp + toHp, shield: Math.max(v.shield, shield) };
}

/** 체력 소모(죽지 않음: 최소 1 남김). 소모한 양도 돌려준다 */
export function payHp(hp: number, ratio: number): { hp: number; paid: number } {
  const paid = Math.min(Math.max(0, hp - 1), hp * ratio);
  return { hp: hp - paid, paid };
}

/** 스킬이 주는 플레이어 보정 (MK 슈트, 제1원리 보호막 최대치) */
export interface PlayerMods {
  /** 이동속도 증가 비율 */
  moveSpeed: number;
  /** 받는 피해 감소 비율 (0~1) */
  damageReduction: number;
  /** 보호막 최대치 증가 */
  shieldMax: number;
}

export const NO_MODS: PlayerMods = { moveSpeed: 0, damageReduction: 0, shieldMax: 0 };

/** 이동속도·보호막은 더하고, 피해 감소는 곱해서 합친다(100%가 되지 않음) */
export function combineMods(list: readonly Partial<PlayerMods>[]): PlayerMods {
  let moveSpeed = 0;
  let keep = 1;
  let shieldMax = 0;
  for (const m of list) {
    moveSpeed += m.moveSpeed ?? 0;
    keep *= 1 - Math.min(1, Math.max(0, m.damageReduction ?? 0));
    shieldMax += m.shieldMax ?? 0;
  }
  return { moveSpeed, damageReduction: 1 - keep, shieldMax };
}
