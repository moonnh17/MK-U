/**
 * 전직과 학파 궁극기 (순수 함수).
 * - 판정: 챕터1에서 고른 스킬 카드의 계열 수가 많은 쪽. 동점이면 마지막으로 고른 카드의 계열.
 * - 스킬 변환: 반대 학파 스킬(패시브 포함) 제거 → 레벨 합만큼 포인트 → 자기 학파 스킬 무작위 +1(Lv3 제외)
 *   → 받을 스킬이 없으면 무작위 스탯 +N → 빈 칸은 보관함의 자기 학파 스킬로 채운다. 각성은 옮겨가지 않는다.
 * - 전직 후 카드에는 자기 학파 스킬만.
 * - 궁극기 각성: 자기 학파 스킬(패시브 포함) 각성 2개.
 */
import type { Rng } from '../core/rng';
import { STAT_IDS, type SchoolId, type SkillDef, type SkillsData, type StatId, type UltimateDef } from '../types/data';
import type { Stats } from './damage';
import { findSkill, type SkillLoadout } from './skills';

export function judgeSchool(
  picks: Readonly<Record<SchoolId, number>>,
  lastPick: SchoolId | null,
  order: readonly SchoolId[],
): SchoolId {
  const sorted = [...order].sort((a, b) => picks[b] - picks[a]);
  const top = sorted[0]!;
  const tied = sorted.filter((s) => picks[s] === picks[top]);
  if (tied.length > 1 && lastPick && tied.includes(lastPick)) return lastPick;
  return top;
}

export interface ConversionLog {
  school: SchoolId;
  /** 사라진 반대 학파 스킬 */
  removed: { skillId: string; level: number }[];
  /** 포인트로 오른 스킬 (같은 스킬이 여러 번이면 여러 줄) */
  gains: { skillId: string; level: number }[];
  /** 받을 스킬이 없어 스탯으로 바뀐 포인트 */
  stats: { stat: StatId; amount: number }[];
}

export function convertSkills(
  rng: Rng,
  lo: SkillLoadout,
  stats: Stats,
  data: SkillsData,
  school: SchoolId,
  statAmount: number,
): { loadout: SkillLoadout; stats: Stats; log: ConversionLog } {
  const owned = { ...lo.owned };
  const log: ConversionLog = { school, removed: [], gains: [], stats: [] };
  let points = 0;
  for (const [id, o] of Object.entries(lo.owned).sort((a, b) => a[1].order - b[1].order)) {
    if (findSkill(data, id).school === school) continue;
    // 각성은 옮겨가지 않고 레벨만 센다
    points += o.level;
    log.removed.push({ skillId: id, level: o.level });
    delete owned[id];
  }
  const nextStats = { ...stats };
  for (let i = 0; i < points; i++) {
    const candidates = Object.entries(owned)
      .filter(([, o]) => o.level < data.maxLevel)
      .sort((a, b) => a[1].order - b[1].order)
      .map(([id]) => id);
    if (candidates.length > 0) {
      const id = rng.pick(candidates);
      owned[id] = { ...owned[id]!, level: owned[id]!.level + 1 };
      log.gains.push({ skillId: id, level: owned[id]!.level });
    } else {
      const stat = rng.pick(STAT_IDS);
      nextStats[stat] += statAmount;
      log.stats.push({ stat, amount: statAmount });
    }
  }
  let active = lo.active.map((id) => (id && owned[id] ? id : null));
  let passive = lo.passive && owned[lo.passive] ? lo.passive : null;
  // 빈 칸은 보관함의 자기 학파 스킬로 (가진 순서)
  const stored = Object.entries(owned)
    .filter(([id]) => !active.includes(id) && passive !== id)
    .sort((a, b) => a[1].order - b[1].order)
    .map(([id]) => findSkill(data, id));
  for (const def of stored) {
    if (def.kind === 'passive') {
      if (passive === null) passive = def.id;
    } else {
      const empty = active.indexOf(null);
      if (empty !== -1) active = active.map((x, i) => (i === empty ? def.id : x));
    }
  }
  return { loadout: { ...lo, owned, active, passive }, stats: nextStats, log };
}

/** 카드로 내도 되는 스킬: 전직 전에는 전부, 전직 후에는 자기 학파만 */
export function skillAllowed(def: SkillDef, school: SchoolId | null): boolean {
  return school === null || def.school === school;
}

/** 자기 학파 각성 스킬 수 */
export function awakenedCount(lo: SkillLoadout, data: SkillsData, school: SchoolId): number {
  return Object.entries(lo.owned).filter(([id, o]) => o.awakened && findSkill(data, id).school === school).length;
}

export function ultimateAwakeningReady(lo: SkillLoadout, data: SkillsData, school: SchoolId | null, need: number): boolean {
  return school !== null && awakenedCount(lo, data, school) >= need;
}

/**
 * 학파 궁극기 게이지가 얻는 양.
 * kill: 처치로 (열역학 제1법칙) / damage: 정해진 스킬의 피해량 × 비율
 */
export function gaugeFromDamage(def: UltimateDef, skillId: string | null, damage: number): number {
  const g = def.gauge;
  if (g.kind !== 'damage' || !skillId || !g.skills.includes(skillId)) return 0;
  return damage * g.perDamage;
}

/** 대성공 1회당 (아크로) */
export function gaugeFromGreatSuccess(def: UltimateDef): number {
  return def.gauge.kind === 'damage' ? (def.gauge.perGreatSuccess ?? 0) : 0;
}

/**
 * 역설: 관측 동안 표식 적에게 준 실제 피해 기록 → 재현 비율.
 * 기본 일부, 실험 성공이면 상당 부분, 대성공이면 전부.
 */
export function paradoxRatio(success: boolean, great: boolean, ratios: { partial: number; major: number; full: number }): number {
  if (great) return ratios.full;
  return success ? ratios.major : ratios.partial;
}
