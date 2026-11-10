/**
 * 전직과 학파 궁극기 (순수 함수).
 * - 판정: 챕터1에서 고른 스킬 카드의 계열 수가 많은 쪽. 동점이면 마지막으로 고른 카드의 계열.
 * - 스킬 변환: 반대 학파 스킬(패시브 포함) 제거 → 레벨 합만큼 포인트 → 자기 학파 스킬 무작위 +1(Lv3 제외)
 *   → 받을 스킬이 없으면 남은 포인트는 사라진다 → 빈 칸은 보관함의 자기 학파 스킬로 채운다. 각성은 옮겨가지 않는다.
 * - 전직 후 카드에는 자기 학파 스킬만.
 * - 궁극기 각성: 요구 아이템 보유.
 */
import type { Rng } from '../core/rng';
import type { JobDef, SchoolId, SkillDef, SkillsData } from '../types/data';
import { acquireSkill, findSkill, type SkillLoadout } from './skills';

/**
 * 숙련 판정 (전사, 원본 규칙): 두 숙련 중 레벨이 높은 쪽 분기로.
 * 같으면 두 번째 숙련이 1 이상일 때 두 번째, 둘 다 0이면 첫 번째. 그 밖의 숙련(신체)은 보지 않는다.
 */
export function judgeMastery(
  owned: Readonly<Record<string, { level: number }>>,
  judge: readonly [string, string],
  order: readonly SchoolId[],
): SchoolId {
  const a = owned[judge[0]]?.level ?? 0;
  const b = owned[judge[1]]?.level ?? 0;
  return a > b || (a === b && b === 0) ? order[0]! : order[1]!;
}

/** 계열 집계가 가장 많은 학파들 (2개 이상이면 동점 → 플레이어가 직접 고른다, 원본 규칙) */
export function topSchools(picks: Readonly<Partial<Record<SchoolId, number>>>, order: readonly SchoolId[]): SchoolId[] {
  const max = Math.max(...order.map((s) => picks[s] ?? 0));
  return order.filter((s) => (picks[s] ?? 0) === max);
}

/** 많은 쪽으로 전직. 동점이면 null (선택창) */
export function judgeSchool(picks: Readonly<Partial<Record<SchoolId, number>>>, order: readonly SchoolId[]): SchoolId | null {
  const top = topSchools(picks, order);
  return top.length === 1 ? top[0]! : null;
}

export interface ConversionLog {
  school: SchoolId;
  /** 사라진 반대 학파 스킬 */
  removed: { skillId: string; level: number }[];
  /** 포인트로 오른 스킬 (같은 스킬이 여러 번이면 여러 줄) */
  gains: { skillId: string; level: number }[];
  /** 전직으로 새로 받은 스킬 (전사). 예전 저장에는 없다 */
  granted?: string[];
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
    const def = findSkill(data, id);
    // 숙련은 전직 후에도 그대로 남는다
    if (def.school === school || def.kind === 'mastery') continue;
    // 각성은 옮겨가지 않고 레벨만 센다
    points += o.level;
    log.removed.push({ skillId: id, level: o.level });
    delete owned[id];
  }
  for (let i = 0; i < points; i++) {
    const candidates = Object.entries(owned)
      .filter(([id, o]) => o.level < data.maxLevel && findSkill(data, id).kind !== 'mastery')
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
    .filter(([id]) => !active.includes(id) && passive !== id && findSkill(data, id).kind !== 'mastery')
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

/** 카드로 내도 되는 스킬: 내 직업 스킬 중 전직 전에는 직업의 전직 전 계열(마기학자 두 학파, 전사 숙련), 전직 후에는 자기 학파만 */
export function skillAllowed(def: SkillDef, job: Pick<JobDef, 'id' | 'preSchools'>, school: SchoolId | null): boolean {
  if (def.job !== job.id) return false;
  return school === null ? job.preSchools.includes(def.school) : def.school === school;
}


/**
 * 역설: 관측 동안 표식 적에게 준 실제 피해 기록 → 재현 비율.
 * 기본 일부, 실험 성공이면 상당 부분, 대성공이면 전부.
 */
export function paradoxRatio(success: boolean, great: boolean, ratios: { partial: number; major: number; full: number }): number {
  if (great) return ratios.full;
  return success ? ratios.major : ratios.partial;
}

/** 전직 선물: 아직 없는 자기 학파 스킬(숙련 제외) 중 count개를 무작위로 Lv1로 준다 */
export function grantSchoolSkills(
  rng: Rng,
  lo: SkillLoadout,
  data: SkillsData,
  jobId: string,
  school: SchoolId,
  count: number,
): { loadout: SkillLoadout; granted: string[] } {
  let loadout = lo;
  const granted: string[] = [];
  for (let i = 0; i < count; i++) {
    const pool = data.skills.filter((s) => s.job === jobId && s.school === school && s.kind !== 'mastery' && !loadout.owned[s.id]);
    if (pool.length === 0) break;
    const def = rng.pick(pool);
    loadout = acquireSkill(loadout, def).loadout;
    granted.push(def.id);
  }
  return { loadout, granted };
}
