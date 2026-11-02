/**
 * 실험체의 기억: 마기력 결정으로 직업마다 따로 하는 영구 강화 (순수 함수).
 * 레벨이 오를수록 비용이 커지고(비용 표), 강화 값은 그 직업으로 시작하는 모든 런에 적용된다.
 * 초기화하면 그 직업에 쓴 결정을 전부 돌려준다.
 */
import type { SaveData } from '../core/save';
import type { UpgradeDef } from '../types/data';

export type UpgradeLevels = Readonly<Record<string, number>>;

export function upgradeLevel(levels: UpgradeLevels | undefined, id: string): number {
  return levels?.[id] ?? 0;
}

/** 다음 레벨 비용 (최대 레벨이면 null) */
export function nextCost(def: UpgradeDef, level: number): number | null {
  return def.costs[level] ?? null;
}

/** 지금 레벨까지 쓴 결정 */
export function spentOn(levels: UpgradeLevels | undefined, defs: readonly UpgradeDef[]): number {
  let sum = 0;
  for (const d of defs) {
    const lv = Math.min(upgradeLevel(levels, d.id), d.costs.length);
    for (let i = 0; i < lv; i++) sum += d.costs[i]!;
  }
  return sum;
}

/** 강화 한 번. 결정이 모자라거나 최대 레벨이면 false (저장은 그대로) */
export function buyUpgrade(save: SaveData, jobId: string, def: UpgradeDef): boolean {
  const levels = (save.upgrades[jobId] ??= {});
  const lv = upgradeLevel(levels, def.id);
  const cost = nextCost(def, lv);
  if (cost === null || save.crystals < cost) return false;
  save.crystals -= cost;
  levels[def.id] = lv + 1;
  return true;
}

/** 그 직업 강화 초기화: 쓴 결정을 전부 돌려주고, 돌려준 양을 반환 */
export function resetUpgrades(save: SaveData, jobId: string, defs: readonly UpgradeDef[]): number {
  const refund = spentOn(save.upgrades[jobId], defs);
  save.crystals += refund;
  save.upgrades[jobId] = {};
  return refund;
}

/** 삭제된 스탯 강화: 레벨을 지우고 쓴 결정을 돌려준다. 돌려준 양을 반환 */
export function refundRemovedUpgrades(save: SaveData, removed: { ids: readonly string[]; costs: readonly number[] }): number {
  let refund = 0;
  for (const levels of Object.values(save.upgrades)) {
    for (const id of removed.ids) {
      for (let i = 0; i < Math.min(levels[id] ?? 0, removed.costs.length); i++) refund += removed.costs[i]!;
      delete levels[id];
    }
  }
  save.crystals += refund;
  return refund;
}

export interface UpgradeBonus {
  /** 기본 체력 증가 */
  maxHp: number;
  /** 최대 정신력 증가 */
  sanity: number;
}

/** 런 시작에 더할 값 */
export function upgradeBonus(levels: UpgradeLevels | undefined, defs: readonly UpgradeDef[]): UpgradeBonus {
  const out: UpgradeBonus = { maxHp: 0, sanity: 0 };
  for (const d of defs) {
    const v = Math.min(upgradeLevel(levels, d.id), d.costs.length) * d.perLevel;
    out[d.kind] += v;
  }
  return out;
}
