/**
 * 전직과 학파 궁극기 (순수 함수).
 * - 판정: 챕터1에서 고른 스킬 카드의 계열 수가 많은 쪽. 동점이면 마지막으로 고른 카드의 계열.
 * - 스킬 변환: 반대 학파 스킬(패시브 포함) 제거 → 레벨 합만큼 포인트 → 자기 학파 스킬 무작위 +1(Lv3 제외)
 *   → 받을 스킬이 없으면 남은 포인트는 사라진다 → 빈 칸은 보관함의 자기 학파 스킬로 채운다. 각성은 옮겨가지 않는다.
 * - 전직 후 카드에는 자기 학파 스킬만.
 * - 궁극기 각성: 요구 아이템 보유.
 */
import type { Rng } from '../core/rng';
import type { SchoolId, SkillDef, SkillsData, UltimateDef } from '../types/data';
import { findSkill, type SkillLoadout } from './skills';

/** 계열 집계가 가장 많은 학파들 (2개 이상이면 동점 → 플레이어가 직접 고른다, 원본 규칙) */
export function topSchools(picks: Readonly<Record<SchoolId, number>>, order: readonly SchoolId[]): SchoolId[] {
  const max = Math.max(...order.map((s) => picks[s]));
  return order.filter((s) => picks[s] === max);
}

/** 많은 쪽으로 전직. 동점이면 null (선택창) */
export function judgeSchool(picks: Readonly<Record<SchoolId, number>>, order: readonly SchoolId[]): SchoolId | null {
  const top = topSchools(picks, order);
  return top.length === 1 ? top[0]! : null;
}

export interface ConversionLog {
  school: SchoolId;
  /** 사라진 반대 학파 스킬 */
  removed: { skillId: string; level: number }[];
  /** 포인트로 오른 스킬 (같은 스킬이 여러 번이면 여러 줄) */
  gains: { skillId: string; level: number }[];
}

export function convertSkills(
  rng: Rng,
  lo: SkillLoadout,
  data: SkillsData,
  school: SchoolId,
): { loadout: SkillLoadout; log: ConversionLog } {
  const owned = { ...lo.owned };
  const log: ConversionLog = { school, removed: [], gains: [] };
  let points = 0;
  for (const [id, o] of Object.entries(lo.owned).sort((a, b) => a[1].order - b[1].order)) {
    if (findSkill(data, id).school === school) continue;
    // 각성은 옮겨가지 않고 레벨만 센다
    points += o.level;
    log.removed.push({ skillId: id, level: o.level });
    delete owned[id];
  }
  for (let i = 0; i < points; i++) {
    const candidates = Object.entries(owned)
      .filter(([, o]) => o.level < data.maxLevel)
      .sort((a, b) => a[1].order - b[1].order)
      .map(([id]) => id);
    if (candidates.length === 0) break;
    const id = rng.pick(candidates);
    owned[id] = { ...owned[id]!, level: owned[id]!.level + 1 };
    log.gains.push({ skillId: id, level: owned[id]!.level });
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
  return { loadout: { ...lo, owned, active, passive }, log };
}

/** 카드로 내도 되는 스킬: 전직 전에는 전부, 전직 후에는 자기 학파만 */
export function skillAllowed(def: SkillDef, school: SchoolId | null): boolean {
  return school === null || def.school === school;
}


/**
 * 역설: 관측 동안 표식 적에게 준 실제 피해 기록 → 재현 비율.
 * 기본 일부, 실험 성공이면 상당 부분, 대성공이면 전부.
 */
export function paradoxRatio(success: boolean, great: boolean, ratios: { partial: number; major: number; full: number }): number {
  if (great) return ratios.full;
  return success ? ratios.major : ratios.partial;
}
