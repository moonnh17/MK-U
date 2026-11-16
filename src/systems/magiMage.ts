/**
 * 마기법사 (순수 함수): 개전 각인, 칸 순서 전직 판정, 원소·지팡이 피해 배율.
 * - 각인: 액티브 1번 칸 스킬의 각인만 적용, 수치는 스킬 레벨, 전직 학파 스킬이면 계열 공명 배율.
 * - 전직: 1번 → 2번 → 3번 칸에서 처음 나오는 전직 학파 스킬. 없으면 null(직접 선택).
 */
import type { ElementId, ImprintEffect, JobDef, SchoolId, SkillsData } from '../types/data';
import { findSkill, type SkillLoadout } from './skills';

export interface ActiveImprint {
  skillId: string;
  effect: ImprintEffect;
  /** 레벨·공명 반영한 수치 + 고정값 */
  values: Record<string, number>;
  resonance: boolean;
}

export function activeImprint(
  lo: SkillLoadout,
  data: SkillsData,
  job: Pick<JobDef, 'imprint'>,
  school: SchoolId | null,
): ActiveImprint | null {
  const rule = job.imprint;
  const id = rule ? lo.active[rule.slot] : null;
  const owned = id ? lo.owned[id] : undefined;
  if (!rule || !id || !owned) return null;
  const def = findSkill(data, id);
  const im = def.imprint;
  if (!im) return null;
  const resonance = school !== null && def.school === school;
  const lv = im.levels[Math.min(im.levels.length, Math.max(1, owned.level)) - 1]!;
  const mul = resonance ? 1 + rule.resonance : 1;
  const values: Record<string, number> = { ...im.fixed };
  for (const [k, v] of Object.entries(lv)) values[k] = v * mul;
  return { skillId: id, effect: im.effect, values, resonance };
}

/** 칸 순서(1→2→3)에서 처음 나오는 전직 학파 스킬의 학파. 없으면 null */
export function judgeBySlots(active: readonly (string | null)[], data: SkillsData, order: readonly SchoolId[]): SchoolId | null {
  for (const id of active) {
    const school = id ? findSkill(data, id).school : null;
    if (school && order.includes(school)) return school;
  }
  return null;
}

/** 작열: 화염 원소 직접 피해 배율 (화상 틱은 이 경로를 지나지 않는다) */
export function elementDamageMul(element: ElementId | undefined, im: ActiveImprint | null): number {
  return element === 'fire' && im?.effect === 'fireDamage' ? 1 + (im.values.fireDamage ?? 0) : 1;
}

/** 지팡이 공명: 지팡이 계열 무기 피해 배율 */
export function staffDamageMul(category: string, im: ActiveImprint | null): number {
  return category === 'staff' && im?.effect === 'staffDamage' ? 1 + (im.values.staffDamage ?? 0) : 1;
}
