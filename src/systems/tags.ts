/**
 * 태그 판정 (순수 함수). 원본 구조의 이름을 따른다:
 * skillTags(id) · hasTag · taggedChance · canAutoCast · tagBadges.
 * 태그는 성질과 보정 대상만 나타내고, 스킬 고유의 발동 조건을 대체하지 않는다.
 */
import type { Vec2 } from '../core/actions';
import type {
  BleedRule,
  ChanceRule,
  SkillDef,
  TagDef,
  TagId,
  TagsData,
} from '../types/data';

function tagDef(id: TagId, data: TagsData): TagDef {
  const def = data.tags.find((t) => t.id === id);
  if (!def) throw new Error(`태그 '${id}' 없음`);
  return def;
}

/**
 * 스킬의 태그. source를 주면 그 공격의 태그(피해 계산용), 없으면 카드·인벤토리 표시용 태그.
 * 부모 태그를 하위 공격에 복사하지 않는다.
 */
export function skillTags(def: SkillDef, awakened: boolean, source?: string): TagId[] {
  if (source !== undefined) {
    const t = def.sources[source];
    if (!t) throw new Error(`스킬 '${def.id}'에 source '${source}' 없음`);
    return [...t];
  }
  return [...(awakened && def.awakening ? def.awakening.tags : def.tags)];
}

export function hasTag(tags: readonly TagId[], id: TagId): boolean {
  return tags.includes(id);
}

/** 확률 태그: 결과 종류(success / greatSuccess)별 상한 */
export function taggedChance(baseChance: number, capKey: string, data: TagsData): number {
  const r = tagDef('chance', data).rule as ChanceRule;
  const cap = r.caps[capKey];
  if (cap === undefined) throw new Error(`확률 상한 '${capKey}' 없음`);
  return Math.min(cap, baseChance);
}

export interface RangeTarget extends Vec2 {
  radius: number;
}

/** 근접 스킬은 사거리 안에 적이 있어야 발동한다. 근접이 아니면 항상 true */
export function canAutoCast(tags: readonly TagId[], range: number, origin: Vec2, targets: readonly RangeTarget[]): boolean {
  if (!hasTag(tags, 'melee')) return true;
  return targets.some((t) => Math.hypot(t.x - origin.x, t.y - origin.y) <= range + t.radius);
}

export interface TagBadge {
  id: TagId;
  nameKey: string;
  color: string;
}

export function tagBadges(tags: readonly TagId[], data: TagsData): TagBadge[] {
  return tags.map((id) => {
    const d = tagDef(id, data);
    return { id, nameKey: d.nameKey, color: d.badgeColor };
  });
}

// ---------- 출혈 ----------

export interface BleedState {
  stacks: number;
  remainingSec: number;
  /** 다음 틱까지 쌓인 시간 */
  tickTimer: number;
  /** 중첩 1개당 틱 피해 (태그 보정 적용 후) */
  damagePerStack: number;
}

const EPS = 1e-6;

/** 출혈을 건다. 중첩은 상한까지, 다시 걸면 지속시간을 갱신한다 */
export function applyBleed(state: BleedState | null, damagePerStack: number, stacks: number, rule: BleedRule): BleedState {
  if (!state) {
    return { stacks: Math.min(rule.maxStacks, stacks), remainingSec: rule.durationSec, tickTimer: 0, damagePerStack };
  }
  return {
    stacks: Math.min(rule.maxStacks, state.stacks + stacks),
    remainingSec: rule.refreshOnReapply ? rule.durationSec : state.remainingSec,
    tickTimer: state.tickTimer,
    damagePerStack: Math.max(state.damagePerStack, damagePerStack),
  };
}

/** 시간을 흘려 이번에 들어갈 피해를 돌려준다. 끝났으면 state는 null */
export function tickBleed(state: BleedState, dt: number, rule: BleedRule): { state: BleedState | null; damage: number } {
  let tickTimer = state.tickTimer + dt;
  const remainingSec = state.remainingSec - dt;
  let damage = 0;
  while (tickTimer >= rule.tickIntervalSec - EPS) {
    tickTimer -= rule.tickIntervalSec;
    damage += state.stacks * state.damagePerStack;
  }
  if (remainingSec <= EPS) return { state: null, damage };
  return { state: { ...state, tickTimer, remainingSec }, damage };
}
