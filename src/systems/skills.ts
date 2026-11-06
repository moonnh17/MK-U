/**
 * 스킬 보유·장착·레벨·각성·쿨타임 (순수 함수). 원본 상태를 바꾸지 않고 새 값을 돌려준다.
 * - 액티브 습득 시 빈 칸에 자동 장착, 칸이 다 차면 보관. 패시브도 1칸 + 보관.
 * - 장착하지 않은 스킬도 레벨업·각성된다.
 */
import type { SkillDef, SkillsData } from '../types/data';

export interface OwnedSkill {
  level: number;
  awakened: boolean;
  /** 습득 순서 (보관 목록·각성 카드 정렬) */
  order: number;
}

export interface SkillLoadout {
  owned: Record<string, OwnedSkill>;
  /** 액티브 장착 칸. 빈 칸은 null */
  active: (string | null)[];
  passive: string | null;
  nextOrder: number;
}

export function emptyLoadout(activeSlots: number): SkillLoadout {
  return { owned: {}, active: Array.from({ length: activeSlots }, () => null), passive: null, nextOrder: 0 };
}

export function findSkill(data: SkillsData, id: string): SkillDef {
  const def = data.skills.find((s) => s.id === id);
  if (!def) throw new Error(`스킬 '${id}' 없음`);
  return def;
}

export function isEquipped(lo: SkillLoadout, id: string): boolean {
  return lo.passive === id || lo.active.includes(id);
}

function cloneLoadout(lo: SkillLoadout): SkillLoadout {
  return { owned: { ...lo.owned }, active: [...lo.active], passive: lo.passive, nextOrder: lo.nextOrder };
}

/** 새 스킬 습득. equipped=false면 보관함으로 갔다 */
export function acquireSkill(lo: SkillLoadout, def: SkillDef): { loadout: SkillLoadout; equipped: boolean } {
  if (lo.owned[def.id]) throw new Error(`이미 가진 스킬 '${def.id}'`);
  const next = cloneLoadout(lo);
  next.owned[def.id] = { level: 1, awakened: false, order: next.nextOrder++ };
  let equipped = false;
  if (def.kind === 'passive') {
    if (next.passive === null) {
      next.passive = def.id;
      equipped = true;
    }
  } else {
    const empty = next.active.indexOf(null);
    if (empty !== -1) {
      next.active[empty] = def.id;
      equipped = true;
    }
  }
  return { loadout: next, equipped };
}

export function levelUpSkill(lo: SkillLoadout, id: string, maxLevel: number): SkillLoadout {
  const cur = lo.owned[id];
  if (!cur) throw new Error(`없는 스킬 '${id}'`);
  if (cur.level >= maxLevel) throw new Error(`'${id}'는 이미 최대 레벨`);
  const next = cloneLoadout(lo);
  next.owned[id] = { ...cur, level: cur.level + 1 };
  return next;
}

export function awakenSkill(lo: SkillLoadout, id: string): SkillLoadout {
  const cur = lo.owned[id];
  if (!cur) throw new Error(`없는 스킬 '${id}'`);
  if (cur.awakened) throw new Error(`'${id}'는 이미 각성함`);
  const next = cloneLoadout(lo);
  next.owned[id] = { ...cur, awakened: true };
  return next;
}

/** 디버그: 레벨을 바로 정한다. 0이면 스킬을 없애고 칸을 비운다. 없으면 습득부터 */
export function setSkillLevel(lo: SkillLoadout, def: SkillDef, level: number, awakened: boolean): SkillLoadout {
  if (level <= 0) {
    const next = cloneLoadout(lo);
    delete next.owned[def.id];
    next.active = next.active.map((x) => (x === def.id ? null : x));
    if (next.passive === def.id) next.passive = null;
    return next;
  }
  const base = lo.owned[def.id] ? lo : acquireSkill(lo, def).loadout;
  const next = cloneLoadout(base);
  next.owned[def.id] = { ...next.owned[def.id]!, level, awakened };
  return next;
}

/** 보관 중인 스킬 (가진 순서) */
export function storedSkills(lo: SkillLoadout): string[] {
  return Object.entries(lo.owned)
    .filter(([id]) => !isEquipped(lo, id))
    .sort((a, b) => a[1].order - b[1].order)
    .map(([id]) => id);
}

/**
 * 장착. target은 액티브 칸 번호 또는 'passive'.
 * - 보관 스킬을 찬 칸에 넣으면 원래 스킬은 보관된다.
 * - 장착 칸끼리는 자리만 바꾼다.
 * restarted: 보관함에서 새로 장착되어 쿨타임을 처음부터 돌릴 스킬.
 */
export function equipSkill(
  lo: SkillLoadout,
  id: string,
  target: number | 'passive',
  data: SkillsData,
): { loadout: SkillLoadout; restarted: string[] } {
  if (!lo.owned[id]) throw new Error(`없는 스킬 '${id}'`);
  const def = findSkill(data, id);
  const next = cloneLoadout(lo);
  if (target === 'passive') {
    if (def.kind !== 'passive') throw new Error(`'${id}'는 패시브가 아님`);
    const was = next.passive === id;
    next.passive = id;
    return { loadout: next, restarted: was ? [] : [id] };
  }
  if (def.kind !== 'active') throw new Error(`'${id}'는 액티브가 아님`);
  if (target < 0 || target >= next.active.length) throw new Error(`칸 번호 ${target} 범위 밖`);
  const from = next.active.indexOf(id);
  if (from === target) return { loadout: next, restarted: [] };
  if (from !== -1) {
    next.active[from] = next.active[target] ?? null;
    next.active[target] = id;
    return { loadout: next, restarted: [] };
  }
  next.active[target] = id;
  return { loadout: next, restarted: [id] };
}

/** 각성 조건: 최대 레벨 + 요구 아이템 보유, 아직 각성하지 않음 */
export function canAwaken(lo: SkillLoadout, def: SkillDef, items: readonly string[], maxLevel: number): boolean {
  const o = lo.owned[def.id];
  if (!o || o.awakened || o.level < maxLevel) return false;
  return items.includes(def.awakening.requiredItem);
}

/** 지금 각성할 수 있는 스킬 (오래 가진 순) */
export function awakeningReady(lo: SkillLoadout, data: SkillsData, items: readonly string[]): string[] {
  return Object.entries(lo.owned)
    .sort((a, b) => a[1].order - b[1].order)
    .map(([id]) => id)
    .filter((id) => canAwaken(lo, findSkill(data, id), items, data.maxLevel));
}

/** 현재 레벨의 쿨타임·수치. 각성하면 마지막 레벨 수치 위에 각성 수치를 덮는다 */
export function skillValues(def: SkillDef, owned: Pick<OwnedSkill, 'level' | 'awakened'>): {
  cooldownSec: number;
  values: Record<string, number>;
} {
  const lv = def.levels[Math.min(def.levels.length, Math.max(1, owned.level)) - 1]!;
  if (!owned.awakened) return { cooldownSec: lv.cooldownSec, values: { ...lv.values } };
  return { cooldownSec: def.awakening.cooldownSec, values: { ...lv.values, ...def.awakening.values } };
}

// ---------- 쿨타임 ----------

/** 스킬 id → 남은 쿨타임(초) */
export type Cooldowns = Record<string, number>;

export function tickCooldowns(cd: Cooldowns, dt: number): Cooldowns {
  const out: Cooldowns = {};
  for (const [id, left] of Object.entries(cd)) {
    const v = left - dt;
    if (v > 0) out[id] = v;
  }
  return out;
}

export function cooldownLeft(cd: Cooldowns, id: string): number {
  return cd[id] ?? 0;
}

/** 남은 쿨타임을 sec만큼 돌려준다(0 아래로 내려가면 쿨타임 끝) */
export function refundCooldown(cd: Cooldowns, id: string, sec: number): Cooldowns {
  const out = { ...cd };
  const v = cooldownLeft(cd, id) - sec;
  if (v > 0) out[id] = v;
  else delete out[id];
  return out;
}

// ---------- 궁극기 재사용 대기 ----------

/** 궁극기 쿨타임 감소 상한 (아이템을 겹쳐도 이 이상 줄지 않는다) */
export const ULTIMATE_CDR_CAP = 0.9;

/** 궁극기 재사용 대기(초): 기본값 × (1 − 궁극기 쿨타임 감소). 스킬 쿨타임 감소와는 상관없다 */
export function ultimateCooldownSec(base: number, reduction: number): number {
  return base * (1 - Math.min(ULTIMATE_CDR_CAP, Math.max(0, reduction)));
}
